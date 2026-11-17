/**
 * The `cs` showcase adapter: a C# showcase is one `.cs` file, built with the host's .NET SDK (10 or later) as a file-based app in the host copy, its
 * references given by its own `#:` directives (`#:project`, `#:package`, …), then run and recorded. Its compiler errors (anywhere) and warnings (in
 * the showcase's own file) are its build's issues. `dotnet` takes its settings from the environment only, as any MSBuild switch on its command line
 * makes it read the `.cs` file as a project. Internal, never re-exported.
 */

import { readFileSync, statSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import type { Showcase, ShowcaseView, VirtualFile } from '../../../host/index.js';
import { getFolder } from '../../../markdown/index.js';
import { createRunSession, type RunSession } from '../../../host-copy/index.js';
import type {
  ShowcaseAdapter,
  ShowcaseBuildIssue,
  ShowcaseBuildRequest,
  ShowcaseBuildResult,
  ShowcaseHostCheck,
  ShowcaseHostCopyContent,
  ShowcaseRun,
  ShowcaseValidation,
} from '../index.js';

// #region Settings

/**
 * Lowest major version of the .NET SDK that builds file-based apps
 */
export const MINIMUM_DOTNET_VERSION = 10;

/**
 * Names of the environment variables of `showroom`'s own environment the `cs` showcase adapter passes on to `dotnet`, beside the fixed ones
 */
export const CS_ENVIRONMENT_NAMES: readonly string[] = ['DOTNET_ROOT'];

/**
 * Settings of `dotnet` given through the environment: no build server, node or compiler server outliving a build, no telemetry, no banners
 */
export const CS_DOTNET_ENVIRONMENT: Readonly<Record<string, string>> = {
  MSBUILDDISABLENODEREUSE: '1',
  DOTNET_CLI_USE_MSBUILD_SERVER: '0',
  UseSharedCompilation: 'false',
  DOTNET_CLI_TELEMETRY_OPTOUT: '1',
  DOTNET_NOLOGO: '1',
  DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
};

/**
 * Time limit of the host check's `dotnet --list-sdks`, in milliseconds
 */
export const CS_HOST_CHECK_TIME_LIMIT = 30_000;

/**
 * Most bytes of the host's `global.json` read
 */
export const GLOBAL_JSON_LIMIT = 64 * 1024;

// #endregion

// #region Helpers

/**
 * Escapes a path for an MSBuild item specification (`%`, `;`, `*`, `?`, `$`, `@`, `'` as `%XX`)
 * @param path The path
 * @returns The escaped path
 */
export function escapeMsBuild(path: string): string {
  return path.replace(/[%;*?$@']/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

/**
 * Gets the `DefaultItemExcludes` that keeps every `.cs` virtual file out of the host's projects' default `Compile` items: their absolute paths in
 * the host copy, escaped, as MSBuild resolves excludes from each project's folder
 * @param copyRoot Absolute path of the host copy's root
 * @param virtualFiles Every virtual file of the host repository
 * @returns The value, empty if there are no `.cs` virtual files
 */
export function getDefaultItemExcludes(copyRoot: string, virtualFiles: readonly VirtualFile[]): string {
  return virtualFiles
    .filter((file) => file.path.toLowerCase().endsWith('.cs'))
    .map((file) => escapeMsBuild(join(copyRoot, file.path)))
    .join(';');
}

/**
 * Gets the paths a showcase's `#:project` directives name, as written
 * @param source The showcase's source
 * @returns The paths, in order
 */
export function getProjectDirectives(source: string): string[] {
  const paths: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*#:project\s+(.+?)\s*$/.exec(line);
    if (match) paths.push(match[1].replace(/^"(.*)"$/, '$1'));
  }
  return paths;
}

/**
 * Resolves a `#:project` directive's path to the project file it names: the file itself, or the one project file in a folder
 * @param root Absolute path of the host repository's root
 * @param folder POSIX-style path of the showcase's folder, relative to the root
 * @param path The directive's path, as written (either slash)
 * @returns The project file's POSIX-style path relative to the root, or undefined if it is outside the root or not found
 */
export async function resolveProjectDirective(root: string, folder: string, path: string): Promise<string | undefined> {
  const joined = posix.normalize(posix.join(folder, path.replace(/\\/g, '/')));
  if (joined === '..' || joined.startsWith('../') || posix.isAbsolute(joined)) return undefined;
  try {
    const found = await stat(join(root, joined));
    if (found.isFile()) return joined;
    if (!found.isDirectory()) return undefined;
    const projects = (await readdir(join(root, joined))).filter((name) => /\.[a-z]+proj$/i.test(name));
    return projects.length === 1 ? posix.join(joined, projects[0]) : undefined;
  } catch (_err) {
    return undefined;
  }
}

/**
 * Represents a compiler's or MSBuild's diagnostic, read from `dotnet build`'s output
 */
export interface CsDiagnostic {
  /**
   * Severity
   */
  severity: 'error' | 'warning';
  /**
   * Its code (e.g. `CS0029`)
   */
  code: string;
  /**
   * Its message, without the project it ends with
   */
  message: string;
  /**
   * POSIX-style path of its file relative to the host repository's root, as the output gives it with the host copy's path made relative; none when
   * it is outside the host copy
   */
  path?: string;
  /**
   * Its line, from 1
   */
  line?: number;
}

/**
 * Reads the diagnostics from `dotnet build`'s output, without duplicates (it prints each one twice): `<path>(<line>,<col>): <severity> <code>:
 * <message> [<project>]`, or `<path> : <severity> <code>: …` with no position; a path into the run folder (`<run>/…`), the home folder (`~/…`) or
 * anywhere else outside the host copy gets none
 * @param output The build's output, its host copy paths made relative to the root
 * @returns The diagnostics, in order
 */
export function parseDiagnostics(output: string): CsDiagnostic[] {
  const found = new Map<string, CsDiagnostic>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(?:(.+?)(?:\((\d+)(?:,\d+(?:,\d+,\d+)?)?\))?\s*:\s+)?(error|warning)\s+([A-Za-z]+\d+)\s*:\s*(.*?)(?:\s+\[[^\]]*\])?\s*$/.exec(line);
    if (!match) continue;
    const [, file, lineNumber, severity, code, message] = match;
    const path = file !== undefined && _isRootRelative(file.trim()) ? posix.normalize(file.trim().replace(/\\/g, '/')) : undefined;
    const diagnostic: CsDiagnostic = {
      severity: severity as 'error' | 'warning',
      code,
      message,
      ...(path !== undefined ? { path } : {}),
      ...(path !== undefined && lineNumber !== undefined ? { line: Number(lineNumber) } : {}),
    };
    found.set(JSON.stringify(diagnostic), diagnostic);
  }
  return [...found.values()];
}

/**
 * Checks if a diagnostic's path is relative to the root: not absolute, not the run folder's or the home folder's, not leading out
 * @param path The path
 * @returns True if it is
 */
function _isRootRelative(path: string): boolean {
  if (
    !path ||
    !/\.[^./\\]+$/.test(path) ||
    path.startsWith('<run>') ||
    path.startsWith('~') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) ||
    path.startsWith('\\')
  ) {
    return false;
  }
  const normalized = posix.normalize(path.replace(/\\/g, '/'));
  return normalized !== '..' && !normalized.startsWith('../');
}

