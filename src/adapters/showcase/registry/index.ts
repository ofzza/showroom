/**
 * Showcase adapter registry: the built-in showcase adapters, and loading the custom showcase adapters a host repository lists in its
 * `showroom.json`. Internal, never re-exported.
 */

import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Showcase, ShowcaseView } from '../../../host/index.js';
import { checkShowcaseViews, SHOWCASE_ADAPTER_NAME } from '../../../markdown/index.js';
import { HtmlShowcaseAdapter } from '../html/index.js';
import { AngularShowcaseAdapter } from '../angular/index.js';
import { CS_ENVIRONMENT_NAMES, CsShowcaseAdapter, getHostSdkPaths, readGlobalJson } from '../cs/index.js';
import type { ShowcaseAdapter, ShowcaseHostCheck } from '../index.js';
import { JsonSchemaShowcaseAdapter } from '../jsonschema/index.js';
import { ReactShowcaseAdapter } from '../react/index.js';
import { TsShowcaseAdapter } from '../ts/index.js';
import { getDocumentationFolder, resolvePackage } from '../ts/typecheck/index.js';
import { resolveCommand } from '../../../processes/index.js';

// #region Built-in showcase adapters

/**
 * Built-in showcase adapters, by name
 */
const _SHOWCASE_ADAPTERS: Record<string, () => ShowcaseAdapter> = {
  html: () => new HtmlShowcaseAdapter(),
  ts: () => new TsShowcaseAdapter(),
  react: () => new ReactShowcaseAdapter(),
  angular: () => new AngularShowcaseAdapter(),
  cs: () => new CsShowcaseAdapter(),
  jsonschema: () => new JsonSchemaShowcaseAdapter(),
};

/**
 * Names of the showcase adapters planned as built-in ones, which custom showcase adapters can't take either
 */
export const PLANNED_SHOWCASE_ADAPTER_NAMES: readonly string[] = [];

/**
 * Names of the built-in showcase adapters whose showcase frames load the shared Mermaid bundle; internal, never part of the showcase adapter
 * interface, so custom showcase adapters can't use it
 */
const _MERMAID_SHOWCASE_ADAPTERS: readonly string[] = ['jsonschema'];

/**
 * Checks if a built-in showcase adapter's showcase frames load the shared Mermaid bundle (see MERMAID_FOLDER)
 * @param name Name of the showcase adapter
 * @param names Names of the built-in showcase adapters that do; the registry's own if not given
 * @returns True if it is built in, and its showcase frames load it
 */
export function usesMermaidBundle(name: string, names: readonly string[] = _MERMAID_SHOWCASE_ADAPTERS): boolean {
  return Object.hasOwn(_SHOWCASE_ADAPTERS, name) && names.includes(name);
}

/**
 * Default showcase views of a showcase adapter that declares none (see ShowcaseAdapter's `defaultViews`)
 */
export const DEFAULT_SHOWCASE_VIEWS: readonly ShowcaseView[] = ['demo'];

/**
 * Gets a showcase adapter's default showcase views
 * @param adapter The showcase adapter
 * @returns Its `defaultViews`, or DEFAULT_SHOWCASE_VIEWS if it declares none
 */
export function getDefaultViews(adapter: ShowcaseAdapter): ShowcaseView[] {
  return [...(adapter.defaultViews ?? DEFAULT_SHOWCASE_VIEWS)];
}

/**
 * Gets the names of the environment variables of `showroom`'s own environment a built-in showcase adapter passes on to the commands it runs, beside
 * the fixed ones: `DOTNET_ROOT` for the `cs` showcase adapter, none for any other
 * @param name Name of the showcase adapter
 * @returns The names
 */
export function getShowcaseAdapterEnvironmentNames(name: string): readonly string[] {
  return name === 'cs' ? CS_ENVIRONMENT_NAMES : [];
}

/**
 * Gets the names of the built-in showcase adapters
 * @returns Names of the built-in showcase adapters, sorted
 */
