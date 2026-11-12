/**
 * End-to-end tests of the command line: `showroom check`, with and without `--showcases` (and `--quiet`), on copies of the fixture host repositories
 */

import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyFixture, type ScratchFolder } from '../testing/index.js';
import { main } from './index.js';

/**
 * Runs the command line, capturing its output
 * @param args Command line arguments
 * @returns Exit code, and everything written to stdout and stderr
 */
async function _run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const code = await main(args, { stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) });
  return { code, stdout, stderr };
}

describe('cli (end to end)', () => {
  // Runs main() in-process on copies of the fixture host repositories, each in a scratch folder of its own removed after the test, asserting on the
  // exit code and the captured output as a user would see them. The copies can be changed, which the fixtures never are.

  const copies: ScratchFolder[] = [];

  /**
   * Copies a fixture into a scratch folder, removed after the test
   * @param name Name of the fixture
   * @returns Path of the copy's root
   */
  async function copy(name: string): Promise<string> {
    const scratch = await copyFixture(name);
    copies.push(scratch);
    return scratch.path;
  }

  afterEach(async () => {
    await Promise.all(copies.splice(0).map((scratch) => scratch.remove()));
  });

  describe('check', () => {
    // `showroom check` on the showcase and link fixtures: the showcases in the host information on stdout, and each issue on stderr with its
    // documentation file and line.

    it('Writes the showcases and virtual files with the host information', async () => {
      const root = await copy('showcases');
      const { code, stdout, stderr } = await _run(['check', '--root', root]);
      expect(stderr).toBe('');
      expect(code).toBe(0);
      const host = JSON.parse(stdout);
      expect(host.showcases.map((showcase: { id: string }) => showcase.id)).toEqual([
        'README.md#1',
        'README.md#2',
        'README.md#3',
        'docs/guide.md#1',
        'docs/guide.md#2',
      ]);
      expect(host.virtualFiles.map((file: { path: string }) => file.path)).toEqual([
        'README.showcase-1.html',
        'styles.css',
        'docs/guide.showcase-1.html',
        'docs/guide.showcase-2.js',
      ]);
    });

    it('Fails on a showcase broken in the copy, naming its documentation file and line', async () => {
      const root = await copy('showcases');
      await rm(join(root, 'demos', 'demo.html'));
      const readme = await readFile(join(root, 'README.md'), 'utf8');
      await writeFile(join(root, 'README.md'), readme.replace('```html showcase', '```html showcase=nope'));
      const { code, stdout, stderr } = await _run(['check', '--root', root]);
      expect(code).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toBe(
        [
          'error: README.md:3: Unknown showcase adapter "nope"; the showcase adapters are: demo, html',
          `error: README.md:11: A linked showcase's entry point "demos/demo.html" not found`,
          '',
        ].join('\n'),
      );
    });

    it('Reports every broken showcase on stderr', async () => {
      const root = await copy('showcase-errors');
      const { code, stdout, stderr } = await _run(['check', '--root', root]);
      expect(code).toBe(1);
      expect(stdout).toBe('');
      const lines = stderr.trimEnd().split('\n');
      expect(lines).toHaveLength(29);
      expect(lines).toContain(
        'error: errors/markers.md:6: Invalid showcase adapter name "Html" in showcase marker "showcase=Html": use lower-case letters, digits and "-", starting with a letter',
      );
      expect(lines).toContain('error: showroom.json: Custom showcase adapter "broken": "./adapters/missing.js" not found');
      expect(lines).toContain('error: Showcase adapter "needy": needs "left-pad" installed');
    });

    it('Warns about broken links on stderr, and passes', async () => {
      const root = await copy('links');
      const { code, stdout, stderr } = await _run(['check', '--root', root]);
      expect(code).toBe(0);
      expect(JSON.parse(stdout).project.name).toBe('links-host');
      expect(stderr).toBe(
        [
          'warning: README.md:7: Broken link "docs/missing.md": nothing at "docs/missing.md"',
          'warning: README.md:7: Broken link "../outside.md": it leads outside the host repository',
          `warning: README.md:7: Broken link "%E0%A4%A.md": it can't be URL-decoded`,
          'warning: README.md:12: Broken link "./docs/missing-reference.md": nothing at "docs/missing-reference.md"',
          'warning: docs/guide.md:3: Broken link "./sub/nowhere.md": nothing at "docs/sub/nowhere.md"',
          '',
        ].join('\n'),
      );
    });

    it('Stops warning about a link once its target exists', async () => {
      const root = await copy('links');
      await writeFile(join(root, 'docs', 'missing.md'), '# Not missing any more\n');
      const { stderr } = await _run(['check', '--root', root]);
      expect(stderr).not.toContain('docs/missing.md');
    });
  });

  describe('check --showcases', () => {
    // `showroom check --showcases` builds every showcase once the static check passes, failing on a showcase that doesn't build.

    it('Writes the host information when every showcase builds', async () => {
      const root = await copy('showcase-frames');
      const { code, stdout, stderr } = await _run(['check', '--showcases', '--root', root]);
      expect(stderr).toBe('');
      expect(code).toBe(0);
      expect(JSON.parse(stdout).showcases).toHaveLength(4);
    });

    it('Writes nothing to stdout with --quiet, as npm run ci runs it on this repository', async () => {
      const root = await copy('showcase-frames');
      const { code, stdout, stderr } = await _run(['check', '--showcases', '--quiet', '--root', root]);
      expect(code).toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toBe('');
    });

    it('Reports every build error on stderr, and fails', async () => {
      const root = await copy('showcase-build-errors');
      const { code, stdout, stderr } = await _run(['check', '--showcases', '--root', root]);
      expect(code).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toBe(
        [
          'error: README.md:7: Showcase README.md#1 (README.md:5): Unexpected token',
          'error: README.md:5: Showcase README.md#1 (README.md:5): Something went wrong',
          'error: README.md:5: Showcase README.md#1 (README.md:5): Not here',
          'error: src/widget.js:2: Showcase README.md#1 (README.md:5): Widget broke',
          'error: README.md:12: Showcase README.md#2 (README.md:12): Showcase adapter "throwing" failed to build the showcase: build broke',
          'error: README.md:18: Showcase README.md#3 (README.md:18): Showcase adapter "invalid" returned an invalid build result: the page "missing.html" is not among the files',
          '',
        ].join('\n'),
      );
    });
  });
});