/**
 * Gets a `cs` build's issues from its diagnostics: every error, and the warnings in the showcase's own file
 * @param diagnostics The diagnostics
 * @param entry POSIX-style path of the showcase's entry point, relative to the root
 * @returns The issues
 */
export function getCsBuildIssues(diagnostics: readonly CsDiagnostic[], entry: string): ShowcaseBuildIssue[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error' || diagnostic.path === entry)
    .map((diagnostic) => ({
      severity: diagnostic.severity,
      message: `${diagnostic.code}: ${diagnostic.message}`,
      ...(diagnostic.path !== undefined ? { path: diagnostic.path } : {}),
      ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
    }));
}

/**
 * Reads the installed SDKs' versions from `dotnet --list-sdks`' output (`<version> [<folder>]` per line)
 * @param output The output
 * @returns The versions, as written
 */
export function parseSdkList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => /^\s*(\d+\.\d+\.\d+\S*)\s+\[/.exec(line)?.[1])
    .filter((version): version is string => version !== undefined);
}

/**
 * Represents what the `cs` showcase adapter reads from the host's `global.json`
 */
export interface GlobalJson {
  /**
   * `sdk.version`, if given
   */
  version?: string;
  /**
   * `sdk.rollForward`, if given
   */
  rollForward?: string;
  /**
   * `sdk.paths`, if given
   */
  paths?: string[];
}

