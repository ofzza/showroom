/**
 * Integration tests of the ts showcase adapter: buildShowcases() on fixture host repositories with ts showcases, built with Vite
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check } from '../../../cli/check/index.js';
import { readConfiguration } from '../../../configuration/index.js';
import { getFrameScript } from '../../../frame/index.js';
import { buildShowcases, type ShowcaseFrame } from '../../../showcases/index.js';
import { FIXTURES } from '../../../testing/index.js';
import { CONSOLE_PANEL_ID, getConsoleScript } from './console/index.js';

/**
 * Checks a fixture, then builds its showcases
 * @param name Name of the fixture
 * @param mode Mode to build in
 * @returns The outcome of buildShowcases()
 */
async function _build(name: string, mode?: 'development' | 'production') {
  const root = join(FIXTURES, name);
  const { host } = await check(root);
  const { configuration } = await readConfiguration(root);
  if (!host || !configuration) throw new Error(`The fixture "${name}" doesn't pass the check`);
  return buildShowcases({ root, host, configuration, mode });
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
  // Builds the showcases of the `showcase-ts` fixture (an inline showcase importing the host's own package by its name through a committed `lib/`
  // folder, virtual files in its folder and in another one, by a path without an extension, a .js specifier and a folder, a virtual CSS file, JSON,
  // an asset, and a dynamic import with CSS, under a tsconfig turning useDefineForClassFields off; an inline JavaScript showcase; and a linked one
  // importing a virtual file), in each mode, type checked under its tsconfig; the `showcase-ts-errors` fixture's build errors and warning; the
  // `showcase-ts-types` fixture's type errors, and the `showcase-ts-defaults` fixture's, without a tsconfig; and the `showcase-ts-many` fixture's 10
  // showcases. The fixtures are only read.

  it('Builds ts showcases into showcase frames, with the page, the bundle, and the files read', async () => {
    const { frames, errors, warnings, issues, watched } = await _build('showcase-ts');
    expect({ errors: Object.fromEntries(errors), warnings, issues }).toEqual({ errors: {}, warnings: [], issues: [] });
    expect([...frames.keys()]).toEqual(['README.md#1', 'README.md#2', 'README.md#3']);

    // The page: the frame script, the CSS, the showcase frame root, the console panel and its script, then the module
    const frame = frames.get('README.md#1')!;
    const page = _file(frame, /^index\.html$/).content;
    const entry = _file(frame, /^assets\/README\.showcase-1-[\w-]+\.js$/);
    const css = _file(frame, /^assets\/README-[\w-]+\.css$/);
    expect(page).toContain(`<script>${getFrameScript()}</script>`);
    expect(page).toContain(`<link rel="stylesheet" crossorigin href="./${css.path}">`);
    expect(page).toContain(`<div id="root"></div><div id="${CONSOLE_PANEL_ID}" hidden></div><script>${getConsoleScript()}</script>`);
    expect(page).toContain(`<script type="module" crossorigin src="./${entry.path}"></script>`);
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
    const { frames, errors, warnings, issues, watched } = await _build('showcase-ts-errors');
    expect(issues).toEqual([]);
    expect([...frames.keys()]).toEqual(['README.md#6']);
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
    const { frames, errors, warnings, issues, watched } = await _build('showcase-ts-types');
    expect(issues).toEqual([]);
    const error = (id: string, line: number, message: string, path: string, at: number) => [
      id,
      [{ severity: 'error', message: `Showcase ${id} (README.md:${line}): ${message}`, path, line: at }],
    ];
    const assign = (from: string, to: string) => `TS2322: Type '${from}' is not assignable to type '${to}'.`;
    expect([...errors]).toEqual([
      // In a code block, in a linked file, and in a virtual resource
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
    // typeCheck off, a JavaScript entry point, allowJs, the host's declarations, and the nearer tsconfig
    expect([...frames.keys()]).toEqual(['README.md#6', 'README.md#7', 'README.md#9', 'README.md#10', 'docs/nested/guide.md#1']);
    // A failed type check keeps the bundle's warnings
    expect(warnings.map(({ message, path, line }) => ({ message, path, line }))).toEqual([
      {
        message:
          'Showcase README.md#11 (README.md:68): Use of direct `eval` function is strongly discouraged as it poses security risks and may cause issues with minification.',
        path: 'README.md',
        line: 69,
      },
    ]);
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
        message: "Showcase README.md#1 (README.md:5): TS7006: Parameter 'value' implicitly has an 'any' type.",
        path: 'README.md',
        line: 6,
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
});
