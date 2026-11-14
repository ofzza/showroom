/**
 * Tests of the testing helpers
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFixture, createScratchFolder, FIXTURES, getInstalledFixturePath, INSTALLED_FIXTURES, INSTALLS, installFixture, SCRATCH_ROOT } from './index.js';

describe('testing', () => {
  // Tests the scratch folder helpers on the real file system: each test creates its scratch folder inside `node_modules/.cache/showroom-tests/`, and
  // removes it again; and installing fixtures, into a scratch folder, with a fake npm.

  it('Creates a scratch folder of its own, and removes it', async () => {
    const first = await createScratchFolder('helper-');
    const second = await createScratchFolder('helper-');
    try {
      expect(relative(SCRATCH_ROOT, first.path)).toMatch(/^helper-\w+$/);
      expect(second.path).not.toBe(first.path);
      await writeFile(join(first.path, 'file.txt'), 'text');
    } finally {
      await first.remove();
      await second.remove();
    }
    expect(existsSync(first.path)).toBe(false);
    expect(existsSync(second.path)).toBe(false);
  });

  it('Copies a fixture into a scratch folder', async () => {
    const copy = await copyFixture('minimal');
    try {
      expect((await readdir(copy.path)).sort()).toEqual((await readdir(join(FIXTURES, 'minimal'))).sort());
    } finally {
      await copy.remove();
    }
  });

  it('Names an installed fixture after its lockfile, in the installs folder', async () => {
    expect(INSTALLED_FIXTURES).toEqual(['showcase-react-18']);
    const path = await getInstalledFixturePath('showcase-react-18');
    expect(relative(INSTALLS, path)).toMatch(/^showcase-react-18-[0-9a-f]{16}$/);
    expect(await getInstalledFixturePath('showcase-react-18')).toBe(path);
  });

  it('Installs a fixture once per lockfile, with npm ci, replacing older installs', async () => {
    const scratch = await createScratchFolder('installs-');
    try {
      const runs: string[][] = [];
      const run = async (args: string[], cwd: string) => {
        runs.push(args);
        await mkdir(join(cwd, 'node_modules'));
      };
      await mkdir(join(scratch.path, 'showcase-react-18-0000000000000000'));
      const path = await installFixture('showcase-react-18', run, scratch.path);
      expect(path).toBe(await getInstalledFixturePath('showcase-react-18', scratch.path));
      expect(runs).toEqual([['ci', '--no-audit', '--no-fund', '--ignore-scripts']]);
      expect(await readFile(join(path, 'package-lock.json'), 'utf8')).toBe(await readFile(join(FIXTURES, 'showcase-react-18', 'package-lock.json'), 'utf8'));
      expect(existsSync(join(path, 'node_modules'))).toBe(true);
      expect(await readdir(scratch.path)).toEqual([basename(path)]);
      // Installed already
      expect(await installFixture('showcase-react-18', run, scratch.path)).toBe(path);
      expect(runs).toHaveLength(1);
    } finally {
      await scratch.remove();
    }
  });

  it('Leaves nothing behind when npm fails', async () => {
    const scratch = await createScratchFolder('installs-');
    try {
      const failing = async () => {
        throw new Error('offline');
      };
      await expect(installFixture('showcase-react-18', failing, scratch.path)).rejects.toThrow('offline');
      expect(await readdir(scratch.path)).toEqual([]);
    } finally {
      await scratch.remove();
    }
  });
});
