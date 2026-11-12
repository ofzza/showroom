/**
 * Tests of the showroom's Vite configuration
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Alias, Plugin } from 'vite';
import type { HostInformation } from '../host/index.js';
import { getShowcaseFrameHash, type ShowcaseFrame } from '../showcases/index.js';
import {
  HOST_MODULE_ID,
  RESOLVED_HOST_MODULE_ID,
  createHostPlugin,
  createShowcaseFramesMiddleware,
  createShowcaseFramesPlugin,
  getAppDir,
  getContentType,
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
  showcases: [
    { id: 'README.md#1', documentation: 'README.md', line: 3, offset: 10, kind: 'inline', adapter: 'html', entry: 'README.showcase-1.html' },
    { id: 'my docs/a #1.md#2', documentation: 'my docs/a #1.md', line: 5, offset: 40, kind: 'linked', adapter: 'x', entry: 'demo.html' },
  ],
  virtualFiles: [],
};

/**
 * Showcase frames of the host repository's showcases
 */
const _FRAMES = new Map<string, ShowcaseFrame>([
  ['README.md#1', { folder: 'showcases/README.md/1', page: 'index.html', files: [{ path: 'index.html', content: '<p>1</p>' }], reads: [] }],
  [
    'my docs/a #1.md#2',
    {
      folder: 'showcases/my docs/a #1.md/2',
      page: 'pages/index.html',
      files: [
        { path: 'pages/index.html', content: '<p>2</p>' },
        { path: 'a.png', content: new Uint8Array([1, 2]) },
      ],
      reads: [],
    },
  ],
]);

/**
 * Gets the hash of one of the showcase frames
 * @param id Id of its showcase
 * @returns The hash
 */
function _hash(id: string): string {
  return getShowcaseFrameHash(_FRAMES.get(id)!.files);
}

/**
 * Calls one of a plugin's hooks, which Vite allows to be a function or an object with a `handler`
 * @param plugin The plugin
 * @param name Name of the hook
 * @param args Arguments of the hook
 * @returns What the hook returns
 */
function _call(plugin: Plugin, name: 'resolveId' | 'load' | 'transformIndexHtml' | 'generateBundle', ...args: unknown[]): unknown {
  return _callWith({}, plugin, name, ...args);
}

/**
 * Calls one of a plugin's hooks with a given `this`, as Vite would
 * @param context The hook's `this`
 * @param plugin The plugin
 * @param name Name of the hook
 * @param args Arguments of the hook
 * @returns What the hook returns
 */
