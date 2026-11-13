/**
 * Type checking `ts` showcases with the host repository's own TypeScript, 5.x or 6.x, through its classic compiler API: finding and loading it from
 * a documentation file's folder, the nearest `tsconfig.json` applied whole (its emit options dropped), a compiler host serving the virtual files from
 * memory and sharing parsed source files between a run's showcases, and the type errors of the files a showcase reaches. Node code; `showroom`'s own
 * `typescript` is only imported for its types. Internal, never re-exported.
 */

import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type * as TypeScript from 'typescript';
import type { Showcase, VirtualFile } from '../../../../host/index.js';
import type { ShowcaseBuildError, ShowcaseHostCheck } from '../../index.js';

// #region Finding TypeScript

/**
 * Represents a TypeScript module, as `typescript` exports it
 */
export type TypeScriptModule = typeof TypeScript;

/**
 * Represents how far a TypeScript version is supported: `supported` (5.x and 6.x), `old` (before 5.0), or `unsupported` (7 and later, or a
 * version that can't be read)
 */
export type TypeScriptSupport = 'supported' | 'old' | 'unsupported';

/**
 * Represents the TypeScript a documentation file's folder finds
 */
export interface FoundTypeScript {
  /**
   * Absolute path of the `typescript` package's folder
   */
  folder: string;
  /**
   * Its version, from its `package.json`, or an empty string if it can't be read
   */
  version: string;
  /**
   * How far its version is supported
   */
  support: TypeScriptSupport;
}

/**
 * Represents a function resolving the `typescript` package from a folder
 * @param folder Absolute path of the folder
 * @returns Absolute path of the package's folder, or undefined if it isn't found
 */
export type TypeScriptResolver = (folder: string) => string | undefined;

/**
 * Resolves a package from a folder, as Node resolves it (up through every `node_modules` folder above it, past the host repository's root too)
 * @param folder Absolute path of the folder
 * @param name The package's name
 * @returns Absolute path of the package's folder, or undefined if it isn't found
 */
export function resolvePackage(folder: string, name: string): string | undefined {
  const require = createRequire(join(folder, '_.js'));
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch (_err) {
    // Its `package.json` may not be exported: walk up from its main module instead
  }
  try {
    for (let current = dirname(require.resolve(name)); dirname(current) !== current; current = dirname(current)) {
      if (readPackageJson(current)?.name === name) return current;
    }
  } catch (_err) {
    // Not installed, or a package of types only, with no main module
  }
  return undefined;
}

/**
 * Resolves the `typescript` package from a folder (see resolvePackage())
 * @param folder Absolute path of the folder
 * @returns Absolute path of the package's folder, or undefined if it isn't found
 */
export function resolveTypeScript(folder: string): string | undefined {
  return resolvePackage(folder, 'typescript');
}

/**
 * Reads a package's `package.json`
 * @param folder Absolute path of the package's folder
 * @returns Its content, or undefined if it can't be read
 */
export function readPackageJson(folder: string): Record<string, unknown> | undefined {
  try {
    const content: unknown = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
    return typeof content === 'object' && content !== null ? (content as Record<string, unknown>) : undefined;
  } catch (_err) {
    return undefined;
  }
}

/**
 * Judges a TypeScript version: 5.x and 6.x (prereleases included) are supported, older ones are too old, and 7 and later aren't supported yet
 * @param version The version
 * @returns How far it is supported; a version that can't be read is unsupported
 */
export function judgeTypeScriptVersion(version: string): TypeScriptSupport {
  const major = /^(\d+)\.\d+/.exec(version.trim())?.[1];
  if (major === undefined) return 'unsupported';
  return Number(major) < 5 ? 'old' : Number(major) >= 7 ? 'unsupported' : 'supported';
}

/**
 * Finds the TypeScript a folder resolves, with its version
 * @param folder Absolute path of the folder
 * @param resolver Resolves the `typescript` package from the folder (see resolveTypeScript())
 * @returns The TypeScript found, or undefined if there is none
 */
export function findTypeScript(folder: string, resolver: TypeScriptResolver = resolveTypeScript): FoundTypeScript | undefined {
  const found = resolver(folder);
  if (found === undefined) return undefined;
  const version = readPackageJson(found)?.version;
  const text = typeof version === 'string' ? version : '';
  return { folder: found, version: text, support: judgeTypeScriptVersion(text) };
}

