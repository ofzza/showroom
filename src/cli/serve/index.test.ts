/**
 * Tests of `showroom serve`
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import ignore from 'ignore';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CheckResult } from '../check/index.js';
import type { HostInformation } from '../../host/index.js';
import { createHostWatcher, createIgnored, serve, type HostWatcherOptions } from './index.js';

/**
 * Gets the path of a fixture host repository
 * @param name Name of the fixture
 * @returns Path of the fixture's root
 */
function _fixture(name: string): string {
  return fileURLToPath(new URL(`../../../test/fixtures/${name}`, import.meta.url));
}

/**
 * Creates host information with one README
 * @param content Content of the README
 * @param code Code file index
 * @returns The host information
 */
function _host(content: string, code: string[] = []): HostInformation {
  return { project: { name: 'p' }, documentation: [{ path: 'README.md', kind: 'readme', extension: '.md', content }], code, showcases: [], virtualFiles: [] };
}

/**
 * Creates a host watcher with fakes, recording what it does
 * @param results Results the fake check returns, one per call (the last one repeated)
 * @param options Options to override
 * @returns The watcher, the number of reloads, the stderr output, and the number of checks run
 */
function _watcher(results: CheckResult[], options: Partial<HostWatcherOptions> = {}) {
  const record = { reloads: 0, stderr: '', checks: 0 };
  const watcher = createHostWatcher({
    host: { project: { name: 'p' }, documentation: _host('first').documentation },
    check: async () => results[Math.min(record.checks++, results.length - 1)],
    readMatcher: async () => ignore().add('vendor/'),
    target: { reload: () => record.reloads++ },
    output: { stdout: () => undefined, stderr: (text) => (record.stderr += text) },
    ...options,
  });
  return { watcher, record };
}

