/**
 * Tests of the `tsshowcase` command line
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { main, USAGE } from './index.js';

/**
 * Gets the path of a fixture host repository
 * @param name Name of the fixture
 * @returns Path of the fixture's root
 */
function _fixture(name: string): string {
  return fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url));
}

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

describe('cli', () => {
  // Tests main() through its arguments, exit code and captured output, running `check` on the fixture host repositories in `test/fixtures/`.

  describe('check', () => {
    // Where each part of a check's outcome goes: host information to stdout, issues to stderr, pass or fail to the exit code.

    it('Writes the host information to stdout and exits with 0 when the check passes', async () => {
      const { code, stdout, stderr } = await _run(['check', '--root', _fixture('minimal')]);
      expect(code).toBe(0);
      expect(stderr).toBe('');
      expect(JSON.parse(stdout).project.name).toBe('minimal-host');
      expect(stdout).toMatch(/^\{\n {2}"project"/);
    });

    it('Writes warnings to stderr without failing', async () => {
      const { code, stdout, stderr } = await _run(['check', '--root', _fixture('duplicates')]);
      expect(code).toBe(0);
      expect(JSON.parse(stdout).project.name).toBe('duplicates-host');
      expect(stderr).toBe(
        'warning: LICENCE: Several license files in the root (LICENCE, LICENSE.txt); using LICENCE\n' +
          'warning: README.md: Several readme files in the root (README.md, README, README.txt); using README.md\n',
      );
    });

    it('Writes errors to stderr, nothing to stdout, and exits with 1 when the check fails', async () => {
      const { code, stdout, stderr } = await _run(['check', '--root', _fixture('unknown-stack')]);
      expect(code).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toBe('error: tsshowcase.json: Unknown stack "cobol"; the stack adapters are: typescript\n');
    });
  });

  describe('Arguments', () => {
    // Help, and every way the arguments can be wrong.

    it('Shows the help with --help', async () => {
      expect(await _run(['--help'])).toEqual({ code: 0, stdout: USAGE, stderr: '' });
    });

    it('Fails without a command', async () => {
      const { code, stderr } = await _run([]);
      expect(code).toBe(1);
      expect(stderr).toBe(`No command given\n\n${USAGE}`);
    });

    it('Fails on an unknown command', async () => {
      const { code, stderr } = await _run(['build']);
      expect(code).toBe(1);
      expect(stderr).toBe(`Unknown command: build\n\n${USAGE}`);
    });

    it('Fails on an unknown option', async () => {
      const { code, stderr } = await _run(['check', '--out']);
      expect(code).toBe(1);
      expect(stderr).toMatch(/^Unknown option '--out'/);
    });
  });
});
