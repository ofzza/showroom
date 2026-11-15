/**
 * Tests of showcases in the showroom: placing showcase frames in rendered Markdown, and the showcase frame's iframe
 */

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { DocumentationFile } from '../../host/index.js';
import { getShowcaseSources, scanMarkdown } from '../../markdown/index.js';
import type { LoadedShowcase, ShownShowcase, ShownVirtualFile } from '../host/index.js';
import { Markdown } from '../markdown/index.js';
import { ThemeContext, type ThemeName } from '../theme/index.js';
import { DEFAULT_FRAME_HEIGHT, ShowcaseFrame, getFenceInside, getShowcaseFrameTitle, remarkShowcaseFrames, splitShowcaseMarkdown } from './index.js';

/**
 * Path of the documentation file the tests render
 */
const _PATH = 'docs/guide.md';

/**
 * Gets the shown showcases of a documentation file, as `check` finds them, each with a URL naming its position, and one tab whose content names
 * it (`code of <n>`)
 * @param content Markdown content of the documentation file
 * @returns The shown showcases
 */
function _showcases(content: string): ShownShowcase[] {
  return scanMarkdown(_PATH, content).showcases.map(({ id, documentation, offset, display, entry }) => ({
    id,
    documentation,
    offset,
    display,
    views: ['demo'],
    markdown: '',
    entryTab: 0,
    checks: [],
    issues: [],
    buildMark: true,
    tabs: [{ label: 'HTML', path: entry, language: 'html', source: { kind: 'virtual', content: `code of ${id.slice(id.lastIndexOf('#') + 1)}` } }],
    url: `showcases/${id.replace('#', '/')}/index.html?hash=0123abcd`,
  }));
}

/**
 * Renders a documentation file with its showcases to HTML on the server
 * @param content Markdown content of the documentation file
 * @param showcases Shown showcases; those of the content by default
 * @param theme Name of the theme
 * @param virtualFiles Shown virtual files; none by default
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes, and with every showcase frame (its box, with its
 * iframe and nothing logged) replaced by `[<n>]`, `<n>` being its showcase's position
 */
function _render(content: string, showcases = _showcases(content), theme: ThemeName = 'light', virtualFiles: ShownVirtualFile[] = []): string {
  const file: DocumentationFile = { path: _PATH, kind: 'other', extension: '.md', content };
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>
        <ThemeContext.Provider value={theme}>
          <Markdown file={file} documentation={[file]} showcases={showcases} virtualFiles={virtualFiles} />
        </ThemeContext.Provider>
      </FluentProvider>
    </SSRProvider>,
  )
    .replaceAll('<!-- -->', '')
    .replace(/<div class="[^"]*"><iframe [^>]*src="showcases\/docs\/guide\.md\/(\d+)\/index\.html[^>]*><\/iframe><\/div>/g, '[$1]');
}

