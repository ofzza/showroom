/**
 * Tests of the angular showcase adapter
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Showcase } from '../../../host/index.js';
import { createScratchFolder, REPOSITORY_ROOT, type ScratchFolder } from '../../../testing/index.js';
import { SHOWCASE_FRAME_ROOT_ID } from '../ts/index.js';
import { ANGULAR_PACKAGES, NOT_A_STANDALONE_COMPONENT } from './compile/index.js';
import { AngularShowcaseAdapter, getAngularMountModule, MINIMUM_ANGULAR_VERSION } from './index.js';

/**
 * Creates a showcase for the angular showcase adapter
 * @param kind Kind of the showcase
 * @param entry Path of its entry point
 * @param extra Other fields to set (e.g. options)
 * @returns The showcase
 */
function _showcase(kind: Showcase['kind'], entry: string, extra: Partial<Showcase> = {}): Showcase {
  return {
    id: 'README.md#1',
    documentation: 'README.md',
    line: 1,
    offset: 0,
    kind,
    display: kind === 'code-block' ? 'block' : 'inline',
    adapter: 'angular',
    entry,
    include: [],
    tabs: [{ kind: 'source' }],
    views: ['demo'],
    ...extra,
  };
}

describe('adapters/showcase/angular', () => {
  // Tests the angular showcase adapter without building: its validation, its host check (with a resolver answering from `package.json` files in a
  // scratch folder), and the mount module's source. Its compile and plugins are tested in `compile/` and `plugins/`, its builds by the integration
  // tests.

  const adapter = new AngularShowcaseAdapter();

  it('Supports Angular 20 and later', () => {
    expect(MINIMUM_ANGULAR_VERSION).toBe(20);
  });

  describe('Validation', () => {
    // Tests the entry points and options the adapter accepts, on hand-written showcases.

    it('Accepts TypeScript entry points, with typeCheck on and zone off by default', () => {
      for (const showcase of [_showcase('code-block', 'README.showcase-1.ts'), _showcase('link', 'demos/demo.ts')]) {
        expect(adapter.validate(showcase)).toEqual({ options: { typeCheck: true, zone: false }, errors: [] });
      }
    });

    it('Rejects any other entry point', () => {
      expect(adapter.validate(_showcase('code-block', 'README.showcase-1.js')).errors).toEqual(['The angular showcase adapter needs a "ts" code block']);
      expect(adapter.validate(_showcase('code-block', 'README.showcase-1.tsx')).errors).toEqual(['The angular showcase adapter needs a "ts" code block']);
      expect(adapter.validate(_showcase('link', 'demos/demo.mts')).errors).toEqual([
        'The angular showcase adapter needs a link to a .ts file, not "demos/demo.mts"',
      ]);
    });

    it('Takes typeCheck and zone, both booleans, as its options', () => {
      const options = (value: unknown) => adapter.validate(_showcase('code-block', 'a.ts', { options: value }));
      expect(options({ zone: true })).toEqual({ options: { typeCheck: true, zone: true }, errors: [] });
      expect(options({ typeCheck: false })).toEqual({ options: { typeCheck: false, zone: false }, errors: [] });
      expect(options({ zone: 'yes', allowJs: true }).errors).toEqual([
        'The angular showcase adapter\'s option "zone" must be true or false',
        'Unknown option "allowJs" of the angular showcase adapter; its options are "typeCheck" and "zone"',
      ]);
      expect(options('zone').errors).toEqual(['The angular showcase adapter\'s options must be an object, e.g. "showcase=angular({ typeCheck: false })"']);
    });
  });

  describe('Host check', () => {
    // Tests the host check once per documentation file's folder, with a resolver answering from `package.json` files written into a scratch folder:
    // each folder of a hand-made host repository holds what its packages resolve to.

    let scratch: ScratchFolder;
    beforeAll(async () => {
      scratch = await createScratchFolder('angular-check-');
    });
    afterAll(() => scratch.remove());

    /**
     * Writes a package's `package.json` into the scratch folder
     * @param name The package's name
     * @param version Its version
     * @returns Absolute path of its folder
     */
    async function _package(name: string, version: string): Promise<string> {
      const folder = join(scratch.path, 'packages', `${name}@${version}`);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'package.json'), JSON.stringify({ name, version }));
      return folder;
    }

    /**
     * Creates a resolver answering from the packages written, by the folder asked from
     * @param byFolder The packages' folders, by package name, by the folder (relative to the root, or a package's folder) asked from
     * @returns The resolver
     */
    function _resolver(byFolder: Record<string, Record<string, string>>): (folder: string, name: string) => string | undefined {
      return (folder, name) => {
        const key = folder.startsWith(join(scratch.path, 'packages')) ? folder : folder.slice(join(scratch.path, 'root').length + 1) || '.';
        return byFolder[key]?.[name];
      };
    }

    it('Checks each folder of showcases once, its zone.js only where a showcase sets zone', async () => {
      const angular22 = Object.fromEntries(await Promise.all(ANGULAR_PACKAGES.map(async (name) => [name, await _package(name, '22.2.0')])));
      const angular19 = Object.fromEntries(await Promise.all(ANGULAR_PACKAGES.map(async (name) => [name, await _package(name, '19.2.0')])));
      const typescript6 = await _package('typescript', '6.0.3');
      const typescript7 = await _package('typescript', '7.0.0');
      // ts7's compiler finds TypeScript 7
      const compilerCli7 = await _package('@angular/compiler-cli', '22.2.1');
      const resolver = _resolver({
        '.': { ...angular22, 'zone.js': await _package('zone.js', '0.16.3') },
        old: angular19,
        ts7: { ...angular22, '@angular/compiler-cli': compilerCli7 },
        nozone: angular22,
        missing: {},
        [angular22['@angular/compiler-cli']]: { typescript: typescript6 },
        [angular19['@angular/compiler-cli']]: { typescript: typescript6 },
        [compilerCli7]: { typescript: typescript7 },
      });

      const showcases = [
        _showcase('code-block', 'README.showcase-1.ts', { options: { typeCheck: true, zone: true } }),
        _showcase('code-block', 'old/README.showcase-1.ts', { documentation: 'old/README.md', options: { typeCheck: true, zone: false } }),
        _showcase('code-block', 'old/README.showcase-2.ts', { documentation: 'old/README.md', options: { typeCheck: false, zone: false } }),
        _showcase('code-block', 'ts7/README.showcase-1.ts', { documentation: 'ts7/README.md', options: { typeCheck: false, zone: false } }),
        _showcase('code-block', 'nozone/README.showcase-1.ts', { documentation: 'nozone/README.md', options: { typeCheck: true, zone: true } }),
        _showcase('code-block', 'missing/README.showcase-1.ts', { documentation: 'missing/README.md', options: { typeCheck: true, zone: false } }),
      ];
      const checked = new AngularShowcaseAdapter(resolver).check(join(scratch.path, 'root'), showcases);
      expect(checked).toEqual({
        errors: [
          'the angular showcases of "missing" can\'t be built: "@angular/core", "@angular/common", "@angular/compiler", "@angular/compiler-cli", "@angular/platform-browser" isn\'t installed where it can be found: install it',
          'the angular showcases of "nozone" with "zone: true" need "zone.js", but it isn\'t installed where it can be found: install it',
          ...ANGULAR_PACKAGES.map(
            (name) => `the angular showcases of "old" can't be built: "${name}" 20 or later is needed, but the one found is 19.2.0: upgrade it`,
          ),
          'the angular showcases of "ts7" can\'t be built: "typescript" 5.x or 6.x is needed by Angular\'s compiler, but the one found is 7.0.0',
        ],
        warnings: [],
      });
    });

    it("Finds this repository's own Angular, TypeScript and zone.js", () => {
      expect(adapter.check(REPOSITORY_ROOT, [_showcase('code-block', 'README.showcase-1.ts', { options: { typeCheck: true, zone: true } })])).toEqual({
        errors: [],
        warnings: [],
      });
    });

    it('Fails a build when the host has no Angular, without compiling', async () => {
      const resolver = () => undefined;
      const result = await new AngularShowcaseAdapter(resolver).build({
        root: join(scratch.path, 'root'),
        showcase: _showcase('code-block', 'README.showcase-1.ts'),
        options: { typeCheck: true, zone: false },
        virtualFiles: [],
        hostVirtualFiles: [],
        mode: 'production',
        scratchFolder: scratch.path,
        stack: 'typescript',
      });
      expect(result).toEqual({
        reads: ['README.md'],
        issues: [
          {
            severity: 'error',
            message:
              'the angular showcases of "." can\'t be built: "@angular/core", "@angular/common", "@angular/compiler", "@angular/compiler-cli", "@angular/platform-browser" isn\'t installed where it can be found: install it',
          },
        ],
      });
    });
  });

  describe('Mount module', () => {
    // Tests the mount module's source, zoneless and with zone.js.

    it('Creates the component in the showcase frame root, zoneless, attaching its view, after checking it at run time', () => {
      const source = getAngularMountModule('docs/README.showcase-1.ts', false);
      expect(source.split('\n').slice(0, 3)).toEqual([
        "import { createComponent, NgZone, provideZonelessChangeDetection, reflectComponentType } from '@angular/core';",
        "import { createApplication } from '@angular/platform-browser';",
        'import Showcase from "./README.showcase-1.ts";',
      ]);
      expect(source).toContain(`if (!reflectComponentType(Showcase)?.isStandalone) {\n  console.error(${JSON.stringify(NOT_A_STANDALONE_COMPONENT)});`);
      expect(source).toContain('createApplication({ providers: [provideZonelessChangeDetection()] })');
      expect(source).toContain(`document.getElementById(${JSON.stringify(SHOWCASE_FRAME_ROOT_ID)})`);
      expect(source).toContain('createComponent(Showcase, { environmentInjector: application.injector, hostElement })');
      // Inside Angular's zone, as bootstrapping does, or a timer the component starts never triggers change detection with zone.js
      expect(source).toContain('application.injector.get(NgZone).run(() => {');
      expect(source).toContain('application.attachView(component.hostView);');
      expect(source).not.toContain('zone');
    });

    it('Loads zone.js first, and runs with zone-based change detection, with zone', () => {
      const source = getAngularMountModule('demos/demo.ts', true);
      expect(source.split('\n').slice(0, 2)).toEqual([
        "import 'zone.js';",
        "import { createComponent, NgZone, provideZoneChangeDetection, reflectComponentType } from '@angular/core';",
      ]);
      expect(source).toContain('import Showcase from "./demo.ts";');
      expect(source).toContain('createApplication({ providers: [provideZoneChangeDetection()] })');
    });
  });
});