export function getShowcaseAdapterNames(): string[] {
  return Object.keys(_SHOWCASE_ADAPTERS).sort();
}

/**
 * Creates a built-in showcase adapter by name
 * @param name Name of the showcase adapter
 * @returns A new showcase adapter object, or undefined if there is no built-in one by that name
 */
export function createShowcaseAdapter(name: string): ShowcaseAdapter | undefined {
  return Object.hasOwn(_SHOWCASE_ADAPTERS, name) ? _SHOWCASE_ADAPTERS[name]() : undefined;
}

// #endregion

// #region Custom showcase adapters

/**
 * Represents the outcome of loading a host repository's custom showcase adapters: those that loaded, and the errors of those that didn't
 */
export interface CustomShowcaseAdapters {
  /**
   * Custom showcase adapters that loaded, by name
   */
  adapters: Map<string, ShowcaseAdapter>;
  /**
   * Errors of the custom showcase adapters that didn't load
   */
  errors: string[];
}

/**
 * Loads and validates the custom showcase adapters a host repository lists, running the host repository's code: each module's default export is a
 * factory, called once per call of this function, so each run gets fresh showcase adapter objects. Node keeps every module it loads for the life of
 * the process, so each module is imported by a URL carrying its content's hash: an unchanged module is reused, and a changed one loaded once more,
 * which a long-running `serve` needs. The modules it imports are not reloaded.
 * @param root Path of the host repository's root
 * @param listed Custom showcase adapters' paths (relative to the root), by name, as `showroom.json`'s `customShowcaseAdapters` lists them
 * @returns The custom showcase adapters that loaded, and the errors of those that didn't
 */
export async function loadCustomShowcaseAdapters(root: string, listed: Record<string, string>): Promise<CustomShowcaseAdapters> {
  const result: CustomShowcaseAdapters = { adapters: new Map(), errors: [] };
  for (const [name, path] of Object.entries(listed)) {
    const loaded = await _load(root, name, path);
    if ('error' in loaded) {
      result.errors.push(`Custom showcase adapter "${name}": ${loaded.error}`);
    } else {
      result.adapters.set(name, loaded.adapter);
    }
  }
  return result;
}

/**
 * Loads and validates one custom showcase adapter
 * @param root Path of the host repository's root
 * @param name Name of the custom showcase adapter
 * @param path Path of its module, relative to the root
 * @returns The custom showcase adapter, or the error that prevents using it
 */
async function _load(root: string, name: string, path: string): Promise<{ adapter: ShowcaseAdapter } | { error: string }> {
  // Check the name
  if (!SHOWCASE_ADAPTER_NAME.test(name)) {
    return { error: 'invalid name: use lower-case letters, digits and "-", starting with a letter' };
  }
  if (Object.hasOwn(_SHOWCASE_ADAPTERS, name) || PLANNED_SHOWCASE_ADAPTER_NAMES.includes(name)) {
    return { error: 'the name is taken by a built-in showcase adapter' };
  }

  // Check the path
  const absolute = resolve(root, path);
  const fromRoot = relative(resolve(root), absolute);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    return { error: `"${path}" is outside the host repository` };
  }
  if (!/\.m?js$/.test(absolute)) {
    return { error: `"${path}" must be a .js or .mjs file` };
  }
  try {
    if (!(await stat(absolute)).isFile()) {
      return { error: `"${path}" is not a file` };
    }
  } catch (_err) {
    return { error: `"${path}" not found` };
  }

  // Load the module, by a URL carrying its content's hash, and create the showcase adapter with its default export
  let module: Record<string, unknown>;
  try {
    const hash = createHash('sha256')
      .update(await readFile(absolute))
      .digest('hex')
      .slice(0, 16);
    module = await import(`${pathToFileURL(absolute).href}?v=${hash}`);
  } catch (err) {
    return { error: `"${path}" failed to load: ${(err as Error).message}` };
  }
  const factory = module.default;
  if (typeof factory !== 'function') {
    return { error: `"${path}" must have a default export: a function returning an object implementing the showcase adapter interface` };
  }
  let adapter: Record<string, unknown> | undefined;
  try {
    adapter = await (factory as () => Record<string, unknown> | Promise<Record<string, unknown>>)();
  } catch (err) {
    return { error: `"${path}" failed to create its showcase adapter: ${(err as Error).message}` };
  }
  if (typeof adapter !== 'object' || adapter === null) {
    return { error: `"${path}"'s default export must return an object implementing the showcase adapter interface` };
  }
  const missing = ['validate', 'build'].filter((method) => typeof adapter[method] !== 'function');
  const invalid = ['check', 'close'].filter((method) => adapter[method] !== undefined && typeof adapter[method] !== 'function');
  if (missing.length || invalid.length) {
    const methods = [...missing, ...invalid].map((method) => `"${method}"`).join(', ');
    return { error: `"${path}"'s default export must return an object implementing the showcase adapter interface; check ${methods}` };
  }
  const views = adapter.defaultViews;
  if (views !== undefined) {
    const problem = Array.isArray(views) ? checkShowcaseViews(views) : 'it must be a list of views';
    if (problem) return { error: `"${path}"'s showcase adapter has invalid "defaultViews": ${problem}` };
  }
  const problem = checkRecordedDeclarations(adapter);
  if (problem) return { error: `"${path}"'s showcase adapter ${problem}` };
  return { adapter: adapter as unknown as ShowcaseAdapter };
}

