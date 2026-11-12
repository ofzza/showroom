/**
 * Tests of the testing helpers
 */

import { existsSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFixture, createScratchFolder, FIXTURES, SCRATCH_ROOT } from './index.js';

describe('testing', () => {
  // Tests the scratch folder helpers on the real file system: each test creates its scratch folder inside `node_modules/.cache/showroom-tests/`, and
  // removes it again.

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
});
