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
        stack: 'dotnet',
        project: { path: 'src/App/App.csproj', sourceRoot: 'lib', ignore: ['a'], code: ['*.cs'], documentation: ['docs/*.md'] },
        outDir: 'out',
        customShowcaseAdapters: { mine: './adapters/mine.js' },
        showcaseViews: { ts: 'source', mine: ['markdown', 'demo'], html: 'none' },
        navigation: [{ path: '/' }],
      };
      expect(validateConfiguration(value)).toEqual({ configuration: value, errors: [] });
    });

    it('Accepts a configuration with only a stack', () => {
      expect(validateConfiguration({ stack: 'typescript' })).toEqual({ configuration: { stack: 'typescript' }, errors: [] });
    });

    it('Rejects a value that is not an object', () => {
      for (const value of [null, [], 'typescript', 1]) {
        expect(validateConfiguration(value).errors).toEqual(['showroom.json must contain a JSON object']);
      }
    });

    it('Rejects unknown keys', () => {
      // Catches typos, such as `outdir` for `outDir`
      expect(validateConfiguration({ stack: 'typescript', outdir: 'site' }).errors).toEqual(['showroom.json: unknown key "outdir"']);
      // Removed keys are unknown too: include=markdown replaced exposeShowcaseMarkdownSyntax (D511, D608)
      expect(validateConfiguration({ stack: 'typescript', exposeShowcaseMarkdownSyntax: true }).errors).toEqual([
        'showroom.json: unknown key "exposeShowcaseMarkdownSyntax"',
      ]);
    });

    it('Rejects the keys that moved into project at the top level', () => {
      // Plain unknown keys, with no pointer to their new place (D878)
      expect(validateConfiguration({ stack: 'typescript', sourceRoot: '.', ignore: [], code: [], documentation: [] }).errors).toEqual([
        'showroom.json: unknown key "sourceRoot"',
        'showroom.json: unknown key "ignore"',
        'showroom.json: unknown key "code"',
        'showroom.json: unknown key "documentation"',
      ]);
    });

    it('Rejects values of the wrong type', () => {
      expect(validateConfiguration({ stack: '', outDir: [], project: { name: 'library' } }).errors).toEqual([
        'showroom.json: "stack" must be a non-empty string',
        'showroom.json: "outDir" must be a non-empty string',
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

  describe('validateConfiguration() of the project', () => {
    // `project`: an object only, whose fields override what a stack adapter gives, `null` unsetting one; and, when `stack` names no stack
    // adapter, what it must and can't give (D877–D881, D888, D893).

    it('Accepts every field, each as a value or null, with a stack adapter', () => {
      const project = {
        path: 'package.json',
        name: 'library',
        version: null,
        description: 'A library',
        license: 'MIT',
        author: null,
        homepage: 'https://example.com',
        repository: 'https://example.com/library.git',
        sourceRoot: null,
        ignore: ['vendor/'],
        code: null,
        documentation: [],
      };
      expect(validateConfiguration({ stack: 'typescript', project })).toEqual({ configuration: { stack: 'typescript', project }, errors: [] });
      // A stack adapter needs no name from showroom.json, and unsetting it is check()'s to report (D883)
      expect(validateConfiguration({ stack: 'typescript', project: { name: null } }).errors).toEqual([]);
    });

    it('Accepts the project information without a stack adapter, with and without a stack', () => {
      expect(validateConfiguration({ stack: 'java', project: { name: 'library', version: '1.0.0', ignore: ['target/'], code: ['*.java'] } }).errors).toEqual(
        [],
      );
      expect(validateConfiguration({ project: { name: 'library' } })).toEqual({ configuration: { project: { name: 'library' } }, errors: [] });
      // The default name, given explicitly, is just another name; and null is the same as leaving a field out
      expect(validateConfiguration({ stack: 'custom', project: { name: 'library', version: null, path: null } }).errors).toEqual([]);
    });

    it('Rejects a string, pointing at path', () => {
      expect(validateConfiguration({ stack: 'dotnet', project: 'App/App.csproj' }).errors).toEqual([
        'showroom.json: "project" must be an object; give the project file\'s path as "project": { "path": "App/App.csproj" }',
      ]);
    });

    it('Rejects a value that is not an object', () => {
      for (const project of [[], null, 1]) {
        expect(validateConfiguration({ stack: 'typescript', project }).errors).toEqual(['showroom.json: "project" must be an object']);
      }
    });

    it('Rejects fields of the wrong type', () => {
      const project = { path: '', name: '', version: 1, author: { name: 'Someone' }, sourceRoot: 1, ignore: 'x', code: [1], documentation: {} };
      expect(validateConfiguration({ stack: 'typescript', project }).errors).toEqual([
        'showroom.json: "project": "path" must be a non-empty string or null',
        'showroom.json: "project": "name" must be a non-empty string or null',
        'showroom.json: "project": "version" must be a non-empty string or null',
        'showroom.json: "project": "author" must be a non-empty string or null',
        'showroom.json: "project": "sourceRoot" must be a non-empty string or null',
        'showroom.json: "project": "ignore" must be an array of strings or null',
        'showroom.json: "project": "code" must be an array of strings or null',
        'showroom.json: "project": "documentation" must be an array of strings or null',
      ]);
    });

    it('Rejects unknown keys, pointing top-level keys out', () => {
      // A top-level key written inside the object is the likely mistake
      expect(validateConfiguration({ stack: 'typescript', project: { outDir: 'site', authors: 'Someone' } }).errors).toEqual([
        'showroom.json: "project": unknown key "outDir"; "outDir" is a top-level key of showroom.json',
        'showroom.json: "project": unknown key "authors"',
      ]);
    });

    it('Requires a name without a stack adapter, naming why', () => {
      const leftOut = '"stack" is left out; the stack adapters are: dotnet, typescript';
      const unknown = '"stack" "java" names no stack adapter; they are: dotnet, typescript';
      expect(validateConfiguration({}).errors).toEqual([
        `showroom.json: "project" has no "name", which a host repository without a stack adapter must give (${leftOut})`,
      ]);
      expect(validateConfiguration({ project: { version: '1.0.0' } }).errors).toEqual([
        `showroom.json: "project" has no "name", which a host repository without a stack adapter must give (${leftOut})`,
      ]);
      // A mistyped stack shows here (D877)
      expect(validateConfiguration({ stack: 'java', project: { name: null } }).errors).toEqual([
        `showroom.json: "project" has no "name", which a host repository without a stack adapter must give (${unknown})`,
      ]);
    });

    it('Rejects a path without a stack adapter, naming why', () => {
      expect(validateConfiguration({ stack: 'java', project: { name: 'library', path: 'pom.xml' } }).errors).toEqual([
        'showroom.json: "project": "path" is only read by a stack adapter ("stack" "java" names no stack adapter; they are: dotnet, typescript)',
      ]);
    });

    it("Refuses a built-in stack adapter's name in another case, and only that", () => {
      // Selecting a stack adapter is case-sensitive (D874, D893)
      for (const [stack, name] of [
        ['TypeScript', 'typescript'],
        ['DOTNET', 'dotnet'],
      ]) {
        expect(validateConfiguration({ stack, project: { path: 'x' } }).errors).toEqual([
          `showroom.json: "stack" "${stack}" names no stack adapter, as a stack adapter is selected by its name exactly as written: write "${name}" for it`,
        ]);
      }
    });

    it('Reports only the type error of a project that is no object, or a stack that is no string', () => {
      expect(validateConfiguration({ stack: 'java', project: 'pom.xml' }).errors).toHaveLength(1);
      expect(validateConfiguration({ stack: 1 }).errors).toEqual(['showroom.json: "stack" must be a non-empty string']);
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
        { title: 'Script', path: 'JavaScript:alert(1)' },
        { title: 'Data', path: 'data:text/html,<p>hi</p>' },
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
        'showroom.json: "navigation" item 13: a URL must be "http:", "https:", "mailto:" or protocol-relative ("//")',
        'showroom.json: "navigation" item 14: a URL must be "http:", "https:", "mailto:" or protocol-relative ("//")',
      ]);
    });

    it("Accepts a navigation item's URL of an allowed scheme, in any case, or protocol-relative", () => {
      const navigation = ['HTTPS://example.com', 'http://example.com', 'mailto:a@example.com', '//example.com/a'].map((path) => ({ title: 'URL', path }));
      expect(validateConfiguration({ stack: 'typescript', navigation }).errors).toEqual([]);
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
      expect(errors).toHaveLength(3);
    });
  });
});
