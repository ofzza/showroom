/**
 * Compiling `angular` showcases ahead of time with the host repository's own Angular compiler, in memory, before Vite: finding the host's Angular
 * packages and the TypeScript its compiler uses, loading them, the nearest tsconfig with its `angularCompilerOptions`, a program of its files and
 * the entry point served from memory, its diagnostics filtered to what the showcase reaches, the default export check, and the emitted JavaScript
 * with its source maps. Node code; `showroom`'s own `@angular/compiler-cli` and `typescript` are only imported for their types. Internal, never
 * re-exported.
 */

import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as AngularCompiler from '@angular/compiler-cli';
import type * as TypeScript from 'typescript';
import type { Showcase, VirtualFile } from '../../../../host/index.js';
import {
  createTypeCheckHost,
  DROPPED_COMPILER_OPTIONS,
  findTypeScript,
  getDocumentationFolder,
  getTypeCheckConfiguration,
  isDependencyFile,
  loadTypeScript,
  mapDiagnostic,
  readPackageJson,
  resolvePackage,
  type FoundTypeScript,
  type ShowcaseBuildMessage,
  type TypeScriptModule,
} from '../../ts/typecheck/index.js';

// #region Finding Angular

/**
 * The oldest Angular major version supported
 */
export const MINIMUM_ANGULAR_VERSION = 20;

/**
 * Names of the Angular packages an `angular` showcase needs in the host repository
 */
export const ANGULAR_PACKAGES: readonly string[] = [
  '@angular/core',
  '@angular/common',
  '@angular/compiler',
  '@angular/compiler-cli',
  '@angular/platform-browser',
];

/**
 * Represents a function resolving a package from a folder
 * @param folder Absolute path of the folder
 * @param name The package's name
 * @returns Absolute path of the package's folder, or undefined if it isn't found
 */
export type PackageResolver = (folder: string, name: string) => string | undefined;

/**
 * Represents a package found
 */
export interface FoundPackage {
  /**
   * Absolute path of the package's folder
   */
  folder: string;
  /**
   * Its version, from its `package.json`, or an empty string if it can't be read
   */
  version: string;
}

/**
 * Represents the Angular a documentation file's folder finds
 */
export interface FoundAngular {
  /**
   * The Angular packages found, by name (see ANGULAR_PACKAGES)
   */
  packages: Partial<Record<string, FoundPackage>>;
  /**
   * The TypeScript `@angular/compiler-cli` resolves from its own folder, if it is found
   */
  typeScript?: FoundTypeScript;
}

/**
 * Gets the major of a version
 * @param version The version, e.g. `22.2.6`
 * @returns Its major, or undefined if it can't be read
 */
export function getMajorVersion(version: string): number | undefined {
  const major = /^(\d+)\./.exec(version.trim())?.[1];
  return major === undefined ? undefined : Number(major);
}

/**
 * Finds the Angular packages from a folder, as Node resolves them, and the TypeScript `@angular/compiler-cli` resolves from its own folder (the one
 * it imports itself)
 * @param folder Absolute path of the folder (the documentation file's)
 * @param resolver Resolves a package from a folder (see resolvePackage()); the tests replace it
 * @returns What was found
 */
export function findAngular(folder: string, resolver: PackageResolver = resolvePackage): FoundAngular {
  const packages: Partial<Record<string, FoundPackage>> = {};
  for (const name of ANGULAR_PACKAGES) {
    const found = resolver(folder, name);
    if (found === undefined) continue;
    const version = readPackageJson(found)?.version;
    packages[name] = { folder: found, version: typeof version === 'string' ? version : '' };
  }
  const compilerCli = packages['@angular/compiler-cli'];
  const typeScript = compilerCli ? findTypeScript(compilerCli.folder, (from) => resolver(from, 'typescript')) : undefined;
  return { packages, ...(typeScript ? { typeScript } : {}) };
}

/**
 * Gets what keeps the Angular found from compiling `angular` showcases: a package missing, a version older than MINIMUM_ANGULAR_VERSION or that
 * can't be read, packages of different majors, and the TypeScript of `@angular/compiler-cli` missing or not 5.x or 6.x (a 5.x or 6.x outside the
 * range Angular accepts is Angular's own check, when it compiles)
 * @param found The Angular found (see findAngular())
 * @returns A message per problem, saying what to do; empty when there is none
 */
