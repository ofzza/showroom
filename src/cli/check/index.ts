/**
 * Check: collects the host information from a host repository, reporting every issue found along the way
 */

import ignore from 'ignore';
import { open, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { ShowcaseAdapter } from '../../adapters/showcase/index.js';
import {
  checkHostCheckResult,
  createShowcaseAdapter,
  DEFAULT_SHOWCASE_VIEWS,
  getDefaultViews,
  getShowcaseAdapterNames,
  getTrustTools,
  loadCustomShowcaseAdapters,
} from '../../adapters/showcase/registry/index.js';
import { getStackAdapter, getStackAdapterNames } from '../../adapters/stack/index.js';
import { readConfiguration, CONFIGURATION_FILE_NAME, type Configuration } from '../../configuration/index.js';
import type {
  DocumentationFile,
  DocumentationKind,
  HostInformation,
  LinkedFile,
  NavigationItem,
  ProjectInformation,
  Showcase,
  ShowcaseView,
  VirtualFile,
} from '../../host/index.js';
import { isText, LINKED_FILE_SIDEBAR_LIMIT } from '../../linked-files/index.js';
import {
  getFolder,
  isMarkdownPath,
  resolvePath,
  scanMarkdown,
  splitLink,
  type MarkdownHeading,
  type MarkdownLink,
  type ScannedShowcase,
} from '../../markdown/index.js';
import { resolveNavigation } from '../../navigation/index.js';
import { buildShowcases, getBuildShowcasesIssues } from '../../showcases/index.js';
import { createIgnoreMatcher, resolveOutputFolder } from './internal/index.js';

// #region Types

/**
 * Represents the severity of a check issue: errors fail the check, warnings don't
 */
export type CheckIssueSeverity = 'error' | 'warning';

/**
 * Represents an issue found while checking a host repository
 */
export interface CheckIssue {
  /**
   * Severity of the issue
   */
  severity: CheckIssueSeverity;
  /**
   * Description of the issue
   */
  message: string;
  /**
   * POSIX-style path the issue concerns, relative to the host repository's root, if it concerns one
   */
  path?: string;
  /**
   * Line of the file at `path` the issue concerns, from 1, if it concerns one
   */
  line?: number;
  /**
   * Name of the check a showcase's issue belongs to (e.g. `type check`), as its showcase adapter reported it, if it belongs to one
   */
  check?: string;
}

/**
 * Represents the options of a check, overriding the configuration
 */
export interface CheckOptions {
  /**
   * Output folder, absolute or relative to the current directory; overrides the configuration's `outDir`
   */
  outDir?: string;
  /**
   * True to also build every showcase, once the static check finds no errors, throwing the showcase frames away; a showcase that doesn't build is
   * an error
   */
  showcases?: boolean;
  /**
   * Whether the host repository's code may run: its custom showcase adapters, its tools (e.g. its TypeScript) and its showcases. `false` by default:
   * nothing of the host repository runs, and every showcase is shown as its source. A function is called at most once, only when the host
   * repository has something to trust (a showcase, or a custom showcase adapter), after `showroom.json` is read and the documentation files scanned
   * and before anything of the host repository runs, with what would run; it resolves to the decision, and a rejection means no trust.
   */
  trust?: boolean | ((request: TrustRequest) => Promise<boolean>);
}

/**
 * Represents what trusting a host repository would run, as given to the `trust` option's function
 */
export interface TrustRequest {
  /**
   * The custom showcase adapter modules `showroom.json` lists, by name, each with the absolute real path of its module (those that exist)
   */
  customShowcaseAdapters: { name: string; path: string }[];
  /**
   * The tools building the showcases would load from outside `showroom`, by package name, each with the absolute real path of its folder: including
   * TypeScript, Angular's compiler and the CSS preprocessors resolvable from the host repository, as the bundler and its plugins may load more
   */
  tools: { name: string; path: string }[];
  /**
   * Number of showcases
   */
  showcases: number;
}

/**
 * Represents the outcome of checking a host repository
 */
export interface CheckResult {
  /**
   * True if the check found no errors (warnings don't fail it)
   */
  passed: boolean;
  /**
   * Host information, only present when the check passed
   */
  host?: HostInformation;
  /**
   * Every issue found, errors and warnings
   */
  issues: CheckIssue[];
  /**
   * True if the host repository's code was allowed to run (see CheckOptions' `trust`); false when nothing asked for it
   */
  trusted: boolean;
}

// #endregion

// #region Built-in documentation

/**
 * Built-in documentation patterns, the start of the documentation pattern list: `README` anywhere, and `LICENSE` and `CONTRIBUTE` in the root, in UK
 * and US spelling, with the `.md` or `.txt` extension or none. Matching is case-insensitive.
 */
export const BUILT_IN_DOCUMENTATION: readonly string[] = [
  ...['README'].flatMap((name) => [name, `${name}.md`, `${name}.txt`]),
  ...['LICENSE', 'LICENCE', 'CONTRIBUTE', 'CONTRIBUTING'].flatMap((name) => [`/${name}`, `/${name}.md`, `/${name}.txt`]),
];

/**
 * Documentation kinds of the built-in file names, by lower-case name without extension
 */
const _KINDS: Record<string, DocumentationKind> = {
  readme: 'readme',
  license: 'license',
  licence: 'license',
  contribute: 'contribute',
  contributing: 'contribute',
};

/**
 * Priority of extensions when one folder holds several files of the same built-in kind: lower wins
 */
const _EXTENSION_PRIORITY: Record<string, number> = { '.md': 0, '': 1, '.txt': 2 };

/**
 * Gets the documentation kind of a file from its name
 * @param name File name
 * @param extension Extension of the file name
 * @returns Documentation kind of the file
 */
function _getKind(name: string, extension: string): DocumentationKind {
  const stem = ['.md', '.txt'].includes(extension.toLowerCase()) ? name.slice(0, -extension.length) : name;
  return _KINDS[stem.toLowerCase()] ?? 'other';
}

// #endregion

// #region Check

/**
 * Checks a host repository and collects its host information
 * @param root Path of the host repository's root
 * @param options Options overriding the configuration
 * @returns The outcome of the check: whether it passed, the host information if it did, and every issue found
 */
export async function check(root: string, options: CheckOptions = {}): Promise<CheckResult> {
  return checkHost(root, options, options.showcases ? 'build' : 'check');
}

/**
 * Checks a host repository and collects its host information, as check() does, reporting the showcases of a check without trust as the command
 * running it shows them. Internal: `serve` and `build` report them as not built, as they build the showcases themselves; never re-exported.
 * @param root Path of the host repository's root
 * @param options Options overriding the configuration
 * @param report What the showcases of a check without trust are reported as: by showcase adapter (`check`), or as not built (`build`)
 * @returns The outcome of the check
 */
export async function checkHost(root: string, options: CheckOptions, report: 'check' | 'build'): Promise<CheckResult> {
  const issues: CheckIssue[] = [];
  let trusted = options.trust === true;
  const fail = (): CheckResult => ({ passed: false, issues, trusted });

  // Read the configuration
  const { configuration, errors } = await readConfiguration(root);
  if (!configuration) {
    issues.push(...errors.map((message) => ({ severity: 'error' as const, message, path: CONFIGURATION_FILE_NAME })));
    return fail();
  }

  // Get the stack adapter
  const adapter = getStackAdapter(configuration.stack);
  if (!adapter) {
    issues.push({
      severity: 'error',
      message: `Unknown stack "${configuration.stack}"; the stack adapters are: ${getStackAdapterNames().join(', ')}`,
      path: CONFIGURATION_FILE_NAME,
    });
    return fail();
  }

  // Resolve the project file the configuration names, which must be inside the host repository
  let projectFile: string | undefined;
  if (configuration.project !== undefined) {
    projectFile = _toPosix(relative(resolve(root), resolve(root, configuration.project)));
    if (projectFile === '..' || projectFile.startsWith('../') || isAbsolute(projectFile)) {
      issues.push({ severity: 'error', message: `Project "${configuration.project}" is outside the host repository`, path: CONFIGURATION_FILE_NAME });
      return fail();
    }
  }

  // Read the project information
  let project: ProjectInformation | undefined;
  try {
    project = await adapter.readProject(root, projectFile);
  } catch (err) {
    issues.push({ severity: 'error', message: (err as Error).message });
  }

  // Resolve the source root
  const sourceRoot = _toPosix(relative(resolve(root), resolve(root, configuration.sourceRoot ?? adapter.sourceRoot)));
  if (sourceRoot === '..' || sourceRoot.startsWith('../') || isAbsolute(sourceRoot)) {
    issues.push({ severity: 'error', message: `Source root "${configuration.sourceRoot}" is outside the host repository`, path: CONFIGURATION_FILE_NAME });
    return fail();
  }
  if (!(await _isDirectory(join(root, sourceRoot)))) {
    issues.push({ severity: 'error', message: `Source root "${sourceRoot || '.'}" is not a directory` });
    return fail();
  }

  // Resolve the output folder, which must be inside the host repository and is never walked
  const outputFolder = resolveOutputFolder(root, configuration, options.outDir);
  if ('error' in outputFolder) {
    issues.push({ severity: 'error', message: outputFolder.error, ...(options.outDir === undefined ? { path: CONFIGURATION_FILE_NAME } : {}) });
    return fail();
  }

  // Walk the host repository
  const ignored = createIgnoreMatcher(adapter, configuration, outputFolder.relativePath);
  const files = await _walk(root, '', ignored);

  // Collect the code file index
  const codeMatcher = ignore().add([...adapter.code, ...(configuration.code ?? [])]);
  const code = files.filter((path) => {
    if (sourceRoot && !path.startsWith(`${sourceRoot}/`)) return false;
    return codeMatcher.ignores(sourceRoot ? path.slice(sourceRoot.length + 1) : path);
  });

  // Collect the documentation files
  const documentationMatcher = ignore().add([...BUILT_IN_DOCUMENTATION, ...adapter.documentation, ...(configuration.documentation ?? [])]);
  const candidates = files.filter((path) => documentationMatcher.ignores(path));
  const documentation: DocumentationFile[] = [];
  for (const path of _pickDuplicates(candidates, issues)) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const extension = extname(name);
    documentation.push({ path, kind: _getKind(name, extension), extension, content: await readFile(join(root, path), 'utf8') });
  }

  // Find the showcases, virtual files, links and images in the Markdown documentation files, and check them
  const showcases: ScannedShowcase[] = [];
  const virtualFiles: VirtualFile[] = [];
  const links: _FoundLink[] = [];
  const headings = new Map<string, MarkdownHeading[]>();
  for (const file of documentation.filter((file) => isMarkdownPath(file.path))) {
    const scan = scanMarkdown(file.path, file.content);
    const heading = scan.headings.find((found) => found.text);
    if (heading) file.heading = heading.text;
    headings.set(file.path, scan.headings);
    showcases.push(...scan.showcases);
    virtualFiles.push(...scan.virtualFiles);
    links.push(...scan.links.map((link) => ({ ...link, documentation: file.path, image: false })));
    links.push(...scan.images.map((link) => ({ ...link, documentation: file.path, image: true })));
    issues.push(...scan.errors.map(({ line, message }) => ({ severity: 'error' as const, message, path: file.path, line })));
  }
  links.sort((a, b) => _compare(a.documentation, b.documentation) || a.line - b.line);
  await _checkVirtualFiles(root, virtualFiles, issues);
  trusted = await _checkShowcases(root, configuration, showcases, virtualFiles, issues, options.trust ?? false, report);
  const included = await _checkIncludes(root, documentation, showcases, virtualFiles, outputFolder.relativePath, issues);
  await _checkLinks(root, links, issues);
  const linkedFiles = await _collectLinkedFiles(root, documentation, links, showcases, included, outputFolder.relativePath, issues);

  // Resolve the navigation showroom.json configures, if any
  let navigation: NavigationItem[] | undefined;
  if (configuration.navigation && project) {
    const headingIds = new Map([...headings].map(([path, found]) => [path, found.map(({ id }) => id)]));
    const resolution = resolveNavigation(configuration.navigation, { documentation, headingIds, projectName: project.name });
    issues.push(...resolution.issues.map(({ severity, message, path }) => ({ severity, message, path: path ?? CONFIGURATION_FILE_NAME })));
    navigation = resolution.items;
  }

  if (!project || issues.some((issue) => issue.severity === 'error')) return fail();
  // Every showcase has its views by now: _checkShowcases() applied the defaults, or reported an error
  const host: HostInformation = {
    project,
    documentation,
    code,
    showcases: showcases as Showcase[],
    virtualFiles,
    linkedFiles,
    ...(navigation ? { navigation } : {}),
  };

  // Build every showcase, if asked to, throwing the showcase frames away; build warnings fail nothing
  if (options.showcases) {
    issues.push(...getBuildShowcasesIssues(await buildShowcases({ root, host, configuration, trust: trusted })));
    if (issues.some((issue) => issue.severity === 'error')) return fail();
  }
  return { passed: true, host, issues, trusted };
}