/**
 * Reads the host's `global.json` at its root, statically, at most GLOBAL_JSON_LIMIT bytes, its comments allowed
 * @param root Absolute path of the host repository's root
 * @returns Its SDK settings; undefined if there is none; an error if it can't be read
 */
export function readGlobalJson(root: string): GlobalJson | { error: string } | undefined {
  let text: string;
  try {
    const path = join(root, 'global.json');
    const found = statSync(path);
    if (!found.isFile()) return undefined;
    if (found.size > GLOBAL_JSON_LIMIT) return { error: `global.json is larger than ${GLOBAL_JSON_LIMIT / 1024} kB` };
    text = readFileSync(path, 'utf8');
  } catch (_err) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(_stripJsonComments(text.replace(/^\uFEFF/, '')));
  } catch (err) {
    return { error: `global.json can't be read: ${(err as Error).message}` };
  }
  const sdk = typeof value === 'object' && value !== null ? (value as Record<string, unknown>).sdk : undefined;
  if (typeof sdk !== 'object' || sdk === null) return {};
  const { version, rollForward, paths } = sdk as Record<string, unknown>;
  return {
    ...(typeof version === 'string' ? { version } : {}),
    ...(typeof rollForward === 'string' ? { rollForward } : {}),
    ...(Array.isArray(paths) ? { paths: paths.filter((path): path is string => typeof path === 'string') } : {}),
  };
}

/**
 * Removes `//` and `/* *\/` comments outside strings from a JSON text
 * @param text The text
 * @returns The text without comments
 */
function _stripJsonComments(text: string): string {
  let result = '';
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      const start = index;
      for (index++; index < text.length && text[index] !== '"'; index++) if (text[index] === '\\') index++;
      result += text.slice(start, index + 1);
    } else if (character === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index++;
      result += '\n';
    } else if (character === '/' && text[index + 1] === '*') {
      index = text.indexOf('*/', index + 2);
      if (index === -1) break;
      index++;
    } else {
      result += character;
    }
  }
  return result;
}

/**
 * Gets the SDK folders `global.json`'s `sdk.paths` names inside the host repository (relative ones, and `$host$` aside)
 * @param root Absolute path of the host repository's root
 * @param paths `sdk.paths`
 * @returns Their absolute paths
 */
export function getHostSdkPaths(root: string, paths: readonly string[]): string[] {
  const absoluteRoot = resolve(root);
  return paths
    .filter((path) => path !== '$host$')
    .map((path) => resolve(absoluteRoot, path))
    .filter((path) => path === absoluteRoot || path.startsWith(`${absoluteRoot}/`) || path.startsWith(`${absoluteRoot}\\`));
}

/**
 * Judges the .NET SDK: an error when no installed SDK is 10 or later, or when `global.json` pins one below 10 with a `rollForward` that can't reach
 * a major of 10 or later (only `latestMajor` can)
 * @param versions The installed SDKs' versions
 * @param globalJson The host's `global.json`'s SDK settings, if any
 * @returns The errors, if any
 */
