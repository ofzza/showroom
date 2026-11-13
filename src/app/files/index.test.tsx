/**
 * Tests of the linked files' modal
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { LinkedFile } from '../../host/index.js';
import { LinkedFileDialog, LinkedFileView, fetchLinkedFile, type LinkedFileContent } from './index.js';

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

describe('app/files', () => {
  // Tests the modal's content by rendering it on the server with given content (effects don't run, and FluentUI's dialog renders through a portal,
  // so nothing of it is rendered on the server), and fetching a linked file with a stubbed `fetch`.

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('LinkedFileView', () => {
    // The modal's content in each of its states.

    it('Shows a spinner while the file is fetched', () => {
      expect(_render(<LinkedFileView file={_FILE} content={{ status: 'loading' }} />)).toContain('Loading…');
    });

    it('Shows why the file failed to load', () => {
      const html = _render(<LinkedFileView file={_FILE} content={{ status: 'failed', message: "The file couldn't be loaded (404 Not Found)." }} />);
      expect(html).toContain('The file couldn&#x27;t be loaded (404 Not Found).');
    });

    it('Shows the content highlighted, in the language of its extension or name', () => {
      const content: LinkedFileContent = { status: 'loaded', text: 'export const a = 1;\n' };
      expect(_render(<LinkedFileView file={_FILE} content={content} />)).toContain('class="hljs language-ts"');
      const makefile = _render(<LinkedFileView file={{ path: 'Makefile', size: 1, text: true }} content={{ status: 'loaded', text: 'all:\n\techo hi\n' }} />);
      expect(makefile).toContain('class="hljs language-makefile"');
    });
  });

  describe('fetchLinkedFile', () => {
    // Fetching a linked file's copy, with `fetch` stubbed.

    it("Fetches the file's copy, never from the cache", async () => {
      const fetch = vi.fn(async () => new Response('export const a = 1;\n'));
      vi.stubGlobal('fetch', fetch);
      expect(await fetchLinkedFile(_FILE)).toEqual({ status: 'loaded', text: 'export const a = 1;\n' });
      expect(fetch).toHaveBeenCalledWith('files/src/my%20index.ts', expect.objectContaining({ cache: 'no-store' }));
    });

    it('Fails on an error status, or a failed request', async () => {
      vi.stubGlobal('fetch', async () => new Response('Not found', { status: 404, statusText: 'Not Found' }));
      expect(await fetchLinkedFile(_FILE)).toEqual({ status: 'failed', message: "The file couldn't be loaded (404 Not Found)." });
      vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
      expect(await fetchLinkedFile(_FILE)).toEqual({ status: 'failed', message: "The file couldn't be loaded (500)." });
      vi.stubGlobal('fetch', async () => Promise.reject(new TypeError('Failed to fetch')));
      expect(await fetchLinkedFile(_FILE)).toEqual({ status: 'failed', message: "The file couldn't be loaded (Failed to fetch)." });
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