// #endregion

// #region Showcases

/**
 * Checks that every virtual file's name is unique in its folder, case-insensitively: among the virtual files, and among the real files and folders
 * on disk, ignored or not
 * @param root Path of the host repository's root
 * @param virtualFiles Virtual files, sorted by documentation file and line
 * @param issues Issues to add the errors to
 */
async function _checkVirtualFiles(root: string, virtualFiles: VirtualFile[], issues: CheckIssue[]): Promise<void> {
  const seen = new Map<string, VirtualFile>();
  const onDisk = new Map<string, Map<string, string>>();
  for (const file of virtualFiles) {
    const folder = getFolder(file.path);
    const name = file.path.slice(folder ? folder.length + 1 : 0);
    const error = (message: string): void => void issues.push({ severity: 'error', message, path: file.documentation, line: file.line });
    // Another virtual file
    const other = seen.get(file.path.toLowerCase());
    if (other) {
      error(`Virtual file "${file.path}" collides with the virtual file at ${other.documentation}:${other.line}`);
      continue;
    }
    seen.set(file.path.toLowerCase(), file);
    // A real file or folder
    if (!onDisk.has(folder)) {
      const names = await readdir(join(root, folder)).catch(() => [] as string[]);
      onDisk.set(folder, new Map(names.map((entry) => [entry.toLowerCase(), entry])));
    }
    const real = onDisk.get(folder)!.get(name.toLowerCase());
    if (real !== undefined) {
      error(`Virtual file "${file.path}" collides with "${folder ? `${folder}/` : ''}${real}" on disk`);
    }
  }
}

