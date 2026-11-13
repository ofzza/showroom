/**
 * Tests of the ts showcase adapter
 */

import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import type { Showcase, VirtualFile } from '../../../host/index.js';
import type { ShowcaseBuildError } from '../index.js';
import { CONSOLE_PANEL_ID, getConsoleScript, SHOWCASE_FRAME_ROOT_ID } from './console/index.js';
import {
  createReadsPlugin,
  createVirtualFilesPlugin,
  getBuildErrors,
  getBuildWarning,
  getHostPath,
  getImportCandidates,
  getImportLine,
  getTsBuildConfiguration,
  getTsPage,
  getVirtualFileDataUrl,
  getVirtualFilesByPath,
  RESOLVE_EXTENSIONS,
  TsShowcaseAdapter,
} from './index.js';

/**
 * Path of the fixture host repository with ts showcases, whose real files the resolution tests find on disk
 */
const _ROOT = fileURLToPath(new URL('../../../../test/fixtures/showcase-ts', import.meta.url));

/**
 * Creates a showcase for the ts showcase adapter
 * @param kind Kind of the showcase
 * @param entry Path of its entry point
 * @param extra Other fields to set (e.g. options)
 * @returns The showcase
 */
function _showcase(kind: Showcase['kind'], entry: string, extra: Partial<Showcase> = {}): Showcase {
  return { id: 'README.md#1', documentation: 'README.md', line: 1, offset: 0, kind, adapter: 'ts', entry, ...extra };
}

/**
 * Creates a virtual file
 * @param path Its path, relative to the root
 * @param content Its content
 * @param documentation Its documentation file
 * @returns The virtual file
 */
function _virtual(path: string, content = '', documentation = 'README.md'): VirtualFile {
  return { path, kind: 'resource', content, documentation, line: 10 };
}

/**
 * Calls a plugin's `resolveId` hook as Vite would, with a fake plugin context whose `resolve()` answers from a list
 * @param plugin The plugin
 * @param source The specifier imported
 * @param importer Absolute path of the importer, if any
 * @param resolved What the context's `resolve()` resolves specifiers to (Vite's own resolution); null by default
 * @returns What the hook returns
 */
async function _resolve(plugin: Plugin, source: string, importer?: string, resolved: Record<string, string> = {}): Promise<unknown> {
  const context = {
    resolve: async (specifier: string) => (Object.hasOwn(resolved, specifier) ? { id: resolved[specifier] } : null),
    error: (message: string) => {
      throw new Error(message);
    },
  };
  return (plugin.resolveId as (...args: unknown[]) => Promise<unknown>).call(context, source, importer, { isEntry: !importer });
}

/**
 * Calls a plugin's `load` hook as Vite would
 * @param plugin The plugin
 * @param id The module id
 * @returns What the hook returns
 */
function _load(plugin: Plugin, id: string): unknown {
  return (plugin.load as (id: string) => unknown).call({}, id);
}

/**
 * Gets an absolute path in the fixture
 * @param path POSIX-style path, relative to the fixture's root
 * @returns The absolute path
 */
function _abs(path: string): string {
  return join(_ROOT, ...path.split('/'));
}

