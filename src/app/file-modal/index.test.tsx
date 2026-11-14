/**
 * Tests of the linked files' modal
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { DocumentationFile, LinkedFile } from '../../host/index.js';
import type { ShownTab } from '../host/index.js';
import {
  LinkedFileDialog,
  LinkedFileView,
  MISSING_DOCUMENTATION_MESSAGE,
  MISSING_FILE_MESSAGE,
  NOT_TEXT_MESSAGE,
  ShownTabList,
  ShownTabView,
  fetchLinkedFile,
  getDialogView,
  getFetchedTabUrl,
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

describe('app/file-modal', () => {
  // Tests the modal's and the tabs' content by rendering it on the server with given content (effects don't run, and FluentUI's dialog renders
  // through a portal, so nothing of it is rendered on the server), what the modal shows with and without tabs (getDialogView()), and fetching a
  // linked file with a stubbed `fetch`.

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('LinkedFileView', () => {
    // The modal's content in each of its states.

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

  describe('getDialogView', () => {
    // What the modal shows: the file alone, or the selected tab of a linked showcase shown inline with included files.

    it('Shows the file alone without tabs, or with one', () => {
      const alone = { index: 0, title: 'src/my index.ts', fetchUrl: 'files/src/my%20index.ts', openUrl: 'files/src/my%20index.ts' };
      expect(getDialogView(_FILE, undefined, 0)).toEqual(alone);
      expect(getDialogView(_FILE, [_TABS.file], 0)).toEqual(alone);
    });

    it('Shows the selected tab, titled with its path, with a link for a linked file only', () => {
      const tabs = [_TABS.file, _TABS.virtual, _TABS.binary];
      expect(getDialogView(_FILE, tabs, 0)).toEqual({
        tab: _TABS.file,
        index: 0,
        title: 'src/my index.ts',
        fetchUrl: 'files/src/my%20index.ts?hash=0123abcd',
        openUrl: 'files/src/my%20index.ts?hash=0123abcd',
      });
      expect(getDialogView(_FILE, tabs, 1)).toEqual({ tab: _TABS.virtual, index: 1, title: 'README.showcase-1.html', fetchUrl: undefined, openUrl: undefined });
      expect(getDialogView(_FILE, tabs, 2)).toMatchObject({ fetchUrl: undefined, openUrl: 'files/logo.png' });
      // A selection beyond the tabs (after the tabs changed) falls back to the last
      expect(getDialogView(_FILE, tabs, 7).index).toBe(2);
    });
  });

  it('Renders nothing while no file is shown', () => {
    const without = _render(<span>Page</span>);
    expect(
      _render(
        <>
          <span>Page</span>
          <LinkedFileDialog onClose={() => undefined} />
        </>,
      ),
    ).toBe(without);
  });
});
