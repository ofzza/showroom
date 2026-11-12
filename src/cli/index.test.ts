/**
 * Tests of the `showroom` command line
 */

import { describe, it, expect } from 'vitest';
import { join, relative } from 'node:path';
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
  // Tests main() through its arguments, exit code and captured output, running `check` on the fixture host repositories in `test/fixtures/`, and `serve`
  // and `build` only where their first check fails.

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
      expect(stderr).toBe('error: showroom.json: Unknown stack "cobol"; the stack adapters are: typescript\n');
    });

    it('Overrides the output folder with --out-dir, relative to the current directory', async () => {
      const outDir = relative(process.cwd(), join(_fixture('output-folder'), 'unmarked'));
      const { code, stdout } = await _run(['check', '--root', _fixture('output-folder'), '--out-dir', outDir]);
      expect(code).toBe(0);
      expect(JSON.parse(stdout).documentation.map((file: { path: string }) => file.path)).toEqual(['README.md', 'showroom/README.md']);
    });

    it("Fails on an --out-dir that is the host repository's root", async () => {
      const root = _fixture('minimal');
      const { code, stderr } = await _run(['check', '--root', root, '--out-dir', root]);
      expect(code).toBe(1);
      expect(stderr).toBe(`error: Output folder "${root}" is the host repository's root\n`);
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
      const { code, stderr } = await _run(['deploy']);
      expect(code).toBe(1);
      expect(stderr).toBe(`Unknown command: deploy\n\n${USAGE}`);
    });

    it('Fails on an unknown option', async () => {
      const { code, stderr } = await _run(['check', '--out']);
      expect(code).toBe(1);
      expect(stderr).toMatch(/^Unknown option '--out'/);
    });

    it('Lists the serve and build commands, --out-dir and --port in the help', () => {
      expect(USAGE).toMatch(/^ {2}serve {4}/m);
      expect(USAGE).toMatch(/^ {2}build {4}/m);
      expect(USAGE).toMatch(/^ {2}--out-dir <dir> /m);
      expect(USAGE).toMatch(/^ {2}--port <port> /m);
    });

    it('Fails on an invalid port, before serving', async () => {
      for (const port of ['0', '65536', 'abc', '80.5', '-1']) {
        const { code, stdout, stderr } = await _run(['serve', `--port=${port}`]);
        expect(code).toBe(1);
        expect(stdout).toBe('');
        expect(stderr).toBe(`Invalid port: ${port}\n\n${USAGE}`);
      }
    });

    it('Fails on --port with check', async () => {
      const { code, stderr } = await _run(['check', '--port', '8080', '--root', _fixture('minimal')]);
      expect(code).toBe(1);
      expect(stderr).toBe(`--port only applies to serve\n\n${USAGE}`);
    });

    it('Fails on --port with build, before building', async () => {
      const { code, stderr } = await _run(['build', '--port', '8080', '--root', _fixture('minimal')]);
      expect(code).toBe(1);
      expect(stderr).toBe(`--port only applies to serve\n\n${USAGE}`);
    });
  });

  describe('serve', () => {
    // Only how main() hands over to serve: its unit tests never start the dev server (see AGENTS.md › Testing), so this runs serve where its first check
    // fails, before it starts anything.

    it('Exits with 1, writing the issues to stderr, when the first check fails', async () => {
      const { code, stdout, stderr } = await _run(['serve', '--root', _fixture('unknown-stack'), '--port', '8080']);
      expect(code).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toBe('error: showroom.json: Unknown stack "cobol"; the stack adapters are: typescript\n');
    });

    it('Passes --out-dir on to serve', async () => {
      const root = _fixture('minimal');
      const { code, stderr } = await _run(['serve', '--root', root, '--out-dir', root, '--port', '8080']);
      expect(code).toBe(1);
      expect(stderr).toBe(`error: Output folder "${root}" is the host repository's root\n`);
    });
  });

  describe('build', () => {
    // Only how main() hands over to build: its unit tests never run Vite (see AGENTS.md › Testing), so this runs build where its check fails, before it
    // writes anything.

    it('Exits with 1, writing the issues to stderr, when the check fails', async () => {
      const { code, stdout, stderr } = await _run(['build', '--root', _fixture('unknown-stack')]);
      expect(code).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toBe('error: showroom.json: Unknown stack "cobol"; the stack adapters are: typescript\n');
    });

    it('Passes --out-dir on to build', async () => {
      const root = _fixture('minimal');
      const { code, stderr } = await _run(['build', '--root', root, '--out-dir', root]);
      expect(code).toBe(1);
      expect(stderr).toBe(`error: Output folder "${root}" is the host repository's root\n`);
    });
  });
});
