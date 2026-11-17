/**
 * Integration tests of the cs showcase adapter: buildShowcases() on fixture host repositories, with the .NET SDK
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { check } from '../../../cli/check/index.js';
import { readConfiguration } from '../../../configuration/index.js';
import { createRunSession, type RunSession } from '../../../host-copy/index.js';
import { getCacheFolder } from '../../../processes/index.js';
import { buildShowcases, type BuildShowcasesResult } from '../../../showcases/index.js';
import { FIXTURES, useOwnCacheFolder } from '../../../testing/index.js';
import type { ShowcaseRecording } from '../index.js';

/**
 * Checks a fixture, then builds its showcases
 * @param name Name of the fixture
 * @param session The run session to build in; one of its own, disposed after, if not given
 * @returns The outcome of buildShowcases()
 */
async function _build(name: string, session?: RunSession): Promise<BuildShowcasesResult> {
  const root = join(FIXTURES, name);
  const { host, issues } = await check(root, { trust: true });
  const { configuration } = await readConfiguration(root);
  if (!host || !configuration) throw new Error(`The fixture "${name}" doesn't pass the check: ${JSON.stringify(issues)}`);
  return buildShowcases({ root, host, configuration, trust: true, ...(session ? { session } : {}) });
}

/**
 * Gets the processes still running with a folder of the user's cache folder (the run folders') in their environment: what a build left behind
 * @returns Their command lines; none where `/proc` can't be read
 */
async function _getLeftProcesses(): Promise<string[]> {
  const cache = getCacheFolder();
  let pids: string[];
  try {
    pids = (await readdir('/proc')).filter((name) => /^\d+$/.test(name));
  } catch (_err) {
    return [];
  }
  const left: string[] = [];
  for (const pid of pids) {
    try {
      const environment = await readFile(`/proc/${pid}/environ`, 'utf8');
      if (environment.split('\0').some((variable) => variable.includes(cache))) {
        left.push((await readFile(`/proc/${pid}/cmdline`, 'utf8')).replace(/\0/g, ' '));
      }
    } catch (_err) {
      // Another user's process, or one that ended meanwhile
    }
  }
  return left;
}

