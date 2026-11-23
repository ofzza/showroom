/**
 * Tests of the testing helpers
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MINIMUM_ANGULAR_VERSION } from '../adapters/showcase/angular/index.js';
import { MINIMUM_REACT_VERSION } from '../adapters/showcase/react/index.js';
import {
  copyFixture,
  createCliInput,
  createScratchFolder,
  useOwnCacheFolder,
  CURRENT_MAJORS,
  FIXTURES,
  getInstalledFixturePath,
  getMajor,
  getMajorsIssues,
  INSTALLED_FIXTURES,
  INSTALLS,
  installFixture,
  REPOSITORY_ROOT,
  SCRATCH_ROOT,
  satisfiesRange,
  type MajorsState,
  type SupportedFramework,
} from './index.js';

describe('testing', () => {
  // Tests the scratch folder helpers on the real file system: each test creates its scratch folder inside `node_modules/.cache/showroom-tests/`, and
  // removes it again; installing fixtures, into a scratch folder, with a fake npm; and the majors guard, on this repository's own install and on
  // hand-written states; the command line's input, answering as given; and a test file's own cache folder.

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

  it("Gives a test file a cache folder of its own, then restores the tier's", async () => {
    const previous = process.env.XDG_CACHE_HOME;
    const cache = await useOwnCacheFolder();
    expect(process.env.XDG_CACHE_HOME).toBe(cache.path);
    expect(existsSync(cache.path)).toBe(true);
    await cache.restore();
    expect(process.env.XDG_CACHE_HOME).toBe(previous);
    expect(existsSync(cache.path)).toBe(false);
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
    expect(INSTALLED_FIXTURES).toEqual(['showcase-react-18', 'showcase-angular-20', 'showcase-angular-21']);
    for (const name of INSTALLED_FIXTURES) expect(existsSync(join(FIXTURES, name, 'package-lock.json'))).toBe(true);
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
      // Installed already, its fixture files copied again, as one can change without its lockfile (e.g. its showroom.json, in P23)
      await writeFile(join(path, 'showroom.json'), '{ "stale": true }');
      expect(await installFixture('showcase-react-18', run, scratch.path)).toBe(path);
      expect(runs).toHaveLength(1);
      expect(await readFile(join(path, 'showroom.json'), 'utf8')).toBe(await readFile(join(FIXTURES, 'showcase-react-18', 'showroom.json'), 'utf8'));
      expect(existsSync(join(path, 'node_modules'))).toBe(true);
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

  it('Creates an input answering as given, recording the questions, and at the end of its answers as at the end of the input', async () => {
    const { input, questions } = createCliInput(true, ['y', null]);
    expect(input.isTerminal).toBe(true);
    expect(await input.ask('first? ')).toBe('y');
    expect(await input.ask('second? ')).toBeNull();
    expect(await input.ask('third? ')).toBe('');
    expect(questions).toEqual(['first? ', 'second? ', 'third? ']);
    expect(createCliInput().input.isTerminal).toBe(false);
  });

  describe('Supported majors', () => {
    // Tests the majors guard: this repository's installed majors against CURRENT_MAJORS, each older supported major's installed fixture, and
    // TypeScript inside the range Angular's compiler accepts (the guard itself); then getMajorsIssues() and the range parser on hand-written values.

    /**
     * The frameworks whose every supported major is tested, their minimum from their showcase adapters
     */
    const _FRAMEWORKS: SupportedFramework[] = [
      { package: 'react', minimum: MINIMUM_REACT_VERSION, fixturePrefix: 'showcase-react' },
      { package: '@angular/core', minimum: MINIMUM_ANGULAR_VERSION, fixturePrefix: 'showcase-angular' },
    ];

    /**
     * Reads the version of a package this repository installs
     * @param name The package's name
     * @returns Its version, or undefined if it isn't installed
     */
    async function _readInstalledVersion(name: string): Promise<string | undefined> {
      try {
        return (JSON.parse(await readFile(join(REPOSITORY_ROOT, 'node_modules', name, 'package.json'), 'utf8')) as { version?: string }).version;
      } catch {
        return undefined;
      }
    }

    /**
     * Gets a state in which nothing is wrong, for the hand-written cases to change
     * @param changes What to change
     * @returns The state
     */
    function _state(changes: Partial<MajorsState> = {}): MajorsState {
      return {
        installed: { react: '19.3.0', '@angular/core': '22.2.6', typescript: '6.0.3' },
        current: { react: 19, '@angular/core': 22, typescript: 6 },
        frameworks: [
          { package: 'react', minimum: 18, fixturePrefix: 'showcase-react' },
          { package: '@angular/core', minimum: 20, fixturePrefix: 'showcase-angular' },
        ],
        installedFixtures: ['showcase-react-18', 'showcase-angular-20', 'showcase-angular-21'],
        typescriptRange: '>=6.0 <6.1',
        ...changes,
      };
    }

    it('Finds every supported major tested, and TypeScript in the range Angular accepts', async () => {
      // The guard: a Dependabot major, or a changed minimum, fails it with what to do
      const installed: Record<string, string | undefined> = {};
      for (const name of Object.keys(CURRENT_MAJORS)) installed[name] = await _readInstalledVersion(name);
      const compilerCli = JSON.parse(await readFile(join(REPOSITORY_ROOT, 'node_modules', '@angular', 'compiler-cli', 'package.json'), 'utf8')) as {
        peerDependencies?: Record<string, string>;
      };
      const typescriptRange = compilerCli.peerDependencies?.typescript;
      expect(typescriptRange).toBeDefined();
      expect(getMajorsIssues({ installed, current: CURRENT_MAJORS, frameworks: _FRAMEWORKS, installedFixtures: INSTALLED_FIXTURES, typescriptRange })).toEqual(
        [],
      );
    });

    it('Finds nothing wrong in a consistent state', () => {
      expect(getMajorsIssues(_state())).toEqual([]);
    });

    it("Asks for the replaced major's fixture when a newer major is installed", () => {
      expect(getMajorsIssues(_state({ installed: { react: '19.3.0', '@angular/core': '23.0.0', typescript: '6.0.3' } }))).toEqual([
        '"@angular/core" 23 is installed, but 22 is its current major: add the "showcase-angular-22" fixture, and update the current majors',
      ]);
    });

    it('Reports a major older than the current one, or a package missing', () => {
      expect(getMajorsIssues(_state({ installed: { react: '18.3.1', typescript: '6.0.3' } }))).toEqual([
        '"react" 18 is installed, but 19 is its current major: update the current majors',
        '"@angular/core" isn\'t installed, but 22 is its current major: install it, or update the current majors',
      ]);
    });

    it('Reports an older supported major without its installed fixture, and a fixture no longer needed', () => {
      expect(
        getMajorsIssues(_state({ installedFixtures: ['showcase-react-18', 'showcase-angular-21', 'showcase-angular-19', 'showcase-angular-22'] })),
      ).toEqual([
        '"@angular/core" 20 is supported, but has no installed fixture: add "showcase-angular-20"',
        '"showcase-angular-19" is installed, but "@angular/core" 19 isn\'t an older supported major: remove it',
        '"showcase-angular-22" is installed, but "@angular/core" 22 isn\'t an older supported major: remove it',
      ]);
    });

    it("Reports a TypeScript outside the range Angular's compiler accepts", () => {
      expect(getMajorsIssues(_state({ installed: { react: '19.3.0', '@angular/core': '22.2.6', typescript: '6.1.0' } }))).toEqual([
        '"typescript" 6.1.0 is outside ">=6.0 <6.1", the range "@angular/compiler-cli" accepts: install a TypeScript inside it',
      ]);
    });

    it('Reads majors, and checks versions against npm ranges', () => {
      expect(getMajor('22.2.6')).toBe(22);
      expect(getMajor('v6.0.0-beta')).toBe(6);
      expect(getMajor(undefined)).toBeUndefined();
      expect(getMajor('next')).toBeUndefined();
      expect(satisfiesRange('6.0.3', '>=6.0 <6.1')).toBe(true);
      expect(satisfiesRange('6.1.0', '>=6.0 <6.1')).toBe(false);
      expect(satisfiesRange('5.9.3', '>=5.8 <6.0')).toBe(true);
      expect(satisfiesRange('7.4.0', '^6.5.3 || ^7.4.0')).toBe(true);
      expect(satisfiesRange('8.0.0', '^6.5.3 || ^7.4.0')).toBe(false);
      expect(satisfiesRange('0.16.3', '~0.15.0 || ~0.16.0')).toBe(true);
      expect(satisfiesRange('0.17.0', '^0.16.0')).toBe(false);
      expect(satisfiesRange('20.3.35', '20.3.35')).toBe(true);
      expect(satisfiesRange('6.0.0-rc', '>=6.0')).toBe(true);
      // Not understood: neither satisfied nor not
      expect(satisfiesRange('6.0.3', '6.x')).toBeUndefined();
      expect(satisfiesRange('6.0.3', '')).toBeUndefined();
      expect(satisfiesRange('latest', '>=6')).toBeUndefined();
    });
  });
});
