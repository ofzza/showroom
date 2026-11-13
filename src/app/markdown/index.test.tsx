/**
 * Tests of Markdown rendering of documentation files
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { DocumentationFile, LinkedFile } from '../../host/index.js';
import { COLOURED_TOKEN_CLASSES, UNCOLOURED_TOKEN_CLASSES } from '../code/index.js';
import { Markdown, UNRESOLVED_LINK_TOOLTIP } from './index.js';

/**
 * Linked files the rendered documentation files link to
 */
const _LINKED_FILES: LinkedFile[] = [
  { path: 'docs/diagram.png', size: 70, text: false },
  { path: 'src/big.json', size: 2 * 1024 * 1024, text: false },
  { path: 'src/index.ts', size: 75, text: true },
];

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
        <Markdown file={file} documentation={documentation} linkedFiles={_LINKED_FILES} />
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

  it('Colours every token class highlight.js emits', () => {
    // A class left out is shown in the code block's own colour: README.md's `md` examples are a single `hljs-code` token, and once weren't coloured
    const samples = [
      ['md', '# Title\n\n- *item* **bold** [link](x)\n\n> quote\n\n```html\n<b>x</b>\n```\n\n`code`'],
      ['ts', 'class A extends B { m(p: number): string { return `${p}\\n` + /re/.source; } } // c\nconst f = (x) => x >= 1 && this;'],
      ['html', '<!doctype html>\n<a href="x" class="y">t &amp;</a>'],
      ['css', '@media (x) { a:hover, #id .c[data-x="1"] { color: #fff !important; width: 1px; } }'],
      ['json', '{ "a": [1, true, null, "s"] }'],
      ['bash', '#!/bin/sh\nexport A="$B" && echo $(ls) # c'],
      ['diff', '--- a\n+++ b\n@@ -1 +1 @@\n-x\n+y'],
    ];
    const html = samples.map(([language, code]) => _render(`\`\`\`${language}\n${code}\n\`\`\``)).join('');
    const emitted = new Set([...html.matchAll(/class="(hljs-[\w-]+)/g)].map((match) => match[1]!));
    expect(emitted).toContain('hljs-code');
    expect([...emitted].filter((name) => !COLOURED_TOKEN_CLASSES.includes(name) && !UNCOLOURED_TOKEN_CLASSES.includes(name))).toEqual([]);
  });

  it('Links documentation files to their routes, and absolute URLs to a new tab', () => {
    const html = _render('[Home](../README.md) [Install](#install) [Site](https://example.com)');
    expect(html).toMatch(/<a [^>]*href="#\/"[^>]*>Home<\/a>/);
    expect(html).toMatch(/<a [^>]*href="#\/docs\/guide.md#install"[^>]*>Install<\/a>/);
    expect(html).toMatch(/<a [^>]*href="https:\/\/example.com"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>Site<\/a>/);
  });

  it('Links text linked files to their copies, opened in the modal on click, and other linked files to a new tab', () => {
    const html = _render('[code](../src/index.ts#L2) [big](../src/big.json) [diagram](diagram.png)');
    // The modal opens on click, which needs effects; the link still names the copy, for the browser's own "open in a new tab"
    expect(html).toMatch(/<a [^>]*href="files\/src\/index.ts"[^>]*>code<\/a>/);
    expect(html).not.toMatch(/<a [^>]*href="files\/src\/index.ts"[^>]*target=/);
    expect(html).toMatch(/<a [^>]*href="files\/src\/big.json"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>big<\/a>/);
    expect(html).toMatch(/<a [^>]*href="files\/docs\/diagram.png"[^>]*target="_blank"[^>]*>diagram<\/a>/);
  });

  it('Shows links to anything else as plain text', () => {
    const html = _render('See [the missing code](../src/missing.ts), [a folder](../src/).');
    expect(html).not.toContain('../src/missing.ts');
    expect(html).toMatch(/<span [^>]*tabindex="0"[^>]*>the missing code<\/span>/);
    expect(html).toMatch(/<span [^>]*tabindex="0"[^>]*>a folder<\/span>/);
    // The tooltip itself only appears on hover or focus, through a portal, so only its trigger is rendered here
    expect(UNRESOLVED_LINK_TOOLTIP).toBe('Not in the showroom');
  });

  it('Shows relative images from their linked files, absolute ones as they are, and any other as its alt text', () => {
    const html = _render('![A diagram](./diagram.png) ![A badge](https://example.com/badge.svg) ![A photo](./photo.jpg)');
    expect(html).toContain('<img src="files/docs/diagram.png" alt="A diagram"/>');
    expect(html).toContain('<img src="https://example.com/badge.svg" alt="A badge"/>');
    expect(html).not.toContain('photo.jpg');
    expect(html).toContain('<span>A photo</span>');
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