describe('adapters/showcase/cs (integration)', () => {
  // Builds and records the cs fixtures' showcases with the .NET SDK on the PATH, in the host copy (the fixtures are only read): showcase-cs's pass,
  // showcase-cs-errors's fail, and showcase-cs-many's five measure a run cold and with kept build output (O105). Its run folders are in a cache folder
  // of its own, so that the processes left behind are only its own

  let cache: Awaited<ReturnType<typeof useOwnCacheFolder>>;
  beforeAll(async () => {
    cache = await useOwnCacheFolder();
  });
  afterAll(async () => {
    await cache.restore();
  });

  describe('Passing showcases', () => {
    // Builds showcase-cs once: a code block referencing the host's project, a named one with a warning, a linked one referencing the project by its
    // folder, and one in the project's own folder (K28)

    let built: BuildShowcasesResult;
    const recording = (id: string): ShowcaseRecording => built.recordings.get(id)!;
    const texts = (id: string) => recording(id).lines.map((line) => line.text);

    beforeAll(async () => {
      built = await _build('showcase-cs');
    }, 180_000);

    it('Records each showcase, built with its #:project', () => {
      expect([...built.errors.keys()]).toEqual([]);
      expect(built.frames.size).toBe(0);
      expect(texts('README.md#1')).toEqual(['thousands 1,234,567', 'cwd copy', 'virtual True', 'args 0']);
      expect(recording('README.md#1')).toMatchObject({ dropped: 0, exitCode: 0 });
      expect(built.checks.get('README.md#1')).toEqual(['runtime']);
      expect(texts('README.md#3')).toEqual(['linked 42,000']);
    });

    it("Keeps a virtual file out of the host's project in its folder", () => {
      // See K28: without DefaultItemExcludes, the project compiles the virtual file, and every showcase referencing it fails with CS9298
      expect(texts('src/Numbers/README.md#1')).toEqual(['inside 1,000']);
    });

    it("Gives the showcase's own warning at its code block's line", () => {
      expect(texts('README.md#2')).toEqual(['hello']);
      expect(built.shownIssues.get('README.md#2')).toEqual([
        expect.objectContaining({
          severity: 'warning',
          message: "CS0219: The variable 'unused' is assigned but its value is never used",
          path: 'hello.cs',
          line: 1,
        }),
      ]);
      expect(built.warnings).toEqual([expect.objectContaining({ severity: 'warning', path: 'README.md', line: 18 })]);
    });

    it('Watches each showcase file and the project files it references', () => {
      // See PLAN-P20 D799
      expect(built.watched).toEqual(['README.md', 'docs/linked.cs', 'src/Numbers/Numbers.csproj', 'src/Numbers/README.md']);
    });

    it('Leaves no process behind', async () => {
      // See PLAN-P20 D790 C22: the MSBuild worker node would outlive dotnet build by ~15 s, unless the process group is killed
      expect(await _getLeftProcesses()).toEqual([]);
      expect(await readdir(getCacheFolder())).toEqual([]);
    });
  });

  describe('Failing showcases', () => {
    // Builds showcase-cs-errors once: a compiler error, an unhandled exception, standard error, an exit code, and an error in the host's project
    // beside a warning there

    let built: BuildShowcasesResult;
    const recording = (id: string): ShowcaseRecording => built.recordings.get(id)!;
    const shown = (id: string) => built.shownIssues.get(id)!.map(({ severity, message, line, check }) => ({ severity, message, line, check }));

    beforeAll(async () => {
      built = await _build('showcase-cs-errors');
    }, 180_000);

    it("Fails a compiler error's build at its code block's line, with no recording", () => {
      expect(built.recordings.has('README.md#1')).toBe(false);
      expect(shown('README.md#1')).toEqual([
        { severity: 'error', message: "CS0029: Cannot implicitly convert type 'string' to 'int'", line: 2, check: undefined },
      ]);
      expect(built.errors.get('README.md#1')).toEqual([expect.objectContaining({ path: 'README.md', line: 9 })]);
    });

    it('Fails the runtime check of an exception, standard error and an exit code, their paths made relative', () => {
      expect(recording('README.md#2')).toMatchObject({ signal: 'SIGABRT' });
      const exception = recording('README.md#2').lines.map((line) => line.text);
      expect(exception[0]).toBe('before');
      expect(exception).toContain('Unhandled exception. System.InvalidOperationException: boom');
      expect(exception.some((text) => text.includes('in README.showcase-2.cs:line 2'))).toBe(true);
      expect(recording('README.md#3').lines).toEqual([{ level: 'error', text: 'to standard error' }]);
      expect(recording('README.md#4')).toMatchObject({ exitCode: 3, lines: [{ level: 'log', text: 'exiting' }] });
      for (const id of ['README.md#2', 'README.md#3', 'README.md#4']) {
        expect(built.checks.get(id)).toEqual(['runtime']);
        expect(shown(id)).toEqual([expect.objectContaining({ severity: 'error', check: 'runtime' })]);
      }
    });

    it("Fails on an error in the host's project, without its warnings", () => {
      // See PLAN-P20 D801
      expect(built.recordings.has('README.md#5')).toBe(false);
      expect(built.shownIssues.get('README.md#5')).toEqual([
        expect.objectContaining({
          severity: 'error',
          message: "CS0029: Cannot implicitly convert type 'string' to 'int'",
          path: 'src/Broken/Broken.cs',
          line: 10,
        }),
      ]);
      expect(built.warnings).toEqual([]);
    });
  });

  it('Builds five showcases cold, then again with their build output kept', async () => {
    // O105's measurement: each showcase builds into a folder of its own, kept across serve's runs by its run session
    const session = createRunSession();
    try {
      const started = Date.now();
      const cold = await _build('showcase-cs-many', session);
      const coldTime = Date.now() - started;
      const again = await _build('showcase-cs-many', session);
      const keptTime = Date.now() - started - coldTime;
      console.info(`showcase-cs-many: ${coldTime} ms cold, ${keptTime} ms with kept build output`);
      for (const built of [cold, again]) {
        expect([...built.errors.keys()]).toEqual([]);
        expect([...built.recordings.values()].map((recorded) => recorded.lines.map((line) => line.text))).toEqual([
          ['1,000'],
          ['2,000'],
          ['3,000'],
          ['4,000'],
          ['5,000'],
        ]);
      }
      expect(keptTime).toBeLessThan(coldTime);
    } finally {
      await session.dispose();
    }
  }, 300_000);
});
