/**
 * Integration tests of the jsonschema showcase adapter: buildShowcases() on its fixtures, with the tests' shared Mermaid bundle
 */

import { join } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { check } from '../../../cli/check/index.js';
import { readConfiguration } from '../../../configuration/index.js';
import { getFrameScript } from '../../../frame/index.js';
import { getMermaidHash, getMermaidImportMap, buildShowcases } from '../../../showcases/index.js';
import { FIXTURES } from '../../../testing/index.js';

/**
 * Checks a fixture, then builds its showcases with the tests' shared Mermaid bundle
 * @param name Name of the fixture
 * @param trust True to trust the host repository
 * @returns The outcome of buildShowcases()
 */
async function _build(name: string, trust = true) {
  const root = join(FIXTURES, name);
  const { host } = await check(root, { trust });
  const { configuration } = await readConfiguration(root);
  if (!host || !configuration) throw new Error(`The fixture "${name}" doesn't pass the check`);
  return buildShowcases({ root, host, configuration, trust, mermaidDir: inject('mermaidDir') });
}

describe('adapters/showcase/jsonschema (integration)', () => {
  // Builds the `showcase-jsonschema` fixture's showcases (a linked schema, every kind of node and edge, a root reference, a root of definitions
  // only, a named showcase, awkward names, a nested documentation file) and the `showcase-jsonschema-errors` fixture's (every error and warning),
  // with buildShowcases(), as check, serve and build do: each frame is its page alone, with the frame script and the import map of the shared
  // Mermaid bundle, never Mermaid itself. The fixtures are only read.

  it('Builds each showcase frame as its page alone, importing the shared Mermaid bundle by its import map', async () => {
    const { frames, errors, warnings, issues } = await _build('showcase-jsonschema');
    expect([issues, [...errors.values()], warnings]).toEqual([[], [], []]);
    expect([...frames.keys()]).toEqual(['README.md#1', 'README.md#2', 'README.md#3', 'README.md#4', 'README.md#5', 'README.md#6', 'docs/nested.md#1']);
    const hash = await getMermaidHash(inject('mermaidDir'));
    expect(hash).toMatch(/^[0-9a-f]+$/);
    for (const [id, frame] of frames) {
      expect(frame.mermaid).toBe(true);
      expect(frame.files.map((file) => file.path)).toEqual(['index.html']);
      const depth = id.startsWith('docs/') ? 4 : 3;
      const importMap = getMermaidImportMap(`${'../'.repeat(depth)}mermaid/mermaid.js?hash=${hash}`);
      expect(frame.files[0].content).toContain(`<script>${getFrameScript()}</script>${importMap}`);
    }
    expect(frames.get('README.md#1')!.reads).toEqual(['schemas/timetable.schema.json']);
    expect(frames.get('README.md#2')!.reads).toEqual(['README.md']);
  });

  it('Places every error and warning, shipping no showcase frame for an error', async () => {
    const { frames, errors, warnings, shownIssues } = await _build('showcase-jsonschema-errors');
    // Syntax errors at their lines (PLAN-P21 D857): a code block's in its documentation file, a linked file's in it
    const placed = [...errors.values()].flat();
    expect(placed.map(({ path, line }) => `${path}:${line ?? ''}`)).toEqual([
      'README.md:8',
      'README.md:16',
      'schemas/broken.schema.json:5',
      'README.md:25',
      'schemas/big.schema.json:',
    ]);
    expect(
      placed.map(({ message }) => /The schema isn't valid JSON|The schema must be a JSON object|The diagram is too large for Mermaid/.exec(message)?.[0]),
    ).toEqual([
      "The schema isn't valid JSON",
      "The schema isn't valid JSON",
      "The schema isn't valid JSON",
      'The schema must be a JSON object',
      'The diagram is too large for Mermaid',
    ]);
    expect([...errors.keys()]).toEqual(['README.md#1', 'README.md#2', 'README.md#3', 'README.md#4', 'README.md#10']);
    for (const id of errors.keys()) expect(frames.has(id)).toBe(false);
    // Warnings ship their showcase frames, at the entry point with no line
    expect([...frames.keys()]).toEqual(['README.md#5', 'README.md#6', 'README.md#7', 'README.md#8', 'README.md#9']);
    expect(warnings.map(({ path, line }) => `${path}:${line}`)).toEqual([
      'README.md:31',
      'README.md:37',
      'README.md:37',
      'README.md:43',
      'README.md:63',
      'README.md:63',
      'README.md:76',
    ]);
    expect(shownIssues.get('README.md#7')).toEqual([
      {
        severity: 'warning',
        message:
          'References not resolved, shown as "unknown": into other files, not read yet: "other.schema.json#/$defs/Thing", "./README.showcase-1.json"; ' +
          'in this file, not read yet: "#/definitions/Old", "#/$defs/Missing", "#", "#/$defs/A~1B"',
        path: 'README.showcase-7.json',
      },
    ]);
    // Issues of the build itself name no check, so they show on its build status mark (SPEC-S17 D820)
    expect([...shownIssues.values()].flat().every((issue) => issue.check === undefined)).toBe(true);
  });

  it('Builds nothing without trust', async () => {
    // See PLAN-P21 D854, SPEC-S17 D818: although nothing of the host runs to build it
    const { frames, errors, warnings, checks } = await _build('showcase-jsonschema', false);
    expect([frames.size, errors.size, warnings.length]).toEqual([0, 0, 0]);
    expect([...checks.values()].every((names) => names.length === 0)).toBe(true);
  });
});
