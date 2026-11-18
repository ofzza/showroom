/**
 * Tests of the showroom's Vite configuration
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Alias, Plugin } from 'vite';
import type { HostInformation, LinkedFile, ShowcaseView, VirtualFile } from '../host/index.js';
import { LINKED_FILES_FOLDER } from '../linked-files/index.js';
import { MERMAID_FOLDER, getMermaidDir, getShowcaseFrameHash, type ShowcaseFrame } from '../showcases/index.js';
import { createScratchFolder, type ScratchFolder } from '../testing/index.js';
import {
  HOST_MODULE_ID,
  RESOLVED_HOST_MODULE_ID,
  createHostPlugin,
  createLinkedFilesMiddleware,
  createLinkedFilesPlugin,
  createMermaidMiddleware,
  createMermaidPlugin,
  createShowcaseFramesMiddleware,
  createShowcaseFramesPlugin,
  getAppDir,
  getContentType,
  getLinkedFileContentType,
  getReactAliases,
  getShownHostInformation,
  hasBuildMark,
  loadsShowcaseFrame,
  MARKDOWN_TAB_LABEL,
  getShownTabs,
  getTabFileHashes,
  getUntrustedViews,
  getViteConfiguration,
  getMissingMermaidMessage,
  IMMUTABLE_CACHE_CONTROL,
  listMermaidFiles,
  usesMermaid,
} from './index.js';

/**
 * Host information of a small host repository
 */
const _HOST: HostInformation = {
  project: { name: 'my <library> & "co"' },
  documentation: [{ path: 'README.md', kind: 'readme', extension: '.md', content: '# Hi' }],
  code: ['src/index.ts'],
  showcases: [
    {
      id: 'README.md#1',
      documentation: 'README.md',
      line: 3,
      offset: 10,
      kind: 'code-block',
      display: 'block',
      adapter: 'html',
      entry: 'README.showcase-1.html',
      include: [],
      tabs: [{ kind: 'source' }],
      views: ['demo'],
    },
    {
      id: 'my docs/a #1.md#2',
      documentation: 'my docs/a #1.md',
      line: 5,
      offset: 40,
      kind: 'link',
      display: 'inline',
      adapter: 'x',
      entry: 'demo.html',
      include: [],
      tabs: [{ kind: 'source' }],
      views: ['demo'],
    },
  ],
  virtualFiles: [
    { path: 'README.showcase-1.html', named: false, showcase: 'README.md#1', content: '<p>1</p>', documentation: 'README.md', line: 3, offset: 0 },
  ],
  linkedFiles: [{ path: 'src/index.ts', size: 75, text: true }],
};

/**
 * Root of the linked-files fixture, whose files the linked files plugin reads
 */
const _LINKED_ROOT = fileURLToPath(new URL('../../test/fixtures/linked-files', import.meta.url));

/**
 * Linked files of the linked-files fixture: a part of them, as check() collects them
 */
