/**
 * Testing helpers, for the tests only (excluded from the build, never re-exported): scratch folders inside this repository's
 * `node_modules/.cache/showroom-tests/`, copies of the fixture host repositories in them, and the work of the test projects' global setups (the
 * temporary folder, and the compiled showroom)
 */

import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

declare module 'vitest' {
  /**
   * Values the global setups provide to the tests, read with `inject()`
   */
  export interface ProvidedContext {
    /**
     * Absolute path of the compiled showroom's folder (see compileApp()), in the `e2e` project
     */
    appDir: string;
  }
}

// #region Paths

/**
 * Absolute path of this repository's root
 */
export const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Absolute path of the folder holding the fixture host repositories
 */
export const FIXTURES = join(REPOSITORY_ROOT, 'test', 'fixtures');

/**
 * Absolute path of the folder every scratch folder is created in: ignored by git, ESLint and Prettier, and wiped by `npm ci`
 */
export const SCRATCH_ROOT = join(REPOSITORY_ROOT, 'node_modules', '.cache', 'showroom-tests');

// #endregion

// #region Scratch folders

/**
 * Represents a scratch folder a test created
 */
export interface ScratchFolder {
  /**
   * Absolute path of the scratch folder
   */
  path: string;
  /**
   * Removes the scratch folder and everything in it
   * @returns A promise resolved once it is removed
   */
  remove(): Promise<void>;
}

/**
 * Creates a scratch folder of its own for a test, inside `node_modules/.cache/showroom-tests/`; the test removes it when it is done
 * @param prefix Start of the folder's name, followed by random characters
 * @returns The scratch folder
 */
export async function createScratchFolder(prefix = 'scratch-'): Promise<ScratchFolder> {
  await mkdir(SCRATCH_ROOT, { recursive: true });
  const path = await mkdtemp(join(SCRATCH_ROOT, prefix));
  return { path, remove: () => rm(path, { recursive: true, force: true }) };
}

/**
 * Copies a fixture host repository into a scratch folder of its own, so a test can run on it, or change it, without touching the fixture
 * @param name Name of the fixture, a folder in `test/fixtures/`
 * @returns The scratch folder holding the copy, whose path is the copy's root
 */
export async function copyFixture(name: string): Promise<ScratchFolder> {
  const scratch = await createScratchFolder(`${name}-`);
  await cp(join(FIXTURES, name), scratch.path, { recursive: true });
  return scratch;
}

// #endregion

// #region Global setups

/**
 * Compiles the showroom (with the rest of `src/`) into a folder, as `npm run build` does into `dist/`, so tests can build showrooms without
 * depending on, or writing to, `dist/`
 * @param folder Absolute path of the folder to compile into
 * @returns Absolute path of the compiled showroom's folder, holding its `index.html`
 */
export async function compileApp(folder: string): Promise<string> {
  const tsc = join(REPOSITORY_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  await promisify(execFile)(process.execPath, [tsc, '-p', join(REPOSITORY_ROOT, 'tsconfig.build.json'), '--outDir', folder, '--declaration', 'false'], {
    cwd: REPOSITORY_ROOT,
  });
  await cp(join(REPOSITORY_ROOT, 'src', 'app', 'index.html'), join(folder, 'app', 'index.html'));
  return join(folder, 'app');
}

// #endregion