/**
 * Checks a showcase adapter's declarations about recording and the host copy: `recorded`, a boolean, which needs `defaultViews` without `demo`;
 * `hostCopy`, `{ exclude, git }`, a list of patterns and a boolean
 * @param adapter The showcase adapter
 * @returns The problem with them, if any, as the end of a sentence about the showcase adapter
 */
export function checkRecordedDeclarations(adapter: Record<string, unknown>): string | undefined {
  const { recorded, hostCopy, defaultViews } = adapter;
  if (recorded !== undefined && typeof recorded !== 'boolean') return 'has invalid "recorded": it must be a boolean';
  if (recorded === true && (!Array.isArray(defaultViews) || defaultViews.includes('demo'))) {
    return 'records its showcases, so it must declare "defaultViews", without "demo" (its showcases have no showcase frame)';
  }
  if (hostCopy !== undefined) {
    const { exclude, git } = (typeof hostCopy === 'object' && hostCopy !== null ? hostCopy : {}) as Record<string, unknown>;
    if (!Array.isArray(exclude) || !exclude.every((pattern) => typeof pattern === 'string') || typeof git !== 'boolean') {
      return 'has invalid "hostCopy": it must be { exclude, git }, a list of patterns and a boolean';
    }
  }
  return undefined;
}

// #endregion

// #region Host checks

/**
 * Checks what a showcase adapter's `check()` returned: `{ errors, warnings }`, two lists of strings, either of them empty
 * @param result What `check()` returned (awaited)
 * @returns The host check, or a description of what is wrong with the result
 */
export function checkHostCheckResult(result: unknown): ShowcaseHostCheck | { problem: string } {
  const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
  if (Array.isArray(result)) {
    return { problem: 'it returned a list; since the host check returns { errors, warnings }, return the list as "errors", with "warnings: []"' };
  }
  if (typeof result !== 'object' || result === null) return { problem: 'it must return { errors, warnings }, two lists of strings' };
  const { errors, warnings } = result as Record<string, unknown>;
  if (!isStrings(errors)) return { problem: '"errors" must be a list of strings' };
  if (!isStrings(warnings)) return { problem: '"warnings" must be a list of strings' };
  return { errors, warnings };
}

// #endregion

// #region Trust

/**
 * Represents a tool from outside `showroom` that building a showcase would load: a package resolved from the host repository
 */
export interface TrustTool {
  /**
   * Name of the package (e.g. `typescript`)
   */
  name: string;
  /**
   * Absolute real path of the package's folder
   */
  path: string;
}