describe('app/showcases', () => {
  // Tests placing showcase frames and blocks through the Markdown component, on hand-written Markdown whose showcases `scanMarkdown()` finds (so offsets are
  // the ones `check` gives), with each showcase frame's iframe reduced to its position; and the iframe itself, server-rendered.

  describe('Placement', () => {
    // Where the remark plugin puts each showcase: a showcase shown as a block (its code pane marked by `data-code-pane-state`) in its fence's or
    // paragraph's place; a linked showcase shown inline nowhere, as its link opens it in the showcase sidebar.

    it("Places a code block showcase as a block in its fence's place, and leaves a linked one shown inline as its link", () => {
      const html = _render('Intro\n\n```html showcase\n<p>x</p>\n```\n\nSee [the demo](demo.html "showcase") here.');
      expect(html).toMatch(/<p>Intro<\/p>\s*<div [^>]*data-code-pane-state="hidden"[^>]*>.*\[1\].*code of 1.*<\/div>\s*<p>See /s);
      expect(html).not.toContain('[2]');
      // The fence itself is gone: its code is only in the code pane
      expect(html).not.toContain('&lt;p&gt;x&lt;/p&gt;');
    });

    it("Places a linked showcase shown as a block in its paragraph's place, in a list item and a blockquote too", () => {
      const html = _render('Before\n\n[a](a.html "showcase block")\n\n- [b](b.html "showcase block")\n\n> [c](c.html "showcase block")');
      expect(html).toMatch(/<p>Before<\/p>\s*<div [^>]*data-code-pane-state[^>]*>.*\[1\].*code of 1/s);
      expect(html).toMatch(/<li>\s*<div [^>]*data-code-pane-state[^>]*>.*\[2\]/s);
      expect(html).toMatch(/<blockquote>\s*<div [^>]*data-code-pane-state[^>]*>.*\[3\]/s);
      // The links' text isn't shown
      expect(html).not.toMatch(/>a<\/a>|>b<\/a>|>c<\/a>/);
    });

    it('Leaves a showcase with no showcase frame as plain Markdown', () => {
      // A showcase missing from the shown showcases, e.g. while serve's first build threw
      const html = _render('```html showcase\n<p>x</p>\n```\n\n[a](a.html "showcase block")', []);
      expect(html).toContain('<code class="hljs language-html">');
      // Its paragraph stays (the link to a.html points to nothing here, so it is plain text)
      expect(html).toMatch(/<p><span [^>]*>a<\/span><\/p>/);
      expect(html).not.toContain('data-code-pane-state');
    });

    it('Places no showcase frame for linked showcases shown inline, wherever their links are', () => {
      // Before P16 (D513, .workflow/SPEC-S12-showcase-views.md), each was placed before its paragraph, heading or table
      const html = _render('[a](a.html "showcase") and [b](b.html "showcase")\n\n- item [c](c.html "showcase")\n\n## Demo [d](d.html "showcase")');
      expect(html).not.toContain('<iframe');
      expect(html).toMatch(/<li>item /);
      expect(html).toMatch(/<h2 id="demo-d">/);
    });

    it('Skips a showcase whose offset matches no fence or link, and those of other documentation files', () => {
      const content = 'Text\n\n[a](a.html "showcase block")';
      const [showcase] = _showcases(content);
      expect(_render(content, [showcase])).toContain('[1]');
      expect(_render(content, [{ ...showcase, offset: 0 }])).not.toContain('[1]');
      expect(_render(content, [{ ...showcase, documentation: 'README.md' }])).not.toContain('[1]');
      expect(_render(content, [])).not.toContain('<iframe');
    });

    it('Removes a showcase shown as nothing, block or linked, leaving no trace of its fence or paragraph', () => {
      const content = 'Before\n\n```html showcase view=none\n<p>x</p>\n```\n\n[a](a.html "showcase block view=none")\n\nAfter';
      const html = _render(
        content,
        _showcases(content).map((showcase) => ({ ...showcase, views: ['none'] })),
      );
      expect(html).toMatch(/<p>Before<\/p>\s*<p>After<\/p>/);
      expect(html).not.toContain('data-code-pane-state');
    });

    it("Places the shown virtual files with no showcase adapter in their fences' place, or removes them, leaving the others as code blocks", () => {
      const content =
        '```css showcase file=a.css\na {}\n```\n\n```css showcase file=b.css view=markdown\nb {}\n```\n\n```css showcase file=c.css view=none\nc {}\n```';
      const sources = getShowcaseSources(content);
      const virtualFiles = scanMarkdown(_PATH, content)
        .virtualFiles.filter(({ views }) => views?.[0] !== 'source')
        .map(({ path, offset, views }) => ({ path, documentation: _PATH, offset, views: views!, markdown: sources.get(offset)! }));
      const html = _render(content, [], 'light', virtualFiles);
      // a.css stays an ordinary code block; b.css shows its fence, marker included; c.css is gone
      expect(html).toContain('class="hljs language-css">');
      expect(html).not.toContain('showcase file=a.css');
      expect(html).toMatch(/class="hljs language-md">.*showcase file=b.css view=markdown.*class="hljs language-css">/s);
      expect(html).not.toContain('c {}');
      expect(html).not.toContain('data-code-pane-state');
    });

    it('Changes nothing without showcases', () => {
      const transform = remarkShowcaseFrames({ showcases: [] });
      const tree = { type: 'root', children: [{ type: 'paragraph', position: { start: { offset: 0 } } }] };
      transform(tree);
      expect(tree.children).toHaveLength(1);
    });
  });

  describe('Markdown and source views', () => {
    // Splitting a showcase's Markdown source into the segments its markdown view highlights, on hand-written sources.

    it('Splits a fence into its lines, as Markdown, around its inside, as its language', () => {
      expect(splitShowcaseMarkdown('```ts showcase=ts\nconst a = 1;\nconst b = 2;\n```')).toEqual([
        { text: '```ts showcase=ts', language: 'md' },
        { text: 'const a = 1;\nconst b = 2;', language: 'ts' },
        { text: '```', language: 'md' },
      ]);
      expect(splitShowcaseMarkdown('~~~~HTML showcase\n<p>~~~</p>\n~~~~~')).toEqual([
        { text: '~~~~HTML showcase', language: 'md' },
        { text: '<p>~~~</p>', language: 'html' },
        { text: '~~~~~', language: 'md' },
      ]);
    });

    it('Splits a fence with nothing inside, or never closed', () => {
      expect(splitShowcaseMarkdown('```css showcase file=a.css\n```')).toEqual([
        { text: '```css showcase file=a.css', language: 'md' },
        { text: '```', language: 'md' },
      ]);
      // A shorter fence doesn't close it
      expect(splitShowcaseMarkdown('````js showcase\na\n```')).toEqual([
        { text: '````js showcase', language: 'md' },
        { text: 'a\n```', language: 'js' },
      ]);
    });

    it('Keeps a link, or a fence in a blockquote, whole, as Markdown', () => {
      expect(splitShowcaseMarkdown('[a](a.html "showcase block")')).toEqual([{ text: '[a](a.html "showcase block")', language: 'md' }]);
      expect(splitShowcaseMarkdown('> ```html showcase\n> <p>x</p>\n> ```')).toEqual([{ text: '> ```html showcase\n> <p>x</p>\n> ```', language: 'md' }]);
    });

    it("Gets a fence's inside, with its language", () => {
      expect(getFenceInside('```css showcase file=a.css\na {}\n```')).toEqual({ text: 'a {}', language: 'css' });
      expect(getFenceInside('```css showcase file=a.css\n```')).toEqual({ text: '', language: '' });
    });
  });

  describe('Showcase frame', () => {
    // The iframe a showcase frame renders as, before any message: its URL with the theme, its title and its default height.

    const showcase: LoadedShowcase = {
      id: 'docs/my notes.md#2',
      documentation: 'docs/my notes.md',
      offset: 0,
      display: 'inline',
      views: ['demo'],
      markdown: '',
      entryTab: 0,
      checks: [],
      issues: [],
      buildMark: true,
      tabs: [],
      url: 'showcases/docs/my%20notes.md/2/index.html?hash=0123abcd',
    };

    /**
     * Renders a showcase frame
     * @param theme Name of the theme
     * @returns The rendered HTML
     */
    const render = (theme: ThemeName) =>
      renderToString(
        <SSRProvider>
          <FluentProvider theme={webLightTheme}>
            <ThemeContext.Provider value={theme}>
              <ShowcaseFrame showcase={showcase} />
            </ThemeContext.Provider>
          </FluentProvider>
        </SSRProvider>,
      );

    it('Renders a lazily loaded iframe with the theme added to its URL', () => {
      const html = render('dark');
      expect(html).toContain('src="showcases/docs/my%20notes.md/2/index.html?hash=0123abcd&amp;theme=dark"');
      expect(html).toContain('title="Showcase 2 of docs/my notes.md"');
      expect(html).toContain('loading="lazy"');
      expect(html).toContain(`height:${DEFAULT_FRAME_HEIGHT}px`);
      expect(html).toContain('color-scheme:dark');
      expect(html).not.toContain('min-height');
      // The showcase is the host repository's own code, so it isn't sandboxed, and keeps its storage and cookies
      expect(html).not.toContain('sandbox');
      expect(render('light')).toContain('&amp;theme=light');
    });

    it('Titles a showcase frame by its position and documentation file', () => {
      expect(getShowcaseFrameTitle({ ...showcase, id: 'README.md#12', documentation: 'README.md' })).toBe('Showcase 12 of README.md');
    });
  });
});
