/**
 * Tests of checking a host repository
 */

import { describe, it, expect } from 'vitest';
import { symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINKED_FILE_MODAL_LIMIT } from '../../linked-files/index.js';
import { copyFixture, createScratchFolder } from '../../testing/index.js';
import { BUILT_IN_DOCUMENTATION, check } from './index.js';

/**
 * Gets the path of a fixture host repository
 * @param name Name of the fixture
 * @returns Path of the fixture's root
 */
function _fixture(name: string): string {
  return fileURLToPath(new URL(`../../../test/fixtures/${name}`, import.meta.url));
}

describe('cli/check', () => {
  // Tests check() end to end on the fixture host repositories in `test/fixtures/`, each built to exercise one area: the defaults, file name
  // variants, duplicates, configured patterns, every error, the output folder, showcases and links.

  it('Starts the documentation patterns with README anywhere and the rest in the root only', () => {
    expect(BUILT_IN_DOCUMENTATION).toContain('README.md');
    expect(BUILT_IN_DOCUMENTATION).toContain('/LICENCE.txt');
    expect(BUILT_IN_DOCUMENTATION).toContain('/CONTRIBUTING');
    expect(BUILT_IN_DOCUMENTATION).not.toContain('LICENSE');
  });

  describe('Defaults', () => {
    // The minimal fixture, configured with nothing but the stack.

    it('Passes with the full host information and no issues', async () => {
      const result = await check(_fixture('minimal'));
      expect(result.passed).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.host?.project.name).toBe('minimal-host');
    });

    it('Collects the root documentation and README files anywhere, sorted', async () => {
      const { host } = await check(_fixture('minimal'));
      expect(host?.documentation).toEqual([
        { path: 'CONTRIBUTING.md', kind: 'contribute', extension: '.md', content: '# Contributing\n' },
        { path: 'LICENSE', kind: 'license', extension: '', content: 'MIT License\n' },
        { path: 'README.md', kind: 'readme', extension: '.md', content: '# Minimal host\n' },
        { path: 'src/module/README.md', kind: 'readme', extension: '.md', content: '# Module\n' },
        { path: 'vendor/README.md', kind: 'readme', extension: '.md', content: '# Vendor\n' },
      ]);
    });

    it('Finds no showcases or virtual files where the documentation embeds none', async () => {
      const { host } = await check(_fixture('minimal'));
      expect(host?.showcases).toEqual([]);
      expect(host?.virtualFiles).toEqual([]);
    });

    it('Indexes only code files under the source root', async () => {
      // vendor/vendor.js is code, but outside the source root; styles.css is under it, but not code
      const { host } = await check(_fixture('minimal'));
      expect(host?.code).toEqual(['src/index.test.ts', 'src/index.ts', 'src/module/index.tsx']);
    });
  });

  describe('File names', () => {
    // The names fixture: built-in documentation names in other cases, spellings and extensions.

    it('Matches names regardless of case, spelling and extension', async () => {
      const { host } = await check(_fixture('names'));
      expect(host?.documentation.map(({ path, kind, extension }) => ({ path, kind, extension }))).toEqual([
        { path: 'Licence.txt', kind: 'license', extension: '.txt' },
        { path: 'contribute', kind: 'contribute', extension: '' },
        { path: 'readme.MD', kind: 'readme', extension: '.MD' },
        { path: 'src/sub/ReadMe.txt', kind: 'readme', extension: '.txt' },
      ]);
    });
  });

  describe('Duplicates', () => {
    // The duplicates fixture: README.md, README and README.txt, and LICENCE and LICENSE.txt, side by side in the root.

    it('Keeps one file of each kind, by extension priority', async () => {
      const { host } = await check(_fixture('duplicates'));
      expect(host?.documentation.map(({ path }) => path)).toEqual(['LICENCE', 'README.md']);
    });

    it('Warns about each folder with duplicates, without failing', async () => {
      // Warnings come in path order of the files kept
      const result = await check(_fixture('duplicates'));
      expect(result.passed).toBe(true);
      expect(result.issues).toEqual([
        { severity: 'warning', message: 'Several license files in the root (LICENCE, LICENSE.txt); using LICENCE', path: 'LICENCE' },
        {
          severity: 'warning',
          message: 'Several readme files in the root (README.md, README, README.txt); using README.md',
          path: 'README.md',
        },
      ]);
    });
  });

  describe('Patterns', () => {
    // The patterns fixture: a configuration extending each of the stack adapter's pattern lists, re-including with `!`, and a custom source root.

    it('Ignores files, and re-includes them with !', async () => {
      const { host } = await check(_fixture('patterns'));
      const paths = host?.documentation.map(({ path }) => path);
      expect(paths).toContain('vendor/keep/README.md');
      expect(paths).not.toContain('vendor/drop/README.md');
    });

    it('Adds and removes code files under the configured source root', async () => {
      const { host } = await check(_fixture('patterns'));
      expect(host?.code).toEqual(['lib/component.vue', 'lib/index.ts', 'lib/internal/index.ts']);
    });

    it('Adds documentation files of kind other, and removes built-in ones', async () => {
      const { host } = await check(_fixture('patterns'));
      expect(host?.documentation.map(({ path, kind }) => ({ path, kind }))).toEqual([
        { path: 'README.md', kind: 'readme' },
        { path: 'docs/guide.md', kind: 'other' },
        { path: 'vendor/keep/README.md', kind: 'readme' },
      ]);
    });
  });

  describe('Errors', () => {
    // A fixture per error: each fails the check, reports the error, and gives no host information.

    it.each([
      ['no-configuration', /^showroom\.json not found in /, 'showroom.json'],
      ['invalid-configuration', /^showroom\.json is not valid JSON: /, 'showroom.json'],
      ['wrong-configuration', /^showroom\.json: /, 'showroom.json'],
      ['unknown-stack', /^Unknown stack "cobol"; the stack adapters are: typescript$/, 'showroom.json'],
      ['no-project', /^package\.json not found in /, undefined],
      ['no-source-root', /^Source root "lib" is not a directory$/, undefined],
      ['outside-source-root', /^Source root "\.\.\/minimal" is outside the host repository$/, 'showroom.json'],
    ])('Fails on %s', async (name, message, path) => {
      const result = await check(_fixture(name));
      expect(result.passed).toBe(false);
      expect(result.host).toBeUndefined();
      expect(result.issues[0]).toEqual({ severity: 'error', message: expect.stringMatching(message), ...(path ? { path } : {}) });
    });

    it('Reports every configuration error at once', async () => {
      const result = await check(_fixture('wrong-configuration'));
      expect(result.issues.map(({ message }) => message)).toEqual([
        'showroom.json: "sourceRoot" must be a non-empty string',
        'showroom.json: "ignore" must be an array of strings',
        'showroom.json: unknown key "extra"',
        'showroom.json: "stack" is required',
      ]);
    });
  });

  describe('Output folder', () => {
    // The output folder fixture (source root `.`) holds a built showroom in `showroom/` and another folder, `unmarked/`, each with a README
    // and a JavaScript file; the out-dir fixtures configure an output folder that isn't allowed. The override is passed as `showroom build` passes it.

    it('Never collects anything in the default output folder', async () => {
      const { passed, host } = await check(_fixture('output-folder'));
      expect(passed).toBe(true);
      expect(host?.documentation.map((file) => file.path)).toEqual(['README.md', 'unmarked/README.md']);
      expect(host?.code).toEqual(['src/index.ts', 'unmarked/index.js']);
    });

    it('Never collects anything in an overriding output folder', async () => {
      const { passed, host } = await check(_fixture('output-folder'), { outDir: join(_fixture('output-folder'), 'unmarked') });
      expect(passed).toBe(true);
      expect(host?.documentation.map((file) => file.path)).toEqual(['README.md', 'showroom/README.md']);
      expect(host?.code).toEqual(['showroom/assets/index.js', 'src/index.ts']);
    });

    it("Fails on a configured output folder that is the host repository's root, or outside it", async () => {
      expect(await check(_fixture('out-dir-root'))).toEqual({
        passed: false,
        issues: [{ severity: 'error', message: `Output folder "./" is the host repository's root`, path: 'showroom.json' }],
      });
      expect(await check(_fixture('out-dir-outside'))).toEqual({
        passed: false,
        issues: [{ severity: 'error', message: 'Output folder "../site" is outside the host repository', path: 'showroom.json' }],
      });
    });

    it("Fails on an overriding output folder that is the host repository's root, or outside it, without blaming the configuration", async () => {
      const root = _fixture('minimal');
      expect((await check(root, { outDir: root })).issues).toEqual([{ severity: 'error', message: `Output folder "${root}" is the host repository's root` }]);
      expect((await check(root, { outDir: dirname(root) })).issues).toEqual([
        { severity: 'error', message: `Output folder "${dirname(root)}" is outside the host repository` },
      ]);
    });

    it('Accepts an overriding output folder that fixes a configured one', async () => {
      expect((await check(_fixture('out-dir-outside'), { outDir: join(_fixture('out-dir-outside'), 'site') })).passed).toBe(true);
    });
  });

  describe('Showcases', () => {
    // The showcases fixture embeds code block, linked and custom showcases, and resources, in Markdown documentation files, and passes; the
    // showcase-errors fixture holds one documentation file per kind of broken showcase, the showcase-adapters fixture lists one custom showcase
    // adapter per way of getting it wrong, and the showcase-ts-invalid fixture holds ts showcases the ts showcase adapter rejects.

    it('Reports ts showcases in other languages, or with invalid options, and accepts every language of the ts showcase adapter', async () => {
      // The showcase-ts-invalid fixture: tsx, html, jsx and cjs entry points, invalid options, then one valid showcase per accepted language
      const { passed, issues } = await check(_fixture('showcase-ts-invalid'));
      expect(passed).toBe(false);
      expect(issues.map(({ path, line, message }) => `${path}:${line}: ${message}`)).toEqual([
        'README.md:3: The ts showcase adapter needs a "ts", "js", "mts" or "mjs" code block; for tsx and jsx, use the react showcase adapter',
        'README.md:7: The ts showcase adapter needs a "ts", "js", "mts" or "mjs" code block',
        'README.md:11: The ts showcase adapter needs a link to a .ts, .mts, .js or .mjs file, not "demos/app.jsx"; for tsx and jsx, use the react showcase adapter',
        'README.md:11: The ts showcase adapter needs a link to a .ts, .mts, .js or .mjs file, not "demos/common.cjs"',
        'README.md:13: The ts showcase adapter\'s option "typeCheck" must be true or false',
        'README.md:13: Unknown option "size" of the ts showcase adapter; its options are "typeCheck" and "allowJs"',
      ]);
    });

    it('Collects the showcases, with the options their showcase adapters validated', async () => {
      const { passed, issues, host } = await check(_fixture('showcases'));
      expect(passed).toBe(true);
      expect(issues).toEqual([]);
      expect(host?.showcases.map(({ id, line, kind, adapter, options, entry }) => ({ id, line, kind, adapter, options, entry }))).toEqual([
        { id: 'README.md#1', line: 3, kind: 'code-block', adapter: 'html', options: undefined, entry: 'README.showcase-1.html' },
        { id: 'README.md#2', line: 11, kind: 'link', adapter: 'html', options: undefined, entry: 'demos/demo.html' },
        { id: 'README.md#3', line: 11, kind: 'link', adapter: 'demo', options: { size: 2 }, entry: 'demos/widget.js' },
        { id: 'docs/guide.md#1', line: 3, kind: 'code-block', adapter: 'html', options: undefined, entry: 'docs/guide.showcase-1.html' },
        { id: 'docs/guide.md#2', line: 7, kind: 'code-block', adapter: 'demo', options: { size: 1 }, entry: 'docs/guide.showcase-2.js' },
      ]);
      // An adapter's validation may drop options the marker gave, but html takes none, so they are never set
      expect(host?.showcases.filter((showcase) => 'options' in showcase).map((showcase) => showcase.id)).toEqual(['README.md#3', 'docs/guide.md#2']);
    });

    it('Collects the virtual files, and parses Markdown documentation files only', async () => {
      // docs/notes.txt holds a broken marker, ignored as the file is plain text
      const { host } = await check(_fixture('showcases'));
      expect(host?.virtualFiles).toEqual([
        { path: 'README.showcase-1.html', kind: 'entry', content: '<p class="hello">Hello</p>', documentation: 'README.md', line: 3 },
        { path: 'styles.css', kind: 'resource', content: '.hello { color: red; }', documentation: 'README.md', line: 7 },
        {
          path: 'docs/guide.showcase-1.html',
          kind: 'entry',
          content: '<link rel="stylesheet" href="../styles.css" />',
          documentation: 'docs/guide.md',
          line: 3,
        },
        { path: 'docs/guide.showcase-2.js', kind: 'entry', content: "console.log('Hi');", documentation: 'docs/guide.md', line: 7 },
      ]);
    });

    it('Reports every broken showcase, with its documentation file and line', async () => {
      const result = await check(_fixture('showcase-errors'));
      expect(result.passed).toBe(false);
      expect(result.host).toBeUndefined();
      expect(result.issues.map(({ path, line, message }) => `${path}:${line}: ${message}`)).toEqual([
        // The markers, as the documentation files are scanned
        `errors/entries.md:9: A linked showcase's entry point must be a relative path, not "https://example.com/a.html"`,
        `errors/entries.md:11: A linked showcase's entry point "../../a.html" is outside the host repository`,
        `errors/entries.md:13: A linked showcase's entry point can't have a query or fragment: "./linked.html?a"`,
        'errors/markers.md:3: The showcase marker must follow the code block\'s language ("```<language> showcase=html")',
        'errors/markers.md:6: Invalid showcase adapter name "Html" in showcase marker "showcase=Html": use lower-case letters, digits and "-", starting with a letter',
        `errors/markers.md:9: A showcase's entry point can't have a "file" key; a resource's marker is "showcase file=<name>"`,
        'errors/markers.md:12: Invalid resource name "a/b.css": use a plain file name, with no "/" or "\\"',
        'errors/markers.md:15: Invalid showcase options (JSON5: invalid end of input at 1:6) in showcase marker "showcase=needy({ a: )"',
        'errors/markers.md:18: The key "anchor" is reserved for later, in showcase marker "showcase anchor=here"',
        "errors/markers.md:21: Only inline links can be showcases; an image can't hold a showcase marker",
        "errors/markers.md:23: Only inline links can be showcases; a reference definition can't hold a showcase marker",
        'errors/markers.md:25: Unknown key "of" in showcase marker "showcase of buttons"',
        // The virtual files' names, across documentation files, on disk, and against generated names
        'errors/collisions.md:6: Virtual file "errors/shared.css" collides with the virtual file at errors/collisions-more.md:3',
        'errors/collisions.md:9: Virtual file "errors/Existing.TXT" collides with "errors/existing.txt" on disk',
        'errors/collisions.md:15: Virtual file "errors/collisions.showcase-1.html" collides with the virtual file at errors/collisions.md:12',
        // The custom showcase adapters
        'showroom.json:undefined: Custom showcase adapter "broken": "./adapters/missing.js" not found',
        // The showcases: unknown adapters, linked entry points, validation
        'errors/adapters.md:3: Unknown showcase adapter "nope"; the showcase adapters are: html, needy, react, throwing, ts',
        'errors/adapters.md:12: needy takes no options',
        'errors/adapters.md:15: Showcase adapter "throwing" failed to validate the showcase: validate broke',
        `errors/entries.md:3: A linked showcase's entry point "errors/missing.html" not found`,
        `errors/entries.md:5: A linked showcase's entry point "errors/folder" is a folder`,
        'errors/entries.md:5: The html showcase adapter needs a link to an .html or .htm file, not "errors/folder"',
        `errors/entries.md:7: A linked showcase's entry point "errors/linked-virtual.html" is a virtual file; use a code block showcase instead`,
        'errors/html.md:3: The html showcase adapter needs an "html" or "htm" code block',
        'errors/html.md:6: The html showcase adapter needs a link to an .html or .htm file, not "adapters/needy.js"',
        'errors/html.md:8: The html showcase adapter takes no options',
        // The host requirements of the showcase adapters in use, and closing them
        // (needy's host check is given only the showcase whose validation passed)
        'undefined:undefined: Showcase adapter "needy": needs "left-pad" installed',
        'undefined:undefined: Showcase adapter "needy": checked errors/adapters.md#3',
        'undefined:undefined: Showcase adapter "throwing" failed to check the host repository: check broke',
        'undefined:undefined: Showcase adapter "throwing" failed to close: close broke',
      ]);
      expect(result.issues.filter((issue) => issue.severity === 'warning').map(({ message }) => message)).toEqual([
        'Showcase adapter "needy": checked errors/adapters.md#3',
      ]);
    });

    it('Loads every custom showcase adapter, used or not, reporting those that fail', async () => {
      const result = await check(_fixture('showcase-adapters'));
      expect(result.passed).toBe(false);
      expect(result.issues.map(({ path, message }) => `${path}: ${message}`)).toEqual([
        'showroom.json: Custom showcase adapter "html": the name is taken by a built-in showcase adapter',
        'showroom.json: Custom showcase adapter "react": the name is taken by a built-in showcase adapter',
        'showroom.json: Custom showcase adapter "Bad_Name": invalid name: use lower-case letters, digits and "-", starting with a letter',
        'showroom.json: Custom showcase adapter "outside": "../outside.js" is outside the host repository',
        'showroom.json: Custom showcase adapter "missing": "./adapters/missing.js" not found',
        'showroom.json: Custom showcase adapter "typescript": "./adapters/adapter.ts" must be a .js or .mjs file',
        'showroom.json: Custom showcase adapter "folder": "./adapters" must be a .js or .mjs file',
        'showroom.json: Custom showcase adapter "no-default": "./adapters/no-default.js" must have a default export: a function returning an object implementing the showcase adapter interface',
        'showroom.json: Custom showcase adapter "incomplete": "./adapters/incomplete.js"\'s default export must return an object implementing the showcase adapter interface; check "build", "check"',
        'showroom.json: Custom showcase adapter "throws": "./adapters/throws.js" failed to load: broken on purpose',
      ]);
    });
  });

  describe('Links', () => {
    // The links fixture: working and broken links, in Markdown documentation files and a plain text one, with an ignored folder.

    it('Warns about every broken relative link, without failing', async () => {
      // Absolute URLs, fragments, linked showcases, ignored files and plain text documentation files are not warned about; images are
      const result = await check(_fixture('links'));
      expect(result.passed).toBe(true);
      expect(result.issues).toEqual([
        { severity: 'warning', message: 'Broken link "docs/missing.md": nothing at "docs/missing.md"', path: 'README.md', line: 7 },
        { severity: 'warning', message: 'Broken link "../outside.md": it leads outside the host repository', path: 'README.md', line: 7 },
        { severity: 'warning', message: `Broken link "%E0%A4%A.md": it can't be URL-decoded`, path: 'README.md', line: 7 },
        { severity: 'warning', message: 'Broken image "./missing.png": nothing at "missing.png"', path: 'README.md', line: 9 },
        { severity: 'warning', message: 'Broken link "./docs/missing-reference.md": nothing at "docs/missing-reference.md"', path: 'README.md', line: 12 },
        { severity: 'warning', message: 'Broken link "./sub/nowhere.md": nothing at "docs/sub/nowhere.md"', path: 'docs/guide.md', line: 3 },
      ]);
    });
  });

  describe('Linked files', () => {
    // The linked-files fixture: text, code, extensionless, binary (linked and shown as an image) and ignored files, a linked showcase's entry point,
    // and links that name no linked file (a documentation file, folders, a missing file, the output folder, an absolute URL); scratch copies of it
    // for a symbolic link leading outside the host repository, and a text file over the modal's limit.

    it('Collects the linked files, once each, ignored or not, sorted by path', async () => {
      const result = await check(_fixture('linked-files'));
      expect(result.passed).toBe(true);
      expect(result.host?.linkedFiles).toEqual([
        { path: 'Makefile', size: 19, text: true },
        { path: 'assets/logo.png', size: 70, text: false },
        { path: 'demo/demo.html', size: 12, text: true },
        { path: 'notes.txt', size: 22, text: true },
        { path: 'src/index.ts', size: 75, text: true },
        { path: 'vendor/data.json', size: 22, text: true },
      ]);
    });

    it('Warns about a link into the output folder, and leaves it out', async () => {
      const result = await check(_fixture('linked-files'));
      expect(result.issues).toEqual([
        { severity: 'warning', message: 'Broken link "missing.txt": nothing at "missing.txt"', path: 'README.md', line: 9 },
        {
          severity: 'warning',
          message: 'Linked file "out/stale.txt" is in the output folder, which `showroom build` empties; it isn\'t copied into the showroom',
          path: 'README.md',
          line: 9,
        },
      ]);
    });

    it('Warns about a linked file whose real path is outside the host repository, and leaves it out', async () => {
      const host = await copyFixture('linked-files');
      const outside = await createScratchFolder('outside-');
      try {
        await writeFile(join(outside.path, 'secret.txt'), 'Outside\n');
        await symlink(join(outside.path, 'secret.txt'), join(host.path, 'outside.txt'));
        await writeFile(join(host.path, 'docs', 'README.md'), '# Guide\n\n[outside](../outside.txt)\n');
        const result = await check(host.path);
        expect(result.host?.linkedFiles.map(({ path }) => path)).not.toContain('outside.txt');
        expect(result.issues).toContainEqual({
          severity: 'warning',
          message: 'Linked file "outside.txt" is outside the host repository (through a symbolic link); it isn\'t copied into the showroom',
          path: 'docs/README.md',
          line: 3,
        });
      } finally {
        await host.remove();
        await outside.remove();
      }
    });

    it("Marks a text file over the modal's limit as not text", async () => {
      const host = await copyFixture('linked-files');
      try {
        await writeFile(join(host.path, 'notes.txt'), 'a'.repeat(LINKED_FILE_MODAL_LIMIT + 1));
        await writeFile(join(host.path, 'src', 'index.ts'), 'a'.repeat(LINKED_FILE_MODAL_LIMIT));
        const linkedFiles = (await check(host.path)).host?.linkedFiles;
        expect(linkedFiles).toContainEqual({ path: 'notes.txt', size: LINKED_FILE_MODAL_LIMIT + 1, text: false });
        expect(linkedFiles).toContainEqual({ path: 'src/index.ts', size: LINKED_FILE_MODAL_LIMIT, text: true });
      } finally {
        await host.remove();
      }
    });
  });
});