/**
 * Checks every showcase, in two parts around the decision to trust the host repository. First, without running anything of it: each showcase's
 * linked entry point, its showcase adapter's name, and for a built-in showcase adapter, its views and its validation (plain parsing). Then trust is
 * decided, when the host repository has something to trust (a showcase, or a custom showcase adapter), given what would run. With trust, the custom
 * showcase adapters are loaded (every one, used or not), their showcases' views resolved and validated, then each used showcase adapter's host
 * requirements checked, given the showcases whose validation passed (errors as error issues, warnings as warning issues). Without trust, nothing of
 * the host repository runs: no custom showcase adapter is loaded (its showcases keep their options unvalidated, and get the views of their marker,
 * else `showroom.json`'s `showcaseViews`, else `demo`), no host check runs, and warnings say so. Each showcase's options are replaced by the
 * validated ones, and each showcase without views gets its defaults: those `showroom.json`'s `showcaseViews` sets for its showcase adapter, or else
 * its showcase adapter's own.
 * @param root Path of the host repository's root
 * @param configuration Configuration of the host repository
 * @param showcases Showcases, sorted by documentation file and line
 * @param virtualFiles Virtual files
 * @param issues Issues to add the errors to
 * @param trust Whether the host repository's code may run, or the function deciding it (see CheckOptions' `trust`)
 * @param report What the showcases are reported as without trust: by showcase adapter (`check`), or as not built (`build`)
 * @returns True if the host repository's code was allowed to run
 */
