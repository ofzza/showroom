/**
 * Tests of `showroom serve`
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import ignore from 'ignore';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CheckIssue, CheckResult } from '../check/index.js';
import type { HostInformation, LinkedFile } from '../../host/index.js';
import { getErrorFrame, getShowcaseFrameFolder, type ShowcaseFrame } from '../../showcases/index.js';
import { getShownHostInformation } from '../../vite/index.js';
import type { ShownHostInformation } from '../../app/host/index.js';
import {
  ISSUES_EVENT,
  SHOWCASES_EVENT,
  createHostWatcher,
  createIgnored,
  getServedFrames,
  getWatchTargets,
  getShownChange,
  runBuild,
  serve,
  type HostWatcherOptions,
  type ServedState,
} from './index.js';

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
 * @param showcases Number of showcases in the README
 * @returns The host information
 */
function _host(content: string, code: string[] = [], showcases = 0): HostInformation {
  return {
    project: { name: 'p' },
    documentation: [{ path: 'README.md', kind: 'readme', extension: '.md', content }],
    code,
    showcases: Array.from({ length: showcases }, (_, index) => ({
      id: `README.md#${index + 1}`,
      documentation: 'README.md',
      line: index + 1,
      offset: index * 10,
      kind: 'link' as const,
      display: 'inline' as const,
      adapter: 'html',
      entry: 'a.html',
      include: [],
    })),
    virtualFiles: [],
    linkedFiles: [],
  };
}

/**
 * Creates a fake build, building every showcase into a showcase frame whose page holds the given text
 * @param page Text of every showcase frame's page
 * @param failing Ids of the showcases that don't build
 * @param watched The files to watch it gives
 * @returns The fake build
 */
function _build(page: string, failing: string[] = [], watched: string[] = []): HostWatcherOptions['build'] {
  return async (host) => {
    const frames = new Map<string, ShowcaseFrame>();
    const errors = new Map<string, CheckIssue[]>();
    for (const showcase of host.showcases) {
      if (failing.includes(showcase.id)) {
        errors.set(showcase.id, [{ severity: 'error', message: `${showcase.id} broke`, path: 'README.md', line: showcase.line }]);
      } else {
        frames.set(showcase.id, { folder: getShowcaseFrameFolder(showcase), page: 'index.html', files: [{ path: 'index.html', content: page }], reads: [] });
      }
    }
    return { frames, errors, warnings: [], issues: [], watched };
  };
}

/**
 * Gets the state `serve` starts with, as its first run leaves it
 * @param host Host information of the first check
 * @param build The first build
 * @returns The state
 */
async function _initial(host: HostInformation, build: HostWatcherOptions['build'] = _build('first')): Promise<ServedState> {
  const built = await runBuild(host, build, new Map());
  return { host: getShownHostInformation(host, built.frames), frames: built.frames, issues: built.issues, watched: built.watched };
}

/**
 * Creates a host watcher with fakes, recording what it does
 * @param initial The state of the first run
 * @param results Results the fake check returns, one per call (the last one repeated)
 * @param options Options to override
 * @returns The watcher, and the record of its reloads, events, stderr output and checks
 */
function _watcher(initial: ServedState, results: CheckResult[], options: Partial<HostWatcherOptions> = {}) {
  const record = { reloads: 0, events: [] as [string, unknown][], stderr: '', checks: 0 };
  const watcher = createHostWatcher({
    initial,
    check: async () => results[Math.min(record.checks++, results.length - 1)],
    build: _build('first'),
    readMatcher: async () => ignore().add('vendor/'),
    target: { reload: () => record.reloads++, send: (event, data) => void record.events.push([event, data]) },
    output: { stdout: () => undefined, stderr: (text) => (record.stderr += text) },
    ...options,
  });
  return { watcher, record };
}

