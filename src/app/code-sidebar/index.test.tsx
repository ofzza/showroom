/**
 * Tests of the code sidebar
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { DocumentationFile, LinkedFile } from '../../host/index.js';
import type { ShownShowcase, ShownTab } from '../host/index.js';
import {
  CODE_SIDEBAR_MAX_WIDTH,
  CODE_SIDEBAR_MIN_WIDTH,
  CODE_SIDEBAR_WIDTH,
  CodeSidebar,
  CodeSidebarView,
  LinkedFileView,
  MISSING_DOCUMENTATION_MESSAGE,
  MISSING_FILE_MESSAGE,
  NOT_TEXT_MESSAGE,
  ShownTabList,
  ShownTabView,
  fetchLinkedFile,
  getSidebarView,
  getFetchedTabUrl,
  getMarkdownMarkers,
  getTabMarks,
  getShownTabText,
  type LinkedFileContent,
} from './index.js';

/**
 * Renders an element to HTML on the server
 * @param element The element
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(element: React.ReactElement): string {
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>{element}</FluentProvider>
    </SSRProvider>,
  ).replaceAll('<!-- -->', '');
}

/**
 * A text linked file
 */
const _FILE: LinkedFile = { path: 'src/my index.ts', size: 30, text: true };

/**
 * A tab of each kind of source
 */
const _TABS = {
  virtual: { label: 'HTML', path: 'README.showcase-1.html', language: 'html', source: { kind: 'virtual', content: '<p>Hi</p>' } },
  documentation: { label: 'docs/guide.md', path: 'docs/guide.md', language: 'md', source: { kind: 'documentation' } },
  file: {
    label: 'src/my index.ts',
    path: 'src/my index.ts',
    language: 'ts',
    source: { kind: 'file', url: 'files/src/my%20index.ts?hash=0123abcd', text: true },
  },
  binary: { label: 'logo.png', path: 'logo.png', language: 'png', source: { kind: 'file', url: 'files/logo.png', text: false } },
  missing: { label: 'out/a.html', path: 'out/a.html', language: 'html', source: { kind: 'missing' } },
} satisfies Record<string, ShownTab>;

/**
 * The documentation files the tabs look a documentation file up in
 */
const _DOCUMENTATION: DocumentationFile[] = [{ path: 'docs/guide.md', kind: 'other', extension: '.md', content: '# A guide\n' }];

