/**
 * Tests of the code pane
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { ShowcaseView } from '../../host/index.js';
import type { ShownShowcase } from '../host/index.js';
import { MISSING_FILE_MESSAGE } from '../code-sidebar/index.js';
import {
  CODE_PANE_BUTTON_LABELS,
  INITIAL_CODE_PANE_STATE,
  SHOWCASE_BLOCK_FRAME_MIN_HEIGHT,
  ShowcaseBlock,
  getCodePaneMinLines,
  getFrameView,
  getNextCodePaneState,
  type CodePaneState,
} from './index.js';

/**
 * A code block showcase with an included virtual file and an included linked file
 */
const _SHOWCASE: ShownShowcase = {
  id: 'README.md#1',
  documentation: 'README.md',
  offset: 0,
  display: 'block',
  views: ['demo'],
  markdown: '',
  entryTab: 0,
  tabs: [
    { label: 'HTML', path: 'README.showcase-1.html', language: 'html', source: { kind: 'virtual', content: '<p class="big">Hi</p>' } },
    { label: 'theme.css', path: 'theme.css', language: 'css', source: { kind: 'virtual', content: '.big {}' } },
    { label: 'docs/clock.ts', path: 'docs/clock.ts', language: 'ts', source: { kind: 'file', url: 'files/docs/clock.ts?hash=0123abcd', text: true } },
  ],
  url: 'showcases/README.md/1/index.html?hash=00000001',
};

