/**
 * Testing helpers, for the tests only (excluded from the build, never re-exported): scratch folders inside this repository's
 * `node_modules/.cache/showroom-tests/`, copies of the fixture host repositories in them, and the work of the test projects' global setups (the
 * temporary folder, the compiled showroom, and the installed fixtures), and the command line's input
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { CliInput } from '../cli/index.js';

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
export const INSTALLED_FIXTURES: readonly string[] = ['showcase-react-18', 'showcase-angular-20', 'showcase-angular-21'];

// #endregion

// #region Supported majors

/**
 * The majors of the packages this repository installs itself, its own fixtures run on (see getMajorsIssues()); each older supported major of a
 * framework is an installed fixture instead (see INSTALLED_FIXTURES)
 */
export const CURRENT_MAJORS: Readonly<Record<string, number>> = { react: 19, '@angular/core': 22, typescript: 6 };

/**
 * Represents a framework whose every supported major is tested: the current one on this repository's own install, each older one on an installed
 * fixture named `<fixturePrefix>-<major>`
 */
export interface SupportedFramework {
  /**
   * Name of the package whose major counts
   */
  package: string;
  /**
   * The oldest major supported, from its showcase adapter
   */
  minimum: number;
  /**
   * Start of the names of its installed fixtures
   */
  fixturePrefix: string;
}

/**
 * Represents what the majors guard checks (see getMajorsIssues())
 */
export interface MajorsState {
  /**
   * The installed versions, by package name (undefined if not installed)
   */
  installed: Readonly<Record<string, string | undefined>>;
  /**
   * The current majors declared (see CURRENT_MAJORS)
   */
  current: Readonly<Record<string, number>>;
  /**
   * The frameworks whose every supported major is tested
   */
  frameworks: readonly SupportedFramework[];
  /**
   * Names of the installed fixtures (see INSTALLED_FIXTURES)
   */
  installedFixtures: readonly string[];
  /**
   * The `typescript` range `@angular/compiler-cli` accepts (its `peerDependencies`), if known
   */
  typescriptRange: string | undefined;
}

/**
 * Gets the major of a version
 * @param version The version, e.g. `22.2.6`
 * @returns Its major, or undefined if it doesn't start with one
 */
export function getMajor(version: string | undefined): number | undefined {
  const match = /^\s*v?(\d+)/.exec(version ?? '');
  return match ? Number(match[1]) : undefined;
}

/**
 * Parses a version into its three numbers, any missing one 0, any prerelease or build left out
 * @param version The version, e.g. `6.0.3` or `6.1`
 * @returns The numbers, or undefined if it isn't a version
 */
function _parseVersion(version: string): [number, number, number] | undefined {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : undefined;
}

/**
 * Compares two parsed versions
 * @param a The first version
 * @param b The second version
 * @returns A negative number if a is lower, 0 if they are equal, a positive one if a is higher
 */
function _compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * Checks if a version satisfies one comparator of a range: `>=`, `>`, `<=`, `<`, `=`, `^`, `~`, or an exact version
 * @param version The parsed version
 * @param comparator The comparator, e.g. `>=6.0`
 * @returns True if it does, undefined if the comparator isn't understood
 */
function _satisfiesComparator(version: [number, number, number], comparator: string): boolean | undefined {
  const match = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(comparator);
  const bound = match ? _parseVersion(match[2]) : undefined;
  if (!match || !bound) return undefined;
  const order = _compare(version, bound);
  switch (match[1]) {
    case '>=':
      return order >= 0;
    case '>':
      return order > 0;
    case '<=':
      return order <= 0;
    case '<':
      return order < 0;
    case '^':
      return order >= 0 && (bound[0] > 0 ? version[0] === bound[0] : version[0] === 0 && version[1] === bound[1]);
    case '~':
      return order >= 0 && version[0] === bound[0] && version[1] === bound[1];
    default:
      return order === 0;
  }
}

/**
 * Checks if a version satisfies an npm range: alternatives joined by `||`, each comparators joined by spaces (no hyphen ranges or `x` wildcards)
 * @param version The version, e.g. `6.0.3`
 * @param range The range, e.g. `>=6.0 <6.1`
 * @returns True if it does, false if it doesn't, undefined if the version or the range isn't understood
 */
export function satisfiesRange(version: string, range: string): boolean | undefined {
  const parsed = _parseVersion(version);
  if (!parsed) return undefined;
  let satisfied = false;
  for (const alternative of range.split('||')) {
    const comparators = alternative.trim().split(/\s+/).filter(Boolean);
    if (!comparators.length) return undefined;
    const results = comparators.map((comparator) => _satisfiesComparator(parsed, comparator));
    if (results.includes(undefined)) return undefined;
    satisfied ||= results.every(Boolean);
  }
  return satisfied;
}

/**
 * Gets what the majors guard finds wrong: an installed major that isn't the declared current one, an older supported major without its installed
 * fixture, an installed fixture of a major no longer supported or now current, and a `typescript` outside the range `@angular/compiler-cli` accepts
 * @param state What is checked
 * @returns A message per issue, saying what to do; empty if there is none
 */
