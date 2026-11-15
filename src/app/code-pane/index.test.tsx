/**
 * Tests of the code pane
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { ShowcaseView } from '../../host/index.js';
import type { ShownShowcase } from '../host/index.js';
import { MISSING_FILE_MESSAGE } from '../code-sidebar/index.js';
import { CONSOLE_VIEW_HEIGHT, INITIAL_CONSOLE_STATE, type ConsoleState } from '../console/index.js';
import {
  CODE_PANE_BUTTON_LABELS,
  INITIAL_CODE_PANE_STATE,
  InlineShowcase,
  NOT_BUILT_TEXT,
  SHOWCASE_BLOCK_FRAME_MIN_HEIGHT,
  ShowcaseBlock,
  getCodePaneMinLines,
  getFrameView,
  getIssueLocation,
  getNextCodePaneState,
  getPlaceholderHeight,
  getStatusMarkLabel,
  getStatusMarkText,
  getStatusMarks,
  isStatusMarkButton,
  shouldExpandIssues,
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
  checks: [],
  issues: [],
  buildMark: true,
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
 * @param initialConsole The console's state
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(showcase: ShownShowcase, initialState?: CodePaneState, initialConsole?: ConsoleState): string {
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>
        <ShowcaseBlock showcase={showcase} documentation={[]} initialState={initialState} initialConsole={initialConsole} />
      </FluentProvider>
    </SSRProvider>,
  ).replaceAll('<!-- -->', '');
}

/**
 * The showcase with a type check that found an error in its code block and one in an included linked file, and a build warning naming no line
 */
const _ISSUES: ShownShowcase = {
  ..._SHOWCASE,
  checks: ['type check'],
  issues: [
    { severity: 'error', message: 'Type string is not assignable', check: 'type check', path: 'README.showcase-1.html', line: 1 },
    { severity: 'warning', message: 'Large chunk', path: 'README.showcase-1.html' },
    { severity: 'error', message: 'Missing name', check: 'type check', path: 'docs/clock.ts', line: 3 },
  ],
};

/**
 * A console's state once the page is ready, with warnings and errors
 * @param warningCount Number of warnings
 * @param errorCount Number of errors
 * @returns The state
 */
function _ready(warningCount = 0, errorCount = 0): ConsoleState {
  return { ...INITIAL_CONSOLE_STATE, ready: true, warningCount, errorCount };
}

