/**
 * Tests of the host copy and the run session: what is copied, syncing both sides, links and virtual files, the run folder, and run()
 */

import { lstat, mkdir, readdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createScratchFolder, type ScratchFolder } from '../testing/index.js';
import { createCopyFilter, createRunSession, HostCopy, STOP_FILES } from './index.js';

/**
 * Writes files into a folder, creating the folders leading to them
 * @param folder Absolute path of the folder
 * @param files Contents by POSIX-style path
 */
async function _write(folder: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(folder, path, '..'), { recursive: true });
    await writeFile(join(folder, path), content);
  }
}

/**
 * Lists a folder's entries, recursively, without following links
 * @param folder Absolute path of the folder
 * @returns POSIX-style paths, sorted, folders ending in `/`, links in `->` and their target
 */
async function _list(folder: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (path: string) => {
    for (const entry of await readdir(join(folder, path), { withFileTypes: true })) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) found.push(`${entryPath} -> ${await readlink(join(folder, entryPath))}`);
      else if (entry.isDirectory()) {
        found.push(`${entryPath}/`);
        await walk(entryPath);
      } else found.push(entryPath);
    }
  };
  await walk('');
  return found.sort();
}

describe('host-copy', () => {
  // Tests the copy filter on hand-written paths, HostCopy on a scratch host repository copied into a scratch folder, and the run session in a
  // scratch cache folder, running Node.js.

  describe('Copy filter', () => {
    // Tests createCopyFilter() on hand-written contents and paths.

    it('Copies what any content copies, never the output folder, and .git only when asked', () => {
      const copies = createCopyFilter(
        [
          { exclude: ['bin/', 'obj/', '*.log'], git: false },
          { exclude: ['obj/', 'node_modules/'], git: true },
        ],
        'showroom',
      );
      expect(copies('src/a.cs', false)).toBe(true);
      expect(copies('bin', true)).toBe(true);
      expect(copies('obj', true)).toBe(false);
      expect(copies('x.log', false)).toBe(true);
      expect(copies('.git', true)).toBe(true);
      expect(copies('showroom', true)).toBe(false);
      expect(copies('showroom/index.html', false)).toBe(false);
      const one = createCopyFilter([{ exclude: ['bin/'], git: false }]);
      expect(one('.git', true)).toBe(false);
      expect(one('.git/config', false)).toBe(false);
      expect(one('bin', true)).toBe(false);
      expect(one('bin', false)).toBe(true);
    });
  });

  describe('Host copy', () => {
    // Tests HostCopy.sync() on a scratch host repository (`host/`) and a scratch host copy (`copy/`).

    let scratch: ScratchFolder;
    let host: string;
    let copy: HostCopy;
    const contents = [{ exclude: ['bin/', 'secret.txt'], git: false }];
    beforeEach(async () => {
      scratch = await createScratchFolder('host-copy-');
      host = join(scratch.path, 'host');
      await _write(host, { 'README.md': '# Host', 'src/a.cs': 'a', 'bin/out.dll': 'x', 'secret.txt': 's', 'showroom/index.html': 'o', '.git/HEAD': 'h' });
      await mkdir(join(scratch.path, 'copy'));
      copy = new HostCopy(host, join(scratch.path, 'copy'));
    });
    afterEach(() => scratch.remove());

    it('Copies what the contents copy, and writes the virtual files', async () => {
      await copy.sync(contents, [{ path: 'src/README.showcase-1.cs', content: 'v' }], 'showroom');
      expect(await _list(copy.folder)).toEqual(['README.md', 'src/', 'src/README.showcase-1.cs', 'src/a.cs']);
      expect(await readFile(join(copy.folder, 'src', 'README.showcase-1.cs'), 'utf8')).toBe('v');
    });

    it('Syncs changes on both sides, keeping what the contents leave out', async () => {
      await copy.sync(contents, [{ path: 'v.cs', content: 'v' }], 'showroom');
      // The host repository changes: an edit, a new file, a deleted file
      await writeFile(join(host, 'src', 'a.cs'), 'a, edited');
      await writeFile(join(host, 'src', 'b.cs'), 'b');
      await rm(join(host, 'README.md'));
      // The host copy changes: a build's output, an edit, a stray file, and a virtual file no longer there
      await _write(copy.folder, { 'bin/Debug/x.dll': 'built', 'stray.txt': 'stray' });
      await copy.sync(contents, [{ path: 'w.cs', content: 'w' }], 'showroom');
      expect(await _list(copy.folder)).toEqual(['bin/', 'bin/Debug/', 'bin/Debug/x.dll', 'src/', 'src/a.cs', 'src/b.cs', 'w.cs']);
      expect(await readFile(join(copy.folder, 'src', 'a.cs'), 'utf8')).toBe('a, edited');
      // An edit made in the host copy is undone
      await writeFile(join(copy.folder, 'src', 'b.cs'), 'b, changed in the copy');
      await copy.sync(contents, [{ path: 'w.cs', content: 'w2' }], 'showroom');
      expect(await readFile(join(copy.folder, 'src', 'b.cs'), 'utf8')).toBe('b');
      expect(await readFile(join(copy.folder, 'w.cs'), 'utf8')).toBe('w2');
    });

    it('Keeps links inside the root, makes absolute ones relative, and leaves out those leading outside it', async () => {
      await mkdir(join(scratch.path, 'outside'));
      await symlink('../README.md', join(host, 'src', 'relative.md'));
      await symlink(join(host, 'src', 'a.cs'), join(host, 'absolute.cs'));
      await symlink(join(scratch.path, 'outside'), join(host, 'out'));
      await symlink('../../outside', join(host, 'src', 'up'));
      await copy.sync(contents, [], 'showroom');
      expect(await _list(copy.folder)).toEqual(['README.md', 'absolute.cs -> src/a.cs', 'src/', 'src/a.cs', 'src/relative.md -> ../README.md']);
    });

    it('Never writes a virtual file through a link', async () => {
      await symlink(join(scratch.path, 'elsewhere'), join(copy.folder, 'docs'));
      await mkdir(join(scratch.path, 'elsewhere'));
      // A link the host repository doesn't have is removed first, so a folder of the host repository's takes its place
      await mkdir(join(host, 'docs'));
      await copy.sync(contents, [{ path: 'docs/v.cs', content: 'v' }]);
      expect((await lstat(join(copy.folder, 'docs'))).isDirectory()).toBe(true);
      expect(await readdir(join(scratch.path, 'elsewhere'))).toEqual([]);
      // A link of the host repository's own on the way is refused
      await rm(join(host, 'docs'), { recursive: true });
      await symlink('src', join(host, 'docs'));
      await expect(copy.sync(contents, [{ path: 'docs/v.cs', content: 'v' }])).rejects.toThrow('"docs" isn\'t a folder');
      expect(await readdir(join(host, 'src'))).toEqual(['a.cs']);
    });
  });

  describe('Run session', () => {
    // Tests createRunSession() in a scratch cache folder: its run folder and stop files, its showcases' folders, run() with Node.js, and disposing.

    let scratch: ScratchFolder;
    beforeEach(async () => (scratch = await createScratchFolder('run-session-')));
    afterEach(() => scratch.remove());

    it('Makes its run folder when first needed, with its stop files and folders, and removes it', async () => {
      const session = createRunSession({ cacheFolder: join(scratch.path, 'cache') });
      expect(await readdir(scratch.path)).toEqual([]);
      const folder = await session.getFolder();
      expect(await session.getFolder()).toBe(folder);
      expect((await readdir(folder)).sort()).toEqual([...Object.keys(STOP_FILES), 'copy', 'data', 'showcases', 'tmp'].sort());
      expect(await readFile(join(folder, 'global.json'), 'utf8')).toBe('{}\n');
      const showcase = await session.getShowcaseFolder('README.md#1');
      expect(await session.getShowcaseFolder('README.md#1')).toBe(showcase);
      expect(await session.getShowcaseFolder('README.md#2')).not.toBe(showcase);
      await session.dispose();
      expect(await readdir(join(scratch.path, 'cache'))).toEqual([]);
    });

    it("Runs a command in the host copy, from the documentation file's folder, passing --pass-env's names to build steps only", async () => {
      const host = join(scratch.path, 'host');
      await _write(host, { 'docs/README.md': '# Docs' });
      const session = createRunSession({ cacheFolder: join(scratch.path, 'cache'), passEnv: ['SHOWROOM_TEST_PASSED'] });
      process.env.SHOWROOM_TEST_PASSED = 'passed';
      try {
        const copy = await session.getHostCopy(host);
        await copy.sync([{ exclude: [], git: false }], []);
        const hostCopy = session.createShowcaseHostCopy(copy, { root: host, folder: 'docs' });
        expect(hostCopy.root).toBe(copy.folder);
        const script = "console.log(process.cwd()); console.log(process.env.SHOWROOM_TEST_PASSED ?? 'none'); console.log(process.env.OWN)";
        const run = await hostCopy.run('node', ['-e', script], { phase: 'run', env: { OWN: 'own', TMPDIR: 'mine' } });
        expect(run.recording.lines.map((line) => line.text)).toEqual(['docs', 'none', 'own']);
        const build = await hostCopy.run('node', ['-e', script], { phase: 'build', cwd: '.' });
        expect(build.stdout).toBe('.\npassed\nundefined');
        await expect(hostCopy.run('node', [], { phase: 'run', cwd: '../..' })).rejects.toThrow('"cwd" leads outside the host copy');
        await expect(hostCopy.run('node', [], { phase: 'later' } as never)).rejects.toThrow('"phase" must be "build" or "run"');
        await expect(hostCopy.run('showroom-missing-command', [], { phase: 'run' })).rejects.toThrow('Command "showroom-missing-command" not found');
        await expect(hostCopy.run('../node', [], { phase: 'run' })).rejects.toThrow('not found');
        // A time limit no longer than its phase's
        const limited = await hostCopy.run('node', ['-e', 'setInterval(() => {}, 1000)'], { phase: 'run', timeLimit: 300 });
        expect(limited.recording).toMatchObject({ timedOut: true, timeLimit: 300 });
        // Outside the host copy, in the run folder (a host check's)
        const outside = await session.run('node', ['-e', 'console.log(process.cwd())'], { phase: 'build' }, { root: host });
        expect(outside.stdout).toBe('<run>');
      } finally {
        delete process.env.SHOWROOM_TEST_PASSED;
        await session.dispose();
      }
    });
  });
});