const _LINKED: LinkedFile[] = [
  { path: 'Makefile', size: 19, text: true },
  { path: 'assets/logo.png', size: 70, text: false },
  { path: 'src/index.ts', size: 75, text: true },
];

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

  it('Gets the shown host information, without the code file index, with every showcase, built or not', () => {
    const shown = getShownHostInformation(_HOST);
    expect({ ...shown, showcases: [] }).toEqual({
      project: _HOST.project,
      documentation: _HOST.documentation,
      showcases: [],
      virtualFiles: [],
      linkedFiles: _HOST.linkedFiles,
      trusted: false,
    });
    // Nothing built: no URLs, checks or issues (D584)
    expect(shown.showcases.map(({ id, url, checks, issues }) => ({ id, url, checks, issues }))).toEqual([
      { id: 'README.md#1', url: undefined, checks: [], issues: [] },
      { id: 'my docs/a #1.md#2', url: undefined, checks: [], issues: [] },
    ]);
  });

  it('Gets the shown host information with the navigation showroom.json configures', () => {
    const navigation = [{ kind: 'page' as const, label: 'Home', path: '' }];
    expect(getShownHostInformation({ ..._HOST, navigation }).navigation).toEqual(navigation);
  });

  it('Gets the shown showcases with their showcase frames, by URL-encoded relative URLs', () => {
    expect(getShownHostInformation(_HOST, { frames: _FRAMES, trusted: true }).showcases).toEqual([
      {
        id: 'README.md#1',
        documentation: 'README.md',
        offset: 10,
        display: 'block',
        views: ['demo'],
        // No fence or link at its offset in this hand-written host information
        markdown: '',
        entryTab: 0,
        tabs: [{ label: 'HTML', path: 'README.showcase-1.html', language: 'html', source: { kind: 'virtual', content: '<p>1</p>' } }],
        url: `showcases/README.md/1/index.html?hash=${_hash('README.md#1')}`,
        checks: [],
        issues: [],
        // An html showcase without build issues: nothing builds it (D585)
        buildMark: false,
      },
      {
        id: 'my docs/a #1.md#2',
        documentation: 'my docs/a #1.md',
        offset: 40,
        display: 'inline',
        views: ['demo'],
        markdown: '',
        entryTab: 0,
        // Not among the linked files (check left it out, with a warning)
        tabs: [{ label: '../demo.html', path: 'demo.html', language: 'html', source: { kind: 'missing' } }],
        url: `showcases/my%20docs/a%20%231.md/2/pages/index.html?hash=${_hash('my docs/a #1.md#2')}`,
        checks: [],
        issues: [],
        buildMark: true,
      },
    ]);
    // A showcase that doesn't build is shipped without a URL (D584)
    const partial = getShownHostInformation(_HOST, { frames: new Map([['README.md#1', _FRAMES.get('README.md#1')!]]), trusted: true }).showcases;
    expect(partial.map(({ id, url }) => [id, url !== undefined])).toEqual([
      ['README.md#1', true],
      ['my docs/a #1.md#2', false],
    ]);
  });

  it("Carries a recorded showcase's recording, whatever its views, with no showcase frame, and only with trust", () => {
    // PLAN-P20 D784: a recording is text, with nothing to load, so it ships even without a console view
    const recording = { lines: [{ level: 'log' as const, text: 'hi' }], dropped: 0, exitCode: 0 };
    const recordings = new Map([['my docs/a #1.md#2', recording]]);
    const shown = getShownHostInformation(_HOST, { frames: new Map(), recordings, checks: new Map([['my docs/a #1.md#2', ['runtime']]]), trusted: true });
    expect(shown.showcases.map(({ url, recording: shownRecording, checks }) => ({ url, recording: shownRecording, checks }))).toEqual([
      { url: undefined, recording: undefined, checks: [] },
      { url: undefined, recording, checks: ['runtime'] },
    ]);
    expect('recording' in shown.showcases[0]).toBe(false);
    expect(getShownHostInformation(_HOST, { frames: new Map(), recordings }).showcases[1].recording).toBeUndefined();
  });

  it('Shows every showcase as its source without trust, with nothing built', () => {
    const issue = { severity: 'error' as const, message: 'Broke', path: 'a.html' };
    const shown = getShownHostInformation(_HOST, {
      frames: _FRAMES,
      checks: new Map([['README.md#1', ['type check']]]),
      shownIssues: new Map([['README.md#1', [issue]]]),
    });
    expect(shown.trusted).toBe(false);
    // D741 and D754 (.workflow/SPEC-S14-trust.md): no showcase frame, no checks, no issues, no build status mark, even when given
    expect(shown.showcases.map(({ views, url, checks, issues, buildMark }) => ({ views, url, checks, issues, buildMark }))).toEqual([
      { views: ['source'], url: undefined, checks: [], issues: [], buildMark: false },
      { views: ['source'], url: undefined, checks: [], issues: [], buildMark: false },
    ]);
    expect(getShownHostInformation(_HOST, { frames: _FRAMES, trusted: true }).trusted).toBe(true);
  });

  it('Gets the views of a showcase without trust: its source, and its markdown where it has one', () => {
    expect(getUntrustedViews(['demo'])).toEqual(['source']);
    expect(getUntrustedViews(['demo', 'console'])).toEqual(['source']);
    expect(getUntrustedViews(['source', 'console'])).toEqual(['source']);
    expect(getUntrustedViews(['markdown', 'demo'])).toEqual(['markdown', 'source']);
    expect(getUntrustedViews(['demo', 'markdown', 'source'])).toEqual(['source', 'markdown']);
    expect(getUntrustedViews(['markdown'])).toEqual(['markdown']);
    expect(getUntrustedViews(['none'])).toEqual(['none']);
  });

  it('Gives each shown showcase its checks and issues, by id', () => {
    const error = { severity: 'error' as const, message: 'Broke', check: 'type check', path: 'src/a.ts', line: 2 };
    const warning = { severity: 'warning' as const, message: 'Slow', path: 'demo.html' };
    const [first, second] = getShownHostInformation(_HOST, {
      frames: _FRAMES,
      trusted: true,
      checks: new Map([['my docs/a #1.md#2', ['type check']]]),
      shownIssues: new Map([
        ['README.md#1', [warning]],
        ['my docs/a #1.md#2', [error]],
      ]),
    }).showcases;
    expect(first).toMatchObject({ checks: [], issues: [warning] });
    expect(second).toMatchObject({ checks: ['type check'], issues: [error] });
  });

  it('Shows a build status mark on every showcase but an html one without issues of its build', () => {
    const issue = (check?: string) => ({ severity: 'error' as const, message: 'Broke', path: 'a.html', ...(check ? { check } : {}) });
    expect(hasBuildMark({ adapter: 'ts' }, [])).toBe(true);
    expect(hasBuildMark({ adapter: 'html' }, [])).toBe(false);
    expect(hasBuildMark({ adapter: 'html' }, [issue('lint')])).toBe(false);
    expect(hasBuildMark({ adapter: 'html' }, [issue()])).toBe(true);
  });

  it("Gives each shown showcase its views and Markdown source, and its showcase frame's URL only where a view loads it", () => {
    const content = '# Hi\n\n```html showcase view=source\n<p>1</p>\n```\n\n[demo](demo.html "showcase block view=console")\n';
    const host: HostInformation = {
      ..._HOST,
      documentation: [{ path: 'README.md', kind: 'readme', extension: '.md', content }],
      showcases: [
        { ..._HOST.showcases[0], offset: content.indexOf('```'), views: ['source'] },
        { ..._HOST.showcases[1], documentation: 'README.md', display: 'block', offset: content.indexOf('[demo]'), views: ['console'] },
      ],
    };
    const [source, console] = getShownHostInformation(host, { frames: _FRAMES, trusted: true }).showcases;
    expect(source).toMatchObject({ views: ['source'], markdown: '```html showcase view=source\n<p>1</p>\n```' });
    // Its page is never loaded, so it has no URL (D574)
    expect(source).not.toHaveProperty('url');
    expect(console).toMatchObject({ views: ['console'], markdown: '[demo](demo.html "showcase block view=console")' });
    expect(console.url).toMatch(/^showcases\/my%20docs\//);
  });

  it("Gives a linked showcase shown inline its showcase frame's URL only where its views load it", () => {
    // Shown in the showcase sidebar, it has no views by default (D619), so its page is never loaded
    const content = '# Hi\n\nSee [demo](demo.html "showcase").\n';
    const shown = (views: ShowcaseView[]) =>
      getShownHostInformation(
        {
          ..._HOST,
          documentation: [{ path: 'README.md', kind: 'readme', extension: '.md', content }],
          showcases: [{ ..._HOST.showcases[1], documentation: 'README.md', display: 'inline', offset: content.indexOf('[demo]'), views }],
        },
        { frames: _FRAMES, trusted: true },
      ).showcases[0];
    expect(shown(['none'])).not.toHaveProperty('url');
    expect(shown(['demo']).url).toMatch(/^showcases\/my%20docs\//);
  });

  it('Checks which views load a showcase frame', () => {
    expect(loadsShowcaseFrame(['demo'])).toBe(true);
    expect(loadsShowcaseFrame(['source', 'console'])).toBe(true);
    expect(loadsShowcaseFrame(['markdown', 'source'])).toBe(false);
    expect(loadsShowcaseFrame(['none'])).toBe(false);
  });

  it("Gets the virtual files with no showcase adapter whose views aren't an ordinary code block's, with their Markdown source", () => {
    const content = '# Hi\n\n```css showcase file=a.css\n```\n\n```css showcase file=b.css view=markdown\n```\n\n```css showcase file=c.css view=none\n```\n';
    const file = (path: string, views: ShowcaseView[], fence: string): VirtualFile => ({
      path,
      named: true,
      views,
      content: '',
      documentation: 'README.md',
      line: 1,
      offset: content.indexOf(fence),
    });
    const host: HostInformation = {
      ..._HOST,
      documentation: [{ path: 'README.md', kind: 'readme', extension: '.md', content }],
      virtualFiles: [
        ..._HOST.virtualFiles,
        file('a.css', ['source'], '```css showcase file=a.css'),
        file('b.css', ['markdown'], '```css showcase file=b.css'),
        file('c.css', ['none'], '```css showcase file=c.css'),
      ],
    };
    expect(getShownHostInformation(host).virtualFiles).toEqual([
      {
        path: 'b.css',
        documentation: 'README.md',
        offset: content.indexOf('```css showcase file=b.css'),
        views: ['markdown'],
        markdown: '```css showcase file=b.css view=markdown\n```',
      },
      {
        path: 'c.css',
        documentation: 'README.md',
        offset: content.indexOf('```css showcase file=c.css'),
        views: ['none'],
        markdown: '```css showcase file=c.css view=none\n```',
      },
    ]);
  });

  it("Places a showcase's tabs in include='s order, its Markdown tab with its source as written, on a block or inline", () => {
    const content = '# Hi\n\n```html showcase include=a.css,markdown\n<p>1</p>\n```\n\nSee [demo](demo.html "showcase include=markdown,source").\n';
    const host: HostInformation = {
      ..._HOST,
      documentation: [{ path: 'README.md', kind: 'readme', extension: '.md', content }],
      showcases: [
        {
          ..._HOST.showcases[0],
          offset: content.indexOf('```'),
          include: ['a.css'],
          tabs: [{ kind: 'source' }, { kind: 'file', path: 'a.css' }, { kind: 'markdown' }],
        },
        { ..._HOST.showcases[1], documentation: 'README.md', offset: content.indexOf('[demo]'), tabs: [{ kind: 'markdown' }, { kind: 'source' }] },
      ],
    };
    const frames = new Map([
      ['README.md#1', _FRAMES.get('README.md#1')!],
      ['my docs/a #1.md#2', _FRAMES.get('my docs/a #1.md#2')!],
    ]);
    const [block, inline] = getShownHostInformation(host, { frames, trusted: true }).showcases;
    expect(block.tabs.map(({ label }) => label)).toEqual(['HTML', 'a.css', MARKDOWN_TAB_LABEL]);
    expect(block.tabs[2]).toEqual({
      label: 'Markdown',
      path: 'README.md',
      language: 'md',
      source: { kind: 'virtual', content: '```html showcase include=a.css,markdown\n<p>1</p>\n```' },
      markdown: true,
    });
    expect(block.tabs.filter((tab) => tab.markdown)).toHaveLength(1);
    // A linked showcase shown inline gets its Markdown tab too, for its showcase sidebar (D535)
    expect(inline.tabs.map(({ label }) => label)).toEqual([MARKDOWN_TAB_LABEL, 'demo.html']);
    expect(inline.tabs[0].source).toEqual({ kind: 'virtual', content: '[demo](demo.html "showcase include=markdown,source")' });
    // The source view shows the source tab, wherever it is
    expect([block.entryTab, inline.entryTab]).toEqual([0, 1]);
  });

  it("Gets a showcase's tabs from every kind of source, labelled, with hashes for text linked files only", () => {
    const host: HostInformation = {
      ..._HOST,
      documentation: [..._HOST.documentation, { path: 'docs/guide.md', kind: 'other', extension: '.md', content: '' }],
      virtualFiles: [{ path: 'docs/theme.css', named: true, content: 'p {}', documentation: 'docs/guide.md', line: 1, offset: 0 }],
      linkedFiles: [
        { path: 'docs/demos/clock.html', size: 9, text: true },
        { path: 'docs/my logo.png', size: 9, text: false },
      ],
    };
    const showcase = {
      ..._HOST.showcases[1],
      documentation: 'docs/guide.md',
      entry: 'docs/demos/clock.html',
      include: ['docs/theme.css', 'README.md', 'docs/my logo.png', 'out/gone.css'],
      tabs: [
        { kind: 'source' as const },
        ...['docs/theme.css', 'README.md', 'docs/my logo.png', 'out/gone.css'].map((path) => ({ kind: 'file' as const, path })),
      ],
    };
    const hashes = new Map([
      ['docs/demos/clock.html', '0123abcd'],
      ['docs/my logo.png', 'ffffffff'],
    ]);
    expect(getShownTabs(host, showcase, hashes)).toEqual([
      {
        label: 'demos/clock.html',
        path: 'docs/demos/clock.html',
        language: 'html',
        source: { kind: 'file', url: 'files/docs/demos/clock.html?hash=0123abcd', text: true },
      },
      { label: 'theme.css', path: 'docs/theme.css', language: 'css', source: { kind: 'virtual', content: 'p {}' } },
      { label: '../README.md', path: 'README.md', language: 'md', source: { kind: 'documentation' } },
      { label: 'my logo.png', path: 'docs/my logo.png', language: 'png', source: { kind: 'file', url: 'files/docs/my%20logo.png', text: false } },
      { label: '../out/gone.css', path: 'out/gone.css', language: 'css', source: { kind: 'missing' } },
    ]);
    // Without a hash, a text linked file's URL has none
    expect(getShownTabs(host, showcase)[0].source).toEqual({ kind: 'file', url: 'files/docs/demos/clock.html', text: true });
  });

  it('Hashes the text linked files showcases show as tabs, reading each', async () => {
    const showcase = { ..._HOST.showcases[1], entry: 'src/index.ts', include: ['assets/logo.png', 'Makefile', 'gone.txt'] };
    const host: HostInformation = { ..._HOST, showcases: [showcase], linkedFiles: [..._LINKED, { path: 'gone.txt', size: 1, text: true }] };
    const hash = async (path: string) => getShowcaseFrameHash([{ path, content: await readFile(join(_LINKED_ROOT, path)) }]);
    // The binary file is never read, and a file that can't be read gets no hash
    expect(await getTabFileHashes(_LINKED_ROOT, host)).toEqual(
      new Map([
        ['src/index.ts', await hash('src/index.ts')],
        ['Makefile', await hash('Makefile')],
      ]),
    );
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

  describe('Linked files', () => {
    // The linked files plugin and its middleware, called with fake requests and responses, on the linked-files fixture's files (read, never written).

    /**
     * Requests a path from the middleware, which answers once it has read the file
     * @param url URL of the request
     * @param method Method of the request
     * @param linkedFiles The linked files it serves
     * @returns The response's status, headers and body, or `next` if the request went on to Vite
     */
    const request = (url: string, method = 'GET', linkedFiles = _LINKED, trusted = true) =>
      new Promise<'next' | { statusCode: number; headers: Record<string, unknown>; body?: Buffer | string }>((resolve) => {
        const response = { statusCode: 0, headers: {} as Record<string, unknown>, body: undefined as Buffer | string | undefined };
        createLinkedFilesMiddleware(
          _LINKED_ROOT,
          () => linkedFiles,
          () => trusted,
        )(
          { url, method } as IncomingMessage,
          {
            set statusCode(code: number) {
              response.statusCode = code;
            },
            setHeader: (name: string, value: unknown) => void (response.headers[name] = value),
            end: (body?: Buffer | string) => {
              response.body = body;
              resolve(response);
            },
          } as unknown as ServerResponse,
          () => resolve('next'),
        );
      });

    it('Serves a linked file from the host repository, never cached', async () => {
      const code = await request('/files/src/index.ts?x=1');
      expect(code).toMatchObject({ statusCode: 200, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Length': 75 } });
      expect(String((code as { body: Buffer }).body)).toBe(await readFile(join(_LINKED_ROOT, 'src', 'index.ts'), 'utf8'));
      expect(await request('/files/assets/logo.png')).toMatchObject({ statusCode: 200, headers: { 'Content-Type': 'image/png' } });
      expect(await request('/files/Makefile', 'HEAD')).toMatchObject({ statusCode: 200, body: undefined });
    });

    it('Serves a text file whose extension says nothing as plain text', () => {
      expect(getLinkedFileContentType({ path: 'Makefile', size: 1, text: true })).toBe('text/plain; charset=utf-8');
      expect(getLinkedFileContentType({ path: 'data.bin', size: 1, text: false })).toBe('application/octet-stream');
      expect(getLinkedFileContentType({ path: 'index.html', size: 1, text: true }, true)).toBe('text/html; charset=utf-8');
    });

    it('Serves a linked file of an active type as plain text without trust, so a new tab shows its source', async () => {
      // D752 (.workflow/SPEC-S14-trust.md): without trust, no host code reaches the dev server's origin
      for (const path of ['a.html', 'a.HTM', 'a.svg', 'a.xml', 'a.xhtml']) {
        expect(getLinkedFileContentType({ path, size: 1, text: true })).toBe('text/plain; charset=utf-8');
      }
      for (const path of ['a.html', 'a.HTM', 'a.svg']) expect(getLinkedFileContentType({ path, size: 1, text: true }, true)).not.toMatch(/^text\/plain/);
      expect(getLinkedFileContentType({ path: 'logo.png', size: 1, text: false })).toBe('image/png');
      const demo = [{ path: 'demo/demo.html', size: 1, text: true }];
      expect(await request('/files/demo/demo.html', 'GET', demo, false)).toMatchObject({
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
      });
      expect(await request('/files/demo/demo.html', 'GET', demo, true)).toMatchObject({ headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    });

    it("Answers anything else in the linked files' folder with a 404", async () => {
      // `serve` hands out only what `build` publishes: README.md is in the fixture, but no linked file
      expect(await request('/files/README.md')).toMatchObject({ statusCode: 404, headers: { 'Cache-Control': 'no-store' } });
      expect(await request('/files/src/INDEX.ts')).toMatchObject({ statusCode: 404 });
      // A linked file gone from disk since the check
      expect(await request('/files/gone.txt', 'GET', [{ path: 'gone.txt', size: 1, text: true }])).toMatchObject({ statusCode: 404 });
    });

    it('Passes every other request on to Vite', async () => {
      expect(await request('/')).toBe('next');
      expect(await request('/filesystem.js')).toBe('next');
      expect(await request('/files/src/index.ts', 'POST')).toBe('next');
      expect(await request('/files/%E0%A4%A')).toBe('next');
    });

    it('Copies the linked files into the build, each at files/<path>', async () => {
      const emitted: unknown[] = [];
      await _callWith(
        { emitFile: (file: unknown) => emitted.push(file) },
        createLinkedFilesPlugin(_LINKED_ROOT, () => _LINKED),
        'generateBundle',
      );
      expect(emitted).toEqual(
        await Promise.all(_LINKED.map(async ({ path }) => ({ type: 'asset', fileName: `files/${path}`, source: await readFile(join(_LINKED_ROOT, path)) }))),
      );
    });

    it('Is added to the dev server by the plugin', () => {
      const used: unknown[] = [];
      (createLinkedFilesPlugin(_LINKED_ROOT, () => _LINKED).configureServer as (server: unknown) => void)({
        middlewares: { use: (middleware: unknown) => used.push(middleware) },
      });
      expect(used).toHaveLength(1);
    });

    it("Never hides one of the showroom's own modules", () => {
      // In serve, Vite serves the showroom's modules unbundled from its root, and the middleware answers every request in the linked files' folder:
      // a folder of src/app/ named like it would be answered with a 404, leaving a blank page. See AGENTS.md › Linked files are handed out at
      // `files/<path>`
      const folders = readdirSync(fileURLToPath(new URL('../app/', import.meta.url)), { withFileTypes: true }).filter((entry) => entry.isDirectory());
      expect(folders.length).toBeGreaterThan(0);
      expect(folders.map((entry) => entry.name)).not.toContain(LINKED_FILES_FOLDER);
    });
  });

  describe('The shared Mermaid bundle', () => {
    // Its plugin and middleware, called with fake requests, responses and plugin contexts, on a fake bundle written into a scratch folder: an entry
    // point, notices, a chunk, the stamp and a file in a dot folder.

    let scratch: ScratchFolder;
    let bundle: string;
    const using = new Map<string, ShowcaseFrame>([
      ..._FRAMES,
      ['README.md#3', { ..._FRAMES.get('README.md#1')!, folder: 'showcases/README.md/3', mermaid: true }],
    ]);

    beforeAll(async () => {
      scratch = await createScratchFolder('mermaid-');
      bundle = join(scratch.path, 'bundle');
      await mkdir(join(bundle, 'chunks'), { recursive: true });
      await mkdir(join(bundle, '.hidden'), { recursive: true });
      await writeFile(join(bundle, 'mermaid.js'), 'export default 1;');
      await writeFile(join(bundle, 'THIRD-PARTY-NOTICES.txt'), '# Licenses');
      await writeFile(join(bundle, 'chunks', 'class-AB12.js'), 'export const a = 1;');
      await writeFile(join(bundle, '.stamp'), '0123');
      await writeFile(join(bundle, '.hidden', 'secret.js'), 'secret');
      await writeFile(join(scratch.path, 'outside.js'), 'outside');
    });

    afterAll(async () => {
      await scratch.remove();
    });

    /**
     * Requests a path from the middleware, which answers once it has read the file
     * @param url URL of the request
     * @param options The method, the showcase frames, the bundle's folder, and the warning's callback
     * @returns The response's status, headers and body, or `next` if the request went on
     */
    const request = (url: string, { method = 'GET', frames = using, dir = bundle, warn = () => {} } = {}) =>
      new Promise<'next' | { statusCode: number; headers: Record<string, unknown>; body?: Buffer | string }>((resolve) => {
        const response = { statusCode: 0, headers: {} as Record<string, unknown>, body: undefined as Buffer | string | undefined };
        createMermaidMiddleware({ mermaidDir: dir, getFrames: () => frames }, warn)(
          { url, method } as IncomingMessage,
          {
            set statusCode(code: number) {
              response.statusCode = code;
            },
            setHeader: (name: string, value: unknown) => void (response.headers[name] = value),
            end: (body?: Buffer | string) => resolve({ ...response, body }),
          } as unknown as ServerResponse,
          () => resolve('next'),
        );
      });

    it('Lists its files, without dotfiles or what dot folders hold, and nothing without an entry point', async () => {
      expect(await listMermaidFiles(bundle)).toEqual(['THIRD-PARTY-NOTICES.txt', 'chunks/class-AB12.js', 'mermaid.js']);
      expect(await listMermaidFiles(join(bundle, 'chunks'))).toBeUndefined();
      expect(await listMermaidFiles(join(scratch.path, 'missing'))).toBeUndefined();
    });

    it('Tells if a showcase frame uses it', () => {
      expect(usesMermaid(_FRAMES)).toBe(false);
      expect(usesMermaid(using)).toBe(true);
    });

    it('Serves its files while a showcase frame uses it, its chunks immutable, its entry point and notices never cached', async () => {
      const entry = await request('/mermaid/mermaid.js?hash=0123abcd');
      expect(entry).toMatchObject({
        statusCode: 200,
        headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
      expect(String((entry as { body: Buffer }).body)).toBe('export default 1;');
      expect(await request('/mermaid/THIRD-PARTY-NOTICES.txt')).toMatchObject({
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
      expect(await request('/mermaid/chunks/class-AB12.js')).toMatchObject({ statusCode: 200, headers: { 'Cache-Control': IMMUTABLE_CACHE_CONTROL } });
    });

    it('Answers HEAD without a body', async () => {
      expect(await request('/mermaid/mermaid.js', { method: 'HEAD' })).toMatchObject({ statusCode: 200, body: undefined });
    });

    it('Answers a missing file, a dotfile and a path leading out of its folder with a 404', async () => {
      for (const url of ['/mermaid/missing.js', '/mermaid/.stamp', '/mermaid/.hidden/secret.js', '/mermaid/../outside.js', '/mermaid/%2E%2E/outside.js']) {
        expect(await request(url), url).toMatchObject({ statusCode: 404, headers: { 'Cache-Control': 'no-store' } });
      }
    });

    it('Answers every request in its folder with a 404 while no showcase frame uses it', async () => {
      // serve hands out nothing build doesn't emit (D849 in .workflow/PLAN-P21-jsonschema.md)
      expect(await request('/mermaid/mermaid.js', { frames: _FRAMES })).toMatchObject({ statusCode: 404 });
    });

    it('Passes every other request on', async () => {
      expect(await request('/mermaid.js')).toBe('next');
      expect(await request('/showcases/README.md/1/index.html')).toBe('next');
      expect(await request('/mermaid/mermaid.js', { method: 'POST' })).toBe('next');
    });

    it('Warns once of a missing bundle, the first time a showcase frame uses it', async () => {
      const warnings: string[] = [];
      const missing = join(scratch.path, 'missing');
      const plugin = createMermaidPlugin({ mermaidDir: missing, getFrames: () => using, onMissing: (message) => warnings.push(message) });
      const used: ((...args: unknown[]) => void)[] = [];
      (plugin.configureServer as (server: unknown) => void)({ middlewares: { use: (middleware: (...args: unknown[]) => void) => used.push(middleware) } });
      expect(used).toHaveLength(1);
      for (let index = 0; index < 2; index++) {
        await new Promise<void>((resolve) =>
          used[0]({ url: '/mermaid/mermaid.js', method: 'GET' }, { setHeader: () => {}, end: () => resolve() }, () => resolve()),
        );
      }
      await _callWith({ emitFile: () => {} }, plugin, 'generateBundle');
      expect(warnings).toEqual([getMissingMermaidMessage(missing)]);
    });

    it('Is emitted into the build once, only when a showcase frame emitted uses it', async () => {
      const emitted: { fileName: string; source: Uint8Array }[] = [];
      const context = { emitFile: (file: { fileName: string; source: Uint8Array }) => emitted.push(file) };
      await _callWith(context, createMermaidPlugin({ mermaidDir: bundle, getFrames: () => _FRAMES }), 'generateBundle');
      expect(emitted).toEqual([]);
      // Two showcase frames use it, and it is emitted once, its notices with it
      const twice = new Map([...using, ['README.md#4', { ...using.get('README.md#3')!, folder: 'showcases/README.md/4' }]]);
      await _callWith(context, createMermaidPlugin({ mermaidDir: bundle, getFrames: () => twice }), 'generateBundle');
      expect(emitted.map((file) => file.fileName)).toEqual([
        `${MERMAID_FOLDER}/THIRD-PARTY-NOTICES.txt`,
        `${MERMAID_FOLDER}/chunks/class-AB12.js`,
        `${MERMAID_FOLDER}/mermaid.js`,
      ]);
      expect(String(emitted[2].source)).toBe('export default 1;');
    });

    it("Never hides one of the showroom's own modules", () => {
      // In serve, the middleware answers every request in the bundle's folder, as for linked files. See AGENTS.md › The shared Mermaid bundle is
      // handed out at `mermaid/<path>`
      const folders = readdirSync(fileURLToPath(new URL('../app/', import.meta.url)), { withFileTypes: true }).filter((entry) => entry.isDirectory());
      expect(folders.length).toBeGreaterThan(0);
      expect(folders.map((entry) => entry.name)).not.toContain(MERMAID_FOLDER);
    });

    it("Finds the package's bundle beside the showroom's folder", () => {
      // From `src/showcases/` this is `src/mermaid/`, which never exists, and from `dist/showcases/` it is `dist/mermaid/`
      expect(resolve(getMermaidDir())).toBe(resolve(dirname(getAppDir()), 'mermaid'));
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

    it("Keeps replacement patterns in the project's name as text", () => {
      // `$&` or `$'` in a replacement string would insert the matched title, or the page after it (D758 in .workflow/PLAN-P19-trust.md)
      const name = "a $& b $' c $$";
      const plugin = createHostPlugin(() => getShownHostInformation({ ..._HOST, project: { ..._HOST.project, name } }));
      expect(_call(plugin, 'transformIndexHtml', '<title>showroom</title><p>x</p>')).toBe(`<title>a $&amp; b $' c $$</title><p>x</p>`);
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
    const configuration = getViteConfiguration({ appDir: '/app', cacheDir: '/cache', hostRoot: '/host', getHost });
    expect(configuration).toMatchObject({ configFile: false, root: '/app', base: './', cacheDir: '/cache', clearScreen: false, logLevel: 'warn' });
    // Nothing Vite would otherwise look for from its root up, inside the host repository when showroom is installed in it (D746 in
    // .workflow/PLAN-P19-trust.md): no PostCSS configuration, no .env files, no public folder
    expect(configuration).toMatchObject({ css: { postcss: {} }, envDir: false, publicDir: false });
    expect((configuration.plugins as Plugin[]).map((plugin) => plugin.name)).toEqual([
      'showroom-host',
      'showroom-showcase-frames',
      'showroom-mermaid',
      'showroom-linked-files',
    ]);
    expect(configuration.resolve?.alias).toEqual(getReactAliases());
  });
});