async function _checkShowcases(
  root: string,
  configuration: Configuration,
  showcases: ScannedShowcase[],
  virtualFiles: VirtualFile[],
  issues: CheckIssue[],
  trust: NonNullable<CheckOptions['trust']>,
  report: 'check' | 'build',
): Promise<boolean> {
  const listed = configuration.customShowcaseAdapters ?? {};

  // The default views the configuration sets, each for a showcase adapter there is
  const configured = new Map<string, ShowcaseView[]>();
  for (const [name, views] of Object.entries(configuration.showcaseViews ?? {})) {
    configured.set(name, typeof views === 'string' ? [views] : views);
    if (!getShowcaseAdapterNames().includes(name) && !Object.hasOwn(listed, name)) {
      const message = `"showcaseViews" names "${name}", which is neither a built-in showcase adapter nor one of "customShowcaseAdapters"`;
      issues.push({ severity: 'error', message, path: CONFIGURATION_FILE_NAME });
    }
  }
  const adapters = new Map<string, ShowcaseAdapter>();
  const used = new Map<string, Showcase[]>();
  const custom = new Map<string, ScannedShowcase[]>(Object.keys(listed).map((name) => [name, []]));
  const virtualPaths = new Set(virtualFiles.map((file) => file.path.toLowerCase()));
  let trusted = false;

  try {
    // Without running anything of the host repository: the showcases' entry points, showcase adapters, and the built-in ones' views and validation
    for (const showcase of showcases) {
      const error = (message: string): void => void issues.push({ severity: 'error', message, path: showcase.documentation, line: showcase.line });

      // A linked entry point must be a real file
      if (showcase.kind === 'link') {
        const kind = virtualPaths.has(showcase.entry.toLowerCase()) ? 'virtual' : await _getEntryKind(join(root, showcase.entry));
        if (kind !== 'file') {
          error(
            kind === 'virtual'
              ? `A linked showcase's entry point "${showcase.entry}" is a virtual file; use a code block showcase instead`
              : `A linked showcase's entry point "${showcase.entry}" ${kind === 'folder' ? 'is a folder' : 'not found'}`,
          );
        }
      }

      // Its showcase adapter: a custom one is only loaded once trusted
      if (Object.hasOwn(listed, showcase.adapter)) {
        custom.get(showcase.adapter)!.push(showcase);
        continue;
      }
      if (!adapters.has(showcase.adapter)) {
        const adapter = createShowcaseAdapter(showcase.adapter);
        if (!adapter) {
          const names = [...getShowcaseAdapterNames(), ...Object.keys(listed)].sort();
          error(`Unknown showcase adapter "${showcase.adapter}"; the showcase adapters are: ${names.join(', ')}`);
          continue;
        }
        adapters.set(showcase.adapter, adapter);
      }
      await _validateShowcase(showcase, showcase.adapter, adapters.get(showcase.adapter)!, configured, used, error);
    }

    // Decide whether to trust the host repository, given what would run
    if (typeof trust !== 'function') {
      trusted = trust;
    } else if (showcases.length || custom.size) {
      const request: TrustRequest = {
        customShowcaseAdapters: await _getModules(root, listed),
        tools: [...used].flatMap(([name, valid]) => getTrustTools(name, resolve(root), valid)),
        showcases: showcases.length,
      };
      trusted = await trust(request).then(
        (answer) => answer === true,
        () => false,
      );
    }

    if (trusted) {
      // Load the custom showcase adapters, then resolve their showcases' views and validate them
      const loaded = await loadCustomShowcaseAdapters(root, listed);
      issues.push(...loaded.errors.map((message) => ({ severity: 'error' as const, message, path: CONFIGURATION_FILE_NAME })));
      for (const [name, adapter] of loaded.adapters) adapters.set(name, adapter);
      for (const [name, found] of custom) {
        const adapter = loaded.adapters.get(name);
        if (!adapter) continue; // A custom showcase adapter that didn't load, reported already
        for (const showcase of found) {
          const error = (message: string): void => void issues.push({ severity: 'error', message, path: showcase.documentation, line: showcase.line });
          await _validateShowcase(showcase, name, adapter, configured, used, error);
        }
      }

      // The host requirements of the showcase adapters in use, given the showcases whose validation passed
      for (const name of [...used.keys()].sort()) {
        try {
          const adapter = adapters.get(name)!;
          if (!adapter.check) continue;
          const result = checkHostCheckResult(
            await adapter.check(
              resolve(root),
              used.get(name)!.map((showcase) => ({ ...showcase })),
            ),
          );
          if ('problem' in result) {
            issues.push({ severity: 'error', message: `Showcase adapter "${name}" returned an invalid host check: ${result.problem}` });
            continue;
          }
          for (const [severity, messages] of [['error', result.errors] as const, ['warning', result.warnings] as const]) {
            issues.push(...messages.map((message) => ({ severity, message: `Showcase adapter "${name}": ${message}` })));
          }
        } catch (err) {
          issues.push({ severity: 'error', message: `Showcase adapter "${name}" failed to check the host repository: ${(err as Error).message}` });
        }
      }
    } else {
      // The custom showcase adapters' showcases get their views without them, and warnings say what didn't run
      for (const [name, found] of custom) {
        for (const showcase of found) {
          const error = (message: string): void => void issues.push({ severity: 'error', message, path: showcase.documentation, line: showcase.line });
          _resolveViews(showcase, configured.get(name) ?? [...DEFAULT_SHOWCASE_VIEWS], error);
        }
      }
      issues.push(..._getUntrustedWarnings(showcases.length, custom, used, adapters, report));
    }
  } finally {
    // Let every showcase adapter clean up
    for (const [name, adapter] of adapters) {
      try {
        await adapter.close?.();
      } catch (err) {
        issues.push({ severity: 'error', message: `Showcase adapter "${name}" failed to close: ${(err as Error).message}` });
      }
    }
  }
  return trusted;
}

