/**
 * Tests of the showcase adapter registry
 */

import { realpathSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Showcase } from '../../../host/index.js';
import { copyFixture, createScratchFolder, createTestProject } from '../../../testing/index.js';
import { CsShowcaseAdapter } from '../cs/index.js';
import { HtmlShowcaseAdapter } from '../html/index.js';
import { JsonSchemaShowcaseAdapter } from '../jsonschema/index.js';
import { AngularShowcaseAdapter } from '../angular/index.js';
import { ReactShowcaseAdapter } from '../react/index.js';
import { TsShowcaseAdapter } from '../ts/index.js';
import {
  checkHostCheckResult,
  checkRecordedDeclarations,
  createShowcaseAdapter,
  DEFAULT_SHOWCASE_VIEWS,
  getDefaultViews,
  getShowcaseAdapterEnvironmentNames,
  getShowcaseAdapterNames,
  getTrustExecutables,
  getTrustTools,
  loadCustomShowcaseAdapters,
  PLANNED_SHOWCASE_ADAPTER_NAMES,
  usesMermaidBundle,
} from './index.js';

/**
 * Path of the fixture host repository listing custom showcase adapters
 */
const _ROOT = fileURLToPath(new URL('../../../../test/fixtures/showcase-adapters', import.meta.url));