export function getMajorsIssues(state: MajorsState): string[] {
  const issues: string[] = [];
  for (const [name, major] of Object.entries(state.current)) {
    const installed = getMajor(state.installed[name]);
    if (installed === undefined) issues.push(`"${name}" isn't installed, but ${major} is its current major: install it, or update the current majors`);
    else if (installed !== major) {
      const framework = state.frameworks.find((framework) => framework.package === name);
      const fixture = framework && installed > major && major >= framework.minimum ? `: add the "${framework.fixturePrefix}-${major}" fixture, and` : ':';
      issues.push(`"${name}" ${installed} is installed, but ${major} is its current major${fixture} update the current majors`);
    }
  }
  for (const framework of state.frameworks) {
    const current = state.current[framework.package];
    for (let major = framework.minimum; current !== undefined && major < current; major++) {
      const fixture = `${framework.fixturePrefix}-${major}`;
      if (!state.installedFixtures.includes(fixture))
        issues.push(`"${framework.package}" ${major} is supported, but has no installed fixture: add "${fixture}"`);
    }
    const prefix = `${framework.fixturePrefix}-`;
    for (const fixture of state.installedFixtures) {
      const major = fixture.startsWith(prefix) && /^\d+$/.test(fixture.slice(prefix.length)) ? Number(fixture.slice(prefix.length)) : undefined;
      if (major !== undefined && (major < framework.minimum || (current !== undefined && major >= current))) {
        issues.push(`"${fixture}" is installed, but "${framework.package}" ${major} isn't an older supported major: remove it`);
      }
    }
  }
  const typescript = state.installed.typescript;
  if (typescript !== undefined && state.typescriptRange !== undefined && satisfiesRange(typescript, state.typescriptRange) !== true) {
    issues.push(`"typescript" ${typescript} is outside "${state.typescriptRange}", the range "@angular/compiler-cli" accepts: install a TypeScript inside it`);
  }
  return issues;
}

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

/**
 * Names of what a canary host repository records once it runs (see createCanaryHost())
 */
export type CanaryName = 'adapter' | 'sass' | 'postcss';

/**
 * Represents a canary host repository: a scratch host repository whose code records that it ran, to show that nothing of it runs without trust
 */
export interface CanaryHost extends ScratchFolder {
  /**
   * Checks if a part of it ran
   * @param name The part: its custom showcase adapter module, its `sass` package, or its PostCSS configuration
   * @returns True if it ran, at any time since the canary host was created
   */
  ran(name: CanaryName): boolean;
}

/**
 * Creates a canary host repository in a scratch folder: a custom showcase adapter module (`canary`, used by a showcase), a stub `sass` package in its
 * `node_modules`, and a `postcss.config.js`, each recording that it ran by writing a file `ran-<name>` into the root as it is loaded; and a `ts`
 * showcase importing a `.scss` file, an `html` showcase and a linked `.html` file
 * @returns The canary host repository
 */
export async function createCanaryHost(): Promise<CanaryHost> {
  const scratch = await createScratchFolder('canary-');
  const record = (name: CanaryName, path: string) =>
    `import { writeFileSync } from 'node:fs';\nwriteFileSync(new URL('${path}ran-${name}', import.meta.url), '');\n`;
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'canary', version: '1.0.0', type: 'module' }),
    'showroom.json': JSON.stringify({ stack: 'typescript', sourceRoot: '.', customShowcaseAdapters: { canary: './canary.js' } }),
    'canary.js': `${record('adapter', './')}export default () => ({ validate: () => ({ errors: [] }), build: async () => ({ reads: [] }) });\n`,
    'postcss.config.js': `${record('postcss', './')}export default { plugins: [] };\n`,
    'node_modules/sass/package.json': JSON.stringify({ name: 'sass', version: '1.0.0', type: 'module', main: 'index.js' }),
    'node_modules/sass/index.js': record('sass', '../../'),
    'style.scss': 'p { color: red; }\n',
    'page.html': '<p>Linked</p>\n',
    'README.md': [
      '# Canary',
      '',
      '```ts showcase=ts include=style.scss',
      "import './style.scss';",
      '```',
      '',
      '```html showcase=html',
      '<p>Hi</p>',
      '```',
      '',
      '```html showcase=canary',
      '<p>Canary</p>',
      '```',
      '',
      'See [the page](page.html).',
      '',
    ].join('\n'),
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(scratch.path, path, '..'), { recursive: true });
    await writeFile(join(scratch.path, path), content);
  }
  return { ...scratch, ran: (name) => existsSync(join(scratch.path, `ran-${name}`)) };
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

// #region Command line input

/**
 * Represents an input for main() in the tests, recording the questions asked
 */
export interface TestCliInput {
  /**
   * The input, to pass to main()
   */
  input: CliInput;
  /**
   * The questions asked, in order
   */
  questions: string[];
}

/**
 * Creates an input for main() in the tests, so no test reads the real terminal, or waits on a prompt
 * @param terminal True if the input is a terminal, so main() asks; false (the default) for no terminal, so it never asks
 * @param answers The answers to give, in order (null for Ctrl-C); a question past them is answered at the end of the input (an empty string)
 * @returns The input, and the questions it was asked
 */
export function createCliInput(terminal = false, answers: (string | null)[] = []): TestCliInput {
  const questions: string[] = [];
  const left = [...answers];
  return {
    questions,
    input: {
      isTerminal: terminal,
      ask: async (question) => {
        questions.push(question);
        return left.length ? left.shift()! : '';
      },
    },
  };
}

// #endregion