export function getAngularProblems(found: FoundAngular): string[] {
  const problems: string[] = [];
  const missing = ANGULAR_PACKAGES.filter((name) => !found.packages[name]);
  if (missing.length) problems.push(`${missing.map((name) => `"${name}"`).join(', ')} isn't installed where it can be found: install it`);
  const majors = new Set<number>();
  for (const name of ANGULAR_PACKAGES) {
    const version = found.packages[name]?.version;
    if (version === undefined) continue;
    const major = getMajorVersion(version);
    if (major === undefined || major < MINIMUM_ANGULAR_VERSION) {
      problems.push(`"${name}" ${MINIMUM_ANGULAR_VERSION} or later is needed, but the one found is ${version || 'of an unknown version'}: upgrade it`);
    } else majors.add(major);
  }
  if (majors.size > 1) problems.push(`the Angular packages found are of different majors (${[...majors].sort().join(', ')}): install one Angular version`);
  if (found.packages['@angular/compiler-cli'] && !found.typeScript) {
    problems.push(`"typescript" isn't installed where "@angular/compiler-cli" can find it: install it`);
  } else if (found.typeScript && found.typeScript.support !== 'supported') {
    problems.push(`"typescript" 5.x or 6.x is needed by Angular's compiler, but the one found is ${found.typeScript.version || 'of an unknown version'}`);
  }
  return problems;
}

/**
 * Represents the host's Angular compiler, as `@angular/compiler-cli` exports it
 */
export type AngularCompilerModule = typeof AngularCompiler;

/**
 * Represents the host's Angular compiler, loaded, with the TypeScript it uses
 */
export interface LoadedAngular {
  /**
   * The Angular compiler
   */
  ng: AngularCompilerModule;
  /**
   * The TypeScript it uses, the same instance it imports itself
   */
  ts: TypeScriptModule;
}

/**
 * Loads the host's Angular compiler (its ES module bundle, from its `package.json`'s `exports`) and its TypeScript, once per process (Node keeps the
 * modules it loaded): TypeScript through `require()`, which the compiler's own `import` of it shares, so both are one instance
 * @param compilerCli Absolute path of the `@angular/compiler-cli` package's folder
 * @param typeScript Absolute path of the `typescript` package's folder it resolves
 * @returns The compiler and its TypeScript
 */
export async function loadAngular(compilerCli: string, typeScript: string): Promise<LoadedAngular> {
  const ts = loadTypeScript(typeScript);
  const exports = readPackageJson(compilerCli)?.exports as { '.'?: string | { default?: string } } | undefined;
  const main = exports?.['.'];
  const entry = (typeof main === 'string' ? main : main?.default) ?? './bundles/index.js';
  const ng = (await import(pathToFileURL(join(compilerCli, entry)).href)) as AngularCompilerModule;
  return { ng, ts };
}

// #endregion

// #region Configuration

/**
 * Angular compiler options dropped from the host's, as they can't apply to emitting a showcase in memory
 */
const _DROPPED_ANGULAR_OPTIONS: readonly string[] = ['flatModuleOutFile', 'flatModuleId', 'tracePerformance'];

/**
 * Represents what an `angular` showcase is compiled with
 */