/**
 * Names of the CSS preprocessors the bundler loads from the host repository when a showcase imports a stylesheet of their kind
 */
export const CSS_PREPROCESSORS: readonly string[] = ['sass', 'sass-embedded', 'less', 'stylus'];

/**
 * Gets the tools from outside `showroom` that a built-in showcase adapter's host check and builds would load, resolved from each documentation
 * file's folder without loading anything: for the `ts` and `react` showcase adapters, TypeScript where showcases type check, and the CSS
 * preprocessors; for the `angular` showcase adapter, Angular's compiler, its TypeScript, and the CSS preprocessors; nothing for the `html` showcase
 * adapter, or for any other. Internal: the trust request's hook, never part of the showcase adapter interface.
 * @param name Name of the built-in showcase adapter
 * @param root Absolute path of the host repository's root
 * @param showcases Its showcases whose validation passed, with their validated options
 * @param resolver Resolves a package from a folder (see resolvePackage()); the tests replace it
 * @returns The tools, by real path, without duplicates, sorted by name then path
 */
export function getTrustTools(
  name: string,
  root: string,
  showcases: readonly Showcase[],
  resolver: (folder: string, name: string) => string | undefined = resolvePackage,
): TrustTool[] {
  if (name !== 'ts' && name !== 'react' && name !== 'angular') return [];
  const tools = new Map<string, TrustTool>();
  const add = (tool: string, folder: string | undefined) => {
    if (folder === undefined) return;
    const path = _realPath(folder);
    tools.set(`${tool}\0${path}`, { name: tool, path });
  };
  for (const showcase of showcases) {
    const folder = resolve(root, getDocumentationFolder(showcase.documentation));
    if (name === 'angular') {
      const compilerCli = resolver(folder, '@angular/compiler-cli');
      add('@angular/compiler-cli', compilerCli);
      if (compilerCli !== undefined) add('typescript', resolver(compilerCli, 'typescript'));
    } else if ((showcase.options as { typeCheck?: unknown } | undefined)?.typeCheck !== false) {
      add('typescript', resolver(folder, 'typescript'));
    }
    for (const preprocessor of CSS_PREPROCESSORS) add(preprocessor, resolver(folder, preprocessor));
  }
  return [...tools.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Gets the executables a built-in showcase adapter's host check and builds would start, resolved from the `PATH` without starting anything: for the
 * `cs` showcase adapter, `dotnet` (from outside the host repository), and the SDK folders the host's `global.json` names inside the host repository
 * (`sdk.paths`, read statically), which its builds may use; none for any other. Internal: the trust request's hook, never part of the showcase
 * adapter interface.
 * @param name Name of the built-in showcase adapter
 * @param root Absolute path of the host repository's root
 * @param _showcases Its showcases whose validation passed
 * @param resolver Resolves a command from the `PATH`, outside the given folders (see resolveCommand()); the tests replace it
 * @returns The executables, by name and real path
 */
export function getTrustExecutables(
  name: string,
  root: string,
  _showcases: readonly Showcase[],
  resolver: (command: string, excluded: readonly string[]) => string | undefined = (command, excluded) =>
    resolveCommand(command, { path: process.env.PATH ?? process.env.Path, excluded, pathext: process.env.PATHEXT }),
): TrustTool[] {
  if (name !== 'cs') return [];
  const executables: TrustTool[] = [];
  const dotnet = resolver('dotnet', [root]);
  if (dotnet !== undefined) executables.push({ name: 'dotnet', path: _realPath(dotnet) });
  const globalJson = readGlobalJson(root);
  const paths = globalJson && !('error' in globalJson) ? (globalJson.paths ?? []) : [];
  for (const path of getHostSdkPaths(root, paths)) executables.push({ name: 'dotnet SDK (global.json)', path: _realPath(path) });
  return executables;
}

/**
 * Gets the real path of a path, following symbolic links
 * @param path The path
 * @returns Its real path, or the path itself if it can't be resolved
 */
function _realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch (_err) {
    return path;
  }
}

// #endregion