/**
 * Loads a TypeScript package, once per process (Node keeps the module it loaded)
 * @param folder Absolute path of the package's folder
 * @returns The TypeScript module
 */
export function loadTypeScript(folder: string): TypeScriptModule {
  return createRequire(import.meta.url)(folder) as TypeScriptModule;
}

/**
 * Gets the POSIX-style path of a documentation file's folder, relative to the host repository's root (`.` for the root)
 * @param documentation POSIX-style path of the documentation file, relative to the root
 * @returns The folder's path
 */
export function getDocumentationFolder(documentation: string): string {
  const at = documentation.lastIndexOf('/');
  return at < 0 ? '.' : documentation.slice(0, at);
}

/**
 * Checks that the showcases that type check find a supported TypeScript, once per documentation file's folder: an error where TypeScript is missing
 * or older than 5.0, a warning where it is 7 or later (their type checking is skipped), each naming the folder and the version found
 * @param root Absolute path of the host repository's root
 * @param showcases The showcases whose validation passed, with their validated options
 * @param resolver Resolves the `typescript` package from a folder (see resolveTypeScript())
 * @param adapter The showcase adapter's name, in the messages
 * @returns The host requirements missing, and the warnings
 */
export function checkTypeScript(
  root: string,
  showcases: readonly Showcase[],
  resolver: TypeScriptResolver = resolveTypeScript,
  adapter = 'ts',
): ShowcaseHostCheck {
  const result: ShowcaseHostCheck = { errors: [], warnings: [] };
  const folders = [
    ...new Set(showcases.filter((showcase) => (showcase.options as { typeCheck?: unknown } | undefined)?.typeCheck !== false).map(_folderOf)),
  ].sort();
  for (const folder of folders) {
    const found = findTypeScript(resolve(root, folder), resolver);
    if (!found) {
      result.errors.push(
        `the ${adapter} showcases of "${folder}" type check, but no TypeScript is installed where it can be found: install "typescript" (5.x or 6.x), or set "typeCheck: false"`,
      );
    } else if (found.support === 'old') {
      result.errors.push(
        `the ${adapter} showcases of "${folder}" type check, but the TypeScript found, ${found.version}, is older than 5.0: upgrade it, or set "typeCheck: false"`,
      );
    } else if (found.support === 'unsupported') {
      result.warnings.push(
        `type checking skipped for the ${adapter} showcases of "${folder}": the TypeScript found, ${found.version || 'of an unknown version'}, isn't supported yet (5.x and 6.x are)`,
      );
    }
  }
  return result;
}

/**
 * Gets the folder of a showcase's documentation file (see getDocumentationFolder())
 * @param showcase The showcase
 * @returns The folder's POSIX-style path, relative to the root
 */
function _folderOf(showcase: Showcase): string {
  return getDocumentationFolder(showcase.documentation);
}

// #endregion

// #region Paths

/**
 * Turns a path's separators into `/`, as TypeScript writes paths
 * @param path The path
 * @returns The path with `/` separators
 */
function _slashes(path: string): string {
  return path.split('\\').join('/');
}

/**
 * Checks if a file is a dependency's: under a `node_modules` folder, judged on its path relative to the host repository's root (fixture copies live
 * under `node_modules/.cache/`), or on its absolute path for a file outside the root
 * @param root Absolute path of the host repository's root
 * @param path Absolute path of the file
 * @returns True if it is in a `node_modules` folder
 */
export function isDependencyFile(root: string, path: string): boolean {
  const relativePath = relative(root, resolve(path));
  const inside = relativePath && relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
  return _slashes(inside ? relativePath : resolve(path))
    .split('/')
    .includes('node_modules');
}

/**
 * Gets a real file's POSIX-style path relative to the host repository's root
 * @param root Absolute path of the host repository's root
 * @param path Absolute path of the file
 * @returns The relative path, or undefined for a file outside the root
 */
function _relativeToRoot(root: string, path: string): string | undefined {
  const relativePath = relative(root, resolve(path));
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return undefined;
  return _slashes(relativePath);
}

// #endregion

// #region Configuration

/**
 * Compiler options of the nearest tsconfig that can't coexist with a showcase outside the host's own project, dropped for type checking
 */
