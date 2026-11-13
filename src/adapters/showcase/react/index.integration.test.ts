/**
 * Integration tests of the react showcase adapter: buildShowcases() on fixture host repositories with react showcases, built with Vite, on this
 * repository's React 19, and on an installed fixture's own React 18
 */

import { join } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { check } from '../../../cli/check/index.js';
import { readConfiguration } from '../../../configuration/index.js';
import { buildShowcases, type ShowcaseFrame } from '../../../showcases/index.js';
import { FIXTURES } from '../../../testing/index.js';
import { CONSOLE_PANEL_ID } from '../ts/console/index.js';

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

describe('adapters/showcase/react (integration)', () => {
  // Builds the showcases of the `showcase-react` fixture (a code block showcase with state, a host component, a virtual component and virtual CSS; a
  // `memo()` default export; a linked `jsx` showcase with a named export; and, under `classic/`, a tsconfig asking for the classic JSX runtime),
  // whose root tsconfig leaves `jsx` unset; the `showcase-react-errors` fixture's missing default exports and type error; and the
  // `showcase-react-18` fixture, installed by the global setup with its own React 18. The fixtures are only read.

  it('Builds react showcases into showcase frames, rendering the default export with the host React, on the ts page', async () => {
    const { frames, errors, warnings, issues } = await _build(join(FIXTURES, 'showcase-react'));
    expect({ errors: Object.fromEntries(errors), warnings, issues }).toEqual({ errors: {}, warnings: [], issues: [] });
    expect([...frames.keys()]).toEqual(['README.md#1', 'README.md#2', 'README.md#3', 'classic/README.md#1']);

    // The page: the showcase frame root, the console panel, the CSS, and the mount module's chunk as the module
    const frame = frames.get('README.md#1')!;
    const page = _file(frame, /^index\.html$/).content;
    const entry = _file(frame, /^assets\/README\.showcase-1\.tsx\.showroom-mount-[\w-]+\.js$/);
    const css = _file(frame, /^assets\/[\w.-]+\.css$/);
    expect(page).toContain(`<div id="root"></div><div id="${CONSOLE_PANEL_ID}" hidden></div>`);
    expect(page).toContain(`<link rel="stylesheet" crossorigin href="./${css.path}">`);
    expect(page).toContain(`<script type="module" crossorigin src="./${entry.path}"></script>`);
    expect(css.content).toContain('.label{color:teal}');

    // The bundle: this repository's React 19, the host's component, the virtual one, and the render into the showcase frame root
    expect(entry.content).toMatch(/[`"]19\.\d+\.\d+[`"]/);
    for (const text of ['Count: ', '`label`', '`from state`', 'getElementById(`root`)']) expect(entry.content).toContain(text);

    // The files read: the documentation file and the host's files, never the mount module
    expect(frame.reads).toContain('README.md');
    expect(frame.reads).toContain('Counter.tsx');
    for (const [, built] of frames) expect(built.reads.filter((path) => path.includes('showroom-mount'))).toEqual([]);
    expect(frames.get('README.md#3')!.reads).toContain('demos/Plain.jsx');
  });

  it("Uses JSX's automatic runtime whatever the tsconfig says, and React's development build in development mode", async () => {
    const { frames, errors } = await _build(join(FIXTURES, 'showcase-react'), 'development');
    expect(Object.fromEntries(errors)).toEqual({});
    const classic = _file(frames.get('classic/README.md#1')!, /showroom-mount-[\w-]+\.js$/).content;
    expect(classic).toContain('.jsxDEV)("p"');
    expect(classic).not.toContain('createElement("p"');
    expect(classic).toContain('react-dom-client.development.js');
  });

  it('Fails a showcase without a default export at its entry point, and reports type errors in TSX', async () => {
    const { frames, errors } = await _build(join(FIXTURES, 'showcase-react-errors'));
    expect([...frames.keys()]).toEqual([]);
    expect(Object.fromEntries(errors)).toEqual({
      'README.md#1': [
        { severity: 'error', message: expect.stringContaining('"default" is not exported by "README.showcase-1.tsx"'), path: 'README.md', line: 6 },
      ],
      'README.md#2': [
        { severity: 'error', message: expect.stringContaining("TS2322: Type 'string' is not assignable to type 'number'."), path: 'README.md', line: 15 },
      ],
      'README.md#3': [
        { severity: 'error', message: expect.stringContaining('"default" is not exported by "demos/NoDefault.tsx"'), path: 'demos/NoDefault.tsx', line: 1 },
      ],
    });
  });

  it("Bundles the host's own React 18, never this repository's React 19", async () => {
    const root = inject('installedFixtures')['showcase-react-18'];
    const { frames, errors, issues } = await _build(root);
    expect({ errors: Object.fromEntries(errors), issues }).toEqual({ errors: {}, issues: [] });
    const entry = _file(frames.get('README.md#1')!, /showroom-mount-[\w-]+\.js$/).content;
    expect(entry).toMatch(/[`"]18\.3\.1[`"]/);
    expect(entry).not.toMatch(/[`"]19\.\d+\.\d+[`"]/);
  });
});