describe('app/code-pane', () => {
  // Tests the showcase block by rendering it on the server in each state and with each showcase view, with given checks, issues and console states
  // (effects don't run, so nothing is fetched, and the layout itself, a container query, is only checked in a browser, see AGENTS.md › Testing);
  // the cycling button's order of states, the status marks, the issue list's decisions and the placeholder's height as pure functions; and a linked
  // showcase shown inline's header bar.

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

  describe('Status marks', () => {
    // Which status marks a showcase gets, with what text and label, and which are buttons; and the header bar rendered on the server with them.

    it('Gets the build mark, one per check, and runtime, from the issues and the console', () => {
      expect(getStatusMarks(_ISSUES, _ready(2, 0)).map(getStatusMarkText)).toEqual(['build ⚠ 1', 'type check ✗ 2', 'runtime ⚠ 2']);
      expect(getStatusMarks(_SHOWCASE, _ready()).map(getStatusMarkText)).toEqual(['build ✓', 'runtime ✓']);
      expect(getStatusMarks(_SHOWCASE, _ready(1, 3)).at(-1)).toEqual({ kind: 'runtime', name: 'runtime', status: 'error', count: 3 });
    });

    it('Reads runtime pending until the page is ready', () => {
      expect(getStatusMarks(_SHOWCASE, INITIAL_CONSOLE_STATE).map(getStatusMarkText)).toEqual(['build ✓', 'runtime …']);
    });

    it("Leaves out an html showcase's build mark, and runtime where the page doesn't run", () => {
      expect(getStatusMarks({ ..._SHOWCASE, buildMark: false }, _ready()).map(({ name }) => name)).toEqual(['runtime']);
      // Unbuilt, or with neither a demo nor a console view: no URL, no page
      expect(getStatusMarks({ ..._SHOWCASE, url: undefined }, _ready()).map(({ name }) => name)).toEqual(['build']);
      expect(getStatusMarks({ ..._SHOWCASE, views: ['source'], url: undefined }, _ready()).map(({ name }) => name)).toEqual(['build']);
    });

    it('Makes buttons of the marks that do something, labelled by what they do', () => {
      const [build, check, runtime] = getStatusMarks(_ISSUES, _ready());
      const passed = getStatusMarks(_SHOWCASE, _ready())[0];
      expect([passed, build, check, runtime].map(isStatusMarkButton)).toEqual([false, true, true, true]);
      expect(getStatusMarkLabel(passed, true, false)).toBe('build: passed');
      expect(getStatusMarkLabel(check, true, false)).toBe('type check: 2 errors. Hide the issues');
      expect(getStatusMarkLabel(build, false, false)).toBe('build: 1 warning. Show the issues');
      expect(getStatusMarkLabel(runtime, true, false)).toBe('runtime: passed. Open the console');
      expect(getStatusMarkLabel({ ...runtime, status: 'error', count: 1 }, true, true)).toBe('runtime: 1 error. Show the first error in the console');
      expect(getStatusMarkLabel({ ...runtime, status: 'pending' }, true, false)).toBe('runtime: loading. Open the console');
    });

    it('Renders the marks on the header bar, before the cycling button: a passed one as text, the others as buttons toggling the issue list', () => {
      const html = _render(_ISSUES, undefined, _ready());
      const bar = html.slice(0, html.indexOf(`aria-label="${CODE_PANE_BUTTON_LABELS.hidden}"`));
      expect(bar).toMatch(/<button [^>]*aria-label="build: 1 warning. Hide the issues"[^>]*aria-expanded="true"[^>]*aria-controls="([^"]+)"/);
      expect(bar).toMatch(/<button [^>]*aria-label="type check: 2 errors. Hide the issues"/);
      expect(bar).toMatch(/<button [^>]*aria-label="runtime: passed. Open the console"/);
      expect(_render(_SHOWCASE, undefined, _ready())).toMatch(/<span [^>]*aria-label="build: passed"[^>]*data-status-mark="passed">build<svg/);
      // Pending, greyed, with no icon
      expect(_render(_SHOWCASE)).toMatch(/aria-label="runtime: loading. Open the console"[^>]*data-status-mark="pending"[^>]*>runtime …</);
    });
  });

  describe('Issue list', () => {
    // The issue list under the header bar: its items, their order and locations, expanded at first; re-expanding as a pure decision.

    it('Lists every issue under the header bar, expanded at first, in order: its check, where it is and its message', () => {
      const html = _render(_ISSUES, undefined, _ready());
      const id = /aria-controls="([^"]+)"/.exec(html)![1];
      const list = html.slice(html.indexOf(`<ul id="${id}"`), html.indexOf('</ul>'));
      expect(list).toContain('aria-label="Issues"');
      const items = [
        ...list.matchAll(
          /<li [^>]*data-issue-severity="(\w+)"[^>]*>.*?<span [^>]*>([^<]*)<\/span><span [^>]*>([^<]*)<\/span><span [^>]*>([^<]*)<\/span><\/li>/g,
        ),
      ];
      expect(items.map((item) => item.slice(1))).toEqual([
        ['error', 'type check', 'HTML:1', 'Type string is not assignable'],
        ['warning', 'build', 'HTML', 'Large chunk'],
        ['error', 'type check', 'docs/clock.ts:3', 'Missing name'],
      ]);
      // Between the header bar and the views
      expect(html.indexOf('</ul>')).toBeLessThan(html.indexOf('data-showcase-view="demo"'));
    });

    it('Has no issue list without issues', () => {
      expect(_render(_SHOWCASE)).not.toContain('aria-label="Issues"');
    });

    it('Expands again only when a showcase with no issues gets some', () => {
      expect([shouldExpandIssues(0, 2), shouldExpandIssues(1, 2), shouldExpandIssues(2, 0), shouldExpandIssues(0, 0)]).toEqual([true, false, false, false]);
    });

    it("Says where an issue is by its tab's label, else its path relative to the documentation file", () => {
      const showcase = { ..._SHOWCASE, documentation: 'docs/guide.md' };
      expect(getIssueLocation(showcase, { severity: 'error', message: '', path: 'README.showcase-1.html', line: 2 })).toBe('HTML:2');
      expect(getIssueLocation(showcase, { severity: 'error', message: '', path: 'src/a.ts', line: 4 })).toBe('../src/a.ts:4');
      expect(getIssueLocation(showcase, { severity: 'error', message: '', path: 'docs/b.ts' })).toBe('b.ts');
    });
  });

  describe('Issue lines', () => {
    // The issue lines marked in the source and markdown views, and the tabs' icons.

    it('Marks the issue lines of the source view, and of the markdown view one line below, after the fence', () => {
      const markdown = '```html showcase\n<p class="big">Hi</p>\n```';
      const html = _render({ ..._ISSUES, views: ['markdown', 'source'], markdown, url: undefined });
      const [markdownView, sourceView] = html.split('data-showcase-view="source"');
      expect(markdownView).toMatch(/data-line-marker="error">2</);
      expect(markdownView).toContain('title="Type string is not assignable" data-line-band="2"');
      expect(sourceView).toMatch(/data-line-marker="error">1</);
      expect(sourceView).toContain('data-line-band="1"');
    });

    it('Puts an icon before the label of a tab whose file has issues', () => {
      const html = _render(_ISSUES, 'half');
      expect(html).toMatch(/data-tab-severity="error"[^>]*>.*?aria-label="Has errors".*?HTML/s);
      expect(html).toMatch(/title="theme.css"(?![^>]*data-tab-severity)/);
      expect(html).toMatch(/title="docs\/clock.ts"[^>]*data-tab-severity="error"/);
    });
  });

  describe('Not built', () => {
    // The placeholder in place of the showcase frame of a showcase that doesn't build, and its height.

    it('Shows "Not built" in the demo and console views, with no showcase frame, at their heights', () => {
      const html = _render({ ..._ISSUES, views: ['demo', 'console'], url: undefined });
      expect(html).not.toContain('<iframe');
      expect(html.match(new RegExp(`style="height:${CONSOLE_VIEW_HEIGHT}px" data-not-built="">${NOT_BUILT_TEXT}<`, 'g'))).toHaveLength(2);
      expect(html).not.toContain('role="log"');
    });

    it("Keeps the demo view's last reported height, else the console view's", () => {
      expect(getPlaceholderHeight('demo', 240)).toBe(240);
      expect(getPlaceholderHeight('demo', 4)).toBe(SHOWCASE_BLOCK_FRAME_MIN_HEIGHT);
      expect(getPlaceholderHeight('demo')).toBe(CONSOLE_VIEW_HEIGHT);
      expect(getPlaceholderHeight('console', 240)).toBe(CONSOLE_VIEW_HEIGHT);
    });
  });

  describe('InlineShowcase', () => {
    // A linked showcase shown inline: the block's header bar until P16 (D593, .workflow/PLAN-P15.5-status-marks.md), rendered on the server.

    /**
     * Renders a linked showcase shown inline
     * @param showcase The showcase
     * @returns The rendered HTML
     */
    const render = (showcase: ShownShowcase) =>
      renderToString(
        <SSRProvider>
          <FluentProvider theme={webLightTheme}>
            <InlineShowcase showcase={showcase} initialConsole={_ready()} />
          </FluentProvider>
        </SSRProvider>,
      ).replaceAll('<!-- -->', '');

    it('Shows its status marks with no cycling button, then its issue list, then its showcase frame', () => {
      const html = render({ ..._ISSUES, display: 'inline' });
      expect(html).toContain('aria-label="type check: 2 errors. Hide the issues"');
      expect(html).not.toContain(CODE_PANE_BUTTON_LABELS.hidden);
      expect(html.indexOf('aria-label="Issues"')).toBeLessThan(html.indexOf('<iframe'));
    });

    it('Shows "Not built" when it doesn\'t build', () => {
      const html = render({ ..._ISSUES, display: 'inline', url: undefined });
      expect(html).not.toContain('<iframe');
      expect(html).toContain(`data-not-built="">${NOT_BUILT_TEXT}<`);
    });
  });
});