export const DROPPED_COMPILER_OPTIONS: readonly string[] = [
  'rootDir',
  'composite',
  'incremental',
  'tsBuildInfoFile',
  'outDir',
  'outFile',
  'declaration',
  'declarationMap',
  'declarationDir',
  'emitDeclarationOnly',
  'isolatedDeclarations',
  'sourceMap',
  'inlineSourceMap',
  'inlineSources',
  'mapRoot',
  'sourceRoot',
];

/**
 * Codes of the tsconfig errors left out: "No inputs were found" (TS18002, TS18003), which can't apply as the entry point is always a root
 */
const _NO_INPUTS: readonly number[] = [18002, 18003];

/**
 * Finds the nearest `tsconfig.json`: in a folder, or the folders above it, up to the host repository's root
 * @param root Absolute path of the host repository's root
 * @param folder Absolute path of the folder to start from, inside the root
 * @returns Absolute path of the tsconfig, or undefined if there is none
 */
export function findTsConfig(root: string, folder: string): string | undefined {
  for (let current = folder; ; current = dirname(current)) {
    const path = join(current, 'tsconfig.json');
    try {
      if (statSync(path).isFile()) return path;
    } catch (_err) {
      // None here
    }
    if (_relativeToRoot(root, current) === undefined || dirname(current) === current) return undefined;
  }
}

/**
 * Represents what a showcase is type checked with: the compiler options, the program's roots, the tsconfig's own errors, and the tsconfig files read
 */
export interface TypeCheckConfiguration {
  /**
   * Compiler options: the nearest tsconfig's (its `extends` followed), with `noEmit` forced and DROPPED_COMPILER_OPTIONS dropped; or TypeScript's
   * defaults without one
   */
  options: TypeScript.CompilerOptions;
  /**
   * Absolute paths of the program's roots: the tsconfig's files (its `files`, `include` and `exclude`), and the entry point
   */
  rootNames: string[];
  /**
   * Errors in the tsconfig, or in a file it extends
   */
  diagnostics: TypeScript.Diagnostic[];
  /**
   * Absolute paths of the tsconfig, and of the files it extends
   */
  configFiles: string[];
}

/**
 * Represents what a showcase's type check configuration depends on
 */
export interface TypeCheckConfigurationOptions {
  /**
   * Absolute path of the host repository's root
   */
  root: string;
  /**
   * Absolute path of the documentation file's folder, where the nearest tsconfig is looked up from
   */
  folder: string;
  /**
   * Absolute path of the entry point
   */
  entry: string;
  /**
   * True to set `allowJs`: for a `js`, `mjs` or `jsx` entry point, or the showcase's `allowJs` option
   */
  allowJs: boolean;
  /**
   * True to set `jsx: react-jsx` where the tsconfig (or its absence) leaves `jsx` unset: for `react` showcases
   */
  jsx?: boolean;
}

/**
 * Gets what a showcase is type checked with (see TypeCheckConfiguration): the nearest tsconfig, from the documentation file's folder up to the host
 * repository's root, applied whole, as `tsc -p` would (its `references` aren't built), except for the options that can't coexist with a file
 * outside the project; or TypeScript's defaults, as `tsc` without a tsconfig, and the entry point the only root. With `jsx`, `jsx: react-jsx` is
 * the default where `jsx` is unset
 * @param ts The host's TypeScript
 * @param options What the configuration depends on
 * @returns The configuration
 */
