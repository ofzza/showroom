/**
 * The `ts` showcase adapter: its entry point is a TypeScript or JavaScript module, bundled with `showroom`'s own Vite, from memory, with the virtual
 * files as modules where they are, and run in its showcase frame's page, above the console panel. Vite is loaded with `import()` only when a
 * showcase is built, as `check` (and so the library) reaches the registry. Internal, never re-exported.
 */

import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { InlineConfig, Logger, Plugin, Rolldown } from 'vite';
import { SILENCED_WARNINGS } from '../../../cli/check/internal/index.js';
import type { Showcase, VirtualFile } from '../../../host/index.js';
import type { ShowcaseAdapter, ShowcaseBuildError, ShowcaseBuildFile, ShowcaseBuildRequest, ShowcaseBuildResult, ShowcaseValidation } from '../index.js';
import { CONSOLE_PANEL_ID, getConsoleScript, SHOWCASE_FRAME_ROOT_ID } from './console/index.js';

// #region Validation

/**
 * Represents the `ts` showcase adapter's options, as validated
 */
export interface TsShowcaseOptions {
  /**
   * True to type check the showcase (the default); not acted on yet
   */
  typeCheck: boolean;
}

/**
 * Pattern of the entry points the `ts` showcase adapter builds: TypeScript and JavaScript modules
 */
const _ENTRY = /\.(ts|mts|js|mjs)$/i;

/**
 * Pattern of the entry points of the `react` showcase adapter, which the `ts` showcase adapter points at
 */
const _REACT_ENTRY = /\.(tsx|jsx)$/i;

/**
 * Validates a `ts` showcase: its only option is `typeCheck`, a boolean (`true` by default), and its entry point must be a ` ```ts `, ` ```js `,
 * ` ```mts ` or ` ```mjs ` code block (or ` ```typescript `, ` ```javascript `), or a linked `.ts`, `.mts`, `.js` or `.mjs` file
 * @param showcase The showcase
 * @returns The validated options, or the errors found
 */
export function validateTsShowcase(showcase: Showcase): ShowcaseValidation {
  const errors: string[] = [];
  let typeCheck = true;
  if (showcase.options !== undefined) {
    const options = showcase.options;
    if (typeof options !== 'object' || options === null || Array.isArray(options)) {
      errors.push('The ts showcase adapter\'s options must be an object, e.g. "showcase=ts({ typeCheck: false })"');
    } else {
      for (const [key, value] of Object.entries(options)) {
        if (key !== 'typeCheck') {
          errors.push(`Unknown option "${key}" of the ts showcase adapter; its only option is "typeCheck"`);
        } else if (typeof value !== 'boolean') {
          errors.push('The ts showcase adapter\'s option "typeCheck" must be true or false');
        } else {
          typeCheck = value;
        }
      }
    }
  }
  if (!_ENTRY.test(showcase.entry)) {
    const react = _REACT_ENTRY.test(showcase.entry) ? '; for tsx and jsx, use the react showcase adapter' : '';
    errors.push(
      showcase.kind === 'inline'
        ? `The ts showcase adapter needs a "ts", "js", "mts" or "mjs" code block${react}`
        : `The ts showcase adapter needs a link to a .ts, .mts, .js or .mjs file, not "${showcase.entry}"${react}`,
    );
  }
  return errors.length ? { errors } : { options: { typeCheck } satisfies TsShowcaseOptions, errors: [] };
}

// #endregion

// #region Paths

/**
 * Represents the virtual files of a build, by absolute path
 */
export type VirtualFilesByPath = ReadonlyMap<string, VirtualFile>;

/**
 * Gets the virtual files of a host repository by their absolute paths
 * @param root Absolute path of the host repository's root
 * @param virtualFiles Every virtual file of the host repository
 * @returns The virtual files, by absolute path
 */
export function getVirtualFilesByPath(root: string, virtualFiles: readonly VirtualFile[]): VirtualFilesByPath {
  return new Map(virtualFiles.map((file) => [resolve(root, file.path), file]));
}