/**
 * Renders a showcase block on the server
 * @param showcase The showcase
 * @param initialState The code pane's state
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(showcase: ShownShowcase, initialState?: CodePaneState): string {
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>
        <ShowcaseBlock showcase={showcase} documentation={[]} initialState={initialState} />
      </FluentProvider>
    </SSRProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('app/code-pane', () => {
  // Tests the showcase block by rendering it on the server in each state and with each showcase view (effects don't run, so nothing is fetched,
  // and the layout itself, a container query, is only checked in a browser, see AGENTS.md › Testing), and the cycling button's order of states.

  it('Cycles hidden, half, sidebar, and back, starting hidden', () => {
    expect(INITIAL_CODE_PANE_STATE).toBe('hidden');
    expect([getNextCodePaneState('hidden'), getNextCodePaneState('half'), getNextCodePaneState('sidebar')]).toEqual(['half', 'sidebar', 'hidden']);
  });

  it('Renders the header bar with the cycling button first, then the views, then the code pane with its tabs, copy button and selected tab', () => {
    const html = _render(_SHOWCASE, 'half');
    expect(html).toContain('data-code-pane-state="half"');
    const button = html.indexOf(`aria-label="${CODE_PANE_BUTTON_LABELS.half}"`);
    const frame = html.indexOf('<iframe');
    const tabs = html.indexOf('role="tablist"');
    const copy = html.indexOf('aria-label="Copy code"');
    const panel = html.indexOf('role="tabpanel"');
    expect(button).toBeGreaterThan(-1);
    expect([button < frame, frame < tabs, tabs < copy, copy < panel]).toEqual([true, true, true, true]);
    // The code block in the panel has no copy button of its own (D415)
    expect(html.split('aria-label="Copy code"')).toHaveLength(2);
    // Each tab by its label; the first selected, its code shown, labelled by its tab
    expect(html).toMatch(/>HTML<.*>theme.css<.*>docs\/clock.ts</s);
    expect(html).toContain('class="hljs language-html"');
    expect(html).not.toContain('.big {}');
    const tabId = /<button [^>]*aria-selected="true"[^>]*id="([^"]+)"|<button [^>]*id="([^"]+)"[^>]*aria-selected="true"/.exec(html);
    expect(html).toContain(`aria-labelledby="${tabId![1] ?? tabId![2]}"`);
  });

  it('Gives the demo view a minimum height in every state', () => {
    // The console panel's counter's row (D576); the cycling button no longer floats over the showcase frame
    expect(SHOWCASE_BLOCK_FRAME_MIN_HEIGHT).toBe(32);
    for (const state of ['hidden', 'half', 'sidebar'] as const) {
      expect(_render(_SHOWCASE, state)).toMatch(new RegExp(`<iframe [^>]*style="[^"]*min-height:${SHOWCASE_BLOCK_FRAME_MIN_HEIGHT}px`));
    }
  });

  it('Shows the tab list with a single tab too', () => {
    // Every block names its file or language (D408)
    expect(_render({ ..._SHOWCASE, tabs: [_SHOWCASE.tabs[0]] })).toMatch(/role="tablist".*>HTML</s);
  });

  it('Labels the cycling button by the state it switches to, and never makes the showcase frame inert', () => {
    for (const state of ['hidden', 'half'] as const) {
      const html = _render(_SHOWCASE, state);
      expect(html).toContain(`data-code-pane-state="${state}"`);
      expect(html).toContain(`aria-label="${CODE_PANE_BUTTON_LABELS[state]}"`);
      expect(html).not.toContain('inert');
    }
    expect(CODE_PANE_BUTTON_LABELS).toEqual({ hidden: 'Show the code', half: 'Show the code in a sidebar' });
  });

  it('Hides the cycling button while the code sidebar is open', () => {
    // The code sidebar itself renders nothing on the server (FluentUI's drawer, through its portal); its content is tested in src/app/code-sidebar/
    const html = _render(_SHOWCASE, 'sidebar');
    expect(html).toContain('data-code-pane-state="sidebar"');
    expect(html).toContain('<iframe');
    expect(html).not.toContain(`aria-label="${CODE_PANE_BUTTON_LABELS.hidden}"`);
    expect(html).not.toContain(`aria-label="${CODE_PANE_BUTTON_LABELS.half}"`);
    expect(html).not.toContain('inert');
  });

  it("Shows a missing file's tab saying so, with no copy button", () => {
    const html = _render({ ..._SHOWCASE, tabs: [{ label: 'out/a.html', path: 'out/a.html', language: 'html', source: { kind: 'missing' } }] }, 'half');
    expect(html).toContain(MISSING_FILE_MESSAGE.replace("'", '&#x27;'));
    expect(html).not.toContain('aria-label="Copy code"');
  });

  it("Shows a text linked file's tab loading, with no copy button, as nothing is fetched on the server", () => {
    const html = _render({ ..._SHOWCASE, tabs: [_SHOWCASE.tabs[2]] }, 'half');
    expect(html).toContain('Loading…');
    expect(html).not.toContain('aria-label="Copy code"');
  });

  it('Stacks the views in their order, each in a view of its own', () => {
    const order = (views: ShowcaseView[]) => [..._render({ ..._SHOWCASE, views }).matchAll(/data-showcase-view="(\w+)"/g)].map((match) => match[1]);
    expect(order(['demo'])).toEqual(['demo']);
    expect(order(['console', 'markdown', 'source', 'demo'])).toEqual(['console', 'markdown', 'source', 'demo']);
  });

  it("Shows the entry point's tab as the source view, and the showcase's Markdown as the markdown view", () => {
    const showcase: ShownShowcase = { ..._SHOWCASE, views: ['markdown', 'source'], markdown: '```html showcase\n<p class="big">Hi</p>\n```' };
    const html = _render(showcase);
    expect(html).toMatch(
      /data-showcase-view="markdown">.*class="hljs language-md".*class="hljs language-html".*data-showcase-view="source">.*class="hljs language-html"/s,
    );
    // The entry point's tab follows the Markdown tab, where it comes first
    const markdownTab = { label: 'Markdown', path: 'README.md', language: 'md', source: { kind: 'virtual' as const, content: 'x' } };
    const shifted = _render({ ..._SHOWCASE, views: ['source'], tabs: [markdownTab, ..._SHOWCASE.tabs], entryTab: 1 });
    expect(shifted).toMatch(/data-showcase-view="source">.*class="hljs language-html"/s);
  });

  it('Loads no showcase frame where no view needs its page running', () => {
    const { url: _url, ...unloaded } = _SHOWCASE;
    const html = _render({ ...unloaded, views: ['source'] });
    expect(html).not.toContain('<iframe');
    expect(getFrameView(['source'])).toBeUndefined();
    expect(getFrameView(['source', 'console'])).toBe('console');
    expect(getFrameView(['console', 'demo'])).toBe('demo');
  });

  it("Takes the selected tab's own lines as its minimum when it has fewer, or the minimum while its text isn't at hand", () => {
    // Short code beside a short showcase takes no more room than it needs (D416)
    expect([getCodePaneMinLines('a\nb'), getCodePaneMinLines('1\n2\n3\n4\n5\n6\n7\n'), getCodePaneMinLines(undefined)]).toEqual([2, 6, 6]);
    expect(_render(_SHOWCASE)).toContain('--showroom-code-pane-min-lines:1');
    expect(_render({ ..._SHOWCASE, tabs: [_SHOWCASE.tabs[2]] })).toContain('--showroom-code-pane-min-lines:6');
  });
});
