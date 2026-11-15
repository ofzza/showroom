/**
 * Integration tests of the angular showcase adapter: buildShowcases() on fixture host repositories with angular showcases, compiled by their own
 * Angular compiler and built with Vite, on this repository's Angular 22, and on installed fixtures' own Angular 20 and 21
 */

import { join } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { check } from '../../../cli/check/index.js';
import { readConfiguration } from '../../../configuration/index.js';
import { buildShowcases, type ShowcaseFrame } from '../../../showcases/index.js';
import { FIXTURES } from '../../../testing/index.js';
import { CONSOLE_PANEL_ID } from '../ts/console/index.js';
import { findAngular } from './compile/index.js';

/**
 * Checks a host repository, then builds its showcases
 * @param root Absolute path of the host repository
 * @param mode Mode to build in
 * @returns The outcome of buildShowcases()
 */
async function _build(root: string, mode?: 'development' | 'production') {
  const { host, issues } = await check(root);
  const { configuration } = await readConfiguration(root);
  if (!host || !configuration) throw new Error(`The host "${root}" doesn't pass the check: ${JSON.stringify(issues)}`);
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

/**
 * Gets the JavaScript of a showcase frame, every chunk's
 * @param frame The showcase frame
 * @returns The chunks' code, joined
 */
function _javaScript(frame: ShowcaseFrame): string {
  return frame.files
    .filter(({ path }) => path.endsWith('.js'))
    .map(({ content }) => (typeof content === 'string' ? content : new TextDecoder().decode(content)))
    .join('\n');
}

describe('adapters/showcase/angular (integration)', () => {
  // Builds the showcases of the `showcase-angular` fixture (a host component with signal inputs, an output and a root service, in a virtual template
  // and style; a linked showcase with a host component's real template and style, an NgModule import and a named export; the host's own partially
  // compiled library by its name; the `zone` option; a solution-style tsconfig under `solution/`; and a host component with a type error no showcase
  // reaches), in each mode; the `showcase-angular-errors` fixture's errors and warning; and the `showcase-angular-20` and `showcase-angular-21`
  // fixtures, installed by the global setup with their own Angular and TypeScript. The fixtures are only read.

  it('Builds angular showcases into showcase frames, compiled, linked and bundled, with no warnings', async () => {
    // The error in src/unreached.component.ts fails no showcase (D457), and Angular's own packages warn about nothing (D461)
    const { frames, errors, warnings, issues } = await _build(join(FIXTURES, 'showcase-angular'));
    expect({ errors: Object.fromEntries(errors), warnings, issues }).toEqual({ errors: {}, warnings: [], issues: [] });
    expect([...frames.keys()]).toEqual(['README.md#1', 'README.md#2', 'README.md#3', 'README.md#4', 'solution/README.md#1']);

    // The page: the showcase frame root, the console panel, and the mount module's chunk as the module
    const frame = frames.get('README.md#1')!;
    const page = _file(frame, /^index\.html$/).content;
    const entry = _file(frame, /^assets\/README\.showcase-1\.ts\.showroom-mount-[\w-]+\.js$/);
    expect(page).toContain(`<div id="root"></div><div id="${CONSOLE_PANEL_ID}" hidden></div>`);
    expect(page).toContain(`<script type="module" crossorigin src="./${entry.path}"></script>`);

    // The bundle: compiled ahead of time, Angular's packages linked, the production defines, zoneless, the template and the styles
    const code = _javaScript(frame);
    for (const text of [
      'host-counter',
      'Last: ',
      '.last[_ngcontent-%COMP%] { color: teal; }',
      '.count[_ngcontent-%COMP%] { color: rebeccapurple; }',
      'attachView',
    ]) {
      expect(code).toContain(text);
    }
    for (const text of ['ɵɵngDeclare', 'ngDevMode', 'ngJitMode', '__zone_symbol__']) expect(code, text).not.toContain(text);

    // The linked showcase's real template and style, the library's linked component, and zone.js loaded with `zone`
    expect(_javaScript(frames.get('README.md#2')!)).toContain('.badge[_ngcontent-%COMP%] { border: 1px solid currentColor; padding: 0 4px; }');
    const library = _javaScript(frames.get('README.md#3')!);
    expect(library).toContain('Hello, ');
    expect(library).not.toContain('ɵɵngDeclare');
    expect(_javaScript(frames.get('README.md#4')!)).toContain('__zone_symbol__');

    // The files read: the compile's and the bundle's, never the mount module
    expect([...frame.reads].sort()).toEqual([
      'README.md',
      'demos/badge-demo.ts',
      'src/badge.component.css',
      'src/badge.component.html',
      'src/badge.component.ts',
      'src/counter.component.ts',
      'src/counter.service.ts',
      'src/unreached.component.ts',
      'tsconfig.json',
    ]);
    expect(frames.get('README.md#3')!.reads).toContain('lib/greeting.component.js');
    expect([...frames.get('solution/README.md#1')!.reads].sort()).toEqual(['solution/README.md', 'solution/tsconfig.json']);
  });

  it("Builds in development mode, with Angular's development checks, and source maps naming the TypeScript sources", async () => {
    const { frames, errors, warnings } = await _build(join(FIXTURES, 'showcase-angular'), 'development');
    expect({ errors: Object.fromEntries(errors), warnings }).toEqual({ errors: {}, warnings: [] });
    const entry = _file(frames.get('README.md#1')!, /showroom-mount-[\w-]+\.js$/).content;
    expect(entry).toContain('ngDevMode');
    const map = /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([\w+/=]+)/.exec(entry);
    expect(map).not.toBeNull();
    const sources = (JSON.parse(Buffer.from(map![1], 'base64').toString('utf8')) as { sources: string[] }).sources;
    expect(sources).toEqual(expect.arrayContaining(['README.showcase-1.ts', 'src/counter.component.ts']));
  });

  it('Reports errors at their lines, whatever fails them, and a warning, and keeps the files beside the type errors', async () => {
    const { frames, errors, warnings, checks } = await _build(join(FIXTURES, 'showcase-angular-errors'));
    // Type errors leave the files usable, and name the type check; a failed compile or bundle runs none (D557, .workflow/PLAN-P15.2-checks-and-issues.md)
    expect([...frames.keys()]).toEqual(['README.md#4', 'README.md#5', 'README.md#6', 'README.md#7']);
    expect([...checks].filter(([, names]) => names.length).map(([id]) => id)).toEqual(['README.md#4', 'README.md#5', 'README.md#6', 'README.md#7']);
    const error = (id: string, line: number, message: string | object, path: string, at: number) => [
      id,
      [{ severity: 'error', message: typeof message === 'string' ? `Showcase ${id} (README.md:${line}): ${message}` : message, path, line: at }],
    ];
    const typeError = (id: string, line: number, message: string, path: string, at: number) => [
      id,
      [{ severity: 'error', message: `Showcase ${id} (README.md:${line}): type check: ${message}`, path, line: at, check: 'type check' }],
    ];
    expect([...errors]).toEqual([
      // A missing default export fails the bundle, at the entry point
      error('README.md#1', 5, expect.stringContaining('"default" is not exported by "README.showcase-1.ts"'), 'README.md', 6),
      error('README.md#2', 14, 'The default export of an angular showcase must be a standalone component', 'README.md', 18),
      error('README.md#3', 23, 'The default export of an angular showcase must be a standalone component', 'README.md', 24),
      typeError('README.md#4', 29, "TS2322: Type 'string' is not assignable to type 'number'.", 'README.md', 34),
      typeError('README.md#5', 40, "TS2339: Property 'missing' does not exist on type 'Inline'.", 'README.md', 46),
      typeError('README.md#6', 56, "TS2339: Property 'nope' does not exist on type 'BrokenComponent'.", 'src/broken.component.html', 2),
      // Without type checking, the bundle's error in a compiled module is at its file, without a line (D460): the showcase's line
      error('README.md#8', 77, expect.stringContaining('"missing" is not exported by "src/parts.ts"'), 'README.md', 77),
    ]);
    expect(warnings).toEqual([
      {
        severity: 'warning',
        message: expect.stringMatching(/^Showcase README\.md#7 \(README\.md:66\): type check: NG8107: The left side of this optional chain/) as string,
        path: 'README.md',
        line: 69,
        check: 'type check',
      },
    ]);
  });

  for (const [major, version, typeScript] of [
    ['20', '20.3.35', '5.8.3'],
    ['21', '21.2.26', '5.9.3'],
  ]) {
    it(`Compiles and bundles with the host's own Angular ${major} and its TypeScript, never this repository's`, async () => {
      const root = inject('installedFixtures')[`showcase-angular-${major}`];
      const found = findAngular(root);
      expect(found.packages['@angular/compiler-cli']!.folder.startsWith(root)).toBe(true);
      expect(found.typeScript?.folder.startsWith(root)).toBe(true);
      expect(found.typeScript?.version).toBe(typeScript);
      const { frames, errors, warnings, issues } = await _build(root);
      expect({ errors: Object.fromEntries(errors), warnings, issues }).toEqual({ errors: {}, warnings: [], issues: [] });
      const code = _javaScript(frames.get('README.md#1')!);
      expect(code).toContain(`\`${version}\``);
      expect(code).not.toMatch(/[`"]22\.\d+\.\d+[`"]/);
      expect(_javaScript(frames.get('README.md#2')!)).toContain('__zone_symbol__');
    });
  }
});