describe('cli/serve', () => {
  // Tests serve's parts without starting a server (see AGENTS.md › Testing): the watcher's `ignored` function, and the reload decisions of the host
  // watcher, with a fake check and a fake reload target. serve() itself is only run where its first check fails, before it starts anything.

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createIgnored', () => {
    // Which paths the dev server's watcher skips, through the ignore matcher, with paths absolute or relative to the current directory.

    const root = join(process.cwd(), 'host');
    const ignored = createIgnored(root, () => ignore().add(['vendor/', '*.log']));

    it('Ignores what the matcher ignores, as files and as folders', () => {
      expect(ignored(join(root, 'debug.log'))).toBe(true);
      expect(ignored(join(root, 'vendor'))).toBe(true);
      expect(ignored(join(root, 'vendor', 'README.md'))).toBe(true);
      expect(ignored(join('host', 'vendor'))).toBe(true);
    });

    it('Watches everything else', () => {
      expect(ignored(join(root, 'README.md'))).toBe(false);
      expect(ignored(join(root, 'docs'))).toBe(false);
    });

    it('Never ignores the root itself, or paths outside it', () => {
      // The dev server's watcher also watches the showroom's own folder, outside the host repository
      expect(ignored(root)).toBe(false);
      expect(ignored(join(process.cwd(), 'vendor'))).toBe(false);
      expect(ignored(join(process.cwd(), 'elsewhere', 'debug.log'))).toBe(false);
    });

    it('Ignores nothing without a matcher', () => {
      expect(createIgnored(root, () => undefined)(join(root, 'debug.log'))).toBe(false);
    });

    it('Uses the latest matcher', () => {
      let matcher = ignore().add('a/');
      const latest = createIgnored(root, () => matcher);
      expect(latest(join(root, 'a'))).toBe(true);
      matcher = ignore().add('b/');
      expect(latest(join(root, 'a'))).toBe(false);
      expect(latest(join(root, 'b'))).toBe(true);
    });
  });

  describe('createHostWatcher', () => {
    // When the host watcher reloads, what it writes, and which data and matcher it keeps.

    it('Reloads, with the new data, when the shown host information changed', async () => {
      const { watcher, record } = _watcher([{ passed: true, host: _host('second'), issues: [] }]);
      await watcher.update();
      expect(record.reloads).toBe(1);
      expect(watcher.getHost().documentation[0].content).toBe('second');
      expect(watcher.getMatcher()?.ignores('vendor/')).toBe(true);
    });

    it("Doesn't reload when only the code file index changed", async () => {
      const { watcher, record } = _watcher([{ passed: true, host: _host('first', ['src/new.ts']), issues: [] }]);
      await watcher.update();
      expect(record.reloads).toBe(0);
    });

    it('Keeps the last good data, and writes the issues, when the check fails', async () => {
      const matcher = ignore().add('old/');
      const { watcher, record } = _watcher([{ passed: false, issues: [{ severity: 'error', message: 'Broken', path: 'showroom.json' }] }], { matcher });
      await watcher.update();
      expect(record.reloads).toBe(0);
      expect(watcher.getHost().documentation[0].content).toBe('first');
      expect(watcher.getMatcher()).toBe(matcher);
      expect(record.stderr).toBe('error: showroom.json: Broken\n');
    });

    it('Writes the issues only when they changed', async () => {
      const warning = { severity: 'warning' as const, message: 'Several', path: 'README.md' };
      const { watcher, record } = _watcher(
        [
          { passed: true, host: _host('first'), issues: [warning] },
          { passed: true, host: _host('first'), issues: [warning] },
          { passed: true, host: _host('first'), issues: [] },
        ],
        { issues: [] },
      );
      await watcher.update();
      await watcher.update();
      expect(record.stderr).toBe('warning: README.md: Several\n');
      await watcher.update();
      expect(record.checks).toBe(3);
    });

    it('Checks once after changes stop for the delay', async () => {
      vi.useFakeTimers();
      const { watcher, record } = _watcher([{ passed: true, host: _host('second'), issues: [] }], { delay: 100 });
      watcher.notify();
      await vi.advanceTimersByTimeAsync(60);
      watcher.notify();
      await vi.advanceTimersByTimeAsync(60);
      expect(record.checks).toBe(0);
      await vi.advanceTimersByTimeAsync(60);
      expect(record.checks).toBe(1);
      expect(record.reloads).toBe(1);
    });

    it('Checks again after a check that changes interrupted', async () => {
      // A change during a running check could be missed by it, so one more check follows
      let finish: () => void = () => undefined;
      const results = [_host('second'), _host('third')];
      let calls = 0;
      const { watcher, record } = _watcher([], {
        check: () =>
          new Promise<CheckResult>((done) => {
            const host = results[calls++];
            finish = () => done({ passed: true, host, issues: [] });
          }),
      });
      const first = watcher.update();
      const second = watcher.update();
      finish();
      await vi.waitFor(() => expect(calls).toBe(2));
      finish();
      await Promise.all([first, second]);
      expect(watcher.getHost().documentation[0].content).toBe('third');
      expect(record.reloads).toBe(2);
    });

    it('Stops checking once closed', async () => {
      vi.useFakeTimers();
      const { watcher, record } = _watcher([{ passed: true, host: _host('second'), issues: [] }], { delay: 100 });
      watcher.notify();
      watcher.close();
      watcher.notify();
      await vi.advanceTimersByTimeAsync(200);
      expect(record.checks).toBe(0);
    });
  });

  it('Exits with 1, writing the issues, without serving, when the first check fails', async () => {
    let stdout = '';
    let stderr = '';
    const code = await serve({ root: _fixture('unknown-stack'), output: { stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) } });
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toBe('error: showroom.json: Unknown stack "cobol"; the stack adapters are: typescript\n');
  });

  it('Checks with the overriding output folder, without serving when it fails', async () => {
    let stderr = '';
    const root = _fixture('minimal');
    const code = await serve({ root, outDir: root, output: { stdout: () => undefined, stderr: (text) => (stderr += text) } });
    expect(code).toBe(1);
    expect(stderr).toBe(`error: Output folder "${root}" is the host repository's root\n`);
  });
});
