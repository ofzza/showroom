/**
 * Tests of reading and validating the configuration
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readConfiguration, validateConfiguration } from './index.js';

/**
 * Gets the path of a fixture host repository
 * @param name Name of the fixture
 * @returns Path of the fixture's root
 */
function _fixture(name: string): string {
  return fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url));
}

describe('configuration', () => {
  // Tests reading and validating `showroom.json`: validation directly on parsed values, and reading on the fixture host repositories in
  // `test/fixtures/`.

  describe('validateConfiguration()', () => {
    // Every rule the validation enforces, one at a time.

    it('Accepts a configuration with every key', () => {
      const value = {
        stack: 'typescript',
        sourceRoot: 'lib',
        project: 'src/App/App.csproj',
        outDir: 'out',
        ignore: ['a'],
        code: ['*.ts'],
        documentation: ['docs/*.md'],
        customShowcaseAdapters: { mine: './adapters/mine.js' },
        showcaseViews: { ts: 'source', mine: ['markdown', 'demo'], html: 'none' },
        navigation: [{ path: '/' }],
      };
      expect(validateConfiguration(value)).toEqual({ configuration: value, errors: [] });
    });

    it('Accepts a configuration with only a stack', () => {
      expect(validateConfiguration({ stack: 'typescript' })).toEqual({ configuration: { stack: 'typescript' }, errors: [] });
    });

    it('Requires a stack', () => {
      expect(validateConfiguration({}).errors).toEqual(['showroom.json: "stack" is required']);
    });

    it('Rejects a value that is not an object', () => {
      for (const value of [null, [], 'typescript', 1]) {
        expect(validateConfiguration(value).errors).toEqual(['showroom.json must contain a JSON object']);
      }
    });

    it('Rejects unknown keys', () => {
      // Catches typos, such as `ignores` for `ignore`
      expect(validateConfiguration({ stack: 'typescript', ignores: [] }).errors).toEqual(['showroom.json: unknown key "ignores"']);
      // Removed keys are unknown too: include=markdown replaced exposeShowcaseMarkdownSyntax (D511, D608)
      expect(validateConfiguration({ stack: 'typescript', exposeShowcaseMarkdownSyntax: true }).errors).toEqual([
        'showroom.json: unknown key "exposeShowcaseMarkdownSyntax"',
      ]);
    });

    it('Rejects values of the wrong type', () => {
      expect(
        validateConfiguration({
          stack: '',
          sourceRoot: 1,
          project: '',
          outDir: [],
          ignore: 'x',
          code: [1],
          documentation: {},
        }).errors,
      ).toEqual([
        'showroom.json: "stack" must be a non-empty string',
        'showroom.json: "sourceRoot" must be a non-empty string',
        'showroom.json: "project" must be a non-empty string',
        'showroom.json: "outDir" must be a non-empty string',
        'showroom.json: "ignore" must be an array of strings',
        'showroom.json: "code" must be an array of strings',
        'showroom.json: "documentation" must be an array of strings',
      ]);
    });

    it('Rejects custom showcase adapters that are not an object of non-empty strings', () => {
      for (const customShowcaseAdapters of [[], 'x', null, { a: 1 }, { a: '' }]) {
        expect(validateConfiguration({ stack: 'typescript', customShowcaseAdapters }).errors).toEqual([
          'showroom.json: "customShowcaseAdapters" must be an object mapping showcase adapter names to paths (non-empty strings)',
        ]);
      }
    });

    it('Rejects default views that are not a view or an array of views', () => {
      for (const showcaseViews of [[], 'demo', null, { ts: 1 }, { ts: [1] }, { ts: null }]) {
        expect(validateConfiguration({ stack: 'typescript', showcaseViews }).errors).toEqual([
          'showroom.json: "showcaseViews" must be an object mapping showcase adapter names to a view or an array of views',
        ]);
      }
      // Each list is checked as a marker's view key is; whether each showcase adapter exists is check's to say
      expect(
        validateConfiguration({ stack: 'typescript', showcaseViews: { ts: [], html: 'Demo', react: ['demo', 'demo'], x: ['none', 'source'] } }).errors,
      ).toEqual([
        'showroom.json: "showcaseViews" of "ts": no views',
        'showroom.json: "showcaseViews" of "html": unknown view "Demo"; the views are: markdown, source, demo, console, none',
        'showroom.json: "showcaseViews" of "react": repeated view "demo"',
        'showroom.json: "showcaseViews" of "x": the view "none" can\'t be combined with other views',
      ]);
    });
  });

  describe('validateConfiguration() of the navigation', () => {
    // The navigation's items, checked recursively and named by their position; whether their paths lead to documentation files is check's to say.

    it('Accepts pages, URLs, patterns and nested groups', () => {
      const navigation = [
        { path: '/' },
        { title: 'Guide', path: 'docs/guide.md#install' },
        { title: 'npm', path: 'https://www.npmjs.com/package/x' },
        { title: 'Examples', items: [{ path: 'examples/*/README.md' }, { title: 'Deeper', items: [{ path: './docs/deep.md' }] }] },
      ];
      expect(validateConfiguration({ stack: 'typescript', navigation })).toEqual({ configuration: { stack: 'typescript', navigation }, errors: [] });
    });

    it('Rejects a navigation that is not an array', () => {
      expect(validateConfiguration({ stack: 'typescript', navigation: { path: '/' } }).errors).toEqual([
        'showroom.json: "navigation" must be an array of navigation items',
      ]);
    });

    it('Rejects invalid items, named by their position', () => {
      const navigation = [
        'README.md',
        { path: 'a.md', link: true },
        { title: '', path: 'a.md' },
        { title: 'Both', path: 'a.md', items: [{ path: 'b.md' }] },
        { title: 'Empty', items: [] },
        { items: [{ path: 'b.md' }] },
        { title: 'Neither' },
        { path: ' ' },
        { path: 'https://example.com' },
        { title: 'Labelled', path: 'docs/*.md' },
        { path: '!docs/a.md' },
        { title: 'Nested', items: [{ path: 'a.md' }, { title: 'Deeper', items: [{ path: 3 }] }] },
      ];
      expect(validateConfiguration({ stack: 'typescript', navigation }).errors).toEqual([
        'showroom.json: "navigation" item 1: must be an object',
        'showroom.json: "navigation" item 2: unknown key "link"',
        'showroom.json: "navigation" item 3: "title" must be a non-empty string',
        'showroom.json: "navigation" item 4: a page ("path") or a group ("items"), not both',
        'showroom.json: "navigation" item 5: "items" must be a non-empty array of navigation items',
        'showroom.json: "navigation" item 6: a group needs a "title"',
        'showroom.json: "navigation" item 7: needs a "path" (a page) or "items" (a group)',
        'showroom.json: "navigation" item 8: "path" must be a non-empty string',
        'showroom.json: "navigation" item 9: a URL needs a "title"',
        'showroom.json: "navigation" item 10: a pattern takes no "title": each documentation file it matches is labelled by its first heading',
        'showroom.json: "navigation" item 11: "path" can\'t be negated ("!")',
        'showroom.json: "navigation" item 12.2.1: "path" must be a non-empty string',
      ]);
    });
  });

  describe('readConfiguration()', () => {
    // Reading the file from a fixture host repository's root.

    it('Reads a valid configuration', async () => {
      expect(await readConfiguration(_fixture('minimal'))).toEqual({ configuration: { stack: 'typescript' }, errors: [] });
    });

    it('Fails when the file is missing', async () => {
      const { configuration, errors } = await readConfiguration(_fixture('no-configuration'));
      expect(configuration).toBeUndefined();
      expect(errors).toEqual([expect.stringMatching(/^showroom\.json not found in /)]);
    });

    it('Fails when the file is not valid JSON', async () => {
      const { configuration, errors } = await readConfiguration(_fixture('invalid-configuration'));
      expect(configuration).toBeUndefined();
      expect(errors).toEqual([expect.stringMatching(/^showroom\.json is not valid JSON: /)]);
    });

    it('Fails when the file is not a valid configuration', async () => {
      const { configuration, errors } = await readConfiguration(_fixture('wrong-configuration'));
      expect(configuration).toBeUndefined();
      expect(errors).toHaveLength(4);
    });
  });
});
