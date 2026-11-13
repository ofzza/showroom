/**
 * Testing helpers, for the tests only (excluded from the build, never re-exported): scratch folders inside this repository's
 * `node_modules/.cache/showroom-tests/`, copies of the fixture host repositories in them, and the work of the test projects' global setups (the
 * temporary folder, the compiled showroom, and the installed fixtures)
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
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
    /**
     * Absolute paths of the installed fixtures (see installFixture()), by fixture name, in the `integration` and `e2e` projects
     */
    installedFixtures: Record<string, string>;
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

/**
 * Absolute path of the folder holding the installed fixtures (see installFixture()), kept across runs
 */
export const INSTALLS = join(SCRATCH_ROOT, 'installs');

/**
 * Names of the fixtures that carry a lockfile, and get an install of their own (e.g. another React than this repository's own)
 */
export const INSTALLED_FIXTURES: readonly string[] = ['showcase-react-18'];

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
 * Gets where a fixture is installed (see installFixture()): a folder named after the fixture and its lockfile's hash, so a changed lockfile gets a
 * new install
 * @param name Name of the fixture, a folder in `test/fixtures/` holding a `package-lock.json`
 * @param folder Absolute path of the folder holding the installs; the tests replace it
 * @returns Absolute path of the installed fixture's folder
 */
export async function getInstalledFixturePath(name: string, folder = INSTALLS): Promise<string> {
  const lockfile = await readFile(join(FIXTURES, name, 'package-lock.json'));
  return join(folder, `${name}-${createHash('sha256').update(lockfile).digest('hex').slice(0, 16)}`);
}

/**
 * Represents a function running `npm` in a folder
 * @param args The arguments
 * @param cwd Absolute path of the folder to run it in
 * @returns A promise resolved once it is done
 */
export type NpmRunner = (args: string[], cwd: string) => Promise<void>;

/**
 * Runs `npm`: the one running the tests' npm script, with this Node, or the `npm` on the `PATH`
 * @param args The arguments
 * @param cwd Absolute path of the folder to run it in
 * @returns A promise resolved once it is done
 */
async function _runNpm(args: string[], cwd: string): Promise<void> {
  const npm = process.env.npm_execpath;
  if (npm && /\.c?js$/i.test(npm)) await promisify(execFile)(process.execPath, [npm, ...args], { cwd });
  else await promisify(execFile)('npm', args, { cwd, shell: process.platform === 'win32' });
}

/**
 * Installs a fixture that carries a lockfile, once per lockfile: a copy of it, with its own `node_modules` from `npm ci`, kept in
 * `node_modules/.cache/showroom-tests/installs/` across runs while its lockfile is unchanged (so only its first install needs the npm registry);
 * older installs of the fixture are removed. Tests only read it, or copy it to change it.
 * @param name Name of the fixture, a folder in `test/fixtures/` holding a `package-lock.json`
 * @param run Runs `npm` (see NpmRunner); the tests replace it
 * @param folder Absolute path of the folder holding the installs; the tests replace it
 * @returns Absolute path of the installed fixture's folder
 */
export async function installFixture(name: string, run: NpmRunner = _runNpm, folder = INSTALLS): Promise<string> {
  const path = await getInstalledFixturePath(name, folder);
  const installed = await stat(path).then(
    () => true,
    () => false,
  );
  if (installed) return path;
  await mkdir(folder, { recursive: true });
  for (const entry of await readdir(folder)) {
    if (entry.startsWith(`${name}-`)) await rm(join(folder, entry), { recursive: true, force: true });
  }

  // Installed beside its final folder, then renamed into place, so an interrupted install is never taken for a finished one
  const partial = await mkdtemp(join(folder, `.partial-${name}-`));
  try {
    await cp(join(FIXTURES, name), partial, { recursive: true });
    await run(['ci', '--no-audit', '--no-fund', '--ignore-scripts'], partial);
    await rename(partial, path);
  } finally {
    await rm(partial, { recursive: true, force: true });
  }
  return path;
}

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