export function getTypeCheckConfiguration(
  ts: TypeScriptModule,
  { root, folder, entry, allowJs, jsx = false }: TypeCheckConfigurationOptions,
): TypeCheckConfiguration {
  const forced: TypeScript.CompilerOptions = { noEmit: true, ...(allowJs ? { allowJs: true } : {}) };
  const defaults: TypeScript.CompilerOptions = jsx ? { jsx: ts.JsxEmit.ReactJSX } : {};
  const tsconfig = findTsConfig(root, folder);
  if (!tsconfig) return { options: { ...defaults, ...forced }, rootNames: [entry], diagnostics: [], configFiles: [] };

  const source = ts.readJsonConfigFile(tsconfig, ts.sys.readFile);
  const host: TypeScript.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: ts.sys.readDirectory,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
  };
  const parsed = ts.parseJsonSourceFileConfigFileContent(source, host, dirname(tsconfig), undefined, tsconfig);
  const options: TypeScript.CompilerOptions = { ...defaults, ...parsed.options, ...forced, configFile: source };
  for (const name of DROPPED_COMPILER_OPTIONS) delete options[name];

  // The entry point joins the tsconfig's files, once
  const rootNames = [...parsed.fileNames];
  const entryName = _slashes(entry).toLowerCase();
  if (!rootNames.some((name) => _slashes(name).toLowerCase() === entryName)) rootNames.push(entry);
  return {
    options,
    rootNames,
    // The JSON's own syntax errors are only on its source file's (internal) `parseDiagnostics`; errors without a file are the tsconfig's
    diagnostics: [...((source as { parseDiagnostics?: TypeScript.Diagnostic[] }).parseDiagnostics ?? []), ...parsed.errors]
      .filter((diagnostic) => !_NO_INPUTS.includes(diagnostic.code))
      .map((diagnostic) => (diagnostic.file ? diagnostic : { ...diagnostic, file: source, start: undefined })),
    configFiles: [tsconfig, ...(source.extendedSourceFiles ?? [])],
  };
}

/**
 * Gets the key of a set of compiler options, the same for the same options whatever their order (the tsconfig's own source file left out)
 * @param options The compiler options
 * @returns The key
 */
export function getCompilerOptionsKey(options: TypeScript.CompilerOptions): string {
  return JSON.stringify(
    Object.keys(options)
      .filter((name) => name !== 'configFile')
      .sort()
      .map((name) => [name, options[name]]),
  );
}

// #endregion

// #region Compiler host

/**
 * Represents the parsed source files a run's type checks share, by TypeScript install and compiler options (see getSourceFileCacheKey()), then by
 * file name and the settings it was parsed with
 */
export type SourceFileCache = Map<string, Map<string, TypeScript.SourceFile>>;

/**
 * Gets the key under which a run shares parsed source files: the TypeScript install, and the full compiler options (the binder keeps its errors on
 * the source file)
 * @param typeScriptFolder Absolute path of the `typescript` package's folder
 * @param options The compiler options
 * @returns The key
 */
export function getSourceFileCacheKey(typeScriptFolder: string, options: TypeScript.CompilerOptions): string {
  return `${typeScriptFolder}\0${getCompilerOptionsKey(options)}`;
}

/**
 * Represents a compiler host serving virtual files, with the files each file's imports resolved to
 */
export interface TypeCheckHost {
  /**
   * The compiler host
   */
  host: TypeScript.CompilerHost;
  /**
   * Canonical file names of the files each file's imports resolved to, by the importing file's canonical file name
   */
  imports: Map<string, Set<string>>;
  /**
   * Gets a file's canonical file name, its separators `/` (for matching paths on case-insensitive file systems, and Windows)
   * @param fileName The file name
   * @returns Its canonical file name
   */
  canonical(fileName: string): string;
  /**
   * Gets the virtual file at a path
   * @param fileName Absolute path of the file
   * @returns The virtual file, or undefined for a real one
   */
  getVirtualFile(fileName: string): VirtualFile | undefined;
}

/**
 * Represents what a type check's compiler host depends on
 */
export interface TypeCheckHostOptions {
  /**
   * Absolute path of the host repository's root
   */
  root: string;
  /**
   * Absolute path of the documentation file's folder, the compiler host's current directory
   */
  folder: string;
  /**
   * The compiler options
   */
  options: TypeScript.CompilerOptions;
  /**
   * Every virtual file of the host repository
   */
  virtualFiles: readonly VirtualFile[];
  /**
   * Real files' parsed source files, shared with other type checks with the same TypeScript and compiler options
   */
  sourceFiles: Map<string, TypeScript.SourceFile>;
}

/**
 * Creates a type check's compiler host: TypeScript's own, with the virtual files served from memory (found by their normalised, canonical paths),
 * its current directory pinned to the documentation file's folder (so the automatic `@types` never depend on where `showroom` runs), real files'
 * parsed source files shared, and every import's resolution recorded
 * @param ts The host's TypeScript
 * @param options What the compiler host depends on
 * @returns The compiler host
 */