/**
 * Splits a module id into its path and its query: a `\0` prefix (a module of a plugin's own) gives no path
 * @param id The module id
 * @returns Its path, and its query (with its `?`, or an empty string)
 */
function _splitId(id: string): { path: string; query: string } {
  const at = id.indexOf('?');
  return at < 0 ? { path: id, query: '' } : { path: id.slice(0, at), query: id.slice(at) };
}

/**
 * Gets the POSIX-style path of an absolute path relative to the host repository's root
 * @param root Absolute path of the host repository's root
 * @param path The absolute path
 * @returns The relative path, or undefined for the root itself, or a path outside it
 */
function _relativeToRoot(root: string, path: string): string | undefined {
  const relativePath = relative(root, path);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return undefined;
  return relativePath.split(sep).join('/');
}

/**
 * Gets the path a build error or read names: a virtual file's path, or a real file's path, relative to the host repository's root, outside every
 * `node_modules` folder
 * @param root Absolute path of the host repository's root
 * @param virtualFiles The virtual files, by absolute path
 * @param id The module id
 * @returns The POSIX-style path, or undefined for a module of a plugin's own, a dependency, or a file outside the host repository
 */
export function getHostPath(root: string, virtualFiles: VirtualFilesByPath, id: string | undefined): string | undefined {
  if (!id || id.startsWith('\0')) return undefined;
  const { path } = _splitId(id);
  const virtualFile = virtualFiles.get(path);
  if (virtualFile) return virtualFile.path;
  const relativePath = _relativeToRoot(root, path);
  return relativePath && !relativePath.split('/').includes('node_modules') ? relativePath : undefined;
}

/**
 * Checks if a real file exists
 * @param path Absolute path of the file
 * @returns True if it is a file
 */
async function _isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (_err) {
    return false;
  }
}

// #endregion

// #region Plugins

/**
 * Extensions an import without one tries, in Vite's order
 */
export const RESOLVE_EXTENSIONS: readonly string[] = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'];

/**
 * TypeScript extensions a JavaScript extension may name, as TypeScript's convention has it (`import './util.js'` for `util.ts`)
 */
const _TS_EXTENSIONS: Record<string, string[]> = { '.js': ['.ts', '.tsx'], '.mjs': ['.mts'], '.jsx': ['.tsx'] };

/**
 * Extensions of the virtual files loaded as modules as they are: code, CSS and JSON; any other virtual file is imported as a `data:` URL of its text
 */
const _MODULE_EXTENSION = /\.(m?[jt]sx?|c[jt]s|css|json)$/i;

/**
 * Media types of the `data:` URLs other virtual files are imported as, by extension; any other is `text/plain`
 */
const _MEDIA_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  html: 'text/html',
  htm: 'text/html',
  xml: 'application/xml',
  md: 'text/markdown',
  csv: 'text/csv',
  txt: 'text/plain',
};

/**
 * Gets the `data:` URL a virtual file that isn't code, CSS or JSON is imported as: its text, typed by its extension, as UTF-8
 * @param path Path of the virtual file
 * @param content Its content
 * @returns The `data:` URL
 */
export function getVirtualFileDataUrl(path: string, content: string): string {
  const extension = /\.([^./\\]+)$/.exec(path)?.[1].toLowerCase() ?? '';
  const type = (Object.hasOwn(_MEDIA_TYPES, extension) && _MEDIA_TYPES[extension]) || 'text/plain';
  return `data:${type};charset=utf-8,${encodeURIComponent(content)}`;
}

/**
 * Gets the paths a relative import may name, in the order they are tried: the path itself, then with each extension, then a TypeScript file a
 * JavaScript extension names, then an index file in the folder it names
 * @param path Absolute path the import names
 * @returns The candidate paths
 */