describe('adapters/showcase/registry', () => {
  // Tests the built-in showcase adapters' registry, and loading custom showcase adapters from the `showcase-adapters` fixture, which lists one per
  // way of getting it wrong. Each module's default export is a factory of showcase adapter objects.

  it('Lists and creates the built-in showcase adapters', () => {
    expect(getShowcaseAdapterNames()).toEqual(['angular', 'cs', 'html', 'jsonschema', 'react', 'ts']);
    expect(createShowcaseAdapter('html')).toBeInstanceOf(HtmlShowcaseAdapter);
    expect(createShowcaseAdapter('html')).not.toBe(createShowcaseAdapter('html'));
    expect(createShowcaseAdapter('ts')).toBeInstanceOf(TsShowcaseAdapter);
    expect(createShowcaseAdapter('react')).toBeInstanceOf(ReactShowcaseAdapter);
    expect(createShowcaseAdapter('angular')).toBeInstanceOf(AngularShowcaseAdapter);
    expect(createShowcaseAdapter('cs')).toBeInstanceOf(CsShowcaseAdapter);
    expect(createShowcaseAdapter('jsonschema')).toBeInstanceOf(JsonSchemaShowcaseAdapter);
    expect(createShowcaseAdapter('toString')).toBeUndefined();
  });

  it("Gets each showcase adapter's default views", () => {
    // Plain TypeScript is more often logic than UI, so its code and console show by default
    expect(getDefaultViews(createShowcaseAdapter('html')!)).toEqual(['demo']);
    expect(getDefaultViews(createShowcaseAdapter('ts')!)).toEqual(['source', 'console']);
    expect(getDefaultViews(createShowcaseAdapter('react')!)).toEqual(['demo']);
    expect(getDefaultViews(createShowcaseAdapter('angular')!)).toEqual(['demo']);
    expect(getDefaultViews(createShowcaseAdapter('cs')!)).toEqual(['source', 'console']);
    expect(getDefaultViews(createShowcaseAdapter('jsonschema')!)).toEqual(['demo']);
    expect(DEFAULT_SHOWCASE_VIEWS).toEqual(['demo']);
    expect(getDefaultViews({ validate: () => ({ errors: [] }), build: async () => ({ reads: [] }) })).toEqual(['demo']);
  });

  it('Reserves no planned built-in name once jsonschema is built in, refusing it to custom showcase adapters', async () => {
    // See PLAN-P21 D833: jsonschema was reserved from P21.1 until P21.2 built it in (as cs was until P20.2, D781)
    expect(PLANNED_SHOWCASE_ADAPTER_NAMES).toEqual([]);
    const { adapters, errors } = await loadCustomShowcaseAdapters(_ROOT, { jsonschema: './adapters/good.js' });
    expect(adapters.size).toBe(0);
    expect(errors).toEqual(['Custom showcase adapter "jsonschema": the name is taken by a built-in showcase adapter']);
  });

  it('Lets only built-in showcase adapters use the shared Mermaid bundle', () => {
    // Only jsonschema uses it (PLAN-P21 D832); other names are given to test the guard on custom showcase adapters
    expect(getShowcaseAdapterNames().filter((name) => usesMermaidBundle(name))).toEqual(['jsonschema']);
    expect(usesMermaidBundle('html', ['html'])).toBe(true);
    expect(usesMermaidBundle('ts', ['html'])).toBe(false);
    expect(usesMermaidBundle('good', ['good'])).toBe(false);
    expect(usesMermaidBundle('toString', ['toString'])).toBe(false);
  });

  it("Passes DOTNET_ROOT on to the cs showcase adapter's commands only", () => {
    expect(getShowcaseAdapterEnvironmentNames('cs')).toEqual(['DOTNET_ROOT']);
    expect(getShowcaseAdapterEnvironmentNames('ts')).toEqual([]);
  });

  it('Loads custom showcase adapters', async () => {
    const { adapters, errors } = await loadCustomShowcaseAdapters(_ROOT, { good: './adapters/good.js', 'good-mjs': 'adapters/good.mjs' });
    expect(errors).toEqual([]);
    expect([...adapters.keys()]).toEqual(['good', 'good-mjs']);
    expect(await adapters.get('good')!.check!(_ROOT, [], { project: createTestProject(), stack: 'typescript' })).toEqual({
      errors: ['good needs nothing, but says so'],
      warnings: [],
    });
  });

  it('Loads the default views a custom showcase adapter declares', async () => {
    const { adapters, errors } = await loadCustomShowcaseAdapters(_ROOT, { views: './adapters/views.js', good: './adapters/good.js' });
    expect(errors).toEqual([]);
    expect(getDefaultViews(adapters.get('views')!)).toEqual(['source', 'console']);
    expect(getDefaultViews(adapters.get('good')!)).toEqual(['demo']);
  });

  it('Creates fresh custom showcase adapter objects on every load', async () => {
    // Each run gets its own objects, so one closed at the end of a run is never used again; the unchanged module itself is only loaded once
    const first = await loadCustomShowcaseAdapters(_ROOT, { good: './adapters/good.js' });
    const second = await loadCustomShowcaseAdapters(_ROOT, { good: './adapters/good.js' });
    expect(first.adapters.get('good')).not.toBe(second.adapters.get('good'));
    expect(first.adapters.get('good')!.build).not.toBe(second.adapters.get('good')!.build);
  });

  it('Loads a custom showcase adapter module again once it changed', async () => {
    // A long-running `serve` picks up an edited custom showcase adapter without a restart; on a scratch copy, as the fixtures are never written to
    const scratch = await copyFixture('showcase-adapters');
    try {
      const listed = { good: './adapters/good.js' };
      const first = await loadCustomShowcaseAdapters(scratch.path, listed);
      expect(await first.adapters.get('good')!.check!(scratch.path, [], { project: createTestProject(), stack: 'typescript' })).toEqual({
        errors: ['good needs nothing, but says so'],
        warnings: [],
      });
      await writeFile(
        join(scratch.path, 'adapters', 'good.js'),
        "export default () => ({ validate: (s) => ({ options: s.options, errors: [] }), check: () => ({ errors: ['edited'], warnings: [] }), build: async () => ({ errors: [{ message: 'x' }] }) });\n",
      );
      const second = await loadCustomShowcaseAdapters(scratch.path, listed);
      expect(await second.adapters.get('good')!.check!(scratch.path, [], { project: createTestProject(), stack: 'typescript' })).toEqual({
        errors: ['edited'],
        warnings: [],
      });
    } finally {
      await scratch.remove();
    }
  });

  it('Reports every custom showcase adapter that does not load', async () => {
    const { adapters, errors } = await loadCustomShowcaseAdapters(_ROOT, {
      html: './adapters/good.js',
      react: './adapters/good.js',
      Bad_Name: './adapters/good.js',
      outside: '../outside.js',
      root: '.',
      missing: './adapters/missing.js',
      typescript: './adapters/adapter.ts',
      folder: './adapters/folder.js',
      'no-default': './adapters/no-default.js',
      incomplete: './adapters/incomplete.js',
      throws: './adapters/throws.js',
      object: './adapters/object.js',
      'factory-throws': './adapters/factory-throws.js',
      'returns-nothing': './adapters/returns-nothing.js',
      'views-repeated': './adapters/views-repeated.js',
      'views-not-list': './adapters/views-not-list.js',
    });
    expect(adapters.size).toBe(0);
    expect(errors).toEqual([
      'Custom showcase adapter "html": the name is taken by a built-in showcase adapter',
      'Custom showcase adapter "react": the name is taken by a built-in showcase adapter',
      'Custom showcase adapter "Bad_Name": invalid name: use lower-case letters, digits and "-", starting with a letter',
      'Custom showcase adapter "outside": "../outside.js" is outside the host repository',
      'Custom showcase adapter "root": "." is outside the host repository',
      'Custom showcase adapter "missing": "./adapters/missing.js" not found',
      'Custom showcase adapter "typescript": "./adapters/adapter.ts" must be a .js or .mjs file',
      'Custom showcase adapter "folder": "./adapters/folder.js" not found',
      'Custom showcase adapter "no-default": "./adapters/no-default.js" must have a default export: a function returning an object implementing the showcase adapter interface',
      'Custom showcase adapter "incomplete": "./adapters/incomplete.js"\'s default export must return an object implementing the showcase adapter interface; check "build", "check"',
      'Custom showcase adapter "throws": "./adapters/throws.js" failed to load: broken on purpose',
      'Custom showcase adapter "object": "./adapters/object.js" must have a default export: a function returning an object implementing the showcase adapter interface',
      'Custom showcase adapter "factory-throws": "./adapters/factory-throws.js" failed to create its showcase adapter: factory broke',
      'Custom showcase adapter "returns-nothing": "./adapters/returns-nothing.js"\'s default export must return an object implementing the showcase adapter interface',
      'Custom showcase adapter "views-repeated": "./adapters/views-repeated.js"\'s showcase adapter has invalid "defaultViews": repeated view "demo"',
      'Custom showcase adapter "views-not-list": "./adapters/views-not-list.js"\'s showcase adapter has invalid "defaultViews": it must be a list of views',
    ]);
  });

  it('Checks what a host check returned', () => {
    expect(checkHostCheckResult({ errors: [], warnings: [] })).toEqual({ errors: [], warnings: [] });
    expect(checkHostCheckResult({ errors: ['e'], warnings: ['w'], extra: 1 })).toEqual({ errors: ['e'], warnings: ['w'] });
    const problem = (result: unknown) => (checkHostCheckResult(result) as { problem?: string }).problem;
    // A list is what check() returned before { errors, warnings }: its problem names the change
    expect(problem(['missing'])).toBe(
      'it returned a list; since the host check returns { errors, warnings }, return the list as "errors", with "warnings: []"',
    );
    expect(problem(undefined)).toBe('it must return { errors, warnings }, two lists of strings');
    expect(problem('missing')).toBe('it must return { errors, warnings }, two lists of strings');
    expect(problem({ warnings: [] })).toBe('"errors" must be a list of strings');
    expect(problem({ errors: [1], warnings: [] })).toBe('"errors" must be a list of strings');
    expect(problem({ errors: [] })).toBe('"warnings" must be a list of strings');
    expect(problem({ errors: [], warnings: 'w' })).toBe('"warnings" must be a list of strings');
  });

  describe('getTrustTools', () => {
    // The tools a trust request names for each built-in showcase adapter, resolved by a fake resolver answering from made-up folders (which have no
    // real path, so they are named as given): a package is found for a folder only where the resolver knows it.

    const root = join(process.cwd(), 'host');
    const installed: Record<string, string[]> = {
      [root]: ['typescript', 'sass', '@angular/compiler-cli'],
      [join(root, 'docs')]: ['less'],
      '/pkgs/@angular/compiler-cli': ['typescript'],
    };
    const resolver = (folder: string, name: string) => {
      if (!installed[folder]?.includes(name)) return undefined;
      return name === 'typescript' && folder.startsWith('/pkgs')
        ? '/pkgs/angular-typescript'
        : name.startsWith('@')
          ? `/pkgs/${name}`
          : `${folder}/node_modules/${name}`;
    };
    const showcase = (documentation: string, options?: object) => ({ documentation, ...(options ? { options } : {}) }) as Showcase;

    it('Names TypeScript where showcases type check, and the CSS preprocessors, for the ts and react showcase adapters', () => {
      expect(getTrustTools('ts', root, [showcase('README.md'), showcase('docs/guide.md'), showcase('README.md')], resolver)).toEqual([
        { name: 'less', path: join(root, 'docs', 'node_modules', 'less') },
        { name: 'sass', path: join(root, 'node_modules', 'sass') },
        { name: 'typescript', path: join(root, 'node_modules', 'typescript') },
      ]);
      // No type check, no TypeScript
      expect(getTrustTools('react', root, [showcase('README.md', { typeCheck: false })], resolver).map(({ name }) => name)).toEqual(['sass']);
    });

    it("Names Angular's compiler and its own TypeScript for the angular showcase adapter, whatever its type check", () => {
      expect(getTrustTools('angular', root, [showcase('README.md', { typeCheck: false })], resolver)).toEqual([
        { name: '@angular/compiler-cli', path: '/pkgs/@angular/compiler-cli' },
        { name: 'sass', path: join(root, 'node_modules', 'sass') },
        { name: 'typescript', path: '/pkgs/angular-typescript' },
      ]);
    });

    it('Names nothing for the html showcase adapter, or any other', () => {
      expect(getTrustTools('html', root, [showcase('README.md')], resolver)).toEqual([]);
      expect(getTrustTools('needy', root, [showcase('README.md')], resolver)).toEqual([]);
    });

    it('Names a tool by its real path', () => {
      // This repository's own TypeScript, as Node resolves it from here
      const [typescript] = getTrustTools('ts', process.cwd(), [showcase('README.md')]).filter(({ name }) => name === 'typescript');
      expect(typescript.path).toBe(realpathSync(join(process.cwd(), 'node_modules', 'typescript')));
    });
  });

  it('Checks the declarations about recording and the host copy', () => {
    // PLAN-P20 D769, D774, D790 C3: a custom showcase adapter's are checked when it loads
    expect(checkRecordedDeclarations({})).toBeUndefined();
    expect(checkRecordedDeclarations({ recorded: true, defaultViews: ['source', 'console'], hostCopy: { exclude: ['bin/'], git: false } })).toBeUndefined();
    expect(checkRecordedDeclarations({ recorded: 'yes' })).toBe('has invalid "recorded": it must be a boolean');
    for (const defaultViews of [undefined, ['demo', 'console']]) {
      expect(checkRecordedDeclarations({ recorded: true, defaultViews })).toBe(
        'records its showcases, so it must declare "defaultViews", without "demo" (its showcases have no showcase frame)',
      );
    }
    for (const hostCopy of [true, { exclude: 'bin/', git: false }, { exclude: [], git: 'no' }]) {
      expect(checkRecordedDeclarations({ hostCopy })).toBe('has invalid "hostCopy": it must be { exclude, git }, a list of patterns and a boolean');
    }
  });

  it('Names no executable for the built-in showcase adapters that start none', () => {
    expect(getTrustExecutables('ts', _ROOT, [], () => '/usr/bin/dotnet')).toEqual([]);
  });

  it("Names the cs showcase adapter's dotnet, and the SDK folders global.json names inside the host repository", async () => {
    // See PLAN-P20 D789: dotnet comes from the PATH outside the root; sdk.paths inside the root are named, as its builds may use an SDK shipped there
    const scratch = await createScratchFolder('trust-cs-');
    try {
      const excluded: (readonly string[])[] = [];
      const resolver = (command: string, folders: readonly string[]) => {
        excluded.push(folders);
        return command === 'dotnet' ? join(scratch.path, 'dotnet') : undefined;
      };
      expect(getTrustExecutables('cs', scratch.path, [], resolver)).toEqual([{ name: 'dotnet', path: join(scratch.path, 'dotnet') }]);
      expect(excluded).toEqual([[scratch.path]]);
      await writeFile(join(scratch.path, 'global.json'), '{ "sdk": { "paths": [".dotnet", "$host$", "/opt/dotnet"] } }');
      expect(getTrustExecutables('cs', scratch.path, [], () => undefined)).toEqual([{ name: 'dotnet SDK (global.json)', path: join(scratch.path, '.dotnet') }]);
    } finally {
      await scratch.remove();
    }
  });
});
