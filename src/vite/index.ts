/**
 * The Vite configuration of the showroom, shared by `showroom serve` and `showroom build`: Vite's root is the application's folder inside
 * the package (`dist/app/`), the shown host information is served as a virtual module, and React is always `showroom`'s own copy. Internal: not
 * re-exported.
 */

import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Alias, InlineConfig, Plugin } from 'vite';
import type { HostInformation } from '../host/index.js';
import type { ShownHostInformation } from '../app/host/index.js';

// #region Shown host information

/**
 * Id of the virtual module serving the shown host information, which the showroom's entry point imports
 */
export const HOST_MODULE_ID = 'virtual:showroom-host';

/**
 * Id the virtual module is resolved to; the `\0` prefix keeps other plugins from treating it as a file
 */
export const RESOLVED_HOST_MODULE_ID = `\0${HOST_MODULE_ID}`;

/**
 * Gets the shown host information: the part of the host information the showroom presents
 * @param host Host information
 * @returns The project information and documentation files, without the code file index
 */
export function getShownHostInformation(host: HostInformation): ShownHostInformation {
  return { project: host.project, documentation: host.documentation };
}

/**
 * Escapes text for HTML
 * @param text Text to escape
 * @returns The text with `&`, `<`, `>` and `"` escaped
 */
function _escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Creates the Vite plugin serving the shown host information as the `virtual:showroom-host` module, and setting the page's `<title>` to the project's name
 * @param getHost Gets the shown host information to serve; called on every load, so it can change while serving
 * @returns The Vite plugin
 */
export function createHostPlugin(getHost: () => ShownHostInformation): Plugin {
  return {
    name: 'showroom-host',
    resolveId: (id) => (id === HOST_MODULE_ID ? RESOLVED_HOST_MODULE_ID : undefined),
    load: (id) => (id === RESOLVED_HOST_MODULE_ID ? `export default ${JSON.stringify(getHost())};\n` : undefined),
    transformIndexHtml: (html) => html.replace(/<title>[^<]*<\/title>/, `<title>${_escapeHtml(getHost().project.name)}</title>`),
  };
}

// #endregion

// #region React aliases

/**
 * Gets the aliases resolving React, React DOM and the scheduler to `showroom`'s own copies, so a host repository's different React (e.g. one FluentUI is
 * hoisted next to) never mixes in, which would break hooks
 * @returns The aliases, matching each package and its subpaths (e.g. `react/jsx-runtime`, `react-dom/client`)
 */
export function getReactAliases(): Alias[] {
  const require = createRequire(import.meta.url);
  const reactDomPath = require.resolve('react-dom/package.json');
  const packages: [string, string][] = [
    ['react', require.resolve('react/package.json')],
    ['react-dom', reactDomPath],
    ['scheduler', createRequire(reactDomPath).resolve('scheduler/package.json')],
  ];
  return packages.map(([name, packageJson]) => ({ find: new RegExp(`^${name}(/.*)?$`), replacement: `${dirname(packageJson)}$1` }));
}

// #endregion

// #region Configuration

/**
 * Gets the folder of the showroom inside the package: `dist/app/`, holding its static `index.html` and its compiled code
 * @returns Path of the folder
 */
export function getAppDir(): string {
  return fileURLToPath(new URL('../app/', import.meta.url));
}

/**
 * Represents the options of the showroom's Vite configuration
 */
export interface ViteConfigurationOptions {
  /**
   * Folder of the showroom, Vite's root (see getAppDir())
   */
  appDir: string;
  /**
   * Vite's cache folder: a fresh folder per run, outside the package and the host repository
   */
  cacheDir: string;
  /**
   * Gets the shown host information to serve or build
   */
  getHost: () => ShownHostInformation;
}

/**
 * Gets the Vite configuration of the showroom. It reads no Vite configuration file, and uses relative asset paths (`base: './'`), so the
 * built application works on static hosting under any path.
 * @param options Options of the configuration
 * @returns Vite's inline configuration; `serve` and `build` add their own `server` and `build` options
 */
export function getViteConfiguration({ appDir, cacheDir, getHost }: ViteConfigurationOptions): InlineConfig {
  return {
    configFile: false,
    root: appDir,
    base: './',
    cacheDir,
    clearScreen: false,
    logLevel: 'warn',
    plugins: [createHostPlugin(getHost)],
    resolve: { alias: getReactAliases() },
  };
}

// #endregion