export function getImportCandidates(path: string): string[] {
  const extension = /\.[^./\\]+$/.exec(path)?.[0].toLowerCase() ?? '';
  const typescript = (_TS_EXTENSIONS[extension] ?? []).map((replacement) => path.slice(0, -extension.length) + replacement);
  return [path, ...RESOLVE_EXTENSIONS.map((ext) => path + ext), ...typescript, ...RESOLVE_EXTENSIONS.map((ext) => join(path, `index${ext}`))];
}

/**
 * Gets the line of an import of a specifier in a module's source
 * @param source Source of the module
 * @param specifier The specifier imported
 * @returns The line of its first occurrence in quotes, from 1, or undefined if it isn't found
 */
export function getImportLine(source: string, specifier: string): number | undefined {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(['"\`])${escaped}\\1`).exec(source);
  return match ? source.slice(0, match.index).split('\n').length : undefined;
}

/**
 * Reads a module's source: a virtual file's content, or a real file's
 * @param virtualFiles The virtual files, by absolute path
 * @param path Absolute path of the module
 * @returns Its source, or undefined if it can't be read
 */
async function _readSource(virtualFiles: VirtualFilesByPath, path: string): Promise<string | undefined> {
  const virtualFile = virtualFiles.get(path);
  if (virtualFile) return virtualFile.content;
  try {
    return await readFile(path, 'utf8');
  } catch (_err) {
    return undefined;
  }
}

/**
 * Creates the Vite plugin resolving imports to virtual files as if they were on disk: a relative import, from any importer (a virtual or a real
 * file), tries each candidate path in turn (see getImportCandidates()), the virtual file before the real one; an import of the host's own module (a
 * virtual or a real file outside every `node_modules` folder) that nothing resolves is reported as a build error at its line, as Vite would only warn
 * about it. Virtual files are loaded from memory: code, CSS and JSON as they are, any other as a `data:` URL of its text, typed by its extension.
 * @param root Absolute path of the host repository's root
 * @param virtualFiles The virtual files, by absolute path
 * @param errors Build errors to add the unresolved imports to
 * @returns The Vite plugin
 */
export function createVirtualFilesPlugin(root: string, virtualFiles: VirtualFilesByPath, errors: ShowcaseBuildError[]): Plugin {
  return {
    name: 'showroom-virtual-files',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (source.startsWith('\0')) return null;
      if (!importer) return virtualFiles.has(source) ? source : null;
      if (importer.startsWith('\0')) return null;
      const importerPath = _splitId(importer).path;

      // A relative import: the virtual file before the real one, at each candidate path
      const { path: specifier, query } = _splitId(source);
      if (/^\.\.?(\/|$)/.test(specifier)) {
        for (const candidate of getImportCandidates(resolve(dirname(importerPath), specifier))) {
          if (virtualFiles.has(candidate)) return candidate + query;
          if (await _isFile(candidate)) break;
        }
      }

      // Anything else is Vite's to resolve; only the host's own modules' imports are reported when it can't
      const path = getHostPath(root, virtualFiles, importerPath);
      if (!path) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved) return resolved;
      const line = getImportLine((await _readSource(virtualFiles, importerPath)) ?? '', source);
      const error: ShowcaseBuildError = { message: `Can't resolve "${source}"`, path, ...(line ? { line } : {}) };
      errors.push(error);
      this.error(error.message);
    },
    load(id) {
      const { path, query } = _splitId(id);
      const virtualFile = virtualFiles.get(path);
      if (!virtualFile || (query && !/\.css$/i.test(path))) return null;
      if (_MODULE_EXTENSION.test(path)) return virtualFile.content;
      return `export default ${JSON.stringify(getVirtualFileDataUrl(path, virtualFile.content))};`;
    },
  };
}

/**
 * Creates the Vite plugin recording the files a build reads, as its modules load (so a failed build has them too): virtual files as their
 * documentation files, and the host repository's real files outside every `node_modules` folder (files only CSS imports, by `@import`, aren't
 * modules, and aren't recorded)
 * @param root Absolute path of the host repository's root
 * @param virtualFiles The virtual files, by absolute path
 * @param reads POSIX-style paths, relative to the host repository's root, to add the files read to
 * @returns The Vite plugin
 */