function _callWith(context: object, plugin: Plugin, name: 'resolveId' | 'load' | 'transformIndexHtml' | 'generateBundle', ...args: unknown[]): unknown {
  const hook = plugin[name] as unknown;
  const handler = (typeof hook === 'function' ? hook : (hook as { handler: unknown }).handler) as (...args: unknown[]) => unknown;
  return handler.apply(context, args);
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

  it('Gets the shown host information, without the code file index, nor showcases without showcase frames', () => {
    expect(getShownHostInformation(_HOST)).toEqual({ project: _HOST.project, documentation: _HOST.documentation, showcases: [] });
  });

  it('Gets the shown showcases with their showcase frames, by URL-encoded relative URLs', () => {
    expect(getShownHostInformation(_HOST, _FRAMES).showcases).toEqual([
      { id: 'README.md#1', documentation: 'README.md', offset: 10, url: `showcases/README.md/1/index.html?hash=${_hash('README.md#1')}` },
      {
        id: 'my docs/a #1.md#2',
        documentation: 'my docs/a #1.md',
        offset: 40,
        url: `showcases/my%20docs/a%20%231.md/2/pages/index.html?hash=${_hash('my docs/a #1.md#2')}`,
      },
    ]);
    expect(getShownHostInformation(_HOST, new Map([['README.md#1', _FRAMES.get('README.md#1')!]])).showcases.map(({ id }) => id)).toEqual(['README.md#1']);
  });

  it("Emits the showcase frames' files into the build", () => {
    const emitted: unknown[] = [];
    const plugin = createShowcaseFramesPlugin(() => _FRAMES);
    _callWith({ emitFile: (file: unknown) => emitted.push(file) }, plugin, 'generateBundle');
    expect(emitted).toEqual([
      { type: 'asset', fileName: 'showcases/README.md/1/index.html', source: '<p>1</p>' },
      { type: 'asset', fileName: 'showcases/my docs/a #1.md/2/pages/index.html', source: '<p>2</p>' },
      { type: 'asset', fileName: 'showcases/my docs/a #1.md/2/a.png', source: new Uint8Array([1, 2]) },
    ]);
  });

  describe('createShowcaseFramesMiddleware', () => {
    // The dev server's middleware, called with fake requests and responses, on the showcase frames above.

    /**
     * Requests a path from the middleware
     * @param url URL of the request
     * @param method Method of the request
     * @returns The response's status, headers and body, or `next` if the request went on to Vite
     */
    const request = (url: string, method = 'GET') => {
      const response = { statusCode: 0, headers: {} as Record<string, unknown>, body: undefined as Buffer | string | undefined };
      let passed = false;
      createShowcaseFramesMiddleware(() => _FRAMES)(
        { url, method } as IncomingMessage,
        {
          set statusCode(code: number) {
            response.statusCode = code;
          },
          setHeader: (name: string, value: unknown) => void (response.headers[name] = value),
          end: (body?: Buffer | string) => void (response.body = body),
        } as unknown as ServerResponse,
        () => (passed = true),
      );
      return passed ? 'next' : response;
    };

    it("Serves a showcase frame's files, with their content types, never cached", () => {
      const page = request('/showcases/README.md/1/index.html?hash=0123abcd&theme=dark');
      expect(page).toMatchObject({
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': 8 },
      });
      expect(String((page as { body: Buffer }).body)).toBe('<p>1</p>');
      const image = request('/showcases/my%20docs/a%20%231.md/2/a.png');
      expect(image).toMatchObject({ statusCode: 200, headers: { 'Content-Type': 'image/png' } });
      expect([...(image as { body: Buffer }).body]).toEqual([1, 2]);
    });

    it('Decodes each path segment, an encoded space and "#" included', () => {
      expect(request('/showcases/my%20docs/a%20%231.md/2/pages/index.html')).toMatchObject({ statusCode: 200 });
    });

    it("Answers a missing file in a showcase frame's folder with a 404", () => {
      expect(request('/showcases/README.md/1/missing.js')).toMatchObject({ statusCode: 404, headers: { 'Cache-Control': 'no-store' } });
    });

    it('Answers HEAD without a body', () => {
      expect(request('/showcases/README.md/1/index.html', 'HEAD')).toMatchObject({ statusCode: 200, body: undefined });
    });

    it('Passes every other request on to Vite', () => {
      // The showroom's own modules are served from `showcases/` too (src/app/showcases/)
      expect(request('/showcases/index.js')).toBe('next');
      expect(request('/showcases/README.md/10/index.html')).toBe('next');
      expect(request('/')).toBe('next');
      expect(request('/showcases/README.md/1/index.html', 'POST')).toBe('next');
      expect(request('/showcases/%E0%A4%A/index.html')).toBe('next');
    });

    it('Gets content types by extension, case-insensitively', () => {
      expect(getContentType('a/b.JS')).toBe('text/javascript; charset=utf-8');
      expect(getContentType('style.css')).toBe('text/css; charset=utf-8');
      expect(getContentType('font.woff2')).toBe('font/woff2');
      expect(getContentType('data.bin')).toBe('application/octet-stream');
      expect(getContentType('README')).toBe('application/octet-stream');
      expect(getContentType('toString')).toBe('application/octet-stream');
    });

    it('Is added to the dev server by the plugin', () => {
      const used: unknown[] = [];
      const plugin = createShowcaseFramesPlugin(() => _FRAMES);
      (plugin.configureServer as (server: unknown) => void)({ middlewares: { use: (middleware: unknown) => used.push(middleware) } });
      expect(used).toHaveLength(1);
      expect(typeof used[0]).toBe('function');
    });
  });

  describe('createHostPlugin', () => {
    // The plugin's hooks, called as Vite would.

    it('Serves the shown host information as the virtual module', () => {
      let host = getShownHostInformation(_HOST);
      const plugin = createHostPlugin(() => host);
      expect(_call(plugin, 'resolveId', HOST_MODULE_ID)).toBe(RESOLVED_HOST_MODULE_ID);
      expect(_call(plugin, 'resolveId', 'react')).toBeUndefined();
      expect(_call(plugin, 'load', RESOLVED_HOST_MODULE_ID)).toBe(`export default ${JSON.stringify(host)};\nexport const issues = [];\n`);
      expect(_call(plugin, 'load', '/main.js')).toBeUndefined();
      // The data is read on every load, so serve can change it
      host = { ...host, documentation: [] };
      expect(_call(plugin, 'load', RESOLVED_HOST_MODULE_ID)).toContain('"documentation":[]');
    });

    it('Serves the current issues as the virtual module\'s "issues"', () => {
      let issues = [{ severity: 'warning' as const, message: 'Several', path: 'README.md' }];
      const plugin = createHostPlugin(
        () => getShownHostInformation(_HOST),
        () => issues,
      );
      expect(_call(plugin, 'load', RESOLVED_HOST_MODULE_ID)).toContain(`\nexport const issues = ${JSON.stringify(issues)};\n`);
      issues = [];
      expect(_call(plugin, 'load', RESOLVED_HOST_MODULE_ID)).toContain('\nexport const issues = [];\n');
    });

    it("Sets the page's title to the project's name, escaped", () => {
      const plugin = createHostPlugin(() => getShownHostInformation(_HOST));
      expect(_call(plugin, 'transformIndexHtml', '<head><title>showroom</title></head>')).toBe(
        '<head><title>my &lt;library&gt; &amp; &quot;co&quot;</title></head>',
      );
    });
  });

  it("Aliases React, React DOM and the scheduler, with their subpaths, to showroom's own copies", () => {
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

  it("Gets the showroom's folder beside this module's", () => {
    // From `src/vite/` this is `src/app/`, and from `dist/vite/` it is `dist/app/`: both hold the static `index.html`
    expect(existsSync(join(getAppDir(), 'index.html'))).toBe(true);
  });

  it("Has a favicon of its own, inline in the showroom's page", async () => {
    // A data URI, so nothing is fetched: without one, browsers asked for /favicon.ico and logged a 404
    expect(await readFile(join(getAppDir(), 'index.html'), 'utf8')).toMatch(/<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="data:image\/svg\+xml,[^"]+"/);
  });

  it('Gets the Vite configuration', () => {
    const getHost = () => getShownHostInformation(_HOST);
    const configuration = getViteConfiguration({ appDir: '/app', cacheDir: '/cache', getHost });
    expect(configuration).toMatchObject({ configFile: false, root: '/app', base: './', cacheDir: '/cache', clearScreen: false, logLevel: 'warn' });
    expect((configuration.plugins as Plugin[]).map((plugin) => plugin.name)).toEqual(['showroom-host', 'showroom-showcase-frames']);
    expect(configuration.resolve?.alias).toEqual(getReactAliases());
  });
});