export function judgeSdks(versions: readonly string[], globalJson: GlobalJson | undefined): string[] {
  const major = (version: string) => Number(version.split('.')[0]);
  if (!versions.some((version) => major(version) >= MINIMUM_DOTNET_VERSION)) {
    const found = versions.length ? `found ${versions.join(', ')}` : 'found none';
    return [`The cs showcase adapter needs the .NET SDK ${MINIMUM_DOTNET_VERSION} or later (${found})`];
  }
  const pinned = globalJson?.version;
  if (pinned !== undefined && major(pinned) < MINIMUM_DOTNET_VERSION && globalJson?.rollForward !== 'latestMajor') {
    return [
      `The cs showcase adapter needs the .NET SDK ${MINIMUM_DOTNET_VERSION} or later, but global.json pins ${pinned}` +
        ` (rollForward ${globalJson?.rollForward ?? 'latestPatch'})`,
    ];
  }
  return [];
}

// #endregion

// #region Adapter

/**
 * Runs `dotnet` with arguments for the host check, outside the host repository and the host copy
 * @param args Its arguments
 * @returns Its run
 */
export type CsHostCheckRunner = (args: readonly string[]) => Promise<ShowcaseRun>;

/**
 * Represents the `cs` showcase adapter
 */
export class CsShowcaseAdapter implements ShowcaseAdapter {
  /**
   * Its default showcase views: its source, and its recorded output
   */
  readonly defaultViews: readonly ShowcaseView[] = ['source', 'console'];
  /**
   * Its showcases are recorded
   */
  readonly recorded = true;
  /**
   * It builds in the host copy, without build output, packages or IDE folders, nor `.git`
   */
  readonly hostCopy: ShowcaseHostCopyContent = { exclude: ['bin/', 'obj/', 'node_modules/', '.vs/'], git: false };

  /**
   * The run session of the host check's processes, made when first needed
   */
  #session: RunSession | undefined;
  /**
   * Runs the host check's `dotnet`
   */
  readonly #runner: CsHostCheckRunner | undefined;

  /**
   * Creates the `cs` showcase adapter
   * @param runner Runs the host check's `dotnet` (the tests replace it); by default, in a run session of its own, removed by close()
   */
  constructor(runner?: CsHostCheckRunner) {
    this.#runner = runner;
  }

  /**
   * Validates a showcase: it takes no options, and its entry point must be a `cs` code block or a linked `.cs` file
   * @param showcase The showcase
   * @returns No options, or the errors found
   */
  public validate(showcase: Showcase): ShowcaseValidation {
    const errors: string[] = [];
    if ('options' in showcase) errors.push('The cs showcase adapter takes no options');
    if (!/\.cs$/i.test(showcase.entry)) {
      errors.push(
        showcase.kind === 'code-block'
          ? 'The cs showcase adapter needs a "cs", "csharp" or "c#" code block'
          : `The cs showcase adapter needs a link to a .cs file, not "${showcase.entry}"`,
      );
    }
    return errors.length ? { errors } : { errors: [] };
  }

  /**
   * Checks the host repository, running nothing of it: the installed SDKs listed by a `dotnet` from the `PATH` (outside the host repository), run in
   * the run folder, judged with the host's `global.json` read statically; SDK folders `global.json` names inside the host repository are warned of
   * @param root Absolute path of the host repository's root
   * @returns The errors and warnings
   */
  public async check(root: string): Promise<ShowcaseHostCheck> {
    const warnings: string[] = [];
    const globalJson = readGlobalJson(root);
    if (globalJson && 'error' in globalJson) warnings.push(globalJson.error);
    const settings = globalJson && !('error' in globalJson) ? globalJson : undefined;
    const sdkPaths = getHostSdkPaths(root, settings?.paths ?? []);
    if (sdkPaths.length) {
      warnings.push(`global.json's "sdk.paths" names SDK folders inside the host repository, which its builds may use: ${sdkPaths.join(', ')}`);
    }
    let run: ShowcaseRun;
    try {
      run = await this.#runHostCheck(root, ['--list-sdks']);
    } catch (err) {
      return { errors: [`The cs showcase adapter needs the .NET SDK ${MINIMUM_DOTNET_VERSION} or later: ${(err as Error).message}`], warnings };
    }
    if (run.recording.exitCode !== 0) {
      const reason = run.recording.timedOut ? 'it timed out' : `it exited with ${run.recording.exitCode ?? run.recording.signal}`;
      return { errors: [`The cs showcase adapter couldn't list the .NET SDKs ("dotnet --list-sdks": ${reason})`], warnings };
    }
    return { errors: judgeSdks(parseSdkList(run.stdout), settings), warnings };
  }