export function createReadsPlugin(root: string, virtualFiles: VirtualFilesByPath, reads: Set<string>): Plugin {
  return {
    name: 'showroom-reads',
    enforce: 'pre',
    load(id) {
      const virtualFile = virtualFiles.get(_splitId(id).path);
      const path = virtualFile ? virtualFile.documentation : getHostPath(root, virtualFiles, id);
      if (path) reads.add(path);
      return null;
    },
  };
}

// #endregion

// #region Errors

/**
 * Removes the ANSI escape codes (colours) from text
 * @param text The text
 * @returns The text without them
 */
function _stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Gets the line of a position in a source
 * @param source The source
 * @param position The position, in characters, from 0
 * @returns The line, from 1
 */
function _getLine(source: string, position: number): number {
  return source.slice(0, position).split('\n').length;
}

/**
 * Represents an error, or a warning, as Vite and its bundler give them
 */
interface _BundlerError {
  message?: unknown;
  id?: unknown;
  loc?: { line?: unknown; file?: unknown };
  pos?: unknown;
  errors?: unknown;
}

/**
 * Maps one of the bundler's errors, or warnings: its message's first line, without its `[code]` prefix, with the host repository's paths made
 * relative to its root; its path, from its module id, its location's file, or the location its message shows (relative to the working directory);
 * and its line, from its location, the location its message shows, or its position in its module's source
 * @param root Absolute path of the host repository's root
 * @param virtualFiles The virtual files, by absolute path
 * @param error The bundler's error or warning
 * @returns The build error
 */
async function _mapError(root: string, virtualFiles: VirtualFilesByPath, error: _BundlerError): Promise<ShowcaseBuildError> {
  const text = _stripAnsi(typeof error.message === 'string' ? error.message : String(error));
  const shown = /╭─\[\s*(.+?):(\d+):(\d+)\s*\]/.exec(text);
  let id = typeof error.id === 'string' ? error.id : typeof error.loc?.file === 'string' ? error.loc.file : undefined;
  let line = typeof error.loc?.line === 'number' ? error.loc.line : undefined;
  if (!id && shown) {
    id = resolve(shown[1]);
    line ??= Number(shown[2]);
  }
  if (line === undefined && id && typeof error.pos === 'number') {
    const source = await _readSource(virtualFiles, _splitId(id).path);
    if (source !== undefined) line = _getLine(source, error.pos);
  }

  // The first line of the message, with absolute paths, and paths relative to the working directory, made relative to the root
  const first = (text.split('\n').find((part) => part.trim()) ?? text).trim().replace(/^\[[^\]]+\]\s*/, '');
  const prefixes = [`${root}${sep}`, `${relative(process.cwd(), root).split(sep).join('/')}/`].filter((prefix) => prefix !== '/');
  const message = prefixes.reduce((result, prefix) => result.split(prefix).join(''), first) || 'The build failed';

  const path = getHostPath(root, virtualFiles, id);
  return { message, ...(path ? { path } : {}), ...(path && line && line >= 1 ? { line } : {}) };
}

/**
 * Maps an error a build threw to build errors: each of its `errors` when it has them (the bundler's), else the error itself
 * @param root Absolute path of the host repository's root
 * @param virtualFiles The virtual files, by absolute path
 * @param error The error thrown
 * @returns The build errors
 */
export async function getBuildErrors(root: string, virtualFiles: VirtualFilesByPath, error: unknown): Promise<ShowcaseBuildError[]> {
  const nested = (error as _BundlerError | undefined)?.errors;
  const errors = Array.isArray(nested) && nested.length ? nested : [error];
  return Promise.all(
    errors.map((item) => _mapError(root, virtualFiles, (typeof item === 'object' && item !== null ? item : { message: item }) as _BundlerError)),
  );
}