/**
 * Resolves a showcase's views: its marker's, or else the defaults given; a showcase shown as a block with the view `none` can't include files
 * @param showcase The showcase, given its views in place
 * @param defaults The default views: the configuration's for its showcase adapter, or else the showcase adapter's own
 * @param error Reports an error at the showcase
 * @returns The showcase with its views, or undefined after an error
 */
function _resolveViews(showcase: ScannedShowcase, defaults: ShowcaseView[], error: (message: string) => void): Showcase | undefined {
  const resolved: Showcase = Object.assign(showcase, { views: showcase.views ?? defaults });
  // A linked showcase shown inline shows its tabs in the showcase sidebar, whatever its views
  if (resolved.views.includes('none') && resolved.tabs.length > 1 && resolved.display === 'block') {
    error(`A showcase shown with the view "none" can't have "include=", as nothing would show its tabs`);
    return undefined;
  }
  return resolved;
}

/**
 * Resolves a showcase's views and validates it with its showcase adapter, replacing its options by the validated ones, and adding it to its
 * showcase adapter's showcases whose validation passed
 * @param showcase The showcase
 * @param name Name of its showcase adapter
 * @param adapter Its showcase adapter
 * @param configured The default views the configuration sets, by showcase adapter
 * @param used The showcases whose validation passed, by showcase adapter, added to
 * @param error Reports an error at the showcase
 */
async function _validateShowcase(
  showcase: ScannedShowcase,
  name: string,
  adapter: ShowcaseAdapter,
  configured: ReadonlyMap<string, ShowcaseView[]>,
  used: Map<string, Showcase[]>,
  error: (message: string) => void,
): Promise<void> {
  const resolved = _resolveViews(showcase, configured.get(name) ?? getDefaultViews(adapter), error);
  if (!resolved) return;
  const valid = used.get(name) ?? [];
  used.set(name, valid);
  try {
    const validation = await adapter.validate({ ...resolved });
    if (validation.errors.length) {
      validation.errors.forEach(error);
    } else {
      if (validation.options === undefined) {
        delete showcase.options;
      } else {
        showcase.options = validation.options;
      }
      valid.push(resolved);
    }
  } catch (err) {
    error(`Showcase adapter "${name}" failed to validate the showcase: ${(err as Error).message}`);
  }
}

