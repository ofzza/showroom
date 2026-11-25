/**
 * Tests of the code pane
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { ShowcaseView } from '../../host/index.js';
import type { ShownShowcase } from '../host/index.js';
import { MISSING_FILE_MESSAGE } from '../showcase-sidebar/index.js';
import { CONSOLE_VIEW_HEIGHT, INITIAL_CONSOLE_STATE, type ConsoleState } from '../console/index.js';
import {
  CLOSE_LABEL,
  CODE_PANE_BUTTON_LABELS,
  CODE_PANE_HIDE_LABEL,
  INITIAL_CODE_PANE_STATE,
  SIDEBAR_VIEWS_BUTTON_LABELS,
  NOT_BUILT_TEXT,
  SHOWCASE_BLOCK_FRAME_MIN_HEIGHT,
  ShowcaseBlock,
  TRUST_NOTICE_TEXT,
  TRUST_NOTICE_TOOLTIP,
  TrustedContext,
  getCodePaneMinLines,
  getFrameView,
  getInitialCodePaneState,
  getIssueLocation,
  getNextCodePaneState,
  getNextSidebarCodePaneState,
  getSidebarViewsState,
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
  // showcase shown inline's block, in the showcase sidebar.

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

  it('Hides the cycling button while the showcase sidebar is open', () => {
    // The showcase sidebar itself renders nothing on the server (FluentUI's drawer, through its portal); its content is tested in src/app/showcase-sidebar/
    const html = _render(_SHOWCASE, 'sidebar');
    expect(html).toContain('data-code-pane-state="sidebar"');
    expect(html).toContain('<iframe');
    expect(html).not.toContain(`aria-label="${CODE_PANE_BUTTON_LABELS.hidden}"`);
    expect(html).not.toContain(`aria-label="${CODE_PANE_BUTTON_LABELS.half}"`);
    expect(html).not.toContain(`aria-label="${CODE_PANE_HIDE_LABEL}"`);
    expect(html).not.toContain('inert');
  });

  it('Shows a button hiding the code pane right of the cycling button in the half state only', () => {
    // So hiding the code pane needn't go through the showcase sidebar (D629, .workflow/PLAN-P16-inline-sidebar.md)
    const html = _render(_SHOWCASE, 'half');
    const cycling = html.indexOf(`aria-label="${CODE_PANE_BUTTON_LABELS.half}"`);
    const hide = html.indexOf(`aria-label="${CODE_PANE_HIDE_LABEL}"`);
    expect(cycling).toBeGreaterThan(-1);
    expect(hide).toBeGreaterThan(cycling);
    expect(_render(_SHOWCASE, 'hidden')).not.toContain(`aria-label="${CODE_PANE_HIDE_LABEL}"`);
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
    // The entry point's tab wherever include= places it: after the Markdown tab, or before it
    const markdownTab = { label: 'Markdown', path: 'README.md', language: 'md', source: { kind: 'virtual' as const, content: 'x' }, markdown: true as const };
    const shifted = _render({ ..._SHOWCASE, views: ['source'], tabs: [markdownTab, ..._SHOWCASE.tabs], entryTab: 1 });
    expect(shifted).toMatch(/data-showcase-view="source">.*class="hljs language-html"/s);
    const last = _render({ ..._SHOWCASE, views: ['source'], tabs: [..._SHOWCASE.tabs, markdownTab], entryTab: 0 });
    expect(last).toMatch(/data-showcase-view="source">.*class="hljs language-html"/s);
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
    // Which status marks a showcase gets, with what text and label, and which are buttons; and the header bar rendered on the server with them, and
    // with the console's line.

    it("Places the console's line after the status marks and before the buttons, only where the console opens over the demo view", () => {
      // See D941 (SPEC-S12-showcase-views.md): with a console view, the lines are in view, so the header bar shows none
      const state = { ..._ready(), lines: [{ level: 'warn' as const, text: 'careful', id: 0, time: 0, quiet: false }], count: 1, next: 1 };
      const html = _render(_SHOWCASE, undefined, state);
      const line = html.indexOf('data-console-header-line="warn"');
      expect(line).toBeGreaterThan(html.indexOf('data-status-mark="passed"'));
      expect(line).toBeLessThan(html.indexOf(`aria-label="${CODE_PANE_BUTTON_LABELS.hidden}"`));
      expect(_render({ ..._SHOWCASE, views: ['demo', 'console'] }, undefined, state)).not.toContain('data-console-header-line');
      expect(_render(_SHOWCASE, undefined, _ready())).not.toContain('data-console-header-line');
    });

    it('Gets the build mark, one per check, and runtime, from the issues and the console', () => {
      expect(getStatusMarks(_ISSUES, _ready(2, 0)).map(getStatusMarkText)).toEqual(['build ⚠ 1', 'type check ✗ 2', '>_ runtime ⚠ 2']);
      expect(getStatusMarks(_SHOWCASE, _ready()).map(getStatusMarkText)).toEqual(['build ✓', '>_ runtime ✓']);
      expect(getStatusMarks(_SHOWCASE, _ready(1, 3)).at(-1)).toEqual({ kind: 'runtime', name: 'runtime', status: 'error', count: 3, lines: 0 });
    });

    it('Counts the lines logged on the runtime mark, after its state, once anything is logged', () => {
      // See D939, D940 (SPEC-S12-showcase-views.md): the console's counter is gone, so the runtime mark says how much was logged
      const logged = (count: number, warnings = 0, errors = 0) => getStatusMarks(_SHOWCASE, { ..._ready(warnings, errors), count }).at(-1)!;
      expect(getStatusMarkText(logged(12))).toBe('>_ runtime ✓ · 12 lines');
      expect(getStatusMarkText(logged(1))).toBe('>_ runtime ✓ · 1 line');
      expect(getStatusMarkText(logged(12, 2))).toBe('>_ runtime ⚠ 2 · 12 lines');
      expect(getStatusMarkText(logged(12, 0, 1))).toBe('>_ runtime ✗ 1 · 12 lines');
      expect(getStatusMarkLabel(logged(12, 0, 1), false, false)).toBe('runtime: 1 error, 12 lines. Open the console');
      // Nothing while loading, whatever came before the page was ready
      expect(getStatusMarkText(getStatusMarks(_SHOWCASE, { ...INITIAL_CONSOLE_STATE, count: 3 }).at(-1)!)).toBe('>_ runtime …');
      expect(_render(_SHOWCASE, undefined, { ..._ready(), count: 12 })).toMatch(
        /data-status-mark="passed"[^>]*><span [^>]*>&gt;_<\/span>runtime<svg[^]*?<\/svg> · 12 lines<\/button>/,
      );
    });

    it("Gives a jsonschema block build and runtime, and only build when its diagram doesn't build", () => {
      // See PLAN-P21 D854, SPEC-S17 D820: its build's issues name no check; an error ships no showcase frame, so there is no runtime
      const jsonschema: ShownShowcase = {
        ..._SHOWCASE,
        tabs: [{ label: 'JSON', path: 'README.showcase-1.json', language: 'json', source: { kind: 'virtual', content: '{}' } }],
      };
      const warning = { severity: 'warning' as const, message: 'The diagram is empty', path: 'README.showcase-1.json' };
      expect(getStatusMarks({ ...jsonschema, issues: [warning] }, _ready()).map(getStatusMarkText)).toEqual(['build ⚠ 1', '>_ runtime ✓']);
      const error = { severity: 'error' as const, message: "The schema isn't valid JSON", path: 'README.showcase-1.json', line: 3 };
      expect(getStatusMarks({ ...jsonschema, issues: [error], url: undefined }, _ready()).map(getStatusMarkText)).toEqual(['build ✗ 1']);
    });

    it('Reads runtime pending until the page is ready', () => {
      expect(getStatusMarks(_SHOWCASE, INITIAL_CONSOLE_STATE).map(getStatusMarkText)).toEqual(['build ✓', '>_ runtime …']);
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
      expect([passed, build, check, runtime].map((mark) => isStatusMarkButton(mark))).toEqual([false, true, true, true]);
      expect(getStatusMarkLabel(passed, true, false)).toBe('build: passed');
      expect(getStatusMarkLabel(check, true, false)).toBe('type check: 2 errors. Hide the issues');
      expect(getStatusMarkLabel(build, false, false)).toBe('build: 1 warning. Show the issues');
      expect(getStatusMarkLabel(runtime, true, false)).toBe('runtime: passed. Open the console');
      expect(getStatusMarkLabel({ ...runtime, status: 'error', count: 1 }, true, true)).toBe('runtime: 1 error. Show the first error in the console');
      expect(getStatusMarkLabel({ ...runtime, status: 'pending' }, true, false)).toBe('runtime: loading. Open the console');
    });

    it('Toggles the console panel over the demo view with the runtime mark, saying which it does', () => {
      // See D946 (PLAN-P28-console-header.md): a second click closes it; with a console view, it still shows the view's first issue line
      const runtime = getStatusMarks(_SHOWCASE, _ready()).at(-1)!;
      expect(getStatusMarkLabel(runtime, false, false, true)).toBe('runtime: passed. Close the console');
      expect(getStatusMarkLabel(runtime, false, true, true)).toBe('runtime: passed. Show the console');
      const open = _render(_SHOWCASE, undefined, { ..._ready(), open: true });
      expect(open).toMatch(/<button [^>]*aria-label="runtime: passed. Close the console"[^>]*aria-expanded="true"/);
      expect(_render(_SHOWCASE, undefined, _ready())).toMatch(/<button [^>]*aria-label="runtime: passed. Open the console"[^>]*aria-expanded="false"/);
      expect(_render({ ..._SHOWCASE, views: ['demo', 'console'] }, undefined, _ready())).not.toMatch(/aria-label="runtime[^"]*"[^>]*aria-expanded/);
    });

    it('Renders the marks on the header bar, before the cycling button: a passed one as text, the others as buttons toggling the issue list', () => {
      const html = _render(_ISSUES, undefined, _ready());
      const bar = html.slice(0, html.indexOf(`aria-label="${CODE_PANE_BUTTON_LABELS.hidden}"`));
      expect(bar).toMatch(/<button [^>]*aria-label="build: 1 warning. Hide the issues"[^>]*aria-expanded="true"[^>]*aria-controls="([^"]+)"/);
      expect(bar).toMatch(/<button [^>]*aria-label="type check: 2 errors. Hide the issues"/);
      expect(bar).toMatch(/<button [^>]*aria-label="runtime: passed. Open the console"/);
      expect(_render(_SHOWCASE, undefined, _ready())).toMatch(/<span [^>]*aria-label="build: passed"[^>]*data-status-mark="passed">build<svg/);
      // Pending, greyed, with no icon
      expect(_render(_SHOWCASE)).toMatch(
        /aria-label="runtime: loading. Open the console"[^>]*data-status-mark="pending"[^>]*><span [^>]*>&gt;_<\/span>runtime …</,
      );
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
      // The Markdown tab, under the documentation file's path, never names an issue in that file
      const markdownTab = {
        label: 'Markdown',
        path: 'docs/guide.md',
        language: 'md',
        source: { kind: 'virtual' as const, content: '' },
        markdown: true as const,
      };
      const withMarkdown = { ...showcase, tabs: [...showcase.tabs, markdownTab] };
      expect(getIssueLocation(withMarkdown, { severity: 'warning', message: '', path: 'docs/guide.md', line: 3 })).toBe('guide.md:3');
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

  describe('Without trust', () => {
    // A showcase of a host repository that isn't trusted (D741 in .workflow/SPEC-S14-trust.md): its block rendered on the server inside the trust
    // context, as App provides it from the shown host information's `trusted`.

    /**
     * Renders a block without trust
     * @param showcase The showcase, as the shown host information gives it without trust
     * @param onClose Given for a block in the showcase sidebar
     * @returns The rendered HTML
     */
    const render = (showcase: ShownShowcase, onClose?: () => void) =>
      renderToString(
        <SSRProvider>
          <FluentProvider theme={webLightTheme}>
            <TrustedContext.Provider value={false}>
              <ShowcaseBlock showcase={showcase} documentation={[]} onClose={onClose} />
            </TrustedContext.Provider>
          </FluentProvider>
        </SSRProvider>,
      ).replaceAll('<!-- -->', '');
    const untrusted: ShownShowcase = { ..._SHOWCASE, views: ['source'], url: undefined, buildMark: false };

    it('Shows the trust notice, with its (i) icon and its tooltip, in place of the status marks', () => {
      const html = render(untrusted);
      expect(html).toContain('data-trust-notice=""');
      expect(html).toContain(TRUST_NOTICE_TEXT);
      expect(html).toContain(`title="${TRUST_NOTICE_TOOLTIP.replaceAll("'", '&#x27;')}"`);
      expect(TRUST_NOTICE_TOOLTIP).toMatch(/answer yes when showroom asks, or pass --trust/);
      expect(html).not.toContain('data-status-mark');
      // Its source, and no showcase frame
      expect(html).toContain('data-showcase-view="source"');
      expect(html).not.toContain('<iframe');
      // Trusted, the status marks are back
      expect(_render(_SHOWCASE)).not.toContain('data-trust-notice');
    });

    it("Starts a linked showcase shown inline's block filling the showcase sidebar, with its tabs", () => {
      expect(getInitialCodePaneState(['source'], true, false)).toBe('sidebar');
      expect(getInitialCodePaneState(['source'], false, false)).toBe(INITIAL_CODE_PANE_STATE);
      expect(render({ ...untrusted, display: 'inline' }, () => {})).toContain('data-code-pane-state="sidebar"');
    });
  });

  describe('In the showcase sidebar', () => {
    // A linked showcase shown inline, shown as a block in the showcase sidebar (D616, .workflow/PLAN-P16-inline-sidebar.md): ShowcaseBlock with its
    // onClose, rendered on the server in each state (SidebarShowcase's drawer renders nothing there, through its portal).

    /**
     * Renders a linked showcase shown inline's block, as the showcase sidebar shows it
     * @param showcase The showcase
     * @param initialState The code pane's state; getInitialCodePaneState()'s by default
     * @returns The rendered HTML
     */
    const render = (showcase: ShownShowcase, initialState?: CodePaneState) =>
      renderToString(
        <SSRProvider>
          <FluentProvider theme={webLightTheme}>
            <ShowcaseBlock showcase={showcase} documentation={[]} initialState={initialState} initialConsole={_ready()} onClose={() => {}} />
          </FluentProvider>
        </SSRProvider>,
      ).replaceAll('<!-- -->', '');
    const inline: ShownShowcase = { ..._ISSUES, display: 'inline' };

    it('Starts below its views, or filling the showcase sidebar when it has none, and hidden on a page', () => {
      expect(getInitialCodePaneState(['demo'], true)).toBe('half');
      expect(getInitialCodePaneState(['source', 'console'], true)).toBe('half');
      expect(getInitialCodePaneState(['none'], true)).toBe('sidebar');
      expect(getInitialCodePaneState(['none'], false)).toBe(INITIAL_CODE_PANE_STATE);
      expect(render(inline)).toContain('data-code-pane-state="half"');
      expect(render({ ...inline, views: ['none'] })).toContain('data-code-pane-state="sidebar"');
    });

    it('Shows its status marks, the toggle button and the close button, then its issue list, its views and its code pane', () => {
      const html = render(inline);
      expect(html).toContain('data-showcase-sidebar=""');
      const marks = html.indexOf('aria-label="type check: 2 errors. Hide the issues"');
      const button = html.indexOf(`aria-label="${SIDEBAR_VIEWS_BUTTON_LABELS.expanded}"`);
      const close = html.indexOf(`aria-label="${CLOSE_LABEL}"`);
      const issues = html.indexOf('aria-label="Issues"');
      const frame = html.indexOf('<iframe');
      const tabs = html.indexOf('role="tablist"');
      expect(marks).toBeGreaterThan(-1);
      expect([marks < button, button < close, close < issues, issues < frame, frame < tabs]).toEqual([true, true, true, true, true]);
      // Never a showcase sidebar of its own
      expect(html.split('data-code-pane-state')).toHaveLength(2);
    });

    it('Toggles its views, expanded above the code pane or collapsed with the code pane filling the showcase sidebar, never hiding the code pane', () => {
      // A two-state toggle instead of the code pane's cycle (D628, .workflow/PLAN-P16-inline-sidebar.md)
      expect([getNextSidebarCodePaneState('half'), getNextSidebarCodePaneState('sidebar')]).toEqual(['sidebar', 'half']);
      expect([getSidebarViewsState('half'), getSidebarViewsState('sidebar')]).toEqual(['expanded', 'collapsed']);
      expect(render(inline)).toMatch(
        new RegExp(
          `aria-label="${SIDEBAR_VIEWS_BUTTON_LABELS.expanded}"[^>]*aria-expanded="true"|aria-expanded="true"[^>]*aria-label="${SIDEBAR_VIEWS_BUTTON_LABELS.expanded}"`,
        ),
      );
      const html = render(inline, 'sidebar');
      expect(html).toContain(`aria-label="${SIDEBAR_VIEWS_BUTTON_LABELS.collapsed}"`);
      expect(html).toContain('aria-expanded="false"');
      // The views stay mounted, the showcase frame never reloading (D617), but out of reach
      expect(html).toMatch(/<div [^>]*aria-hidden="true"[^>]*inert=""[^>]*>.*<iframe/s);
      expect(html).toContain('role="tabpanel"');
    });

    it('Has no toggle button with no views, the code pane always filling the showcase sidebar', () => {
      const html = render({ ...inline, views: ['none'] });
      for (const label of Object.values(SIDEBAR_VIEWS_BUTTON_LABELS)) expect(html).not.toContain(`aria-label="${label}"`);
      expect(html).toContain(`aria-label="${CLOSE_LABEL}"`);
      expect(html).not.toContain('<iframe');
      expect(html).toContain('role="tabpanel"');
    });

    it("Links a linked file's tab to a new tab, beside the copy button", () => {
      const html = render({ ...inline, views: ['none'], tabs: [inline.tabs[2]], entryTab: 0 });
      expect(html).toMatch(/href="files\/docs\/clock.ts\?hash=0123abcd"[^>]*target="_blank"/);
      // A virtual file's tab has no link
      expect(render({ ...inline, views: ['none'] })).not.toContain('target="_blank"');
    });

    it('Shows "Not built" when it doesn\'t build', () => {
      const html = render({ ...inline, url: undefined });
      expect(html).not.toContain('<iframe');
      expect(html).toContain(`data-not-built="">${NOT_BUILT_TEXT}<`);
    });
  });

  describe('Overlays over the page', () => {
    // A block whose opted-in showcase frame starts with overlays out (its starting overhang, as no message comes in the server-side rendering) is
    // raised over what follows it, and lets them out of its grid (D920 in .workflow/PLAN-P25-overlay-overhang.md); in the showcase sidebar, its
    // overlays cover the sticky header bar while they are out (D943 in .workflow/SPEC-S12-showcase-views.md), and a block whose views are collapsed
    // keeps them in (D924).

    const overhang = { height: 400, offset: 0, flow: 20, boxes: [{ left: 0, top: 10, right: 200, bottom: 400 }], open: true };
    const opted: ShownShowcase = { ..._SHOWCASE, views: ['demo'], overlays: true };

    /**
     * Renders a block with its showcase frame's overhang to start with
     * @param showcase The showcase
     * @param initialState The code pane's state
     * @param sidebar True to render it as the showcase sidebar shows it
     * @returns The rendered HTML
     */
    const render = (showcase: ShownShowcase, initialState?: CodePaneState, sidebar = false) =>
      renderToString(
        <SSRProvider>
          <FluentProvider theme={webLightTheme}>
            <ShowcaseBlock
              showcase={showcase}
              documentation={[]}
              initialState={initialState}
              initialConsole={_ready()}
              initialOverhang={overhang}
              onClose={sidebar ? () => {} : undefined}
            />
          </FluentProvider>
        </SSRProvider>,
      );

    it('Raises the block while its overlays are out, in every state of its code pane', () => {
      for (const state of ['hidden', 'half'] as const) {
        const html = render(opted, state);
        expect(html).toMatch(/data-code-pane-state="[a-z]+"[^>]*style="[^"]*z-index:1/);
        expect(html).toContain('data-overhang="1"');
        expect(html).toContain('overlays=1');
      }
      expect(render({ ...opted, display: 'inline' }, 'half', true)).toContain('data-overhang="1"');
    });

    it("Lowers the showcase sidebar's sticky header bar under the showcase frame while its overlays are out", () => {
      // See D943 (SPEC-S12-showcase-views.md): the overlays cover the header bar, its console line included; above it otherwise, as content scrolls
      expect(render({ ...opted, display: 'inline' }, 'half', true)).toContain('data-header-bar-level="0"');
      expect(render({ ...opted, display: 'inline', overlays: undefined }, 'half', true)).toContain('data-header-bar-level="3"');
      expect(render(opted, 'half')).not.toContain('data-header-bar-level');
    });

    it('Keeps a block lowered when not opted in, and collapsed in the showcase sidebar', () => {
      const optedOut = render({ ...opted, overlays: undefined }, 'hidden');
      const collapsed = render({ ...opted, display: 'inline' }, 'sidebar', true);
      for (const html of [optedOut, collapsed]) {
        expect(html).not.toContain('data-overhang');
        expect(html).not.toMatch(/data-code-pane-state="[a-z]+"[^>]*style="[^"]*z-index/);
      }
    });
  });

  describe('Recorded showcases', () => {
    // A recorded showcase's block, rendered on the server with its recording: its console view, its runtime status mark, no showcase frame.

    const recording = { lines: [{ level: 'log' as const, text: 'hello' }], dropped: 0, exitCode: 0 };
    const recorded: ShownShowcase = { ..._SHOWCASE, views: ['source', 'console'], url: undefined, checks: ['compile', 'runtime'], recording };

    it('Shows its recording in its console view, with no showcase frame and nothing pending', () => {
      const html = _render(recorded);
      expect(html).not.toContain('<iframe');
      expect(html).not.toContain(NOT_BUILT_TEXT);
      expect(html).toMatch(
        /data-showcase-view="console"><div [^>]*role="log" aria-label="Recorded output"[^>]*><div [^>]*>Recorded output<\/div><div [^>]*>hello<\/div><div [^>]*>Exited with code 0<\/div>/,
      );
    });

    it('Has one runtime status mark, from the recording, saying it was recorded when built', () => {
      const marks = getStatusMarks(recorded, INITIAL_CONSOLE_STATE);
      // Its line count is the program's own lines, dropped ones included, not the showroom's end line
      expect(marks.map(getStatusMarkText)).toEqual(['build ✓', 'compile ✓', '>_ runtime ✓ · 1 line']);
      const failed = getStatusMarks({ ...recorded, recording: { ...recording, exitCode: 2, dropped: 2 } }, INITIAL_CONSOLE_STATE).at(-1)!;
      expect(getStatusMarkText(failed)).toBe('>_ runtime ✗ 1 · 3 lines');
      expect(getStatusMarkLabel(failed, false, true)).toBe('runtime: 1 error, 3 lines, recorded when built. Show the first error in the console');
      // Without a console view, it is plain text (PLAN-P20 D784)
      expect(isStatusMarkButton(failed, false)).toBe(false);
      expect(getStatusMarkLabel(failed, false, false)).toBe('runtime: 1 error, 3 lines, recorded when built');
      expect(_render({ ...recorded, views: ['source'] })).toMatch(/role="img" data-status-mark="passed"><span [^>]*>&gt;_<\/span>runtime/);
    });

    it('Shows "Not built" in its console view when it has no recording', () => {
      expect(_render({ ...recorded, recording: undefined, checks: [] })).toContain(NOT_BUILT_TEXT);
    });
  });
});
