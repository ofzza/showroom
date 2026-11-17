/**
 * Integration tests of the ts showcase adapter: buildShowcases() on fixture host repositories with ts showcases, built with Vite
 */

import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import { check } from '../../../cli/check/index.js';
import { readConfiguration } from '../../../configuration/index.js';
import { getFrameScript } from '../../../frame/index.js';
import { buildShowcases, type ShowcaseFrame } from '../../../showcases/index.js';
import { createScratchFolder, FIXTURES } from '../../../testing/index.js';
import { buildTsShowcase } from './index.js';
import { resolveTypeScript } from './typecheck/index.js';

/**
 * Checks a fixture, then builds its showcases
 * @param name Name of the fixture
 * @param mode Mode to build in
 * @returns The outcome of buildShowcases()
 */
async function _build(name: string, mode?: 'development' | 'production') {
  const root = join(FIXTURES, name);
  const { host } = await check(root, { trust: true });
  const { configuration } = await readConfiguration(root);
  if (!host || !configuration) throw new Error(`The fixture "${name}" doesn't pass the check`);
  return buildShowcases({ root, host, configuration, mode, trust: true });
}

/**
 * Gets a text file of a showcase frame by a pattern of its path
 * @param frame The showcase frame
 * @param pattern Pattern of the file's path
 * @returns The file's path and content
 */
function _file(frame: ShowcaseFrame, pattern: RegExp): { path: string; content: string } {
  const file = frame.files.find(({ path }) => pattern.test(path));
  if (!file) throw new Error(`No file matches ${pattern}`);
  return { path: file.path, content: typeof file.content === 'string' ? file.content : new TextDecoder().decode(file.content) };
}