/**
 * Gets the custom showcase adapter modules a host repository lists, by name, with their real paths, for a trust request; one that doesn't exist is
 * left out
 * @param root Path of the host repository's root
 * @param listed Custom showcase adapters' paths, relative to the root, by name
 * @returns The modules, in the order listed
 */
async function _getModules(root: string, listed: Record<string, string>): Promise<TrustRequest['customShowcaseAdapters']> {
  const modules: TrustRequest['customShowcaseAdapters'] = [];
  for (const [name, path] of Object.entries(listed)) {
    const real = await realpath(resolve(root, path)).catch(() => undefined);
    if (real !== undefined) modules.push({ name, path: real });
  }
  return modules;
}

/**
 * Gets the warnings of a check without trust: by showcase adapter for `check` (each custom showcase adapter not loaded, each built-in one whose
 * host check didn't run, with its number of showcases), or for `build`, one about the showcases not built, and one about the custom showcase
 * adapters not loaded
 * @param count Number of showcases
 * @param custom The showcases of each custom showcase adapter listed, by name
 * @param used The showcases of each built-in showcase adapter whose validation passed, by name
 * @param adapters The built-in showcase adapters in use, by name
 * @param report What the showcases are reported as
 * @returns The warnings
 */
function _getUntrustedWarnings(
  count: number,
  custom: ReadonlyMap<string, ScannedShowcase[]>,
  used: ReadonlyMap<string, Showcase[]>,
  adapters: ReadonlyMap<string, ShowcaseAdapter>,
  report: 'check' | 'build',
): CheckIssue[] {
  const reason = `as the host repository isn't trusted`;
  const showcasesOf = (number: number) => `${number} showcase${number === 1 ? '' : 's'}`;
  const warning = (message: string): CheckIssue => ({ severity: 'warning', message });
  const names = [...custom.keys()].sort();
  if (report === 'build') {
    return [
      ...(count
        ? [warning(`${showcasesOf(count)} not built, ${reason}; ${count === 1 ? 'it is' : 'they are'} shown as ${count === 1 ? 'its' : 'their'} source`)]
        : []),
      ...(names.length ? [warning(`Custom showcase adapters not loaded, ${reason}: ${names.map((name) => `"${name}"`).join(', ')}`)] : []),
    ];
  }
  return [
    ...names.map((name) => warning(`Custom showcase adapter "${name}" not loaded, ${reason} (${showcasesOf(custom.get(name)!.length)})`)),
    ...[...used.keys()]
      .sort()
      .filter((name) => adapters.get(name)?.check)
      .map((name) => warning(`Showcase adapter "${name}": its host check didn't run, ${reason} (${showcasesOf(used.get(name)!.length)})`)),
  ];
}

/**
 * Represents the included files `check` found: the real files that passed, to be collected as linked files, and those that failed
 */
interface _IncludedFiles {
  /**
   * POSIX-style paths of the included real files that passed, relative to the root, with the showcase first including each
   */
  passed: Map<string, { documentation: string; line: number }>;
  /**
   * POSIX-style paths of the included files that failed, relative to the root, whose errors stand instead of any link's warnings
   */
  failed: Set<string>;
}

/**
 * Checks every showcase's included files: a virtual file (any, in any folder) or a documentation file, by its exact path, is found as it is;
 * a real file must exist with its path's exact case on every OS, be a file, be outside the output folder, and have its real path inside the root.
 * Each failure is an error at the showcase's line.
 * @param root Path of the host repository's root
 * @param documentation Documentation files
 * @param showcases Showcases
 * @param virtualFiles Virtual files
 * @param outputFolder POSIX-style path of the output folder, relative to the root
 * @param issues Issues to add the errors to
 * @returns The included real files that passed, and the included files that failed
 */
async function _checkIncludes(
  root: string,
  documentation: DocumentationFile[],
  showcases: ScannedShowcase[],
  virtualFiles: VirtualFile[],
  outputFolder: string,
  issues: CheckIssue[],
): Promise<_IncludedFiles> {
  const included: _IncludedFiles = { passed: new Map(), failed: new Set() };
  const known = new Set([...virtualFiles.map((file) => file.path), ...documentation.map((file) => file.path)]);
  const entries = new Map<string, string[]>();
  const realRoot = await realpath(root);
  for (const showcase of showcases) {
    for (const path of showcase.include) {
      const error = (message: string): void => {
        issues.push({ severity: 'error', message, path: showcase.documentation, line: showcase.line });
        included.failed.add(path);
      };
      if (known.has(path)) continue;
      const found = await _findExactly(root, path, entries);
      if (found !== true) {
        error(found ? `Included file "${path}" not found; did you mean "${found}"? (included paths are matched exactly)` : `Included file "${path}" not found`);
        continue;
      }
      if (await _isDirectory(join(root, path))) {
        error(`Included file "${path}" is a folder`);
        continue;
      }
      if (path === outputFolder || path.startsWith(`${outputFolder}/`)) {
        error(`Included file "${path}" is in the output folder, which \`showroom build\` empties`);
        continue;
      }
      const real = relative(realRoot, await realpath(join(root, path)));
      if (real === '..' || real.startsWith(`..${sep}`) || isAbsolute(real)) {
        error(`Included file "${path}" is outside the host repository (through a symbolic link)`);
        continue;
      }
      if (!included.passed.has(path)) included.passed.set(path, { documentation: showcase.documentation, line: showcase.line });
    }
  }
  return included;
}