describe('app/code-sidebar', () => {
  // Tests the code sidebar's header and body (CodeSidebarView) and the tabs' content by rendering them on the server with given content (effects
  // don't run, and FluentUI's drawer renders through a portal, so CodeSidebar itself renders nothing on the server), what the code sidebar shows with
  // and without tabs (getSidebarView()), the tabs' marks from hand-written issues, and fetching a linked file with a stubbed `fetch`.

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('LinkedFileView', () => {
    // A linked file's content in each of its states.

    it('Shows a spinner while the file is fetched', () => {
      expect(_render(<LinkedFileView path={_FILE.path} content={{ status: 'loading' }} />)).toContain('Loading…');
    });

    it('Shows why the file failed to load', () => {
      const html = _render(<LinkedFileView path={_FILE.path} content={{ status: 'failed', message: "The file couldn't be loaded (404 Not Found)." }} />);
      expect(html).toContain('The file couldn&#x27;t be loaded (404 Not Found).');
    });

    it('Shows the content highlighted, in the language of its extension or name', () => {
      const content: LinkedFileContent = { status: 'loaded', text: 'export const a = 1;\n' };
      expect(_render(<LinkedFileView path={_FILE.path} content={content} />)).toContain('class="hljs language-ts"');
      const makefile = _render(<LinkedFileView path="Makefile" content={{ status: 'loaded', text: 'all:\n\techo hi\n' }} />);
      expect(makefile).toContain('class="hljs language-makefile"');
    });
  });

  describe('fetchLinkedFile', () => {
    // Fetching a linked file's copy, with `fetch` stubbed.

    it("Fetches the file's copy, never from the cache", async () => {
      const fetch = vi.fn(async () => new Response('export const a = 1;\n'));
      vi.stubGlobal('fetch', fetch);
      expect(await fetchLinkedFile('files/src/my%20index.ts')).toEqual({ status: 'loaded', text: 'export const a = 1;\n' });
      expect(fetch).toHaveBeenCalledWith('files/src/my%20index.ts', expect.objectContaining({ cache: 'no-store' }));
    });

    it('Fails on an error status, or a failed request', async () => {
      vi.stubGlobal('fetch', async () => new Response('Not found', { status: 404, statusText: 'Not Found' }));
      expect(await fetchLinkedFile('files/src/my%20index.ts')).toEqual({ status: 'failed', message: "The file couldn't be loaded (404 Not Found)." });
      vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
      expect(await fetchLinkedFile('files/src/my%20index.ts')).toEqual({ status: 'failed', message: "The file couldn't be loaded (500)." });
      vi.stubGlobal('fetch', async () => Promise.reject(new TypeError('Failed to fetch')));
      expect(await fetchLinkedFile('files/src/my%20index.ts')).toEqual({ status: 'failed', message: "The file couldn't be loaded (Failed to fetch)." });
    });
  });

  describe('ShownTabView', () => {
    // A tab's content, for each kind of source.

    it("Shows a virtual or documentation file's content highlighted", () => {
      expect(_render(<ShownTabView tab={_TABS.virtual} documentation={[]} content={{ status: 'loading' }} />)).toContain('class="hljs language-html"');
      expect(_render(<ShownTabView tab={_TABS.documentation} documentation={_DOCUMENTATION} content={{ status: 'loading' }} />)).toContain('A guide');
      expect(_render(<ShownTabView tab={_TABS.documentation} documentation={[]} content={{ status: 'loading' }} />)).toContain(
        MISSING_DOCUMENTATION_MESSAGE.replace("'", '&#x27;'),
      );
    });

    it("Shows a text linked file's content as fetched", () => {
      expect(_render(<ShownTabView tab={_TABS.file} documentation={[]} content={{ status: 'loading' }} />)).toContain('Loading…');
      expect(_render(<ShownTabView tab={_TABS.file} documentation={[]} content={{ status: 'loaded', text: 'export const a = 1;' }} />)).toContain(
        'class="hljs language-ts"',
      );
    });

    it("Says a file that isn't text can't be shown, with a link opening it", () => {
      const html = _render(<ShownTabView tab={_TABS.binary} documentation={[]} content={{ status: 'loading' }} />);
      expect(html).toContain(NOT_TEXT_MESSAGE.replace("'", '&#x27;'));
      expect(html).toMatch(/<a [^>]*href="files\/logo.png"[^>]*target="_blank"/);
      // The link's "open" icon follows its text, hidden from screen readers (D419)
      expect(html).toMatch(/Open in a new tab<svg [^>]*aria-hidden="true"/);
    });

    it("Says a file that isn't copied into the showroom can't be shown, with no link", () => {
      // A linked showcase's entry point check left out of the linked files, with a warning (D411)
      const html = _render(<ShownTabView tab={_TABS.missing} documentation={[]} content={{ status: 'loading' }} />);
      expect(html).toContain(MISSING_FILE_MESSAGE.replace("'", '&#x27;'));
      expect(html).not.toContain('<a ');
    });
  });

  it('Lists the tabs by their labels, their paths as their tooltips', () => {
    const html = _render(<ShownTabList tabs={[_TABS.virtual, _TABS.file]} selected={1} onSelect={() => undefined} idPrefix="t" />);
    expect(html).toMatch(/<button [^>]*id="t-tab-0"[^>]*title="README.showcase-1.html"/);
    expect(html).toMatch(/<button [^>]*aria-selected="true"[^>]*id="t-tab-1"|<button [^>]*id="t-tab-1"[^>]*aria-selected="true"/);
    expect(html).toContain('>HTML<');
  });

  it("Gets a tab's text when it is at hand", () => {
    const loaded: LinkedFileContent = { status: 'loaded', text: 'export const a = 1;' };
    expect(getShownTabText(_TABS.virtual, [], { status: 'loading' })).toBe('<p>Hi</p>');
    expect(getShownTabText(_TABS.documentation, _DOCUMENTATION, { status: 'loading' })).toBe('# A guide\n');
    expect(getShownTabText(_TABS.file, [], loaded)).toBe('export const a = 1;');
    expect([
      getShownTabText(_TABS.file, [], { status: 'loading' }),
      getShownTabText(_TABS.binary, [], loaded),
      getShownTabText(_TABS.missing, [], loaded),
    ]).toEqual([undefined, undefined, undefined]);
  });

  it('Fetches only a text linked file tab', () => {
    expect(getFetchedTabUrl(_TABS.file)).toBe('files/src/my%20index.ts?hash=0123abcd');
    expect([_TABS.virtual, _TABS.documentation, _TABS.binary, _TABS.missing, undefined].map(getFetchedTabUrl)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  describe('Tab marks', () => {
    // Each tab's line markers and icon, from a showcase's issues; the Markdown tab's, and the markdown view's, after the fence's opening line.

    const tab = (label: string, path: string, source: ShownTab['source']): ShownTab => ({ label, path, language: 'ts', source });
    const showcase: Pick<ShownShowcase, 'tabs' | 'entryTab' | 'issues'> = {
      tabs: [
        { ...tab('Markdown', 'README.md', { kind: 'virtual', content: '```ts showcase\nx\n```' }), markdown: true },
        tab('TS', 'README.showcase-1.ts', { kind: 'virtual', content: 'x' }),
        tab('a.ts', 'a.ts', { kind: 'file', url: 'files/a.ts', text: true }),
        tab('b.ts', 'b.ts', { kind: 'file', url: 'files/b.ts', text: true }),
      ],
      entryTab: 1,
      issues: [
        { severity: 'error', message: 'Broke', path: 'README.showcase-1.ts', line: 1 },
        { severity: 'warning', message: 'Slow', path: 'a.ts' },
      ],
    };

    it("Marks each tab with its file's issues, and its most serious severity", () => {
      const [markdown, entry, a, b] = getTabMarks(showcase);
      expect(entry).toEqual({ markers: new Map([[1, { severity: 'error', messages: ['Broke'] }]]), severity: 'error' });
      // A warning with no line: an icon, no marked line
      expect(a).toEqual({ markers: new Map(), severity: 'warning' });
      expect(b).toEqual({ markers: new Map() });
      // The Markdown tab shows the entry point's fence: its issues, one line below
      expect(markdown).toEqual({ markers: new Map([[2, { severity: 'error', messages: ['Broke'] }]]), severity: 'error' });
      expect(getMarkdownMarkers(showcase)).toEqual(markdown.markers);
    });

    it('Finds the Markdown tab by its flag, wherever include= places it', () => {
      const [markdown, ...files] = showcase.tabs;
      const marks = getTabMarks({ ...showcase, tabs: [...files, markdown], entryTab: 0 });
      expect(marks[3]).toEqual({ markers: new Map([[2, { severity: 'error', messages: ['Broke'] }]]), severity: 'error' });
      expect(marks[0]).toEqual({ markers: new Map([[1, { severity: 'error', messages: ['Broke'] }]]), severity: 'error' });
      expect(getMarkdownMarkers({ ...showcase, tabs: [...files, markdown], entryTab: 0 })).toEqual(marks[3].markers);
    });

    it("Marks nothing in a linked showcase's Markdown source, its link", () => {
      const linked = { ...showcase, tabs: [showcase.tabs[0], tab('demo.ts', 'demo.ts', { kind: 'file', url: 'files/demo.ts', text: true })] };
      const issues = [{ severity: 'error' as const, message: 'Broke', path: 'demo.ts', line: 1 }];
      expect(getMarkdownMarkers({ ...linked, issues }).size).toBe(0);
      expect(getTabMarks({ ...linked, issues })[0]).toEqual({ markers: new Map() });
    });
  });

  describe('getSidebarView', () => {
    // What the code sidebar shows: the file alone, or the selected tab of a linked showcase shown inline with included files, or of a code pane.

    it('Shows the file alone, titled with its name, without tabs, or with one', () => {
      const alone = { index: 0, title: 'my index.ts', fetchUrl: 'files/src/my%20index.ts', openUrl: 'files/src/my%20index.ts' };
      expect(getSidebarView(_FILE, undefined, 0)).toEqual(alone);
      expect(getSidebarView(_FILE, [_TABS.file], 0)).toEqual(alone);
    });

    it('Shows the selected tab, untitled as the tab list is its title, with a link for a linked file only', () => {
      const tabs = [_TABS.file, _TABS.virtual, _TABS.binary];
      expect(getSidebarView(_FILE, tabs, 0)).toEqual({
        tab: _TABS.file,
        index: 0,
        fetchUrl: 'files/src/my%20index.ts?hash=0123abcd',
        openUrl: 'files/src/my%20index.ts?hash=0123abcd',
      });
      expect(getSidebarView(_FILE, tabs, 1)).toEqual({ tab: _TABS.virtual, index: 1, fetchUrl: undefined, openUrl: undefined });
      expect(getSidebarView(_FILE, tabs, 2)).toMatchObject({ fetchUrl: undefined, openUrl: 'files/logo.png' });
      // A selection beyond the tabs (after the tabs changed) falls back to the last
      expect(getSidebarView(_FILE, tabs, 7).index).toBe(2);
    });

    it("Shows a code pane's tabs, even a single one, with no file", () => {
      // A code pane always shows its tab list (D408), so its single tab is a tab, not a file alone
      expect(getSidebarView(undefined, [_TABS.virtual], 0)).toEqual({ tab: _TABS.virtual, index: 0, fetchUrl: undefined, openUrl: undefined });
    });
  });

  describe('CodeSidebarView', () => {
    // The code sidebar's header (the title or the tab list, the link, the close button) and body, rendered on the server.

    it('Titles a file alone with its name, its path as the tooltip, before the link and the close button, above its content', () => {
      const html = _render(<CodeSidebarView file={_FILE} documentation={[]} onClose={() => undefined} />);
      expect(html).toMatch(/<h2 [^>]*title="src\/my index.ts"[^>]*>my index.ts<\/h2>/);
      const link = html.indexOf('Open in a new tab');
      const close = html.indexOf('aria-label="Close"');
      const loading = html.indexOf('Loading…');
      expect([link > -1, link < close, close < loading]).toEqual([true, true, true]);
      expect(html).toContain('href="files/src/my%20index.ts"');
      expect(html).not.toContain('role="tablist"');
    });

    it('Puts the tab list in place of the title, from the initial tab, with the link for a linked file only', () => {
      const tabs = [_TABS.file, _TABS.virtual];
      const first = _render(<CodeSidebarView file={_FILE} tabs={tabs} documentation={[]} onClose={() => undefined} />);
      expect(first).toMatch(/role="tablist".*>src\/my index.ts<.*>HTML</s);
      expect(first).not.toContain('<h2');
      expect(first).toContain('Open in a new tab');
      const second = _render(<CodeSidebarView tabs={tabs} documentation={[]} initialTab={1} onClose={() => undefined} />);
      expect(second).toContain('class="hljs language-html"');
      expect(second).not.toContain('Open in a new tab');
      expect(second).toContain('aria-label="Close"');
    });
  });

  it('Is 66% of the viewport wide, between 400 and 1200 pixels', () => {
    expect([CODE_SIDEBAR_WIDTH, CODE_SIDEBAR_MIN_WIDTH, CODE_SIDEBAR_MAX_WIDTH]).toEqual(['66vw', 400, 1200]);
  });

  it('Renders nothing while closed', () => {
    const without = _render(<span>Page</span>);
    expect(
      _render(
        <>
          <span>Page</span>
          <CodeSidebar onClose={() => undefined} />
          <CodeSidebar tabs={[_TABS.virtual]} open={false} onClose={() => undefined} />
        </>,
      ),
    ).toBe(without);
  });
});
