/**
 * Tests of running processes for recorded showcases: the cache folder, resolving commands, the cleaned environment, replacing paths and cleaning
 * lines, recording output under its caps, and running Node.js scripts under the limits
 */

import { existsSync } from 'node:fs';
import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createScratchFolder, type ScratchFolder } from '../testing/index.js';
import {
  cleanRecordedLine,
  cleanUpSync,
  createPathReplacer,
  getCacheFolder,
  getLiveProcessCount,
  getRunEnvironment,
  isValidCommandName,
  isValidEnvironmentName,
  OUTPUT_LIMIT,
  OutputRecorder,
  registerRunFolder,
  resolveCommand,
  runProcess,
} from './index.js';

/**
 * Checks if a process is alive
 * @param pid Its id
 * @returns True if it is
 */
function _isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_err) {
    return false;
  }
}

describe('processes', () => {
  // Tests the pure helpers on hand-written values, command resolution on executables written into scratch folders, and runProcess() on Node.js
  // scripts given with `-e`, under short time limits.

  describe('Cache folder', () => {
    // Tests where the user's cache folder is, by platform, on given environments and home folders.

    it("Uses XDG_CACHE_HOME, else each platform's own cache folder", () => {
      expect(getCacheFolder({ XDG_CACHE_HOME: '/x/cache' }, 'linux', '/home/u')).toBe(join('/x/cache', 'showroom'));
      expect(getCacheFolder({ XDG_CACHE_HOME: 'relative' }, 'linux', '/home/u')).toBe(join('/home/u', '.cache', 'showroom'));
      expect(getCacheFolder({}, 'linux', '/home/u')).toBe(join('/home/u', '.cache', 'showroom'));
      expect(getCacheFolder({}, 'darwin', '/Users/u')).toBe(join('/Users/u', 'Library', 'Caches', 'showroom'));
      expect(getCacheFolder({ LOCALAPPDATA: '/c/local' }, 'win32', '/c/u')).toBe(join('/c/local', 'showroom'));
    });
  });

  describe('Command resolution', () => {
    // Tests resolveCommand() with `tool` executables written into scratch folders standing for a host repository, the host copy and the PATH's
    // other folders.

    let scratch: ScratchFolder;
    beforeEach(async () => {
      scratch = await createScratchFolder('processes-');
      for (const folder of ['root/bin', 'copy/bin', 'outside', 'second', 'plain']) await mkdir(join(scratch.path, folder), { recursive: true });
      for (const folder of ['root/bin', 'copy/bin', 'outside', 'second']) {
        await writeFile(join(scratch.path, folder, 'tool'), '#!/bin/sh\n');
        await chmod(join(scratch.path, folder, 'tool'), 0o755);
      }
      await writeFile(join(scratch.path, 'plain', 'tool'), '#!/bin/sh\n');
      await writeFile(join(scratch.path, 'plain', 'tool.exe'), '');
    });
    afterEach(() => scratch.remove());

    it('Refuses a command name holding a path separator, ".." or ":"', () => {
      for (const name of ['dotnet', 'node', 'tool-1.2']) expect(isValidCommandName(name)).toBe(true);
      for (const name of ['', '.', '..', '../tool', 'bin/tool', 'bin\\tool', 'C:tool', 'a..b', 'x\0', 3]) expect(isValidCommandName(name)).toBe(false);
      expect(resolveCommand('bin/tool', { path: scratch.path, excluded: [] })).toBeUndefined();
    });

    it('Finds the first executable outside the host repository and the host copy, by its real path', () => {
      const path = (...folders: string[]) => folders.map((folder) => join(scratch.path, folder)).join(':');
      const excluded = [join(scratch.path, 'root'), join(scratch.path, 'copy')];
      expect(resolveCommand('tool', { path: path('root/bin', 'copy/bin', 'outside', 'second'), excluded, platform: 'linux' })).toBe(
        join(scratch.path, 'outside', 'tool'),
      );
      expect(resolveCommand('tool', { path: path('root/bin', 'copy/bin'), excluded, platform: 'linux' })).toBeUndefined();
      // A file that isn't executable is skipped
      expect(resolveCommand('tool', { path: path('plain', 'second'), excluded, platform: 'linux' })).toBe(join(scratch.path, 'second', 'tool'));
      // A relative entry is skipped, and so is an empty PATH
      expect(resolveCommand('tool', { path: 'outside', excluded, platform: 'linux' })).toBeUndefined();
      expect(resolveCommand('tool', { path: undefined, excluded, platform: 'linux' })).toBeUndefined();
    });

    it('Skips a PATH entry, or a file, whose real path leads into an excluded folder through a link', async () => {
      await symlink(join(scratch.path, 'root', 'bin'), join(scratch.path, 'linked-folder'));
      await mkdir(join(scratch.path, 'links'));
      await symlink(join(scratch.path, 'copy', 'bin', 'tool'), join(scratch.path, 'links', 'tool'));
      const excluded = [join(scratch.path, 'root'), join(scratch.path, 'copy')];
      expect(resolveCommand('tool', { path: join(scratch.path, 'linked-folder'), excluded, platform: 'linux' })).toBeUndefined();
      expect(resolveCommand('tool', { path: join(scratch.path, 'links'), excluded, platform: 'linux' })).toBeUndefined();
    });

    it('On Windows, finds only an .exe or .com that PATHEXT lists, in an entry with a drive', () => {
      // Case-insensitive real paths, the drive rule and taskkill are Windows-only; these run the extension rule on the POSIX file system
      expect(resolveCommand('tool', { path: join(scratch.path, 'plain'), excluded: [], platform: 'win32', pathext: '.COM;.EXE;.BAT' })).toBeUndefined();
    });
  });

  describe('Environment', () => {
    // Tests getRunEnvironment() on given environments.

    it("Passes on the fixed names and the given ones, after the showcase adapter's own, with the set ones winning", () => {
      const source = { PATH: '/bin', HOME: '/home/u', USER: 'u', SECRET: 's', NUGET_AUTH_TOKEN: 't', EXTRA: 'e', LANG: 'C' };
      expect(getRunEnvironment({ source, platform: 'linux' })).toEqual({ PATH: '/bin', HOME: '/home/u', LANG: 'C' });
      expect(
        getRunEnvironment({ source, names: ['EXTRA', 'MISSING'], own: { PATH: '/own', OWN: 'o' }, set: { TMPDIR: '/run/tmp', HOME: '/x' }, platform: 'linux' }),
      ).toEqual({ OWN: 'o', PATH: '/bin', HOME: '/x', LANG: 'C', EXTRA: 'e', TMPDIR: '/run/tmp' });
    });

    it('Matches names case-insensitively on Windows, keeping one of each', () => {
      const source = { Path: 'C:\\bin', SYSTEMROOT: 'C:\\Windows', Secret: 's' };
      expect(getRunEnvironment({ source, own: { path: 'own' }, set: { TEMP: 'C:\\run\\tmp' }, platform: 'win32' })).toEqual({
        Path: 'C:\\bin',
        SYSTEMROOT: 'C:\\Windows',
        TEMP: 'C:\\run\\tmp',
      });
    });

    it('Accepts --pass-env names that are not empty and hold no "="', () => {
      expect(isValidEnvironmentName('NUGET_TOKEN')).toBe(true);
      for (const name of ['', 'A=B', 'A\0']) expect(isValidEnvironmentName(name)).toBe(false);
    });
  });

  describe('Output', () => {
    // Tests replacing paths, cleaning lines and OutputRecorder on hand-written chunks.

    it('Makes the host copy root-relative, the run folder <run> and the home folder ~, as paths and file URLs', () => {
      const replace = createPathReplacer({ copy: '/h/.cache/run-1/copy', run: '/h/.cache/run-1', home: '/h', platform: 'linux' });
      expect(replace('at /h/.cache/run-1/copy/docs/a.mjs:3:7')).toBe('at docs/a.mjs:3:7');
      expect(replace(`at ${pathToFileURL('/h/.cache/run-1/copy/docs/a.mjs').href}:3`)).toBe('at docs/a.mjs:3');
      expect(replace('cwd /h/.cache/run-1/copy')).toBe('cwd .');
      expect(replace('tmp /h/.cache/run-1/tmp, /h/x and /hx')).toBe('tmp <run>/tmp, ~/x and /hx');
      const windows = createPathReplacer({ copy: 'C:\\run\\copy', platform: 'win32' });
      expect(windows('at C:\\run\\copy\\docs\\a.cs(3,1) and C:/run/copy/b.cs')).toBe('at docs\\a.cs(3,1) and b.cs');
    });

    it("Removes the terminal's escape sequences, and makes control and bidirectional characters visible", () => {
      expect(cleanRecordedLine('\x1b[31mred\x1b[0m \x1b]0;title\x07done\tok')).toBe('red done\tok');
      expect(cleanRecordedLine('a\u202eb\x07')).toBe('a\\u202eb\\x07');
    });

    it('Records lines by pipe, across chunks, cutting long ones and keeping the newest', () => {
      const recorder = new OutputRecorder((line) => line.replace('/copy/', ''));
      const encoded = new TextEncoder().encode('é\r\n');
      recorder.write('stdout', encoded.subarray(0, 1));
      recorder.write('stdout', encoded.subarray(1));
      recorder.write('stderr', new TextEncoder().encode('at /copy/a.mjs\n'));
      for (let line = 0; line < 200; line++) recorder.write('stderr', new TextEncoder().encode(`e${line}\n`));
      recorder.write('stdout', new TextEncoder().encode(`${'z'.repeat(30000)}`));
      const { recording, stdout, stderr } = recorder.end();
      expect(recording.dropped).toBe(75);
      expect(recording.droppedErrors).toBe(74);
      expect(recording.lines).toHaveLength(128);
      expect(recording.lines.at(-1)).toEqual({ level: 'log', text: `${'z'.repeat(10000)}… (20000 more characters)` });
      expect(stdout.split('\n')[0]).toBe('é');
      expect(stderr.split('\n')[0]).toBe('at a.mjs');
      expect(recording.cut).toBeUndefined();
    });

    it('Leaves out what passes the output cap', () => {
      const recorder = new OutputRecorder();
      recorder.write('stdout', new Uint8Array(OUTPUT_LIMIT - 2).fill(0x61));
      recorder.write('stdout', new TextEncoder().encode('bcdef\nlater\n'));
      const { recording } = recorder.end();
      expect(recording.cut).toBe(true);
      expect(recording.lines).toEqual([{ level: 'log', text: `${'a'.repeat(10000)}… (${OUTPUT_LIMIT - 10000} more characters)` }]);
    });
  });

  describe('Running', () => {
    // Tests runProcess() on Node.js scripts given with `-e`, in a scratch folder, with short time limits; the processes are gone afterwards.

    let scratch: ScratchFolder;
    beforeEach(async () => (scratch = await createScratchFolder('processes-run-')));
    afterEach(() => scratch.remove());

    /**
     * Runs a Node.js script
     * @param script Source of the script
     * @param timeLimit Its time limit
     * @param env Its environment
     * @returns What runProcess() gives
     */
    const run = (script: string, timeLimit = 5000, env: Record<string, string> = {}) =>
      runProcess({ executable: process.execPath, args: ['-e', script], cwd: scratch.path, env, timeLimit });

    it('Records both pipes, and the exit code, with only the environment given and standard input closed', async () => {
      const result = await run(
        "console.log(Object.keys(process.env).filter((k) => k !== '__CF_USER_TEXT_ENCODING').join(',')); console.error('err'); " +
          "process.stdin.on('end', () => { console.log('closed'); process.exitCode = 4; }).resume();",
        5000,
        { ONLY: '1' },
      );
      expect(result.recording).toEqual({
        lines: expect.arrayContaining([
          { level: 'log', text: 'ONLY' },
          { level: 'error', text: 'err' },
          { level: 'log', text: 'closed' },
        ]),
        dropped: 0,
        exitCode: 4,
      });
      expect(result.stdout).toBe('ONLY\nclosed');
      expect(result.stderr).toBe('err');
    });

    it('Gives the signal that ended a process', async () => {
      expect((await run("process.kill(process.pid, 'SIGTERM')")).recording).toMatchObject({ signal: 'SIGTERM' });
    });

    it('Kills the whole process group at the time limit, and what outlives a process', async () => {
      // A child holding the pipes, and one that doesn't; both go with the group
      const result = await run(
        "const { spawn } = require('node:child_process'); " +
          "const a = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' }); " +
          "const b = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); " +
          "console.log(a.pid + ' ' + b.pid); setInterval(() => {}, 1000);",
        800,
      );
      expect(result.recording).toMatchObject({ timedOut: true, timeLimit: 800 });
      const pids = result.recording.lines[0].text.split(' ').map(Number);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(pids.map(_isAlive)).toEqual([false, false]);
      const outliving = await run(
        "const { spawn } = require('node:child_process'); " +
          "const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); c.unref(); console.log(String(c.pid));",
      );
      expect(outliving.recording.exitCode).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(_isAlive(Number(outliving.recording.lines[0].text))).toBe(false);
      expect(getLiveProcessCount()).toBe(0);
    });

    it('Kills the process group when aborted, and the clean-up kills every group and removes the run folders', async () => {
      // PLAN-P20 D790 C7: aborting a long run leaves no child behind
      const controller = new AbortController();
      const running = runProcess({
        executable: process.execPath,
        args: [
          '-e',
          "const { spawn } = require('node:child_process'); const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); console.log(String(c.pid)); setInterval(() => {}, 1000);",
        ],
        cwd: scratch.path,
        env: {},
        timeLimit: 30000,
        signal: controller.signal,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(getLiveProcessCount()).toBe(1);
      controller.abort();
      const result = await running;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(_isAlive(Number(result.recording.lines[0].text))).toBe(false);
      const folder = join(scratch.path, 'run-folder');
      await mkdir(folder);
      registerRunFolder(folder);
      const other = runProcess({ executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: scratch.path, env: {}, timeLimit: 30000 });
      await new Promise((resolve) => setTimeout(resolve, 200));
      cleanUpSync();
      expect((await other).recording.signal).toBe('SIGKILL');
      expect(existsSync(folder)).toBe(false);
      expect(getLiveProcessCount()).toBe(0);
    });

    it("Rejects when the executable can't start", async () => {
      await expect(runProcess({ executable: join(scratch.path, 'missing'), args: [], cwd: scratch.path, env: {}, timeLimit: 1000 })).rejects.toThrow();
      expect(getLiveProcessCount()).toBe(0);
    });
  });
});