/**
 * Maps one of the bundler's warnings to a build warning, as build errors are mapped (see getBuildErrors())
 * @param root Absolute path of the host repository's root
 * @param virtualFiles The virtual files, by absolute path
 * @param warning The bundler's warning
 * @returns The build warning, or undefined for a warning left out (see SILENCED_WARNINGS)
 */
export async function getBuildWarning(
  root: string,
  virtualFiles: VirtualFilesByPath,
  warning: _BundlerError & { code?: unknown },
): Promise<ShowcaseBuildError | undefined> {
  if (typeof warning.code === 'string' && SILENCED_WARNINGS.includes(warning.code)) return undefined;
  return _mapError(root, virtualFiles, warning);
}

// #endregion

// #region Configuration

/**
 * Represents the options of a `ts` showcase's Vite configuration
 */
export interface TsBuildConfigurationOptions {
  /**
   * Absolute path of the host repository's root, Vite's root
   */
  root: string;
  /**
   * Absolute path of the entry point
   */
  entry: string;
  /**
   * Mode to build in
   */
  mode: 'development' | 'production';
  /**
   * Absolute path of the build's scratch folder, holding Vite's cache
   */
  scratchFolder: string;
  /**
   * Vite's client conditions (Vite's `defaultClientConditions`), the mode's taking the place of `development|production`
   */
  conditions: readonly string[];
  /**
   * The build's plugins
   */
  plugins: Plugin[];
  /**
   * Logger collecting Vite's own warnings
   */
  logger: Logger;
  /**
   * Called with each of the bundler's warnings
   */
  onWarning: (warning: Rolldown.RollupLog) => void;
}

/**
 * Gets a `ts` showcase's Vite configuration: inline, reading nothing from the host repository's Vite, PostCSS or environment configuration, with
 * relative URLs (`base: './'`), and the mode pinned (never through `process.env.NODE_ENV`, which Vite sets once per process): `define`, the resolve
 * conditions, minifying and source maps (inline, their sources relative to the root) all follow it. The bundle stays in memory.
 * @param options Options of the configuration
 * @returns Vite's inline configuration
 */
export function getTsBuildConfiguration({
  root,
  entry,
  mode,
  scratchFolder,
  conditions,
  plugins,
  logger,
  onWarning,
}: TsBuildConfigurationOptions): InlineConfig {
  const development = mode === 'development';
  return {
    configFile: false,
    envDir: false,
    publicDir: false,
    root,
    base: './',
    mode,
    cacheDir: join(scratchFolder, 'vite'),
    clearScreen: false,
    logLevel: 'silent',
    customLogger: logger,
    css: { postcss: {} },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'import.meta.env.MODE': JSON.stringify(mode),
      'import.meta.env.DEV': JSON.stringify(development),
      'import.meta.env.PROD': JSON.stringify(!development),
    },
    resolve: { conditions: conditions.map((condition) => (condition === 'development|production' ? mode : condition)) },
    plugins,
    build: {
      write: false,
      outDir: join(scratchFolder, 'out'),
      emptyOutDir: false,
      copyPublicDir: false,
      reportCompressedSize: false,
      minify: !development,
      sourcemap: development ? 'inline' : false,
      modulePreload: { polyfill: false },
      rolldownOptions: {
        input: entry,
        onwarn: (warning) => onWarning(warning),
        // Source maps name their sources relative to the host repository's root, never by the scratch folder's absolute path
        output: {
          sourcemapPathTransform: (source, map) =>
            relative(root, resolve(dirname(map), source))
              .split(sep)
              .join('/'),
        },
      },
    },
  };
}

// #endregion

// #region Page

/**
 * Path of the page the `ts` showcase adapter builds, in its showcase frame's folder
 */
export const TS_PAGE = 'index.html';

/**
 * Escapes text for an HTML attribute
 * @param text Text to escape
 * @returns The text with `&`, `<`, `>` and `"` escaped
 */
