/**
 * Tests of showcases in the showroom: placing showcase frames in rendered Markdown, and the showcase frame's iframe
 */

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { DocumentationFile } from '../../host/index.js';
import { scanMarkdown } from '../../markdown/index.js';
import type { ShownShowcase } from '../host/index.js';
import { Markdown } from '../markdown/index.js';
import { ThemeContext, type ThemeName } from '../theme/index.js';
import { DEFAULT_FRAME_HEIGHT, ShowcaseFrame, getShowcaseFrameTitle, remarkShowcaseFrames } from './index.js';

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
    tabs: [{ label: 'HTML', path: entry, language: 'html', source: { kind: 'virtual', content: `code of ${id.slice(id.lastIndexOf('#') + 1)}` } }],
    url: `showcases/${id.replace('#', '/')}/index.html?hash=0123abcd`,
  }));
}

/**
 * Renders a documentation file with its showcases to HTML on the server
 * @param content Markdown content of the documentation file
 * @param showcases Shown showcases; those of the content by default
 * @param theme Name of the theme
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes, and with every showcase frame's iframe
 * replaced by `[<n>]`, `<n>` being its showcase's position
 */
function _render(content: string, showcases = _showcases(content), theme: ThemeName = 'light'): string {
  const file: DocumentationFile = { path: _PATH, kind: 'other', extension: '.md', content };
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>
        <ThemeContext.Provider value={theme}>
          <Markdown file={file} documentation={[file]} showcases={showcases} />
        </ThemeContext.Provider>
      </FluentProvider>
    </SSRProvider>,
  )
    .replaceAll('<!-- -->', '')
    .replace(/<iframe [^>]*src="showcases\/docs\/guide\.md\/(\d+)\/index\.html[^>]*><\/iframe>/g, '[$1]');
}

describe('app/showcases', () => {
  // Tests placing showcase frames and blocks through the Markdown component, on hand-written Markdown whose showcases `scanMarkdown()` finds (so offsets are
  // the ones `check` gives), with each showcase frame's iframe reduced to its position; and the iframe itself, server-rendered.

  describe('Placement', () => {
    // Where the remark plugin puts each showcase: a showcase shown inline before the nearest paragraph, heading, table or code block holding its
    // entry point; a showcase shown as a block (its code pane marked by `data-code-pane-state`) in its fence's or paragraph's place.

    it("Places a code block showcase as a block in its fence's place, and a linked one shown inline before its paragraph", () => {
      const html = _render('Intro\n\n```html showcase\n<p>x</p>\n```\n\nSee [the demo](demo.html "showcase") here.');
      expect(html).toMatch(/<p>Intro<\/p>\s*<div [^>]*data-code-pane-state="hidden"[^>]*>.*\[1\].*code of 1.*\[2\]\s*<p>See /s);
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

    it('Places several showcases before one paragraph, in document order', () => {
      expect(_render('[a](a.html "showcase") and [b](b.html "showcase")')).toMatch(/>\s*\[1\]\s*\[2\]\s*<p>/);
    });

    it('Places showcases inside lists and blockquotes, before their paragraphs', () => {
      const html = _render('- item [a](a.html "showcase")\n\n> quote [b](b.html "showcase")');
      // A tight list's paragraph renders without its <p>
      expect(html).toMatch(/<li>\s*\[1\]\s*item /);
      expect(html).toMatch(/<blockquote>\s*\[2\]\s*<p>quote /);
    });

    it('Places showcases in a heading or a table cell before the heading or the table', () => {
      const html = _render('## Demo [a](a.html "showcase")\n\n| x |\n| - |\n| [b](b.html "showcase") |');
      expect(html).toMatch(/\[1\]\s*<h2 id="demo-a">/);
      expect(html).toMatch(/\[2\]\s*<table>/);
    });

    it('Skips a showcase whose offset matches no fence or link, and those of other documentation files', () => {
      const content = 'Text [a](a.html "showcase")';
      const [showcase] = _showcases(content);
      expect(_render(content, [{ ...showcase, offset: 0 }])).not.toContain('[1]');
      expect(_render(content, [{ ...showcase, documentation: 'README.md' }])).not.toContain('[1]');
      expect(_render(content, [])).not.toContain('<iframe');
    });

    it('Changes nothing without showcases', () => {
      const transform = remarkShowcaseFrames({ showcases: [] });
      const tree = { type: 'root', children: [{ type: 'paragraph', position: { start: { offset: 0 } } }] };
      transform(tree);
      expect(tree.children).toHaveLength(1);
    });
  });

  describe('Showcase frame', () => {
    // The iframe a showcase frame renders as, before any message: its URL with the theme, its title and its default height.

    const showcase: ShownShowcase = {
      id: 'docs/my notes.md#2',
      documentation: 'docs/my notes.md',
      offset: 0,
      display: 'inline',
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
      expect(html).toContain(`height:calc(${DEFAULT_FRAME_HEIGHT}px + 2 * var(--strokeWidthThin))`);
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
