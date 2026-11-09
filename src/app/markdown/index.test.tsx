/**
 * Tests of Markdown rendering of documentation files
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { DocumentationFile } from '../../host/index.js';
import { Markdown, UNRESOLVED_LINK_TOOLTIP } from './index.js';

/**
 * Renders a Markdown documentation file to HTML on the server
 * @param content Markdown content of the file
 * @param path Path of the file
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(content: string, path = 'docs/guide.md'): string {
  const file: DocumentationFile = { path, kind: 'other', extension: '.md', content };
  const documentation: DocumentationFile[] = [{ path: 'README.md', kind: 'readme', extension: '.md', content: '' }, file];
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>
        <Markdown file={file} documentation={documentation} />
      </FluentProvider>
    </SSRProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('app/markdown', () => {
  // Tests the Markdown component by rendering hand-written Markdown to HTML with `react-dom/server`, and looking for the elements it should produce.

  it('Renders GitHub-flavoured Markdown', () => {
    const html = _render('Some **bold** text\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n\n~~gone~~');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<del>gone</del>');
  });

  it('Gives headings GitHub-compatible ids', () => {
    const html = _render('# Getting started\n\n## Install & run\n\n## Install & run');
    expect(html).toContain('<h1 id="getting-started">');
    expect(html).toContain('<h2 id="install--run">');
    expect(html).toContain('<h2 id="install--run-1">');
  });

  it('Highlights fenced code blocks, but not inline code', () => {
    const html = _render('Run `npm test`.\n\n```ts\nconst answer: number = 42;\n```\n\n```bash\necho "hi"\n```\n\n```tsx\nconst a = <b />;\n```');
    expect(html).toContain('<code>npm test</code>');
    expect(html).toContain('class="hljs language-ts"');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain('<span class="hljs-number">42</span>');
    expect(html).toContain('class="hljs language-bash"');
    expect(html).toContain('<span class="hljs-string">&quot;hi&quot;</span>');
    expect(html).toContain('class="hljs language-tsx"');
  });

  it('Links documentation files to their routes, and absolute URLs to a new tab', () => {
    const html = _render('[Home](../README.md) [Install](#install) [Site](https://example.com)');
    expect(html).toMatch(/<a [^>]*href="#\/"[^>]*>Home<\/a>/);
    expect(html).toMatch(/<a [^>]*href="#\/docs\/guide.md#install"[^>]*>Install<\/a>/);
    expect(html).toMatch(/<a [^>]*href="https:\/\/example.com"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>Site<\/a>/);
  });

  it('Shows links to anything else as plain text', () => {
    const html = _render('See [the code](../src/index.ts).');
    expect(html).not.toContain('../src/index.ts');
    expect(html).toMatch(/<span [^>]*tabindex="0"[^>]*>the code<\/span>/);
    // The tooltip itself only appears on hover or focus, through a portal, so only its trigger is rendered here
    expect(UNRESOLVED_LINK_TOOLTIP).toBe('Not in the showcase application');
  });

  it('Shows relative images as their alt text, and absolute ones as images', () => {
    const html = _render('![A diagram](./diagram.png) ![A badge](https://example.com/badge.svg)');
    expect(html).not.toContain('diagram.png');
    expect(html).toContain('<span>A diagram</span>');
    expect(html).toContain('<img src="https://example.com/badge.svg" alt="A badge"/>');
  });

  it('Leaves out raw HTML, keeping the Markdown around it', () => {
    const html = _render('<div align="center">\n\n**Inside**\n\n</div>\n\n<script>alert(1)</script>\n\nAfter <b>tag</b>');
    expect(html).not.toContain('<div align');
    expect(html).not.toContain('script');
    expect(html).not.toContain('&lt;');
    expect(html).toContain('<strong>Inside</strong>');
    expect(html).toContain('After tag');
  });

  it('Drops unsafe link targets', () => {
    const html = _render('[Click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });
});