describe('adapters/showcase/ts (integration)', () => {
  // Builds the showcases of the `showcase-ts` fixture (a code block showcase importing the host's own package by its name through a committed `lib/`
  // folder, virtual files in its folder and in another one (a named showcase among them), by a path without an extension, a .js specifier and a folder, a virtual CSS file, JSON,
  // an asset, and a dynamic import with CSS, under a tsconfig turning useDefineForClassFields off; a JavaScript code block showcase; and a linked one
  // importing a virtual file), in each mode, type checked under its tsconfig; the `showcase-ts-errors` fixture's build errors and warning; the
  // `showcase-ts-types` fixture's type errors, and the `showcase-ts-defaults` fixture's, without a tsconfig; the `showcase-ts-many` fixture's 10
  // showcases; and buildTsShowcase() called directly on `showcase-ts-defaults` with modules compiled before Vite, as the `angular` showcase adapter
  // builds. The fixtures are only read.

  it('Builds ts showcases into showcase frames, with the page, the bundle, and the files read', async () => {
    const { frames, errors, warnings, issues, watched } = await _build('showcase-ts');
    expect({ errors: Object.fromEntries(errors), warnings, issues }).toEqual({ errors: {}, warnings: [], issues: [] });
    expect([...frames.keys()]).toEqual(['README.md#1', 'README.md#2', 'README.md#3', 'docs/guide.md#1']);

    // The page: the frame script, the CSS, the showcase frame root, then the module
    const frame = frames.get('README.md#1')!;
    const page = _file(frame, /^index\.html$/).content;
    const entry = _file(frame, /^assets\/README\.showcase-1-[\w-]+\.js$/);
    const css = _file(frame, /^assets\/README-[\w-]+\.css$/);
    expect(page).toContain(`<script>${getFrameScript()}</script>`);
    expect(page).toContain(`<link rel="stylesheet" crossorigin href="./${css.path}">`);
    expect(page).toContain(`<div id="root"></div><script type="module" crossorigin src="./${entry.path}"></script>`);
    expect(css.content).toContain('#root{color:teal}');

    // The bundle: the host's own package, the virtual files, JSON, the tsconfig's class fields, the production mode, minified, relative URLs
    expect(entry.content).toContain('Hello, ${');
    for (const text of ['`util`', '`shared`', '`index`', '{answer:42}', 'this.value=1', 'console.log(e(),`production`,`production`)']) {
      expect(entry.content).toContain(text);
    }
    expect(entry.content).not.toMatch(/development|sourceMappingURL|\n\n/);
    const logo = _file(frame, /^assets\/logo-[\w-]+\.svg$/);
    expect(entry.content).toContain(`new URL(\`${logo.path.slice('assets/'.length)}\`,import.meta.url)`);
    const lazy = _file(frame, /^assets\/lazy-[\w-]+\.js$/);
    const lazyCss = _file(frame, /^assets\/lazy-[\w-]+\.css$/);
    expect(entry.content).toContain(`"./${lazy.path.slice('assets/'.length)}","./${lazyCss.path.slice('assets/'.length)}"`);
    expect(lazyCss.content).toContain('.lazy{color:purple}');
    expect(frame.files.map(({ path }) => path).sort()).toEqual(['index.html', css.path, entry.path, lazy.path, lazyCss.path, logo.path].sort());
    // The type check's reads too: the tsconfig, the files it includes, and the host's own package's declarations
    expect([...frame.reads].sort()).toEqual([
      'README.md',
      'data.json',
      'demos/linked.ts',
      'docs/guide.md',
      'env.d.ts',
      'lazy.css',
      'lazy.ts',
      'lib/index.d.ts',
      'lib/index.js',
      'logo.svg',
      'tsconfig.json',
    ]);

    // A JavaScript showcase, and a linked one importing a virtual file
    expect(_file(frames.get('README.md#2')!, /\.js$/).content).toContain('console.info(`plain JavaScript`)');
    const linked = frames.get('README.md#3')!;
    expect(_file(linked, /^assets\/linked-[\w-]+\.js$/).content).toContain('`helper`');
    expect(linked.reads).toEqual(['demos/linked.ts', 'README.md', 'env.d.ts', 'lazy.ts', 'lib/index.d.ts', 'tsconfig.json']);
    // A named showcase, which README.md#1 imports by its name, built on its own too
    expect(_file(frames.get('docs/guide.md#1')!, /^assets\/shared-[\w-]+\.js$/).content).toBeDefined();
    expect(watched).toEqual([
      'README.md',
      'data.json',
      'demos/linked.ts',
      'docs/guide.md',
      'env.d.ts',
      'lazy.css',
      'lazy.ts',
      'lib/index.d.ts',
      'lib/index.js',
      'logo.svg',
      'tsconfig.json',
    ]);
  });

  it('Builds in development mode: unminified, with inline source maps naming their sources relative to the root', async () => {
    const { frames, errors } = await _build('showcase-ts', 'development');
    expect(errors.size).toBe(0);
    const entry = _file(frames.get('README.md#1')!, /^assets\/README\.showcase-1-[\w-]+\.js$/).content;
    expect(entry).toContain('console.log(later(), "development", "development")');
    expect(entry).toContain('this.value = 1');
    const map = /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([\w+/=]+)/.exec(entry);
    expect(map).not.toBeNull();
    const sources = (JSON.parse(Buffer.from(map![1], 'base64').toString('utf8')) as { sources: string[] }).sources;
    expect(sources).toEqual(expect.arrayContaining(['README.showcase-1.ts', 'util.ts', 'docs/shared.ts', 'docs/index.ts', 'lib/index.js']));
    expect(sources.every((source) => !source.startsWith('..') && !source.startsWith('/'))).toBe(true);
  });

  it('Reports build errors at their lines, and warnings, and builds the other showcases', async () => {
    const { frames, errors, warnings, checks, issues, watched } = await _build('showcase-ts-errors');
    expect(issues).toEqual([]);
    expect([...frames.keys()]).toEqual(['README.md#6']);
    // A failed bundle runs no type check, so it lists none (D537, .workflow/SPEC-S12-showcase-views.md)
    expect([...errors.keys()].map((id) => checks.get(id))).toEqual([...errors.keys()].map(() => []));
    expect(checks.get('README.md#6')).toEqual(['type check']);
    const error = (id: string, line: number, message: string, path: string, at: number) => [
      id,
      [{ severity: 'error', message: `Showcase ${id} (README.md:${line}): ${message}`, path, line: at }],
    ];
    expect([...errors]).toEqual([
      error('README.md#1', 5, 'Unexpected token', 'README.md', 7),
      error('README.md#2', 10, 'Unexpected token', 'demos/broken.ts', 3),
      error('README.md#3', 14, `Can't resolve "./missing"`, 'README.md', 16),
      error('README.md#4', 22, `Can't resolve "not-installed-package"`, 'README.md', 25),
      error('README.md#5', 29, `Can't resolve "./broken-free"`, 'demos/imports.ts', 1),
    ]);
    expect(warnings).toEqual([
      {
        severity: 'warning',
        message:
          'Showcase README.md#6 (README.md:31): Use of direct `eval` function is strongly discouraged as it poses security risks and may cause issues with minification.',
        path: 'demos/warning.ts',
        line: 1,
      },
    ]);
    // Failed builds' reads are watched too
    expect(watched).toEqual(['README.md', 'demos/broken.ts', 'demos/imports.ts', 'demos/warning.ts']);
  });

  it('Fails showcases on the type errors of the files they reach, at their lines', async () => {
    // The `showcase-ts-types` fixture: a strict root tsconfig with rootDir, composite and outDir (dropped), including `src/` (whose declarations type
    // an asset and import.meta.env); a nearer tsconfig turning noImplicitAny off in `docs/nested/`
    const { frames, errors, warnings, shownIssues, checks, issues, watched } = await _build('showcase-ts-types');
    expect(issues).toEqual([]);
    const error = (id: string, line: number, message: string, path: string, at: number) => [
      id,
      [{ severity: 'error', message: `Showcase ${id} (README.md:${line}): type check: ${message}`, path, line: at, check: 'type check' }],
    ];
    const assign = (from: string, to: string) => `TS2322: Type '${from}' is not assignable to type '${to}'.`;
    expect([...errors]).toEqual([
      // In a code block, in a linked file, and in a virtual file with no showcase adapter
      error('README.md#1', 5, assign('string', 'number'), 'README.md', 6),
      error('README.md#2', 10, assign('number', 'string'), 'demos/linked.ts', 2),
      error('README.md#3', 12, assign('string', 'boolean'), 'README.md', 18),
      // In a host file two showcases reach: one issue each (src/unreached.ts's error, which no showcase reaches, fails none)
      error('README.md#4', 23, assign('string', 'number'), 'src/broken.ts', 2),
      error('README.md#5', 28, assign('string', 'number'), 'src/broken.ts', 2),
      // A JavaScript import without declarations, under strict; README.md#9, with allowJs, passes
      error(
        'README.md#8',
        49,
        "TS7016: Could not find a declaration file for module './src/legacy.js'. 'src/legacy.js' implicitly has an 'any' type.",
        'README.md',
        50,
      ),
      error('README.md#11', 68, assign('number', 'string'), 'README.md', 70),
    ]);
    // Type errors leave the files usable (D508, .workflow/SPEC-S12-showcase-views.md): every showcase built
    expect([...frames.keys()]).toEqual([...checks.keys()]);
    expect(frames.size).toBe(12);
    // Every showcase ran its type check, but the one with typeCheck off (D557, .workflow/PLAN-P15.2-checks-and-issues.md)
    expect([...checks].filter(([, names]) => !names.length).map(([id]) => id)).toEqual(['README.md#6']);
    expect([...checks].every(([, names]) => !names.length || (names.length === 1 && names[0] === 'type check'))).toBe(true);
    // A failed type check keeps the bundle's warnings
    expect(warnings.map(({ message, path, line }) => ({ message, path, line }))).toEqual([
      {
        message:
          'Showcase README.md#11 (README.md:68): Use of direct `eval` function is strongly discouraged as it poses security risks and may cause issues with minification.',
        path: 'README.md',
        line: 69,
      },
    ]);
    // The showroom shows each in its own file, a virtual file's at its own line (D584, .workflow/PLAN-P15.5-status-marks.md)
    expect(shownIssues.get('README.md#1')).toEqual([
      { severity: 'error', message: assign('string', 'number'), check: 'type check', path: 'README.showcase-1.ts', line: 1 },
    ]);
    expect(shownIssues.get('README.md#4')).toEqual([
      { severity: 'error', message: assign('string', 'number'), check: 'type check', path: 'src/broken.ts', line: 2 },
    ]);
    expect(shownIssues.get('README.md#11')!.map(({ severity, check }) => [severity, check])).toEqual([
      ['error', 'type check'],
      ['warning', undefined],
    ]);
    expect(shownIssues.get('README.md#6')).toEqual([]);
    // The bundles' reads, and the type checks': the tsconfig files, and the files the programs hold, outside node_modules
    expect(watched).toEqual([
      'README.md',
      'demos/linked.ts',
      'docs/nested/guide.md',
      'docs/nested/tsconfig.json',
      'logo.svg',
      'src/broken.ts',
      'src/env.d.ts',
      'src/legacy.js',
      'src/typed.ts',
      'src/unreached.ts',
      'tsconfig.json',
    ]);
  });

  it("Type checks with TypeScript's defaults without a tsconfig", async () => {
    // TypeScript 6's defaults are strict
    const { errors } = await _build('showcase-ts-defaults');
    expect(errors.get('README.md#1')).toEqual([
      {
        severity: 'error',
        message: "Showcase README.md#1 (README.md:5): type check: TS7006: Parameter 'value' implicitly has an 'any' type.",
        path: 'README.md',
        line: 6,
        check: 'type check',
      },
    ]);
  });

  it('Builds 10 showcases, one after another', async () => {
    // The time of this test is the measurement of D255 (PLAN-P7.1-ts.md), type checking included (D284): above 2 s per run, building only the
    // showcases a change affects is taken up
    const { frames, errors } = await _build('showcase-ts-many', 'development');
    expect(errors.size).toBe(0);
    expect(frames.size).toBe(10);
    expect(_file(frames.get('README.md#10')!, /\.js$/).content).toContain('Showcase 10: ');
  });

  describe('Compiled modules', () => {
    // Calls buildTsShowcase() as a showcase adapter compiling before Vite does: a plugin of its own loads the "compiled" JavaScript of the
    // `showcase-ts-defaults` fixture's virtual entry point (whose TypeScript has a type error), and a spy after every transform sees what reaches the
    // bundle.

    /**
     * Builds the `showcase-ts-defaults` fixture's showcase with compiled modules, loaded by a plugin, with the type check off
     * @param modules The compiled modules' code, by path relative to the root (the entry point is `README.showcase-1.ts`)
     * @returns The build's result, and the code each module had after every transform, by path relative to the root
     */
    async function _buildCompiled(modules: Record<string, string>) {
      const root = join(FIXTURES, 'showcase-ts-defaults');
      const { host } = await check(root, { trust: true });
      if (!host) throw new Error("The fixture doesn't pass the check");
      const compiled = new Map(Object.entries(modules).map(([path, code]) => [resolve(root, path), code]));
      const transformed: Record<string, string> = {};
      const plugins: Plugin[] = [
        {
          name: 'compiled',
          enforce: 'pre',
          resolveId: (source, importer) => (importer && compiled.has(resolve(root, source)) ? resolve(root, source) : null),
          load: (id) => (compiled.has(id) ? { code: compiled.get(id)!, moduleType: 'js' } : null),
        },
        { name: 'spy', enforce: 'post', transform: (code, id) => void (id.startsWith(`${root}/`) && (transformed[id.slice(root.length + 1)] = code)) },
      ];
      const scratch = await createScratchFolder('compiled-');
      try {
        const result = await buildTsShowcase({
          request: {
            root,
            showcase: host.showcases[0],
            options: { typeCheck: true, allowJs: false },
            virtualFiles: host.virtualFiles,
            hostVirtualFiles: host.virtualFiles,
            mode: 'development',
            scratchFolder: scratch.path,
          },
          plugins,
          compiled: new Set(compiled.keys()),
          typeCheck: false,
          sourceFiles: new Map(),
          resolveTypeScript,
        });
        return { result, transformed };
      } finally {
        await scratch.remove();
      }
    }

    it("Bundles what its own plugins load, ahead of the virtual files, untouched by Vite's TypeScript transform, and skips the type check", async () => {
      // Vite's Oxc transform filters by id, so without its exclude it would transform the compiled JavaScript of a .ts id again, and drop an import
      // whose bindings are unused (TypeScript's import elision), which JavaScript keeps for its side effects
      const { result, transformed } = await _buildCompiled({
        'README.showcase-1.ts': "import { present } from './compiled-helper.ts';\nconsole.log('entry');\n",
        'compiled-helper.ts': "export const present = 1;\nconsole.log('helper');\n",
      });
      expect(result.issues).toBeUndefined();
      expect(Object.keys(transformed).sort()).toEqual(['README.showcase-1.ts', 'compiled-helper.ts']);
      expect(result.reads).toEqual(['README.md', 'compiled-helper.ts']);
    });

    it('Places a bundle error in a compiled module at its file, without a line', async () => {
      // The bundler's position points into the compiled JavaScript, not into the TypeScript a line would be read against (D460)
      const { result } = await _buildCompiled({
        'README.showcase-1.ts': "import { missing } from './compiled-helper.ts';\nconsole.log(missing);\n",
        'compiled-helper.ts': 'export const present = 1;\n',
      });
      expect(result.issues).toEqual([
        { severity: 'error', message: expect.stringContaining('"missing" is not exported') as string, path: 'README.showcase-1.ts' },
      ]);
      expect(result.files).toBeUndefined();
    });
  });
});