export function createTypeCheckHost(ts: TypeScriptModule, { root, folder, options, virtualFiles, sourceFiles }: TypeCheckHostOptions): TypeCheckHost {
  const host = ts.createCompilerHost(options);
  const canonical = (fileName: string): string => host.getCanonicalFileName(_slashes(resolve(fileName)));
  const virtual = new Map(virtualFiles.map((file) => [canonical(resolve(root, file.path)), file]));
  const getVirtualFile = (fileName: string): VirtualFile | undefined => virtual.get(canonical(fileName));
  const imports = new Map<string, Set<string>>();
  const cache = ts.createModuleResolutionCache(folder, (fileName) => host.getCanonicalFileName(fileName), options);

  const { fileExists, readFile, getSourceFile } = host;
  host.getCurrentDirectory = () => _slashes(folder);
  host.fileExists = (fileName) => getVirtualFile(fileName) !== undefined || fileExists.call(host, fileName);
  host.readFile = (fileName) => getVirtualFile(fileName)?.content ?? readFile.call(host, fileName);
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    const virtualFile = getVirtualFile(fileName);
    if (virtualFile) return ts.createSourceFile(fileName, virtualFile.content, languageVersionOrOptions);
    const key = `${canonical(fileName)}\0${JSON.stringify(languageVersionOrOptions)}`;
    const cached = shouldCreateNewSourceFile ? undefined : sourceFiles.get(key);
    if (cached) return cached;
    const sourceFile = getSourceFile.call(host, fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
    if (sourceFile) sourceFiles.set(key, sourceFile);
    return sourceFile;
  };
  host.resolveModuleNameLiterals = (literals, containingFile, redirectedReference, compilerOptions, containingSourceFile) =>
    literals.map((literal) => {
      const mode = ts.getModeForUsageLocation(containingSourceFile, literal, compilerOptions);
      const resolution = ts.resolveModuleName(literal.text, containingFile, compilerOptions, host, cache, redirectedReference, mode);
      if (resolution.resolvedModule) {
        const from = canonical(containingFile);
        imports.set(from, (imports.get(from) ?? new Set()).add(canonical(resolution.resolvedModule.resolvedFileName)));
      }
      return resolution;
    });
  return { host, imports, canonical, getVirtualFile };
}

// #endregion

// #region Type check

/**
 * Represents a showcase's type check
 */
export interface TypeCheckRequest {
  /**
   * The host's TypeScript
   */
  ts: TypeScriptModule;
  /**
   * Absolute path of its package's folder, keying the shared source files
   */
  typeScriptFolder: string;
  /**
   * Absolute path of the host repository's root
   */
  root: string;
  /**
   * The showcase
   */
  showcase: Showcase;
  /**
   * True to set `allowJs` for this type check (the showcase's `allowJs` option); a `js`, `mjs` or `jsx` entry point sets it anyway
   */
  allowJs: boolean;
  /**
   * True to type check with `jsx: react-jsx` where the tsconfig leaves `jsx` unset (see getTypeCheckConfiguration())
   */
  jsx?: boolean;
  /**
   * Every virtual file of the host repository
   */
  virtualFiles: readonly VirtualFile[];
  /**
   * The parsed source files shared between the run's type checks
   */
  sourceFiles: SourceFileCache;
}

/**
 * Represents the outcome of a type check: its errors, and the files it read
 */
export interface TypeCheckResult {
  /**
   * Type errors, as build errors
   */
  errors: ShowcaseBuildError[];
  /**
   * POSIX-style paths, relative to the host repository's root, of the files read: the program's source files (virtual files as their documentation
   * files) and the tsconfig files, outside every `node_modules` folder
   */
  reads: string[];
}

/**
 * Type checks a showcase: a program of the nearest tsconfig's files and the entry point; the errors of the files the showcase reaches (the entry
 * point and, transitively, every file it imports or references), outside `node_modules` and TypeScript's default library files, with the program's
 * global and option errors and the tsconfig's own
 * @param request The type check
 * @returns The type errors, and the files read
 */
