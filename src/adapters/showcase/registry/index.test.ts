/**
 * Tests of the showcase adapter registry
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HtmlShowcaseAdapter } from '../html/index.js';
import { createShowcaseAdapter, getShowcaseAdapterNames, loadCustomShowcaseAdapters, PLANNED_SHOWCASE_ADAPTER_NAMES } from './index.js';

/**
 * Path of the fixture host repository listing custom showcase adapters
 */
const _ROOT = fileURLToPath(new URL('../../../../test/fixtures/showcase-adapters', import.meta.url));

describe('adapters/showcase/registry', () => {
  // Tests the built-in showcase adapters' registry, and loading custom showcase adapters from the `showcase-adapters` fixture, which lists one per
  // way of getting it wrong.

  it('Lists and creates the built-in showcase adapters', () => {
    expect(getShowcaseAdapterNames()).toEqual(['html']);
    expect(createShowcaseAdapter('html')).toBeInstanceOf(HtmlShowcaseAdapter);
    expect(createShowcaseAdapter('html')).not.toBe(createShowcaseAdapter('html'));
    expect(createShowcaseAdapter('ts')).toBeUndefined();
    expect(createShowcaseAdapter('toString')).toBeUndefined();
  });

  it('Reserves the planned built-in names', () => {
    expect(PLANNED_SHOWCASE_ADAPTER_NAMES).toEqual(['ts', 'react', 'angular']);
  });

  it('Loads custom showcase adapters', async () => {
    const { adapters, errors } = await loadCustomShowcaseAdapters(_ROOT, { good: './adapters/good.js', 'good-mjs': 'adapters/good.mjs' });
    expect(errors).toEqual([]);
    expect([...adapters.keys()]).toEqual(['good', 'good-mjs']);
    expect(await adapters.get('good')!.check!(_ROOT)).toEqual(['good needs nothing, but says so']);
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
      'Custom showcase adapter "no-default": "./adapters/no-default.js" must have a default export: an object implementing the showcase adapter interface',
      'Custom showcase adapter "incomplete": "./adapters/incomplete.js"\'s default export must implement the showcase adapter interface; check "build", "check"',
      'Custom showcase adapter "throws": "./adapters/throws.js" failed to load: broken on purpose',
    ]);
  });
});
