/**
 * Tests of the angular showcase adapter's Vite plugins
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXTURES } from '../../../../testing/index.js';
import { findAngular } from '../compile/index.js';
import { ANGULAR_PRODUCTION_DEFINES, createDefinesPlugin, createEmittedModulesPlugin, createLinkerPlugin, loadLinker, type AngularLinker } from './index.js';

/**
 * Calls one of a plugin's hooks, written as a function, on an empty plugin context
 * @param plugin The plugin
 * @param hook The hook's name
 * @param args Its arguments
 * @returns What it returns
 */
function _call(plugin: Plugin, hook: 'load' | 'transform' | 'config', ...args: unknown[]): unknown {
  return (plugin[hook] as (...args: unknown[]) => unknown).call({}, ...args);
}

describe('adapters/showcase/angular/plugins', () => {
  // Tests the plugins' hooks, called directly on an empty plugin context: loading emitted modules (hand-written), the Linker plugin (with a fake
  // Linker, and this repository's own Linker on the `showcase-angular` fixture's partially compiled library), and the defines of each mode.

  describe('Emitted modules', () => {
    // Tests loading the compile's emitted modules by their source's path.

    const plugin = createEmittedModulesPlugin(
      new Map([
        ['/host/README.showcase-1.ts', { code: 'export default class Demo {}', map: '{"version":3}' }],
        ['/host/src/plain.ts', { code: 'export const plain = 1;' }],
      ]),
    );

    it('Loads an emitted module as JavaScript, with its source map', () => {
      expect(_call(plugin, 'load', '/host/README.showcase-1.ts')).toEqual({ code: 'export default class Demo {}', map: '{"version":3}', moduleType: 'js' });
      expect(_call(plugin, 'load', '/host/src/plain.ts')).toEqual({ code: 'export const plain = 1;', moduleType: 'js' });
    });

    it('Leaves other modules, and requests with a query, to the other plugins', () => {
      expect(_call(plugin, 'load', '/host/src/other.ts')).toBeNull();
      expect(_call(plugin, 'load', '/host/src/plain.ts?raw')).toBeNull();
    });
  });

  describe('Linker', () => {
    // Tests the Linker plugin with a fake Linker recording what it links, then this repository's own Linker on a partially compiled library.

    /**
     * Creates a fake Linker linking every module holding `ɵɵngDeclare`
     * @param linked The paths linked, to add to
     * @returns The fake Linker
     */
    const _fake = (linked: string[]): AngularLinker => ({
      needsLinking: (_path, source) => source.includes('ɵɵngDeclare'),
      link: async (path, source) => {
        linked.push(path);
        return { code: source.replace('ɵɵngDeclare', 'ɵɵdefine'), map: { version: 3 } };
      },
    });

    it("Links every JavaScript module that needs it, Angular's own and the host's, with Babel's source map", async () => {
      const linked: string[] = [];
      const plugin = createLinkerPlugin(_fake(linked));
      const declared = 'i0.ɵɵngDeclareComponent({})';
      expect(await _call(plugin, 'transform', declared, '/host/node_modules/@angular/common/fesm2022/common.mjs')).toEqual({
        code: 'i0.ɵɵdefineComponent({})',
        map: { version: 3 },
      });
      expect(await _call(plugin, 'transform', declared, '/host/lib/greeting.component.js?v=1')).toEqual({
        code: 'i0.ɵɵdefineComponent({})',
        map: { version: 3 },
      });
      expect(linked).toEqual(['/host/node_modules/@angular/common/fesm2022/common.mjs', '/host/lib/greeting.component.js']);
    });

    it('Leaves modules that need no linking, TypeScript modules and virtual modules alone', async () => {
      const linked: string[] = [];
      const plugin = createLinkerPlugin(_fake(linked));
      expect(await _call(plugin, 'transform', 'export const a = 1;', '/host/lib/plain.js')).toBeNull();
      expect(await _call(plugin, 'transform', 'i0.ɵɵngDeclareComponent({})', '/host/src/a.ts')).toBeNull();
      expect(await _call(plugin, 'transform', 'i0.ɵɵngDeclareComponent({})', '\0virtual.js')).toBeNull();
      expect(linked).toEqual([]);
    });

    describe("This repository's own Linker", () => {
      // Loads the Linker, and its Babel, from this repository's `@angular/compiler-cli`, and links the fixture's committed library.

      let linker: AngularLinker;
      beforeAll(async () => {
        linker = await loadLinker(findAngular(join(FIXTURES, 'showcase-angular')).packages['@angular/compiler-cli']!.folder);
      });

      it("Links the host's partially compiled library, with a source map", async () => {
        const path = join(FIXTURES, 'showcase-angular', 'lib', 'greeting.component.js');
        const source = readFileSync(path, 'utf8');
        expect(linker.needsLinking(path, source)).toBe(true);
        const linked = await linker.link(path, source);
        expect(linked?.code).toContain('ɵɵdefineComponent');
        expect(linked?.code).not.toContain('ɵɵngDeclare');
        expect(linked?.map).toMatchObject({ version: 3 });
        expect(linker.needsLinking(path, linked!.code)).toBe(false);
      });
    });
  });

  describe('Defines', () => {
    // Tests the configuration each mode's plugin adds.

    it("Defines Angular's globals false in production, and nothing in development", () => {
      expect(_call(createDefinesPlugin('production'), 'config')).toEqual({
        define: { ngDevMode: 'false', ngJitMode: 'false', ngI18nClosureMode: 'false', ngServerMode: 'false', ngHmrMode: 'false' },
      });
      expect(ANGULAR_PRODUCTION_DEFINES).toHaveLength(5);
      expect(_call(createDefinesPlugin('development'), 'config')).toEqual({});
    });
  });
});