export interface AngularConfiguration {
  /**
   * The compiler options: the nearest tsconfig's, `angularCompilerOptions` included, with what emitting in memory needs overridden
   */
  options: AngularCompiler.AngularCompilerOptions;
  /**
   * Absolute paths of the program's roots: the tsconfig's files and the entry point
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
 * Gets what an `angular` showcase is compiled with: the nearest tsconfig, parsed as the `ts` showcase adapter parses it (its errors with their
 * lines, its files, the files it extends), with the merged `angularCompilerOptions` of Angular's own `readConfiguration()` under it; then only what
 * emitting in memory needs overridden: no `noEmit`, `noEmitOnError`, declarations or the options a showcase can't use (DROPPED_COMPILER_OPTIONS),
 * source maps with their sources, no output path check, and a full compilation. Without a tsconfig, TypeScript's and Angular's defaults
 * @param loaded The host's Angular compiler and TypeScript
 * @param root Absolute path of the host repository's root
 * @param folder Absolute path of the documentation file's folder, where the nearest tsconfig is looked up from
 * @param entry Absolute path of the entry point
 * @returns The configuration
 */
export function getAngularConfiguration({ ng, ts }: LoadedAngular, root: string, folder: string, entry: string): AngularConfiguration {
  const configuration = getTypeCheckConfiguration(ts, { root, folder, entry, allowJs: false });
  const tsconfig = configuration.configFiles[0];
  const angular: AngularCompiler.AngularCompilerOptions = tsconfig ? ng.readConfiguration(tsconfig).options : {};
  const options: AngularCompiler.AngularCompilerOptions = { ...angular, ...configuration.options };
  for (const name of [...DROPPED_COMPILER_OPTIONS, ..._DROPPED_ANGULAR_OPTIONS]) delete options[name];
  Object.assign(options, {
    noEmit: false,
    noEmitOnError: false,
    sourceMap: true,
    inlineSources: true,
    suppressOutputPathCheck: true,
    compilationMode: 'full',
  });
  return { options, rootNames: configuration.rootNames, diagnostics: configuration.diagnostics, configFiles: configuration.configFiles };
}

// #endregion

// #region Compile

/**
 * Represents a module the compile emitted: its JavaScript and source map
 */
export interface EmittedModule {
  /**
   * The JavaScript, without its `sourceMappingURL` comment
   */
  code: string;
  /**
   * Its source map, as JSON text, naming its source with its content
   */
  map?: string;
}

/**
 * Represents an `angular` showcase's compile
 */
export interface AngularCompileRequest {
  /**
   * The host's Angular compiler and TypeScript
   */
  loaded: LoadedAngular;
  /**
   * Absolute path of the host repository's root
   */
  root: string;
  /**
   * The showcase
   */
  showcase: Showcase;
  /**
   * Every virtual file of the host repository
   */
  virtualFiles: readonly VirtualFile[];
  /**
   * False to leave out the type errors and warnings (the showcase's `typeCheck` option)
   */
  typeCheck: boolean;
}

/**
 * Represents the outcome of an `angular` showcase's compile
 */
export interface AngularCompileResult {
  /**
   * Errors that always fail the showcase: the tsconfig's, the options', syntax and structural errors, the default export check's, and a compiler
   * that throws; when there are any, nothing is emitted
   */
  errors: ShowcaseBuildMessage[];
  /**
   * Type errors (TypeScript's semantic and global ones, and Angular's template ones), empty when `typeCheck` is off
   */
  typeErrors: ShowcaseBuildMessage[];
  /**
   * Warnings (e.g. Angular's extended diagnostics), empty when `typeCheck` is off
   */
  warnings: ShowcaseBuildMessage[];
  /**
   * The emitted modules, by the absolute path of their source (`/` separators)
   */
  emitted: Map<string, EmittedModule>;
  /**
   * POSIX-style paths, relative to the host repository's root, of the files read: the program's source files, the template and style files the
   * compiler read (virtual files as their documentation files) and the tsconfig files, outside every `node_modules` folder
   */
  reads: string[];
}

/**
 * The message of the default export check
 */
export const NOT_A_STANDALONE_COMPONENT = 'The default export of an angular showcase must be a standalone component';

/**
 * Gets a path with `/` separators
 * @param path The path
 * @returns The path, its separators `/`
 */
function _slashes(path: string): string {
  return path.split('\\').join('/');
}

/**
 * Maps a diagnostic to a build error (see mapDiagnostic()), Angular's own (codes `-99<code>`) as `NG<code>: <message>`, as `ng build` shows them
 * @param ts The host's TypeScript
 * @param root Absolute path of the host repository's root
 * @param virtualFiles Every virtual file of the host repository
 * @param getVirtualFile Gets the virtual file at a path
 * @param diagnostic The diagnostic
 * @returns The build error
 */
export function mapAngularDiagnostic(
  ts: TypeScriptModule,
  root: string,
  virtualFiles: readonly VirtualFile[],
  getVirtualFile: (fileName: string) => VirtualFile | undefined,
  diagnostic: TypeScript.Diagnostic,
): ShowcaseBuildMessage {
  const error = mapDiagnostic(ts, root, virtualFiles, getVirtualFile, diagnostic);
  const angular = /^-99(\d+)$/.exec(String(diagnostic.code));
  // Angular's extended diagnostics hold their code in their message already
  return angular ? { ...error, message: error.message.replace(/^TS-?\d+: (NG\d+: )?/, `NG${angular[1]}: `) } : error;
}

/**
 * Checks the entry point's default export, through re-exports and aliases, with TypeScript's checker: it must be a class decorated with
 * `@angular/core`'s `Component` (by any local name), whose metadata doesn't set `standalone: false`. A module without a default export is left to
 * the bundle, which fails it
 * @param ts The host's TypeScript
 * @param program The TypeScript program
 * @param entry Absolute path of the entry point
 * @returns The line of the entry point's default export when the check fails (1 if it isn't found in the entry point), else undefined
 */
export function checkDefaultExport(ts: TypeScriptModule, program: TypeScript.Program, entry: string): number | undefined {
  const sourceFile = program.getSourceFile(entry);
  const checker = program.getTypeChecker();
  const module = sourceFile ? checker.getSymbolAtLocation(sourceFile) : undefined;
  const exported = module ? checker.getExportsOfModule(module).find((symbol) => symbol.escapedName === 'default') : undefined;
  if (!sourceFile || !exported) return undefined;
  const resolveAlias = (symbol: TypeScript.Symbol) => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);