describe('adapters/showcase/ts', () => {
  // Tests the ts showcase adapter's parts on hand-made showcases and virtual files: its validation, the resolution and reads plugins (their hooks
  // called directly, with a fake plugin context, against the `showcase-ts` fixture's real files), error and warning mapping on hand-written errors in
  // the shapes Vite and its bundler throw, the Vite configuration of each mode, and the page; and its host check, with an injected resolver. Building
  // with Vite, and type checking, are in the integration tests (type checking's parts are tested in `./typecheck/`).

  describe('Validation', () => {
    // Tests validate() on every language of an entry point, and on its options.

    const adapter = new TsShowcaseAdapter();

    it('Accepts TypeScript and JavaScript entry points, with typeCheck on and allowJs off by default', () => {
      for (const entry of ['README.showcase-1.ts', 'README.showcase-1.js', 'README.showcase-1.mts', 'README.showcase-1.mjs']) {
        expect(adapter.validate(_showcase('inline', entry))).toEqual({ options: { typeCheck: true, allowJs: false }, errors: [] });
      }
      for (const entry of ['demo.ts', 'demo.MTS', 'demos/demo.js', 'demo.mjs']) {
        expect(adapter.validate(_showcase('linked', entry))).toEqual({ options: { typeCheck: true, allowJs: false }, errors: [] });
      }
    });

    it('Rejects other entry points, pointing tsx and jsx at the react showcase adapter', () => {
      expect(adapter.validate(_showcase('inline', 'README.showcase-1.html')).errors).toEqual([
        'The ts showcase adapter needs a "ts", "js", "mts" or "mjs" code block',
      ]);
      expect(adapter.validate(_showcase('inline', 'README.showcase-1.tsx')).errors).toEqual([
        'The ts showcase adapter needs a "ts", "js", "mts" or "mjs" code block; for tsx and jsx, use the react showcase adapter',
      ]);
      expect(adapter.validate(_showcase('linked', 'demo.jsx')).errors).toEqual([
        'The ts showcase adapter needs a link to a .ts, .mts, .js or .mjs file, not "demo.jsx"; for tsx and jsx, use the react showcase adapter',
      ]);
      expect(adapter.validate(_showcase('linked', 'demo.cts')).errors).toEqual([
        'The ts showcase adapter needs a link to a .ts, .mts, .js or .mjs file, not "demo.cts"',
      ]);
    });

    it('Takes typeCheck and allowJs, both booleans, as its options', () => {
      const options = (value: unknown) => adapter.validate(_showcase('inline', 'a.ts', { options: value }));
      expect(options({ typeCheck: false })).toEqual({ options: { typeCheck: false, allowJs: false }, errors: [] });
      expect(options({ allowJs: true })).toEqual({ options: { typeCheck: true, allowJs: true }, errors: [] });
      expect(options({ typeCheck: false, allowJs: true })).toEqual({ options: { typeCheck: false, allowJs: true }, errors: [] });
      expect(options({})).toEqual({ options: { typeCheck: true, allowJs: false }, errors: [] });
      expect(options({ typeCheck: 'no', allowJs: 1, size: 2 }).errors).toEqual([
        'The ts showcase adapter\'s option "typeCheck" must be true or false',
        'The ts showcase adapter\'s option "allowJs" must be true or false',
        'Unknown option "size" of the ts showcase adapter; its options are "typeCheck" and "allowJs"',
      ]);
      for (const options of [[true], 'typeCheck', null]) {
        expect(adapter.validate(_showcase('inline', 'a.ts', { options })).errors).toEqual([
          'The ts showcase adapter\'s options must be an object, e.g. "showcase=ts({ typeCheck: false })"',
        ]);
      }
    });
  });

  describe('Host check', () => {
    // Tests check() with an injected resolver standing for the host's TypeScript (the fixtures always resolve this repository's own), and close().

    it('Checks the TypeScript of the showcases that type check, with the resolver it was given', () => {
      const asked: string[] = [];
      const adapter = new TsShowcaseAdapter((folder) => void asked.push(folder));
      const showcases = [
        _showcase('inline', 'README.showcase-1.ts', { options: { typeCheck: true, allowJs: false } }),
        _showcase('inline', 'docs/guide.showcase-1.ts', { documentation: 'docs/guide.md', options: { typeCheck: false, allowJs: false } }),
      ];
      expect(adapter.check(_ROOT, showcases)).toEqual({
        errors: [
          'the ts showcases of "." type check, but no TypeScript is installed where it can be found: install "typescript" (5.x or 6.x), or set "typeCheck: false"',
        ],
        warnings: [],
      });
      expect(asked).toEqual([_ROOT]);
      expect(new TsShowcaseAdapter().check(_ROOT, showcases)).toEqual({ errors: [], warnings: [] });
    });

    it('Releases the shared source files on close()', () => {
      const adapter = new TsShowcaseAdapter();
      const shared = (adapter as unknown as { _sourceFiles: Map<string, unknown> })._sourceFiles;
      shared.set('key', new Map());
      adapter.close();
      expect((adapter as unknown as { _sourceFiles: Map<string, unknown> })._sourceFiles.size).toBe(0);
    });
  });

  describe('Paths', () => {
    // Tests the candidate paths of an import, finding an import's line, and the paths reads and errors name.

    it('Tries the path, its extensions, a TypeScript file for a JavaScript extension, then an index file', () => {
      const base = _abs('docs/util');
      expect(getImportCandidates(base)).toEqual([
        base,
        ...RESOLVE_EXTENSIONS.map((extension) => base + extension),
        ...RESOLVE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
      ]);
      expect(getImportCandidates(_abs('docs/util.js')).slice(RESOLVE_EXTENSIONS.length + 1, RESOLVE_EXTENSIONS.length + 3)).toEqual([
        _abs('docs/util.ts'),
        _abs('docs/util.tsx'),
      ]);
      expect(getImportCandidates(_abs('a.mjs'))[RESOLVE_EXTENSIONS.length + 1]).toBe(_abs('a.mts'));
    });

    it("Finds an import's line", () => {
      const source = 'const a = 1;\nimport x from \'./x\';\n\nimport y from "pkg/y";\nconst z = import(`./z.ts`);\n';
      expect(getImportLine(source, './x')).toBe(2);
      expect(getImportLine(source, 'pkg/y')).toBe(4);
      expect(getImportLine(source, './z.ts')).toBe(5);
      expect(getImportLine(source, './w')).toBeUndefined();
      // Only the whole specifier, in quotes
      expect(getImportLine(source, 'x')).toBeUndefined();
    });

    it('Names virtual files by their virtual path, and real files by their path, outside node_modules', () => {
      const virtualFiles = getVirtualFilesByPath(_ROOT, [_virtual('docs/util.ts')]);
      expect(getHostPath(_ROOT, virtualFiles, _abs('docs/util.ts'))).toBe('docs/util.ts');
      expect(getHostPath(_ROOT, virtualFiles, `${_abs('lazy.ts')}?used`)).toBe('lazy.ts');
      expect(getHostPath(_ROOT, virtualFiles, _abs('node_modules/pkg/index.js'))).toBeUndefined();
      expect(getHostPath(_ROOT, virtualFiles, _abs('packages/a/node_modules/pkg/index.js'))).toBeUndefined();
      expect(getHostPath(_ROOT, virtualFiles, resolve(_ROOT, '../other/a.ts'))).toBeUndefined();
      expect(getHostPath(_ROOT, virtualFiles, '\0vite/preload-helper.js')).toBeUndefined();
      expect(getHostPath(_ROOT, virtualFiles, undefined)).toBeUndefined();
      // Judged on the path relative to the root, so a host repository under a `node_modules` folder (e.g. a fixture's copy) still has its files
      const nested = _abs('node_modules/.cache/host');
      expect(getHostPath(nested, virtualFiles, join(nested, 'src', 'a.ts'))).toBe('src/a.ts');
    });
  });

  describe('Virtual files plugin', () => {
    // Tests the resolution of imports to virtual files as if on disk, from virtual and real importers, the imports nothing resolves, and loading
    // virtual files.

    const virtualFiles = getVirtualFilesByPath(_ROOT, [
      _virtual('README.showcase-1.ts', "import './util';\n\nimport missing from './missing';\n"),
      _virtual('util.ts'),
      _virtual('shared.ts'),
      _virtual('docs/index.ts', '', 'docs/guide.md'),
      _virtual('theme.css', '#root{}'),
      _virtual('logo.svg', '<svg/>'),
      // A virtual and a real file of the same name never reach a build (`check` reports it); here, to show the virtual one wins
      _virtual('lazy.ts', 'virtual'),
      _virtual('demos/linked.tsx'),
    ]);
    const entry = _abs('README.showcase-1.ts');

    it('Resolves the entry point', async () => {
      const plugin = createVirtualFilesPlugin(_ROOT, virtualFiles, []);
      expect(await _resolve(plugin, entry)).toBe(entry);
      expect(await _resolve(plugin, _abs('demos/linked.ts'))).toBeNull();
    });

    it('Resolves relative imports to virtual files, as on disk', async () => {
      const plugin = createVirtualFilesPlugin(_ROOT, virtualFiles, []);
      expect(await _resolve(plugin, './util', entry)).toBe(_abs('util.ts'));
      expect(await _resolve(plugin, './util.ts', entry)).toBe(_abs('util.ts'));
      // TypeScript's convention: a .js specifier naming a .ts file
      expect(await _resolve(plugin, './shared.js', entry)).toBe(_abs('shared.ts'));
      // A folder holding a virtual index file, in another folder
      expect(await _resolve(plugin, './docs', entry)).toBe(_abs('docs/index.ts'));
      expect(await _resolve(plugin, '../util', _abs('docs/index.ts'))).toBe(_abs('util.ts'));
      // A query is kept
      expect(await _resolve(plugin, './theme.css?inline', entry)).toBe(`${_abs('theme.css')}?inline`);
      // From a real file, and from an importer with a query
      expect(await _resolve(plugin, '../util', _abs('demos/linked.ts'))).toBe(_abs('util.ts'));
      expect(await _resolve(plugin, './util', `${entry}?used`)).toBe(_abs('util.ts'));
    });

    it('Tries the virtual file before the real one at each candidate, and stops at a real file', async () => {
      const plugin = createVirtualFilesPlugin(_ROOT, virtualFiles, []);
      expect(await _resolve(plugin, './lazy', entry)).toBe(_abs('lazy.ts'));
      // demos/linked.ts is real, and comes before the virtual demos/linked.tsx: Vite resolves it
      expect(await _resolve(plugin, './demos/linked', entry, { './demos/linked': _abs('demos/linked.ts') })).toEqual({ id: _abs('demos/linked.ts') });
    });

    it("Leaves other imports to Vite, reporting those of the host's modules it can't resolve at their line", async () => {
      const errors: ShowcaseBuildError[] = [];
      const plugin = createVirtualFilesPlugin(_ROOT, virtualFiles, errors);
      expect(await _resolve(plugin, 'showcase-ts-host', entry, { 'showcase-ts-host': _abs('lib/index.js') })).toEqual({ id: _abs('lib/index.js') });
      await expect(_resolve(plugin, './missing', entry)).rejects.toThrow(`Can't resolve "./missing"`);
      await expect(_resolve(plugin, 'nowhere', _abs('demos/linked.ts'))).rejects.toThrow(`Can't resolve "nowhere"`);
      expect(errors).toEqual([
        { message: `Can't resolve "./missing"`, path: 'README.showcase-1.ts', line: 3 },
        // Not found in the real file's source: no line
        { message: `Can't resolve "nowhere"`, path: 'demos/linked.ts' },
      ]);
      // A dependency's imports, and the plugins' own modules, are Vite's alone
      expect(await _resolve(plugin, 'nowhere', _abs('node_modules/pkg/index.js'))).toBeNull();
      expect(await _resolve(plugin, './x', '\0vite/preload-helper.js')).toBeNull();
      expect(await _resolve(plugin, '\0vite/preload-helper.js', entry)).toBeNull();
      expect(errors).toHaveLength(2);
    });

    it('Loads virtual files from memory: code, CSS and JSON as they are, any other as a data: URL', () => {
      const plugin = createVirtualFilesPlugin(_ROOT, virtualFiles, []);
      expect(_load(plugin, _abs('lazy.ts'))).toBe('virtual');
      expect(_load(plugin, _abs('theme.css'))).toBe('#root{}');
      expect(_load(plugin, `${_abs('theme.css')}?inline`)).toBe('#root{}');
      expect(_load(plugin, `${_abs('util.ts')}?raw`)).toBeNull();
      expect(_load(plugin, _abs('logo.svg'))).toBe('export default "data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E";');
      expect(_load(plugin, _abs('data.json'))).toBeNull();
    });

    it('Types the data: URL of a virtual file that is not code, CSS or JSON by its extension', () => {
      expect(getVirtualFileDataUrl('docs/logo.SVG', '<svg/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E');
      expect(getVirtualFileDataUrl('page.html', '<p>a & b</p>')).toBe('data:text/html;charset=utf-8,%3Cp%3Ea%20%26%20b%3C%2Fp%3E');
      expect(getVirtualFileDataUrl('notes.txt', 'x')).toBe('data:text/plain;charset=utf-8,x');
      expect(getVirtualFileDataUrl('data.yaml', 'x')).toBe('data:text/plain;charset=utf-8,x');
      expect(getVirtualFileDataUrl('noextension', 'x')).toBe('data:text/plain;charset=utf-8,x');
    });
  });

  describe('Reads plugin', () => {
    // Tests recording the files a build reads, as their modules load.

    it('Records virtual files as their documentation files, and real files outside node_modules', () => {
      const reads = new Set<string>();
      const plugin = createReadsPlugin(_ROOT, getVirtualFilesByPath(_ROOT, [_virtual('docs/index.ts', '', 'docs/guide.md')]), reads);
      for (const id of [_abs('docs/index.ts'), `${_abs('lazy.css')}?used`, _abs('node_modules/pkg/index.js'), '\0vite/preload-helper.js', _abs('lazy.ts')]) {
        expect(_load(plugin, id)).toBeNull();
      }
      expect([...reads]).toEqual(['docs/guide.md', 'lazy.css', 'lazy.ts']);
    });
  });

  describe('Errors', () => {
    // Tests mapping the errors and warnings Vite and its bundler give to build errors, on hand-written ones in their shapes: the bundler's errors
    // with a location, a module id and a position, or only a location shown in their message; and plain errors.

    const virtualFiles = getVirtualFilesByPath(_ROOT, [_virtual('README.showcase-1.ts', 'const a = 1;\nconst b = ;\n')]);
    const shown = relative(process.cwd(), _abs('README.showcase-1.ts')).split(sep).join('/');

    it("Maps a transform error, whose location is only in its message, to the virtual file's line", async () => {
      const error = Object.assign(new Error('Build failed with 1 error'), {
        errors: [
          {
            message: `\x1b[31m[builtin:vite-transform] \x1b[0mUnexpected token\n   \x1b[38;5;246m╭─[\x1b[0m ${shown}:2:11 \x1b[38;5;246m]\x1b[0m\n 2 │ const b = ;\n`,
            loc: { line: 2, column: 10 },
            pos: 23,
          },
        ],
      });
      expect(await getBuildErrors(_ROOT, virtualFiles, error)).toEqual([{ message: 'Unexpected token', path: 'README.showcase-1.ts', line: 2 }]);
    });

    it("Maps errors by their module id, their location's file, or their position, with the root's paths made relative", async () => {
      const id = _abs('README.showcase-1.ts');
      const errors = await getBuildErrors(_ROOT, virtualFiles, {
        errors: [
          { message: `[UNRESOLVED_IMPORT] Could not resolve './x' in ${shown}\n ╭─[ ${shown}:2:1 ]`, id, loc: { line: 2, column: 0, file: id } },
          { message: `Failed in ${_abs('lazy.ts')}`, loc: { file: _abs('lazy.ts'), line: 3 } },
          { message: 'At a position', id: `${id}?used`, pos: 14 },
          { message: 'In a dependency', id: _abs('node_modules/pkg/index.js'), loc: { line: 4 } },
          'thrown text',
        ],
      });
      expect(errors).toEqual([
        { message: "Could not resolve './x' in README.showcase-1.ts", path: 'README.showcase-1.ts', line: 2 },
        { message: 'Failed in lazy.ts', path: 'lazy.ts', line: 3 },
        { message: 'At a position', path: 'README.showcase-1.ts', line: 2 },
        { message: 'In a dependency' },
        { message: 'thrown text' },
      ]);
    });

    it('Maps a plain error to its message alone', async () => {
      expect(await getBuildErrors(_ROOT, virtualFiles, new Error('Out of memory\nmore'))).toEqual([{ message: 'Out of memory' }]);
      expect(await getBuildErrors(_ROOT, virtualFiles, { errors: [] })).toEqual([{ message: 'The build failed' }]);
      expect(await getBuildErrors(_ROOT, virtualFiles, new Error(''))).toEqual([{ message: 'The build failed' }]);
    });

    it('Maps warnings as errors, leaving out the silenced ones', async () => {
      const id = _abs('README.showcase-1.ts');
      expect(await getBuildWarning(_ROOT, virtualFiles, { code: 'EVAL', message: '[EVAL] Use of eval', id, loc: { line: 1 } })).toEqual({
        message: 'Use of eval',
        path: 'README.showcase-1.ts',
        line: 1,
      });
      expect(await getBuildWarning(_ROOT, virtualFiles, { message: 'A warning of Vite' })).toEqual({ message: 'A warning of Vite' });
      expect(await getBuildWarning(_ROOT, virtualFiles, { code: 'MODULE_LEVEL_DIRECTIVE', message: "'use client'" })).toBeUndefined();
    });
  });

  describe('Configuration', () => {
    // Tests the Vite configuration of each mode, under Vitest's `NODE_ENV=test`, which the configuration must never follow.

    const options = {
      root: _ROOT,
      entry: _abs('README.showcase-1.ts'),
      scratchFolder: _abs('scratch'),
      conditions: ['module', 'browser', 'development|production'],
      plugins: [],
      logger: {} as never,
      onWarning: () => undefined,
    };

    it('Pins everything Vite would take from the host repository', () => {
      const configuration = getTsBuildConfiguration({ ...options, mode: 'production' });
      expect(configuration).toMatchObject({
        configFile: false,
        envDir: false,
        publicDir: false,
        root: _ROOT,
        base: './',
        cacheDir: join(options.scratchFolder, 'vite'),
        logLevel: 'silent',
        css: { postcss: {} },
        build: { write: false, copyPublicDir: false, modulePreload: { polyfill: false }, rolldownOptions: { input: options.entry } },
      });
    });

    it("Pins each mode in the configuration, whatever NODE_ENV says (see AGENTS.md › The ts showcase adapter's mode is pinned)", () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(getTsBuildConfiguration({ ...options, mode: 'production' })).toMatchObject({
        mode: 'production',
        define: {
          'process.env.NODE_ENV': '"production"',
          'import.meta.env.MODE': '"production"',
          'import.meta.env.DEV': 'false',
          'import.meta.env.PROD': 'true',
        },
        resolve: { conditions: ['module', 'browser', 'production'] },
        build: { minify: true, sourcemap: false },
      });
      expect(getTsBuildConfiguration({ ...options, mode: 'development' })).toMatchObject({
        mode: 'development',
        define: {
          'process.env.NODE_ENV': '"development"',
          'import.meta.env.MODE': '"development"',
          'import.meta.env.DEV': 'true',
          'import.meta.env.PROD': 'false',
        },
        resolve: { conditions: ['module', 'browser', 'development'] },
        build: { minify: false, sourcemap: 'inline' },
      });
    });

    it("Names source maps' sources relative to the root", () => {
      const output = getTsBuildConfiguration({ ...options, mode: 'development' }).build?.rolldownOptions?.output;
      const transform = (output as { sourcemapPathTransform: (source: string, map: string) => string }).sourcemapPathTransform;
      const map = join(options.scratchFolder, 'out', 'assets', 'index.js.map');
      expect(transform(relative(join(options.scratchFolder, 'out', 'assets'), _abs('docs/util.ts')), map)).toBe('docs/util.ts');
    });

    it("Passes the bundler's warnings on", () => {
      const warnings: unknown[] = [];
      const configuration = getTsBuildConfiguration({ ...options, mode: 'production', onWarning: (warning) => void warnings.push(warning) });
      const onwarn = configuration.build?.rolldownOptions?.onwarn as (warning: unknown, warn: () => void) => void;
      onwarn({ code: 'EVAL', message: 'eval' }, () => undefined);
      expect(warnings).toEqual([{ code: 'EVAL', message: 'eval' }]);
    });
  });

  describe('Page', () => {
    // Tests the page written around the bundle.

    it('Holds the CSS, the showcase frame root, the hidden console panel, its script, then the module', () => {
      const page = getTsPage('assets/README.showcase-1-abc.js', ['assets/a.css', 'assets/b&c.css']);
      expect(page).toMatch(/^<!doctype html>\n<html><head><meta charset="utf-8">/);
      expect(page).toContain('<link rel="stylesheet" crossorigin href="./assets/a.css"><link rel="stylesheet" crossorigin href="./assets/b&amp;c.css"></head>');
      expect(page).toContain(
        `<body><div id="${SHOWCASE_FRAME_ROOT_ID}"></div><div id="${CONSOLE_PANEL_ID}" hidden></div><script>${getConsoleScript()}</script>` +
          '<script type="module" crossorigin src="./assets/README.showcase-1-abc.js"></script></body></html>',
      );
    });
  });
});
