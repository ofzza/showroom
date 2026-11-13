/**
 * Tests of highlighted code
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import {
  COLOURED_TOKEN_CLASSES,
  CodeBlock,
  HighlightedCode,
  TOKEN_STYLES,
  UNCOLOURED_TOKEN_CLASSES,
  canCopy,
  copyText,
  countLines,
  getFence,
} from './index.js';

/**
 * Renders an element to HTML on the server
 * @param element The element
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _renderElement(element: ReactNode): string {
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>{element}</FluentProvider>
    </SSRProvider>,
  ).replaceAll('<!-- -->', '');
}

/**
 * Renders highlighted code to HTML on the server
 * @param content The code
 * @param language Its language
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(content: string, language: string): string {
  return _renderElement(<HighlightedCode content={content} language={language} />);
}

describe('app/code', () => {
  // Tests the fence built around a text and the line count on hand-written texts, the copy function with a stubbed `navigator`, and the code block
  // and the highlighted code block by rendering them to HTML with `react-dom/server` (where effects never run, so the copy button is always
  // rendered). The token colours' coverage is tested through Markdown's code blocks (src/app/markdown/).

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Colours the token classes as selectors inside an element', () => {
    expect(COLOURED_TOKEN_CLASSES).toContain('hljs-keyword');
    expect(UNCOLOURED_TOKEN_CLASSES).toContain('hljs-punctuation');
    expect(Object.keys(TOKEN_STYLES)).toContain('& .hljs-keyword');
    expect(Object.keys(TOKEN_STYLES)).toContain('& .hljs-title.class_');
  });

  describe('getFence', () => {
    // The fenced code block a text renders through, and its number of lines.

    it('Fences a text with its language, dropping one line break that ends it', () => {
      expect(getFence('const a = 1;\nconst b = 2;\n', 'ts')).toEqual({ markdown: '```ts\nconst a = 1;\nconst b = 2;\n```\n', lines: 2 });
      expect(getFence('a\r\nb\r\n\r\n', 'txt')).toEqual({ markdown: '```txt\na\r\nb\r\n\n```\n', lines: 3 });
      expect(getFence('', 'md').lines).toBe(1);
    });

    it('Makes the fence longer than any run of backticks in the text', () => {
      expect(getFence('````md\n```\n````', 'md').markdown).toBe('`````md\n````md\n```\n````\n`````\n');
      expect(getFence('a `b` c', 'md').markdown).toBe('```md\na `b` c\n```\n');
    });

    it('Leaves out a language holding a backtick or a space', () => {
      expect(getFence('a', 'my file').markdown).toBe('```\na\n```\n');
      expect(getFence('a', 'x`y').markdown).toBe('```\na\n```\n');
    });
  });

  describe('countLines', () => {
    // The lines of a code block's text, as its gutter numbers them.

    it('Counts lines, dropping one line break that ends the text', () => {
      expect(countLines('a')).toBe(1);
      expect(countLines('')).toBe(1);
      expect(countLines('a\nb\n')).toBe(2);
      expect(countLines('a\r\nb\r\n\r\n')).toBe(3);
      expect(countLines('a\rb')).toBe(2);
    });
  });

  describe('copyText', () => {
    // Copying through `navigator.clipboard`, stubbed; it only exists in secure contexts (see AGENTS.md › The copy button needs a secure context).

    it('Writes the text to the clipboard', async () => {
      const writeText = vi.fn(() => Promise.resolve());
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      expect(canCopy()).toBe(true);
      expect(await copyText('const a = 1;')).toBe(true);
      expect(writeText).toHaveBeenCalledWith('const a = 1;');
    });

    it('Fails when the clipboard refuses the text', async () => {
      vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('Denied')) } });
      expect(await copyText('a')).toBe(false);
    });

    it('Fails without a clipboard, outside secure contexts', async () => {
      vi.stubGlobal('navigator', {});
      expect(canCopy()).toBe(false);
      expect(await copyText('a')).toBe(false);
    });
  });

  describe('CodeBlock', () => {
    // The code block around highlighted code, rendered on the server.

    it('Numbers the lines in a gutter that is hidden from screen readers and not selected', () => {
      const html = _renderElement(
        <CodeBlock text={'a\nb\nc\n'}>
          <pre>
            <code>{'a\nb\nc'}</code>
          </pre>
        </CodeBlock>,
      );
      expect(html).toMatch(/<pre [^>]*aria-hidden="true"[^>]*>1\n2\n3<\/pre>/);
      expect(html).toContain('<code>a\nb\nc</code>');
    });

    it('Has a copy button', () => {
      const html = _renderElement(
        <CodeBlock text="a">
          <pre>
            <code>a</code>
          </pre>
        </CodeBlock>,
      );
      expect(html).toMatch(/<button [^>]*aria-label="Copy code"/);
    });
  });

  describe('HighlightedCode', () => {
    // The highlighted code block, rendered on the server.

    it('Highlights the code as Markdown does, with a line number per line', () => {
      const html = _render('const answer = 42;\n// Done\n', 'ts');
      expect(html).toContain('class="hljs language-ts"');
      expect(html).toContain('<span class="hljs-keyword">const</span>');
      expect(html).toMatch(/<pre [^>]*aria-hidden="true"[^>]*>1\n2<\/pre>/);
      expect(html).toMatch(/<button [^>]*aria-label="Copy code"/);
    });

    it('Shows the whole text as code, fences and HTML included', () => {
      const html = _render('# Title\n\n```js\n<script>alert(1)</script>\n```\n', 'md');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html.match(/<code/g)).toHaveLength(1);
      expect(html).toMatch(/>1\n2\n3\n4\n5<\/pre>/);
    });

    it("Shows a language highlight.js doesn't know as plain text", () => {
      const html = _render('a = b\n', 'no-such-language');
      expect(html).toContain('a = b');
      expect(html).not.toContain('hljs-');
    });
  });
});