function _escapeAttribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Gets a `ts` showcase frame's page: its CSS in the head; the showcase frame root, the console panel's element (hidden), the console script, and the
 * showcase's module in the body, in this order
 * @param module POSIX-style path of the showcase's module, relative to the page
 * @param styles POSIX-style paths of its CSS files, relative to the page
 * @returns The page
 */
export function getTsPage(module: string, styles: readonly string[]): string {
  const links = styles.map((path) => `<link rel="stylesheet" crossorigin href="./${_escapeAttribute(path)}">`).join('');
  return (
    '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    `${links}</head><body><div id="${SHOWCASE_FRAME_ROOT_ID}"></div><div id="${CONSOLE_PANEL_ID}" hidden></div>` +
    `<script>${getConsoleScript()}</script><script type="module" crossorigin src="./${_escapeAttribute(module)}"></script></body></html>`
  );
}

// #endregion

// #region Showcase adapter

/**
 * Represents the `ts` showcase adapter
 */
export class TsShowcaseAdapter implements ShowcaseAdapter {
  /**
   * Validates a showcase (see validateTsShowcase())
   * @param showcase The showcase
   * @returns The validated options, or the errors found
   */
  public validate(showcase: Showcase): ShowcaseValidation {
    return validateTsShowcase(showcase);
  }

  /**
   * Builds a showcase's showcase frame: bundles its entry point with Vite, in memory, and writes its page around the bundle
   * @param request What to build
   * @returns The showcase frame's page, the bundle's chunks and assets, the files read and the warnings; or the build errors
   */
  public async build({ root, showcase, hostVirtualFiles, mode, scratchFolder }: ShowcaseBuildRequest): Promise<ShowcaseBuildResult> {
    const vite = await import('vite');
    const virtualFiles = getVirtualFilesByPath(root, hostVirtualFiles);
    const reads = new Set<string>([showcase.kind === 'inline' ? showcase.documentation : showcase.entry]);
    const unresolved: ShowcaseBuildError[] = [];
    const pending: Promise<ShowcaseBuildError | undefined>[] = [];
    const logger = vite.createLogger('silent');
    const warn = (message: string) => void pending.push(getBuildWarning(root, virtualFiles, { message }));
    logger.warn = warn;
    logger.warnOnce = warn;
    const configuration = getTsBuildConfiguration({
      root,
      entry: resolve(root, showcase.entry),
      mode,
      scratchFolder,
      conditions: vite.defaultClientConditions,
      plugins: [createReadsPlugin(root, virtualFiles, reads), createVirtualFilesPlugin(root, virtualFiles, unresolved)],
      logger,
      onWarning: (warning) => void pending.push(getBuildWarning(root, virtualFiles, warning)),
    });

    let output: Rolldown.RolldownOutput;
    try {
      const built = await vite.build(configuration);
      output = (Array.isArray(built) ? built[0] : built) as Rolldown.RolldownOutput;
    } catch (err) {
      const errors = unresolved.length ? unresolved : await getBuildErrors(root, virtualFiles, err);
      const warnings = (await Promise.all(pending)).filter((warning) => warning !== undefined);
      return { reads: [...reads], errors, ...(warnings.length ? { warnings } : {}) };
    }
    const warnings = (await Promise.all(pending)).filter((warning) => warning !== undefined);

    // The page around the bundle's entry chunk, and every chunk and asset next to it
    const entry = output.output.find((item): item is Rolldown.OutputChunk => item.type === 'chunk' && item.isEntry);
    if (!entry) return { reads: [...reads], errors: [{ message: 'The build has no entry chunk' }] };
    const files: ShowcaseBuildFile[] = [
      { path: TS_PAGE, content: getTsPage(entry.fileName, [...(entry.viteMetadata?.importedCss ?? [])]) },
      ...output.output.map((item) => ({ path: item.fileName, content: item.type === 'chunk' ? item.code : item.source })),
    ];
    return { page: TS_PAGE, files, reads: [...reads], ...(warnings.length ? { warnings } : {}) };
  }
}

// #endregion