  const target = resolveAlias(exported);
  const declaration = target.valueDeclaration ?? target.declarations?.[0];
  const isComponent =
    declaration !== undefined &&
    ts.isClassDeclaration(declaration) &&
    (ts.getDecorators(declaration) ?? []).some((decorator) => {
      if (!ts.isCallExpression(decorator.expression)) return false;
      const callee = decorator.expression.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
      const symbol = checker.getSymbolAtLocation(name);
      const resolved = symbol ? resolveAlias(symbol) : undefined;
      const fromCore = (resolved?.declarations ?? []).some((node) => /\/@angular\/core\//.test(_slashes(node.getSourceFile().fileName)));
      if (resolved?.escapedName !== 'Component' || !fromCore) return false;
      const metadata = decorator.expression.arguments[0];
      const standalone =
        metadata && ts.isObjectLiteralExpression(metadata)
          ? metadata.properties.find((property) => property.name && ts.isIdentifier(property.name) && property.name.text === 'standalone')
          : undefined;
      return !(standalone && ts.isPropertyAssignment(standalone) && standalone.initializer.kind === ts.SyntaxKind.FalseKeyword);
    });
  if (isComponent) return undefined;
  // The line of `export default` (a decorated class starts at its decorators)
  const at = exported.declarations?.find((node) => node.getSourceFile() === sourceFile);
  const keyword = at && ts.canHaveModifiers(at) ? ts.getModifiers(at)?.find((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) : undefined;
  return at ? sourceFile.getLineAndCharacterOfPosition((keyword ?? at).getStart()).line + 1 : 1;
}

/**
 * Compiles an `angular` showcase with the host's Angular compiler, in memory: a program of the nearest tsconfig's files and the entry point (see
 * getAngularConfiguration()), served by the `ts` showcase adapter's compiler host, its own parsed source files only; the diagnostics of the files
 * the showcase reaches (the entry point and, transitively, every file it imports or references, with the template and style files of the
 * components in them), outside `node_modules`, with those bound to no file; the default export check; and, when nothing always fails, every module
 * emitted with its source map
 * @param request The compile
 * @returns The errors, type errors and warnings, the emitted modules, and the files read
 */
export async function compileAngularShowcase({ loaded, root, showcase, virtualFiles, typeCheck }: AngularCompileRequest): Promise<AngularCompileResult> {
  const { ng, ts } = loaded;
  const folder = resolve(root, getDocumentationFolder(showcase.documentation));
  const entry = resolve(root, showcase.entry);
  const result: AngularCompileResult = { errors: [], typeErrors: [], warnings: [], emitted: new Map(), reads: [] };
  const reads = new Set<string>();
  const read = (fileName: string) => {
    const virtualFile = getVirtualFile(fileName);
    const path = virtualFile ? virtualFile.documentation : isDependencyFile(root, fileName) ? undefined : _relativeToRoot(root, fileName);
    if (path) reads.add(path);
  };

  // The configuration and the compiler host: TypeScript's, serving the virtual files, wrapped by Angular's
  const configuration = getAngularConfiguration(loaded, root, folder, entry);
  const { host, imports, canonical, getVirtualFile } = createTypeCheckHost(ts, {
    root,
    folder,
    options: configuration.options,
    virtualFiles,
    sourceFiles: new Map(),
  });
  configuration.configFiles.forEach(read);
  const outputs = new Map<string, { code?: string; map?: string }>();
  host.writeFile = (fileName, text, _bom, _onError, sourceFiles) => {
    const source = sourceFiles?.[0]?.fileName;
    if (source === undefined) return;
    const output = outputs.get(_slashes(resolve(source))) ?? {};
    if (fileName.endsWith('.map')) output.map = text;
    else output.code = text.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n');
    outputs.set(_slashes(resolve(source)), output);
  };
  const ngHost = ng.createCompilerHost({ options: configuration.options, tsHost: host });
  const resources = new Map<string, Set<string>>();
  ngHost.resourceNameToFileName = (resourceName, containingFile) => {
    const fileName = resolve(dirname(containingFile), resourceName);
    if (!host.fileExists(fileName)) return null;
    const from = canonical(containingFile);
    resources.set(from, (resources.get(from) ?? new Set()).add(canonical(fileName)));
    return _slashes(fileName);
  };
  ngHost.readResource = (fileName) => {
    const content = host.readFile(fileName);
    if (content === undefined) throw new Error(`Can't read "${fileName}"`);
    read(fileName);
    return content;
  };

  const map = (diagnostic: TypeScript.Diagnostic) => mapAngularDiagnostic(ts, root, virtualFiles, getVirtualFile, diagnostic);
  let program: AngularCompiler.NgtscProgram;
  try {
    program = new ng.NgtscProgram(configuration.rootNames, configuration.options, ngHost);
    await program.loadNgStructureAsync();
  } catch (err) {
    result.errors.push({ message: `Angular's compiler failed: ${(err as Error).message}` });
    result.reads = [...reads];
    return result;
  }
  // Angular's shims (e.g. its type check files) are in its program only, never on disk or virtual (`isShim()` isn't exported before Angular 21)
  const tsProgram = program.getTsProgram();
  const isShim = (file: TypeScript.SourceFile) => !host.fileExists(file.fileName);
  for (const file of tsProgram.getSourceFiles()) if (!isShim(file)) read(file.fileName);

  // The files the showcase reaches: its imports, and its `/// <reference path>`s, from the entry point on; then their components' resources
  const byName = new Map(tsProgram.getSourceFiles().map((file) => [canonical(file.fileName), file]));
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
  const files = tsProgram
    .getSourceFiles()
    .filter(
      (file) => reached.has(canonical(file.fileName)) && !isShim(file) && !tsProgram.isSourceFileDefaultLibrary(file) && !isDependencyFile(root, file.fileName),
    );
  const reachedFiles = new Set(files.map((file) => canonical(file.fileName)));
  for (const name of [...reachedFiles]) for (const resource of resources.get(name) ?? []) reachedFiles.add(resource);
  const isReached = (diagnostic: TypeScript.Diagnostic) => !diagnostic.file || reachedFiles.has(canonical(diagnostic.file.fileName));

  // The diagnostics: those that always fail, then the type errors; warnings from any of them
  const always = [
    ...configuration.diagnostics,
    ...program.getTsOptionDiagnostics(),
    ...program.getNgOptionDiagnostics(),
    ...files.flatMap((file) => program.getTsSyntacticDiagnostics(file)),
    ...program.getNgStructuralDiagnostics().filter(isReached),
  ];
  const types = [
    ...tsProgram.getGlobalDiagnostics(),
    ...files.flatMap((file) => [...program.getTsSemanticDiagnostics(file), ...program.getNgSemanticDiagnostics(file.fileName)]),
  ];
  const collect = (diagnostics: readonly TypeScript.Diagnostic[], category: TypeScript.DiagnosticCategory) => {
    const errors = new Map<string, ShowcaseBuildMessage>();
    for (const diagnostic of diagnostics.filter((item) => item.category === category && !(item.code === 18002 || item.code === 18003))) {
      const error = map(diagnostic);
      errors.set(`${error.path}\0${error.line}\0${error.message}`, error);
    }
    return [...errors.values()];
  };
  result.errors = collect(always, ts.DiagnosticCategory.Error);
  if (typeCheck) {
    result.typeErrors = collect(types, ts.DiagnosticCategory.Error);
    result.warnings = collect([...always, ...types].filter(isReached), ts.DiagnosticCategory.Warning);
  }

  // The default export check, whatever typeCheck says
  const line = result.errors.length ? undefined : checkDefaultExport(ts, tsProgram, entry);
  if (line !== undefined) {
    const path = getVirtualFile(entry)?.path ?? _relativeToRoot(root, entry);
    result.errors.push({ message: NOT_A_STANDALONE_COMPONENT, ...(path ? { path, line } : {}) });
  }

  // The emitted modules, when nothing always fails
  if (!result.errors.length) {
    program.emit();
    for (const [path, output] of outputs) {
      if (output.code !== undefined) result.emitted.set(path, { code: output.code, ...(output.map === undefined ? {} : { map: output.map }) });
    }
  }
  result.reads = [...reads];
  return result;
}

/**
 * Gets a real file's POSIX-style path relative to the host repository's root
 * @param root Absolute path of the host repository's root
 * @param path Absolute path of the file
 * @returns The relative path, or undefined for a file outside the root
 */
function _relativeToRoot(root: string, path: string): string | undefined {
  const relativePath = _slashes(resolve(path)).slice(_slashes(root).length + 1);
  return _slashes(resolve(path)).startsWith(`${_slashes(root)}/`) && relativePath ? relativePath : undefined;
}

// #endregion