/**
 * Finds a path on disk with its exact case, segment by segment, whatever the file system's case sensitivity
 * @param root Path of the host repository's root
 * @param path POSIX-style path, relative to the root
 * @param entries Each folder's entries read so far, by its path relative to the root, filled as folders are read
 * @returns True if every segment exists with its exact case; otherwise the path as it exists with another case, or undefined if it doesn't
 */
async function _findExactly(root: string, path: string, entries: Map<string, string[]>): Promise<true | string | undefined> {
  const segments = path.split('/');
  const actual: string[] = [];
  for (const segment of segments) {
    const folder = actual.join('/');
    if (!entries.has(folder)) entries.set(folder, await readdir(join(root, folder)).catch(() => [] as string[]));
    const names = entries.get(folder)!;
    const name = names.includes(segment) ? segment : names.find((candidate) => candidate.toLowerCase() === segment.toLowerCase());
    if (name === undefined) return undefined;
    actual.push(name);
  }
  const found = actual.join('/');
  return found === path ? true : found;
}

/**
 * Gets what is at a linked showcase's entry point
 * @param path Absolute path of the entry point
 * @returns `file`, `folder`, or `missing`
 */
async function _getEntryKind(path: string): Promise<'file' | 'folder' | 'missing'> {
  try {
    return (await stat(path)).isDirectory() ? 'folder' : 'file';
  } catch (_err) {
    return 'missing';
  }
}

// #endregion

// #region Links

/**
 * Represents a link, reference definition or image with a relative target, found in a Markdown documentation file
 */
interface _FoundLink extends MarkdownLink {
  /**
   * POSIX-style path of the documentation file holding it
   */
  documentation: string;
  /**
   * True for an image
   */
  image: boolean;
}

/**
 * Checks every link and image with a relative target in the Markdown documentation files, warning about those leading outside the host repository,
 * or to nothing on disk
 * @param root Path of the host repository's root
 * @param links Links and images, with the documentation file holding each
 * @param issues Issues to add the warnings to
 */
async function _checkLinks(root: string, links: _FoundLink[], issues: CheckIssue[]): Promise<void> {
  for (const link of links) {
    const broken = (reason: string): void =>
      void issues.push({
        severity: 'warning',
        message: `Broken ${link.image ? 'image' : 'link'} "${link.href}": ${reason}`,
        path: link.documentation,
        line: link.line,
      });
    const target = splitLink(link.href);
    if (!target) {
      broken(`it can't be URL-decoded`);
      continue;
    }
    if (!target.path) continue; // Only a query: the documentation file itself
    const resolved = resolvePath(link.documentation, target.path);
    if (!resolved) {
      broken('it leads outside the host repository');
    } else if ((await _getEntryKind(join(root, resolved.path))) === 'missing') {
      broken(`nothing at "${resolved.path}"`);
    }
  }
}

// #endregion

// #region Linked files

/**
 * Collects the linked files: the files the links, images and linked showcases' entry points name, and the included real files that passed their
 * check, ignored or not, except documentation files, folders and missing files (warned or errored about already). A file in the output folder, which `build` empties, and a file whose real path (following
 * symbolic links) is outside the host repository are warned about, and left out. Each file's text-ness is decided from its content, read only up
 * to the showcase sidebar's limit.
 * @param root Path of the host repository's root
 * @param documentation Documentation files
 * @param links Links and images, with the documentation file holding each
 * @param showcases Showcases
 * @param included The included files: those that passed are linked files too, and those that failed are left out with no warning
 * @param outputFolder POSIX-style path of the output folder, relative to the root
 * @param issues Issues to add the warnings to
 * @returns The linked files, sorted by path
 */
