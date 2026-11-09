/**
 * Tests of the showcase application's Vite configuration
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Alias, Plugin } from 'vite';
import type { HostInformation } from '../host/index.js';
import {
  HOST_MODULE_ID,
  RESOLVED_HOST_MODULE_ID,
  createHostPlugin,
  getAppDir,
  getReactAliases,
  getShownHostInformation,
  getViteConfiguration,
} from './index.js';

/**
 * Host information of a small host repository
 */
const _HOST: HostInformation = {
  project: { name: 'my <library> & "co"' },
  documentation: [{ path: 'README.md', kind: 'readme', extension: '.md', content: '# Hi' }],
  code: ['src/index.ts'],
};

/**
 * Calls one of a plugin's hooks, which Vite allows to be a function or an object with a `handler`
 * @param plugin The plugin
 * @param name Name of the hook
 * @param args Arguments of the hook
 * @returns What the hook returns
 */
function _call(plugin: Plugin, name: 'resolveId' | 'load' | 'transformIndexHtml', ...args: unknown[]): unknown {
  const hook = plugin[name] as unknown;
  const handler = (typeof hook === 'function' ? hook : (hook as { handler: unknown }).handler) as (...args: unknown[]) => unknown;
  return handler.apply({}, args);
}

/**
 * Applies the aliases to a module id, as Vite's alias resolution does: the first alias that matches replaces the id
 * @param aliases The aliases
 * @param id Module id
 * @returns The replaced id, or undefined if no alias matches
 */
function _alias(aliases: Alias[], id: string): string | undefined {
  const alias = aliases.find((alias) => (alias.find as RegExp).test(id));
  return alias && id.replace(alias.find, alias.replacement);
}

describe('vite', () => {
  // Tests the Vite configuration and its plugin by calling them directly, without starting Vite.

  it('Gets the shown host information, without the code file index', () => {
    expect(getShownHostInformation(_HOST)).toEqual({ project: _HOST.project, documentation: _HOST.documentation });
  });

  describe('createHostPlugin', () => {
    // The plugin's hooks, called as Vite would.

    it('Serves the shown host information as the virtual module', () => {
      let host = getShownHostInformation(_HOST);
      const plugin = createHostPlugin(() => host);
      expect(_call(plugin, 'resolveId', HOST_MODULE_ID)).toBe(RESOLVED_HOST_MODULE_ID);
      expect(_call(plugin, 'resolveId', 'react')).toBeUndefined();
      expect(_call(plugin, 'load', RESOLVED_HOST_MODULE_ID)).toBe(`export default ${JSON.stringify(host)};\n`);
      expect(_call(plugin, 'load', '/main.js')).toBeUndefined();
      // The data is read on every load, so serve can change it
      host = { ...host, documentation: [] };
      expect(_call(plugin, 'load', RESOLVED_HOST_MODULE_ID)).toContain('"documentation":[]');
    });

    it("Sets the page's title to the project's name, escaped", () => {
      const plugin = createHostPlugin(() => getShownHostInformation(_HOST));
      expect(_call(plugin, 'transformIndexHtml', '<head><title>tsshowcase</title></head>')).toBe(
        '<head><title>my &lt;library&gt; &amp; &quot;co&quot;</title></head>',
      );
    });
  });

  it("Aliases React, React DOM and the scheduler, with their subpaths, to tsshowcase's own copies", () => {
    const require = createRequire(import.meta.url);
    const react = dirname(require.resolve('react/package.json'));
    const reactDom = dirname(require.resolve('react-dom/package.json'));
    const aliases = getReactAliases();
    expect(_alias(aliases, 'react')).toBe(react);
    expect(_alias(aliases, 'react/jsx-runtime')).toBe(`${react}/jsx-runtime`);
    expect(_alias(aliases, 'react-dom')).toBe(reactDom);
    expect(_alias(aliases, 'react-dom/client')).toBe(`${reactDom}/client`);
    expect(_alias(aliases, 'scheduler')).toMatch(/[\\/]scheduler$/);
    expect(_alias(aliases, 'react-markdown')).toBeUndefined();
    expect(_alias(aliases, '@fluentui/react-components')).toBeUndefined();
  });

  it("Gets the showcase application's folder beside this module's", () => {
    // From `src/vite/` this is `src/app/`, and from `dist/vite/` it is `dist/app/`: both hold the static `index.html`
    expect(existsSync(join(getAppDir(), 'index.html'))).toBe(true);
  });

  it('Gets the Vite configuration', () => {
    const getHost = () => getShownHostInformation(_HOST);
    const configuration = getViteConfiguration({ appDir: '/app', cacheDir: '/cache', getHost });
    expect(configuration).toMatchObject({ configFile: false, root: '/app', base: './', cacheDir: '/cache', clearScreen: false, logLevel: 'warn' });
    expect((configuration.plugins as Plugin[]).map((plugin) => plugin.name)).toEqual(['tsshowcase-host']);
    expect(configuration.resolve?.alias).toEqual(getReactAliases());
  });
});
