/**
 * Tests of checking a host repository
 */

import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  // variants, duplicates, configured patterns, and every error.

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
      ['no-configuration', /^tsshowcase\.json not found in /, 'tsshowcase.json'],
      ['invalid-configuration', /^tsshowcase\.json is not valid JSON: /, 'tsshowcase.json'],
      ['wrong-configuration', /^tsshowcase\.json: /, 'tsshowcase.json'],
      ['unknown-stack', /^Unknown stack "cobol"; the stack adapters are: typescript$/, 'tsshowcase.json'],
      ['no-project', /^package\.json not found in /, undefined],
      ['no-source-root', /^Source root "lib" is not a directory$/, undefined],
      ['outside-source-root', /^Source root "\.\.\/minimal" is outside the host repository$/, 'tsshowcase.json'],
    ])('Fails on %s', async (name, message, path) => {
      const result = await check(_fixture(name));
      expect(result.passed).toBe(false);
      expect(result.host).toBeUndefined();
      expect(result.issues[0]).toEqual({ severity: 'error', message: expect.stringMatching(message), ...(path ? { path } : {}) });
    });

    it('Reports every configuration error at once', async () => {
      const result = await check(_fixture('wrong-configuration'));
      expect(result.issues.map(({ message }) => message)).toEqual([
        'tsshowcase.json: "sourceRoot" must be a non-empty string',
        'tsshowcase.json: "ignore" must be an array of strings',
        'tsshowcase.json: unknown key "extra"',
        'tsshowcase.json: "stack" is required',
      ]);
    });
  });

  describe('Output folder', () => {
    // The output folder fixture (source root `.`) holds a built showcase application in `showcase/` and another folder, `unmarked/`, each with a README
    // and a JavaScript file; the out-dir fixtures configure an output folder that isn't allowed. The override is passed as `tsshowcase build` passes it.

    it('Never collects anything in the default output folder', async () => {
      const { passed, host } = await check(_fixture('output-folder'));
      expect(passed).toBe(true);
      expect(host?.documentation.map((file) => file.path)).toEqual(['README.md', 'unmarked/README.md']);
      expect(host?.code).toEqual(['src/index.ts', 'unmarked/index.js']);
    });

    it('Never collects anything in an overriding output folder', async () => {
      const { passed, host } = await check(_fixture('output-folder'), { outDir: join(_fixture('output-folder'), 'unmarked') });
      expect(passed).toBe(true);
      expect(host?.documentation.map((file) => file.path)).toEqual(['README.md', 'showcase/README.md']);
      expect(host?.code).toEqual(['showcase/assets/index.js', 'src/index.ts']);
    });

    it("Fails on a configured output folder that is the host repository's root, or outside it", async () => {
      expect(await check(_fixture('out-dir-root'))).toEqual({
        passed: false,
        issues: [{ severity: 'error', message: `Output folder "./" is the host repository's root`, path: 'tsshowcase.json' }],
      });
      expect(await check(_fixture('out-dir-outside'))).toEqual({
        passed: false,
        issues: [{ severity: 'error', message: 'Output folder "../site" is outside the host repository', path: 'tsshowcase.json' }],
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
});