async function _collectLinkedFiles(
  root: string,
  documentation: DocumentationFile[],
  links: _FoundLink[],
  showcases: ScannedShowcase[],
  included: _IncludedFiles,
  outputFolder: string,
  issues: CheckIssue[],
): Promise<LinkedFile[]> {
  // The paths named, with where each was first named: the included files that passed first, which no warning concerns
  const named = new Map<string, { documentation: string; line: number }>(included.passed);
  const documentationPaths = new Set(documentation.map((file) => file.path.toLowerCase()));
  for (const link of links) {
    const target = splitLink(link.href);
    const resolved = target?.path ? resolvePath(link.documentation, target.path) : undefined;
    if (resolved && !resolved.isFolder && resolved.path && !named.has(resolved.path)) named.set(resolved.path, link);
  }
  for (const showcase of showcases) {
    if (showcase.kind === 'link' && !named.has(showcase.entry)) named.set(showcase.entry, { documentation: showcase.documentation, line: showcase.line });
  }

  // The files among them
  const linkedFiles: LinkedFile[] = [];
  const realRoot = await realpath(root);
  for (const [path, { documentation: from, line }] of named) {
    const warn = (message: string): void => void issues.push({ severity: 'warning', message, path: from, line });
    if (documentationPaths.has(path.toLowerCase()) || included.failed.has(path)) continue;
    const info = await stat(join(root, path)).catch(() => undefined);
    if (!info?.isFile()) continue;
    if (path === outputFolder || path.startsWith(`${outputFolder}/`)) {
      warn(`Linked file "${path}" is in the output folder, which \`showroom build\` empties; it isn't copied into the showroom`);
      continue;
    }
    const real = relative(realRoot, await realpath(join(root, path)));
    if (real === '..' || real.startsWith(`..${sep}`) || isAbsolute(real)) {
      warn(`Linked file "${path}" is outside the host repository (through a symbolic link); it isn't copied into the showroom`);
      continue;
    }
    linkedFiles.push({ path, size: info.size, text: info.size <= LINKED_FILE_SIDEBAR_LIMIT && isText(await _readStart(join(root, path), info.size)) });
  }
  return linkedFiles.sort((a, b) => _compare(a.path, b.path));
}

/**
 * Reads a file's content, up to a size
 * @param path Path of the file
 * @param size Number of bytes to read at most
 * @returns The bytes read
 */
async function _readStart(path: string, size: number): Promise<Uint8Array> {
  const handle = await open(path, 'r');
  try {
    const buffer = new Uint8Array(size);
    const { bytesRead } = await handle.read(buffer, 0, size, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// #endregion

// #region Files

/**
 * Walks a directory, collecting the files that aren't ignored; symbolic links are not followed
 * @param root Path of the host repository's root
 * @param directory POSIX-style path of the directory to walk, relative to the root ('' for the root itself)
 * @param ignored Matcher of the ignored files
 * @returns POSIX-style paths of the files found, relative to the root, sorted
 */
async function _walk(root: string, directory: string, ignored: ReturnType<typeof ignore>): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => _compare(a.name, b.name))) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!ignored.ignores(`${path}/`)) files.push(...(await _walk(root, path, ignored)));
    } else if (entry.isFile()) {
      if (!ignored.ignores(path)) files.push(path);
    }
  }
  return files.sort(_compare);
}

/**
 * Picks one file where a folder holds several documentation files of the same built-in kind (e.g. `README.md` and `README.txt`), by extension
 * priority (`.md`, then none, then `.txt`, then any other), reporting a warning for each such folder
 * @param paths POSIX-style paths of the documentation files, sorted
 * @param issues Issues to add the warnings to
 * @returns The paths kept, sorted
 */
function _pickDuplicates(paths: string[], issues: CheckIssue[]): string[] {
  // Group the files of a built-in kind by folder and kind
  const groups = new Map<string, string[]>();
  const kept: string[] = [];
  for (const path of paths) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const kind = _getKind(name, extname(name));
    if (kind === 'other') {
      kept.push(path);
      continue;
    }
    const key = `${path.slice(0, Math.max(path.lastIndexOf('/'), 0))}\0${kind}`;
    groups.set(key, [...(groups.get(key) ?? []), path]);
  }
  // Keep one file of each group
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => _priority(a) - _priority(b) || _compare(a, b));
    kept.push(sorted[0]);
    if (sorted.length > 1) {
      const [folder, kind] = key.split('\0');
      issues.push({
        severity: 'warning',
        message: `Several ${kind} files in ${folder ? `"${folder}"` : 'the root'} (${sorted.join(', ')}); using ${sorted[0]}`,
        path: sorted[0],
      });
    }
  }
  return kept.sort(_compare);
}

/**
 * Gets the extension priority of a documentation file
 * @param path Path of the file
 * @returns Priority: lower wins
 */
function _priority(path: string): number {
  return _EXTENSION_PRIORITY[extname(path.slice(path.lastIndexOf('/') + 1)).toLowerCase()] ?? 3;
}

/**
 * Compares two strings by code unit, for a sort order that doesn't depend on the locale
 * @param a First string
 * @param b Second string
 * @returns Negative, zero or positive, as `Array.prototype.sort` expects
 */
function _compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Converts a path to POSIX style
 * @param path Path to convert
 * @returns The path with `/` separators
 */
function _toPosix(path: string): string {
  return path.split(sep).join('/');
}

/**
 * Checks if a path is a directory
 * @param path Path to check
 * @returns True if the path exists and is a directory
 */
async function _isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (_err) {
    return false;
  }
}

// #endregion