  /**
   * Builds a showcase as a file-based app in the host copy, into its own folder, then runs and records it; a build that fails gives its errors and
   * no recording. Its reads are its own file (a code block's documentation file) and the project files its `#:project` directives name.
   * @param request What to build
   * @returns The recording, the issues and the reads
   */
  public async build({ root, showcase, hostVirtualFiles, hostCopy, showcaseFolder }: ShowcaseBuildRequest): Promise<ShowcaseBuildResult> {
    const virtual = hostVirtualFiles.find((file) => file.path === showcase.entry);
    const reads = [virtual ? virtual.documentation : showcase.entry];
    if (!hostCopy || !showcaseFolder) return { reads, issues: [{ severity: 'error', message: 'The cs showcase adapter needs the host copy' }] };

    // Its source, and the project files it references
    let source: string;
    try {
      source = virtual ? virtual.content : await readFile(join(root, showcase.entry), 'utf8');
    } catch (err) {
      return { reads, issues: [{ severity: 'error', message: `The entry point can't be read: ${(err as Error).message}`, path: showcase.entry }] };
    }
    const folder = getFolder(showcase.entry);
    for (const path of getProjectDirectives(source)) {
      const project = await resolveProjectDirective(root, folder, path);
      if (project !== undefined && !reads.includes(project)) reads.push(project);
    }

    // The build, from the entry point's folder, its output in the showcase's own folder
    const name = posix.basename(showcase.entry);
    const env = { ...CS_DOTNET_ENVIRONMENT, DefaultItemExcludes: getDefaultItemExcludes(hostCopy.root, hostVirtualFiles) };
    const artifacts = join(showcaseFolder, 'artifacts');
    const built = await hostCopy.run('dotnet', ['build', name, '--artifacts-path', artifacts], { phase: 'build', cwd: folder, env });
    const issues = getCsBuildIssues(parseDiagnostics(built.stdout), showcase.entry);
    if (built.recording.exitCode !== 0) {
      if (!issues.some((issue) => issue.severity === 'error')) {
        const how = built.recording.timedOut ? `stopped after its ${(built.recording.timeLimit ?? 0) / 1000} s time limit` : 'failed';
        const last = [...built.stdout.split(/\r?\n/), ...built.stderr.split(/\r?\n/)].filter((line) => line.trim()).slice(-3);
        issues.unshift({ severity: 'error', message: `The build ${how}${last.length ? `: ${last.map((line) => line.trim()).join(' / ')}` : ''}` });
      }
      return { reads, issues };
    }

    // The run, recorded
    const dll = join(artifacts, 'bin', 'debug', `${name.replace(/\.cs$/i, '')}.dll`);
    const run = await hostCopy.run('dotnet', [dll], { phase: 'run', env: { ...CS_DOTNET_ENVIRONMENT } });
    return { reads, recording: run.recording, ...(issues.length ? { issues } : {}) };
  }

  /**
   * Removes the host check's run session, if it made one
   */
  public async close(): Promise<void> {
    await this.#session?.dispose();
    this.#session = undefined;
  }

  /**
   * Runs the host check's `dotnet`
   * @param root Absolute path of the host repository's root
   * @param args Its arguments
   * @returns Its run
   */
  #runHostCheck(root: string, args: readonly string[]): Promise<ShowcaseRun> {
    if (this.#runner) return this.#runner(args);
    this.#session ??= createRunSession();
    return this.#session.run(
      'dotnet',
      args,
      { phase: 'build', timeLimit: CS_HOST_CHECK_TIME_LIMIT, env: { ...CS_DOTNET_ENVIRONMENT } },
      { root, names: CS_ENVIRONMENT_NAMES },
    );
  }
}

// #endregion