describe('cli/serve', () => {
  // Tests serve's parts without starting a server (see AGENTS.md › Testing): the watcher's `ignored` function, the showcase frames it serves, and
  // the decisions of the host watcher (a full reload, or custom events), with a fake check, a fake build and a fake reload target. serve() itself is
  // only run here where its first check fails, before it starts anything; the `serve` tier runs it.

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

    it('Watches the files to watch, and the folders leading to them, under ignored folders', () => {
      let watched = ['vendor/lib/index.js', 'build.log'];
      const withWatched = createIgnored(
        root,
        () => ignore().add(['vendor/', '*.log']),
        () => watched,
      );
      expect(withWatched(join(root, 'vendor'))).toBe(false);
      expect(withWatched(join(root, 'vendor', 'lib'))).toBe(false);
      expect(withWatched(join(root, 'vendor', 'lib', 'index.js'))).toBe(false);
      expect(withWatched(join(root, 'build.log'))).toBe(false);
      // Their neighbours stay ignored, and a path only sharing a prefix isn't a folder leading to one
      expect(withWatched(join(root, 'vendor', 'lib', 'other.js'))).toBe(true);
      expect(withWatched(join(root, 'vendor', 'li'))).toBe(true);
      expect(withWatched(join(root, 'debug.log'))).toBe(true);
      // The latest files to watch apply
      watched = [];
      expect(withWatched(join(root, 'vendor'))).toBe(true);
    });
  });

  describe('getWatchTargets', () => {
    // What serve adds to the dev server's watcher for the files to watch under ignored paths.

    it('Adds the topmost ignored folder holding each file to watch, or the file itself', () => {
      const matcher = ignore().add(['dist/', 'vendor/', '*.gen.ts', 'docs/out/']);
      expect(
        getWatchTargets(['dist/index.js', 'dist/sub/a.js', 'vendor/lib/x.js', 'src/types.gen.ts', 'docs/out/a/b.js', 'README.md', 'src/a.ts'], matcher),
      ).toEqual(['dist', 'docs/out', 'src/types.gen.ts', 'vendor']);
      expect(getWatchTargets(['dist/index.js'], undefined)).toEqual([]);
    });
  });

  describe('getServedFrames', () => {
    // The showcase frames serve hands out after a build: each showcase's own, or the one showing its build errors.

    it("Serves each showcase's showcase frame, or its error frame, in showcase order", async () => {
      const host = _host('x', [], 3);
      const frames = getServedFrames(host, await _build('ok', ['README.md#2'])(host));
      expect([...frames.keys()]).toEqual(['README.md#1', 'README.md#2', 'README.md#3']);
      expect(frames.get('README.md#1')!.files[0].content).toBe('ok');
      expect(frames.get('README.md#2')).toEqual(
        getErrorFrame(host.showcases[1], [{ severity: 'error', message: 'README.md#2 broke', path: 'README.md', line: 2 }]),
      );
    });

    it('Keeps the last showcase frames and files to watch, with an issue, when the build throws', async () => {
      const previous = new Map([['README.md#1', { folder: 'showcases/README.md/1', page: 'index.html', files: [], reads: [] }]]);
      const built = await runBuild(_host('x', [], 1), () => Promise.reject(new Error('no configuration')), previous, ['dist/index.js']);
      expect(built.frames).toBe(previous);
      expect(built.watched).toEqual(['dist/index.js']);
      expect(built.issues).toEqual([{ severity: 'error', message: 'The showcases failed to build: no configuration' }]);
    });

    it("Watches the linked files along with the showcases' reads, whether the build passes or throws", async () => {
      const host = { ..._host('x', [], 1), linkedFiles: [{ path: 'vendor/data.json', size: 2, text: true }] };
      expect((await runBuild(host, _build('ok', [], ['dist/a.js', 'vendor/data.json']), new Map())).watched).toEqual(['dist/a.js', 'vendor/data.json']);
      const thrown = await runBuild(host, () => Promise.reject(new Error('no configuration')), new Map(), ['dist/index.js']);
      expect(thrown.watched).toEqual(['dist/index.js', 'vendor/data.json']);
    });
  });

  describe('getShownChange', () => {
    // What a change of the shown host information needs: nothing, the changed showcase frames and tabs, or a full reload.

    const shown = (content: string, urls: string[], linkedFiles: LinkedFile[] = [], tabUrl = 'files/a.css?hash=00000001'): ShownHostInformation => ({
      project: { name: 'p' },
      documentation: _host(content).documentation,
      showcases: urls.map((url, index) => ({
        id: `README.md#${index + 1}`,
        documentation: 'README.md',
        offset: index,
        display: 'block' as const,
        tabs: [{ label: 'a.css', path: 'a.css', language: 'css', source: { kind: 'file' as const, url: tabUrl, text: true } }],
        url,
      })),
      linkedFiles,
    });

    it('Needs nothing when nothing changed', () => {
      expect(getShownChange(shown('a', ['u1']), shown('a', ['u1']))).toBe('none');
    });

    it('Needs only the showcase frames when only their URLs changed', () => {
      expect(getShownChange(shown('a', ['u1', 'u2']), shown('a', ['u1', 'u3']))).toBe('showcases');
    });

    it('Needs only the tabs when only their URLs changed', () => {
      // A changed included file that no showcase frame uses changes no showcase frame's hash (D406)
      expect(getShownChange(shown('a', ['u1']), shown('a', ['u1'], [], 'files/a.css?hash=00000002'))).toBe('showcases');
      expect(getShownChange(shown('a', ['u1']), shown('a', ['u1'], [], 'files/b.css?hash=00000001'))).toBe('reload');
    });

    it('Needs a full reload when anything else changed', () => {
      expect(getShownChange(shown('a', ['u1']), shown('b', ['u1']))).toBe('reload');
      expect(getShownChange(shown('a', ['u1']), shown('a', ['u1', 'u2']))).toBe('reload');
      expect(getShownChange(shown('a', ['u1']), { ...shown('a', ['u1']), project: { name: 'q' } })).toBe('reload');
      expect(getShownChange(shown('a', ['u1']), shown('a', ['u1'], [{ path: 'a.ts', size: 1, text: true }]))).toBe('reload');
    });
  });

  describe('createHostWatcher', () => {
    // When the host watcher reloads or sends events, what it writes, and which data, showcase frames, issues and matcher it keeps; the tabs' hashes
    // come from a fake `hashFiles`.

    it('Reloads, with the new data, when the shown host information changed', async () => {
      const { watcher, record } = _watcher(await _initial(_host('first')), [{ passed: true, host: _host('second'), issues: [] }]);
      await watcher.update();
      expect(record.reloads).toBe(1);
      expect(record.events).toEqual([]);
      expect(watcher.getHost().documentation[0].content).toBe('second');
      expect(watcher.getMatcher()?.ignores('vendor/')).toBe(true);
    });

    it("Doesn't reload when only the code file index changed", async () => {
      const { watcher, record } = _watcher(await _initial(_host('first')), [{ passed: true, host: _host('first', ['src/new.ts']), issues: [] }]);
      await watcher.update();
      expect(record.reloads).toBe(0);
      expect(record.events).toEqual([]);
    });

    it('Reloads when a showcase is added', async () => {
      const { watcher, record } = _watcher(await _initial(_host('first', [], 1)), [{ passed: true, host: _host('first', [], 2), issues: [] }]);
      await watcher.update();
      expect(record.reloads).toBe(1);
      expect([...watcher.getFrames().keys()]).toEqual(['README.md#1', 'README.md#2']);
    });

    it('Sends every showcase, without a reload, when only showcase frames changed', async () => {
      const host = _host('first', [], 2);
      const { watcher, record } = _watcher(await _initial(host), [{ passed: true, host, issues: [] }], { build: _build('second') });
      const before = watcher.getHost().showcases;
      await watcher.update();
      expect(record.reloads).toBe(0);
      const after = watcher.getHost().showcases;
      expect(after.map(({ url }) => url)).not.toEqual(before.map(({ url }) => url));
      expect(record.events).toEqual([[SHOWCASES_EVENT, after]]);
      expect(watcher.getFrames().get('README.md#1')!.files[0].content).toBe('second');
    });

    it("Sends every showcase, without a reload, when only a tab's file changed", async () => {
      const host: HostInformation = { ..._host('first', [], 1), linkedFiles: [{ path: 'a.html', size: 1, text: true }] };
      let hash = 'aaaaaaaa';
      const hashFiles = async () => new Map([['a.html', hash]]);
      const built = await runBuild(host, _build('first'), new Map());
      const initial = { host: getShownHostInformation(host, built.frames, await hashFiles()), frames: built.frames, issues: [], watched: built.watched };
      const { watcher, record } = _watcher(initial, [{ passed: true, host, issues: [] }], { hashFiles });
      hash = 'bbbbbbbb';
      await watcher.update();
      expect(record.reloads).toBe(0);
      expect(watcher.getHost().showcases[0].tabs[0].source).toEqual({ kind: 'file', url: 'files/a.html?hash=bbbbbbbb', text: true });
      expect(record.events).toEqual([[SHOWCASES_EVENT, watcher.getHost().showcases]]);
    });

    it('Serves an error frame, and sends the build errors as issues, when a showcase stops building', async () => {
      const host = _host('first', [], 2);
      const { watcher, record } = _watcher(await _initial(host), [{ passed: true, host, issues: [] }], { build: _build('first', ['README.md#2']) });
      await watcher.update();
      const issues = [{ severity: 'error', message: 'README.md#2 broke', path: 'README.md', line: 2 }];
      expect(watcher.getFrames().get('README.md#2')!.files[0].content).toContain('README.md#2 broke');
      expect(watcher.getIssues()).toEqual(issues);
      expect(record.events).toEqual([
        [SHOWCASES_EVENT, watcher.getHost().showcases],
        [ISSUES_EVENT, issues],
      ]);
      expect(record.stderr).toBe('error: README.md:2: README.md#2 broke\n');
    });

    it('Watches the files the latest build gives, whenever they change', async () => {
      const host = _host('first', [], 1);
      const calls: [readonly string[], boolean][] = [];
      const builds = [_build('first', [], ['dist/a.js']), _build('first', [], ['dist/a.js']), _build('first', [], ['dist/b.js'])];
      let run = 0;
      const { watcher } = _watcher(await _initial(host), [{ passed: true, host, issues: [] }], {
        build: (built) => builds[run++](built),
        watch: (watched, matcher) => void calls.push([watched, matcher?.ignores('vendor/') ?? false]),
      });
      expect(watcher.getWatched()).toEqual([]);
      await watcher.update();
      await watcher.update();
      await watcher.update();
      // The second run gives the same files: nothing to change
      expect(calls).toEqual([
        [['dist/a.js'], true],
        [['dist/b.js'], true],
      ]);
      expect(watcher.getWatched()).toEqual(['dist/b.js']);
    });

    it("Keeps the previous files to watch along with a run's while a showcase doesn't build, and replaces them once every showcase builds", async () => {
      // A deleted dist/ is no longer among a failed build's reads; unwatching it would miss its rebuild (see AGENTS.md › serve watches ignored files)
      const host = _host('first', [], 1);
      const calls: (readonly string[])[] = [];
      const builds = [_build('first', ['README.md#1'], ['README.md']), _build('first', [], ['README.md', 'dist/b.js'])];
      let run = 0;
      const { watcher } = _watcher(await _initial(host, _build('first', [], ['README.md', 'dist/a.js'])), [{ passed: true, host, issues: [] }], {
        build: (built) => builds[run++](built),
        watch: (watched) => void calls.push(watched),
      });
      await watcher.update();
      expect(watcher.getWatched()).toEqual(['README.md', 'dist/a.js']);
      await watcher.update();
      expect(watcher.getWatched()).toEqual(['README.md', 'dist/b.js']);
      expect(calls).toEqual([['README.md', 'dist/b.js']]);
    });

    it('Keeps the files to watch when the check fails, or the build throws', async () => {
      const host = _host('first', [], 1);
      const initial = await _initial(host, _build('first', [], ['dist/a.js']));
      const calls: (readonly string[])[] = [];
      const { watcher } = _watcher(
        initial,
        [
          { passed: false, issues: [] },
          { passed: true, host, issues: [] },
        ],
        {
          build: () => Promise.reject(new Error('no configuration')),
          watch: (watched) => void calls.push(watched),
        },
      );
      await watcher.update();
      await watcher.update();
      expect(watcher.getWatched()).toEqual(['dist/a.js']);
      expect(calls).toEqual([]);
    });

    it('Keeps the last good data, and writes and sends the issues, when the check fails', async () => {
      const matcher = ignore().add('old/');
      const initial = await _initial(_host('first', [], 1));
      const issues = [{ severity: 'error' as const, message: 'Broken', path: 'showroom.json' }];
      const { watcher, record } = _watcher(initial, [{ passed: false, issues }], { matcher });
      await watcher.update();
      expect(record.reloads).toBe(0);
      expect(watcher.getHost()).toBe(initial.host);
      expect(watcher.getFrames()).toBe(initial.frames);
      expect(watcher.getMatcher()).toBe(matcher);
      expect(watcher.getIssues()).toEqual(issues);
      expect(record.events).toEqual([[ISSUES_EVENT, issues]]);
      expect(record.stderr).toBe('error: showroom.json: Broken\n');
    });

    it('Writes and sends the issues only when they changed', async () => {
      const warning = { severity: 'warning' as const, message: 'Several', path: 'README.md' };
      const { watcher, record } = _watcher(await _initial(_host('first')), [
        { passed: true, host: _host('first'), issues: [warning] },
        { passed: true, host: _host('first'), issues: [warning] },
        { passed: true, host: _host('first'), issues: [] },
      ]);
      await watcher.update();
      await watcher.update();
      expect(record.stderr).toBe('warning: README.md: Several\n');
      expect(record.events).toEqual([[ISSUES_EVENT, [warning]]]);
      await watcher.update();
      expect(record.checks).toBe(3);
      expect(record.events).toEqual([
        [ISSUES_EVENT, [warning]],
        [ISSUES_EVENT, []],
      ]);
    });

    it('Checks once after changes stop for the delay', async () => {
      vi.useFakeTimers();
      const { watcher, record } = _watcher(await _initial(_host('first')), [{ passed: true, host: _host('second'), issues: [] }], { delay: 100 });
      watcher.notify();
      await vi.advanceTimersByTimeAsync(60);
      watcher.notify();
      await vi.advanceTimersByTimeAsync(60);
      expect(record.checks).toBe(0);
      await vi.advanceTimersByTimeAsync(60);
      expect(record.checks).toBe(1);
      expect(record.reloads).toBe(1);
    });

    it('Checks again after a run that changes interrupted', async () => {
      // A change during a running check could be missed by it, so one more run follows
      let finish: () => void = () => undefined;
      const results = [_host('second'), _host('third')];
      let calls = 0;
      const { watcher, record } = _watcher(await _initial(_host('first')), [], {
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
      const { watcher, record } = _watcher(await _initial(_host('first')), [{ passed: true, host: _host('second'), issues: [] }], { delay: 100 });
      watcher.notify();
      await watcher.close();
      watcher.notify();
      await vi.advanceTimersByTimeAsync(200);
      expect(record.checks).toBe(0);
    });

    it('Waits for a running run when closed, and sends nothing after it', async () => {
      // serve() removes its folders and closes the server only once the run is done, so the run never builds into a removed folder
      let finish: () => void = () => undefined;
      let built = false;
      const { watcher, record } = _watcher(await _initial(_host('first')), [{ passed: true, host: _host('second'), issues: [] }], {
        build: (host) =>
          new Promise((done) => {
            finish = () => {
              built = true;
              void _build('first')(host).then(done);
            };
          }),
      });
      const running = watcher.update();
      await vi.waitFor(() => expect(record.checks).toBe(1));
      let closed = false;
      const closing = watcher.close().then(() => (closed = true));
      await Promise.resolve();
      expect(closed).toBe(false);
      finish();
      await Promise.all([running, closing]);
      expect(built).toBe(true);
      expect(record.reloads).toBe(0);
      expect(record.stderr).toBe('');
      expect(watcher.getHost().documentation[0].content).toBe('first');
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
