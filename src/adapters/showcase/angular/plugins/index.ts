/**
 * The `angular` showcase adapter's Vite plugins, added to the `ts` showcase adapter's build: loading the modules Angular's compiler emitted, the
 * Angular Linker (a Babel plugin, run with the host compiler's own Babel) completing every JavaScript module Angular ships partially compiled, and
 * the production mode's defines. Node code. Internal, never re-exported.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';
import { readPackageJson } from '../../ts/typecheck/index.js';
import type { EmittedModule } from '../compile/index.js';

// #region Emitted modules

/**
 * Gets the path of a module id, without its query, its separators `/`
 * @param id The module id
 * @returns The path
 */
function _getPath(id: string): string {
  const at = id.indexOf('?');
  return (at < 0 ? id : id.slice(0, at)).split('\\').join('/');
}

/**
 * Creates the Vite plugin loading the modules Angular's compiler emitted (see compileAngularShowcase()), by their source's absolute path, as
 * JavaScript with their source maps; it must come before the virtual files' plugin, which would load a virtual entry point's TypeScript
 * @param emitted The emitted modules, by the absolute path of their source (`/` separators)
 * @returns The Vite plugin
 */
export function createEmittedModulesPlugin(emitted: ReadonlyMap<string, EmittedModule>): Plugin {
  return {
    name: 'showroom-angular-emitted',
    enforce: 'pre',
    load(id) {
      if (id.includes('?')) return null;
      const module = emitted.get(_getPath(id));
      return module ? { code: module.code, ...(module.map === undefined ? {} : { map: module.map }), moduleType: 'js' } : null;
    },
  };
}

// #endregion

// #region Linker

/**
 * Represents the Angular Linker, loaded from the host's `@angular/compiler-cli`, with its Babel
 */
export interface AngularLinker {
  /**
   * Checks if a module needs linking (Angular's `needsLinking()`: a check of its content)
   * @param path The module's path
   * @param source The module's source
   * @returns True if it does
   */
  needsLinking(path: string, source: string): boolean;
  /**
   * Links a module with Babel
   * @param path The module's path
   * @param source The module's source
   * @returns The linked code and its source map, or undefined if Babel returns nothing
   */
  link(path: string, source: string): Promise<{ code: string; map?: unknown } | undefined>;
}

/**
 * Represents the few parts of `@babel/core` the Linker needs
 */
interface _Babel {
  transformAsync(code: string, options: Record<string, unknown>): Promise<{ code?: string | null; map?: unknown } | null>;
}

/**
 * Gets a subpath's module from a package's `exports`
 * @param folder Absolute path of the package's folder
 * @param subpath The subpath, e.g. `./linker`
 * @param fallback The module's path relative to the package, when its `exports` don't name it
 * @returns Absolute path of the module
 */
function _getExport(folder: string, subpath: string, fallback: string): string {
  const exports = readPackageJson(folder)?.exports as Record<string, string | { default?: string } | undefined> | undefined;
  const entry = exports?.[subpath];
  return join(folder, (typeof entry === 'string' ? entry : entry?.default) ?? fallback);
}

/**
 * Loads the Angular Linker from the host's `@angular/compiler-cli`, with the `@babel/core` resolved from its own folder (Node ignores
 * `import.meta.resolve()`'s parent), once per process (Node keeps the modules it loaded)
 * @param compilerCli Absolute path of the `@angular/compiler-cli` package's folder
 * @returns The Linker
 */
export async function loadLinker(compilerCli: string): Promise<AngularLinker> {
  const load = async <TModule>(path: string) => (await import(pathToFileURL(path).href)) as TModule;
  const core = await load<{ needsLinking(path: string, source: string): boolean }>(_getExport(compilerCli, './linker', 'bundles/linker/index.js'));
  const babelPlugin = await load<{ default: unknown }>(_getExport(compilerCli, './linker/babel', 'bundles/linker/babel/index.js'));
  // Its functions are named exports, or a CommonJS build's default export's
  const babel = await load<Partial<_Babel> & { default?: _Babel }>(createRequire(join(compilerCli, 'package.json')).resolve('@babel/core'));
  const transform = (babel.transformAsync ? babel : babel.default) as _Babel;
  return {
    needsLinking: (path, source) => core.needsLinking(path, source),
    link: async (path, source) => {
      const result = await transform.transformAsync(source, {
        filename: path,
        configFile: false,
        babelrc: false,
        compact: false,
        sourceMaps: true,
        plugins: [[babelPlugin.default, { linkerJitMode: false }]],
      });
      return typeof result?.code === 'string' ? { code: result.code, ...(result.map ? { map: result.map } : {}) } : undefined;
    },
  };
}

/**
 * Pattern of the modules the Linker looks at: JavaScript modules
 */
const _JAVASCRIPT = /\.[cm]?js$/i;

/**
 * Creates the Vite plugin running the Angular Linker on every JavaScript module that needs it, Angular's own packages' and the host's own
 * partially compiled libraries' alike, with Babel's source map
 * @param linker The Linker (see loadLinker())
 * @returns The Vite plugin
 */
export function createLinkerPlugin(linker: AngularLinker): Plugin {
  return {
    name: 'showroom-angular-linker',
    async transform(code, id) {
      const path = _getPath(id);
      if (id.startsWith('\0') || !_JAVASCRIPT.test(path) || !linker.needsLinking(path, code)) return null;
      const linked = await linker.link(path, code);
      return linked ? { code: linked.code, map: (linked.map ?? null) as null } : null;
    },
  };
}

// #endregion

// #region Defines

/**
 * The globals Angular's packages read, defined `false` in production (without `ngServerMode`, a production build fails at run time); development
 * defines none, so Angular's development checks run
 */
export const ANGULAR_PRODUCTION_DEFINES: readonly string[] = ['ngDevMode', 'ngJitMode', 'ngI18nClosureMode', 'ngServerMode', 'ngHmrMode'];

/**
 * Creates the Vite plugin defining Angular's globals for the build's mode (see ANGULAR_PRODUCTION_DEFINES), from the request's mode, never
 * `process.env.NODE_ENV`
 * @param mode Mode the showcase is built in
 * @returns The Vite plugin
 */
export function createDefinesPlugin(mode: 'development' | 'production'): Plugin {
  return {
    name: 'showroom-angular-defines',
    config() {
      return mode === 'production' ? { define: Object.fromEntries(ANGULAR_PRODUCTION_DEFINES.map((name) => [name, 'false'])) } : {};
    },
  };
}

// #endregion
