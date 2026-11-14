/**
 * Tests of the showcase adapter registry
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { copyFixture } from '../../../testing/index.js';
import { HtmlShowcaseAdapter } from '../html/index.js';
import { ReactShowcaseAdapter } from '../react/index.js';
import { TsShowcaseAdapter } from '../ts/index.js';
import { checkHostCheckResult, createShowcaseAdapter, getShowcaseAdapterNames, loadCustomShowcaseAdapters, PLANNED_SHOWCASE_ADAPTER_NAMES } from './index.js';

/**
 * Path of the fixture host repository listing custom showcase adapters
 */
const _ROOT = fileURLToPath(new URL('../../../../test/fixtures/showcase-adapters', import.meta.url));

describe('adapters/showcase/registry', () => {
  // Tests the built-in showcase adapters' registry, and loading custom showcase adapters from the `showcase-adapters` fixture, which lists one per
  // way of getting it wrong. Each module's default export is a factory of showcase adapter objects.

  it('Lists and creates the built-in showcase adapters', () => {
    expect(getShowcaseAdapterNames()).toEqual(['html', 'react', 'ts']);
    expect(createShowcaseAdapter('html')).toBeInstanceOf(HtmlShowcaseAdapter);
    expect(createShowcaseAdapter('html')).not.toBe(createShowcaseAdapter('html'));
    expect(createShowcaseAdapter('ts')).toBeInstanceOf(TsShowcaseAdapter);
    expect(createShowcaseAdapter('react')).toBeInstanceOf(ReactShowcaseAdapter);
    expect(createShowcaseAdapter('angular')).toBeUndefined();
    expect(createShowcaseAdapter('toString')).toBeUndefined();
  });

  it('Reserves the planned built-in names', () => {
    expect(PLANNED_SHOWCASE_ADAPTER_NAMES).toEqual(['angular']);
  });

  it('Loads custom showcase adapters', async () => {
    const { adapters, errors } = await loadCustomShowcaseAdapters(_ROOT, { good: './adapters/good.js', 'good-mjs': 'adapters/good.mjs' });
    expect(errors).toEqual([]);
    expect([...adapters.keys()]).toEqual(['good', 'good-mjs']);
    expect(await adapters.get('good')!.check!(_ROOT, [])).toEqual({ errors: ['good needs nothing, but says so'], warnings: [] });
  });

  it('Creates fresh custom showcase adapter objects on every load', async () => {
    // Each run gets its own objects, so one closed at the end of a run is never used again; the unchanged module itself is only loaded once
    const first = await loadCustomShowcaseAdapters(_ROOT, { good: './adapters/good.js' });
    const second = await loadCustomShowcaseAdapters(_ROOT, { good: './adapters/good.js' });
    expect(first.adapters.get('good')).not.toBe(second.adapters.get('good'));
    expect(first.adapters.get('good')!.build).not.toBe(second.adapters.get('good')!.build);
  });

  it('Loads a custom showcase adapter module again once it changed', async () => {
    // A long-running `serve` picks up an edited custom showcase adapter without a restart; on a scratch copy, as the fixtures are never written to
    const scratch = await copyFixture('showcase-adapters');
    try {
      const listed = { good: './adapters/good.js' };
      const first = await loadCustomShowcaseAdapters(scratch.path, listed);
      expect(await first.adapters.get('good')!.check!(scratch.path, [])).toEqual({ errors: ['good needs nothing, but says so'], warnings: [] });
      await writeFile(
        join(scratch.path, 'adapters', 'good.js'),
        "export default () => ({ validate: (s) => ({ options: s.options, errors: [] }), check: () => ({ errors: ['edited'], warnings: [] }), build: async () => ({ errors: [{ message: 'x' }] }) });\n",
      );
      const second = await loadCustomShowcaseAdapters(scratch.path, listed);
      expect(await second.adapters.get('good')!.check!(scratch.path, [])).toEqual({ errors: ['edited'], warnings: [] });
    } finally {
      await scratch.remove();
    }
  });

  it('Reports every custom showcase adapter that does not load', async () => {
    const { adapters, errors } = await loadCustomShowcaseAdapters(_ROOT, {
      html: './adapters/good.js',
      react: './adapters/good.js',
      Bad_Name: './adapters/good.js',
      outside: '../outside.js',
      root: '.',
      missing: './adapters/missing.js',
      typescript: './adapters/adapter.ts',
      folder: './adapters/folder.js',
      'no-default': './adapters/no-default.js',
      incomplete: './adapters/incomplete.js',
      throws: './adapters/throws.js',
      object: './adapters/object.js',
      'factory-throws': './adapters/factory-throws.js',
      'returns-nothing': './adapters/returns-nothing.js',
    });
    expect(adapters.size).toBe(0);
    expect(errors).toEqual([
      'Custom showcase adapter "html": the name is taken by a built-in showcase adapter',
      'Custom showcase adapter "react": the name is taken by a built-in showcase adapter',
      'Custom showcase adapter "Bad_Name": invalid name: use lower-case letters, digits and "-", starting with a letter',
      'Custom showcase adapter "outside": "../outside.js" is outside the host repository',
      'Custom showcase adapter "root": "." is outside the host repository',
      'Custom showcase adapter "missing": "./adapters/missing.js" not found',
      'Custom showcase adapter "typescript": "./adapters/adapter.ts" must be a .js or .mjs file',
      'Custom showcase adapter "folder": "./adapters/folder.js" not found',
      'Custom showcase adapter "no-default": "./adapters/no-default.js" must have a default export: a function returning an object implementing the showcase adapter interface',
      'Custom showcase adapter "incomplete": "./adapters/incomplete.js"\'s default export must return an object implementing the showcase adapter interface; check "build", "check"',
      'Custom showcase adapter "throws": "./adapters/throws.js" failed to load: broken on purpose',
      'Custom showcase adapter "object": "./adapters/object.js" must have a default export: a function returning an object implementing the showcase adapter interface',
      'Custom showcase adapter "factory-throws": "./adapters/factory-throws.js" failed to create its showcase adapter: factory broke',
      'Custom showcase adapter "returns-nothing": "./adapters/returns-nothing.js"\'s default export must return an object implementing the showcase adapter interface',
    ]);
  });

  it('Checks what a host check returned', () => {
    expect(checkHostCheckResult({ errors: [], warnings: [] })).toEqual({ errors: [], warnings: [] });
    expect(checkHostCheckResult({ errors: ['e'], warnings: ['w'], extra: 1 })).toEqual({ errors: ['e'], warnings: ['w'] });
    const problem = (result: unknown) => (checkHostCheckResult(result) as { problem?: string }).problem;
    // A list is what check() returned before { errors, warnings }: its problem names the change
    expect(problem(['missing'])).toBe(
      'it returned a list; since the host check returns { errors, warnings }, return the list as "errors", with "warnings: []"',
    );
    expect(problem(undefined)).toBe('it must return { errors, warnings }, two lists of strings');
    expect(problem('missing')).toBe('it must return { errors, warnings }, two lists of strings');
    expect(problem({ warnings: [] })).toBe('"errors" must be a list of strings');
    expect(problem({ errors: [1], warnings: [] })).toBe('"errors" must be a list of strings');
    expect(problem({ errors: [] })).toBe('"warnings" must be a list of strings');
    expect(problem({ errors: [], warnings: 'w' })).toBe('"warnings" must be a list of strings');
  });
});
