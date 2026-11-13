/**
 * Tests of highlighted code
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import { COLOURED_TOKEN_CLASSES, HighlightedCode, TOKEN_STYLES, UNCOLOURED_TOKEN_CLASSES, getFence } from './index.js';

/**
 * Renders highlighted code to HTML on the server
 * @param content The code
 * @param language Its language
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(content: string, language: string): string {
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>
        <HighlightedCode content={content} language={language} />
      </FluentProvider>
    </SSRProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('app/code', () => {
  // Tests the fence built around a text on hand-written texts, and the highlighted code block by rendering it to HTML with `react-dom/server`. The
  // token colours' coverage is tested through Markdown's code blocks (src/app/markdown/).

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

  describe('HighlightedCode', () => {
    // The highlighted code block, rendered on the server.

    it('Highlights the code as Markdown does, with a line number per line', () => {
      const html = _render('const answer = 42;\n// Done\n', 'ts');
      expect(html).toContain('class="hljs language-ts"');
      expect(html).toContain('<span class="hljs-keyword">const</span>');
      expect(html).toMatch(/<pre [^>]*aria-hidden="true"[^>]*>1\n2<\/pre>/);
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