export function typeCheckShowcase({
  ts,
  typeScriptFolder,
  root,
  showcase,
  allowJs,
  jsx = false,
  virtualFiles,
  sourceFiles,
}: TypeCheckRequest): TypeCheckResult {
  const folder = resolve(root, getDocumentationFolder(showcase.documentation));
  const entry = resolve(root, showcase.entry);
  const configuration = getTypeCheckConfiguration(ts, { root, folder, entry, allowJs: allowJs || /\.(m?js|jsx)$/i.test(entry), jsx });
  const key = getSourceFileCacheKey(typeScriptFolder, configuration.options);
  const shared = sourceFiles.get(key) ?? new Map<string, TypeScript.SourceFile>();
  sourceFiles.set(key, shared);
  const { host, imports, canonical, getVirtualFile } = createTypeCheckHost(ts, {
    root,
    folder,
    options: configuration.options,
    virtualFiles,
    sourceFiles: shared,
  });
  const program = ts.createProgram({
    rootNames: configuration.rootNames,
    options: configuration.options,
    host,
    configFileParsingDiagnostics: configuration.diagnostics,
  });

  // The files the showcase reaches: its imports, and its `/// <reference path>`s, from the entry point on
  const byName = new Map(program.getSourceFiles().map((file) => [canonical(file.fileName), file]));
  const reached = new Set<string>();
  const pending = [canonical(entry)];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    const file = byName.get(name);
    if (reached.has(name) || !file) continue;
    reached.add(name);
    pending.push(...(imports.get(name) ?? []));
    for (const reference of file.referencedFiles) {
      const path = resolve(dirname(file.fileName), reference.fileName);
      const target = [path, `${path}.ts`, `${path}.d.ts`].map(canonical).find((candidate) => byName.has(candidate));
      if (target) pending.push(target);
    }
  }
  // In the program's order
  const files = program
    .getSourceFiles()
    .filter((file) => reached.has(canonical(file.fileName)) && !program.isSourceFileDefaultLibrary(file) && !isDependencyFile(root, file.fileName));

  const diagnostics = [
    ...program.getConfigFileParsingDiagnostics(),
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...files.flatMap((file) => [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)]),
  ].filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error && !_NO_INPUTS.includes(diagnostic.code));
  const errors = new Map<string, ShowcaseBuildError>();
  for (const diagnostic of diagnostics) {
    const error = mapDiagnostic(ts, root, virtualFiles, getVirtualFile, diagnostic);
    errors.set(`${error.path}\0${error.line}\0${error.message}`, error);
  }

  // The files read, under the root and outside `node_modules`: virtual files as their documentation files
  const reads = new Set<string>();
  for (const name of [...program.getSourceFiles().map((file) => file.fileName), ...configuration.configFiles]) {
    const virtualFile = getVirtualFile(name);
    const path = virtualFile ? virtualFile.documentation : isDependencyFile(root, name) ? undefined : _relativeToRoot(root, name);
    if (path) reads.add(path);
  }
  return { errors: [...errors.values()], reads: [...reads] };
}

/**
 * Maps a diagnostic to a build error: `TS<code>: <its message chain, on one line>`, with the absolute paths in it made relative to the host
 * repository's root (virtual files by their paths); at its file (a virtual file's path, or a real file's, relative to the root) and line, or with no
 * path for an error without a file, or in a file outside the root, or a dependency's (placed at the showcase)
 * @param ts The host's TypeScript
 * @param root Absolute path of the host repository's root
 * @param virtualFiles Every virtual file of the host repository
 * @param getVirtualFile Gets the virtual file at a path
 * @param diagnostic The diagnostic
 * @returns The build error
 */
export function mapDiagnostic(
  ts: TypeScriptModule,
  root: string,
  virtualFiles: readonly VirtualFile[],
  getVirtualFile: (fileName: string) => VirtualFile | undefined,
  diagnostic: TypeScript.Diagnostic,
): ShowcaseBuildError {
  // The message, on one line, with absolute paths (TypeScript writes them with `/`) made relative: the virtual files' first, the longest first
  const text = ts
    .flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
  const replacements = [
    ...virtualFiles.map((file): [string, string] => [_slashes(resolve(root, file.path)), file.path]),
    [`${_slashes(root)}/`, ''] as [string, string],
  ].sort((a, b) => b[0].length - a[0].length);
  const message = `TS${diagnostic.code}: ${replacements.reduce((result, [from, to]) => result.split(from).join(to), text)}`;

  const file = diagnostic.file;
  if (!file) return { message };
  const virtualFile = getVirtualFile(file.fileName);
  const path = virtualFile ? virtualFile.path : isDependencyFile(root, file.fileName) ? undefined : _relativeToRoot(root, file.fileName);
  if (!path) return { message };
  return { message, path, ...(diagnostic.start !== undefined ? { line: file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 } : {}) };
}

// #endregion
