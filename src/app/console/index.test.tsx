/**
 * Tests of the console panel
 */

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import { CONSOLE_MAX_LINES, type ConsoleLine } from '../../frame/index.js';
import { ShowcaseBlock } from '../code-pane/index.js';
import type { LoadedShowcase } from '../host/index.js';
import { ShowcaseFrame } from '../showcases/index.js';
import {
  CONSOLE_FADING_LINES,
  CONSOLE_LINE_FADE_MS,
  CONSOLE_LINE_SHOWN_MS,
  CONSOLE_PANEL_HEIGHT,
  CONSOLE_ROW_HEIGHT,
  ConsolePanel,
  ConsoleView,
  INITIAL_CONSOLE_STATE,
  getConsoleMinHeight,
  getConsoleTitle,
  getCounterLabel,
  getCounterText,
  getDroppedText,
  getFadingLines,
  getFirstIssueLine,
  getNextFadeTime,
  isScrolledToBottom,
  NO_OUTPUT_TEXT,
  RECORDED_OUTPUT_TITLE,
  RECORDING_CUT_TEXT,
  getRecordingConsole,
  getRecordingEndLine,
  updateConsole,
  type ConsoleAction,
  type ConsoleState,
} from './index.js';

/**
 * Time the tests' first batch comes at, in milliseconds since the epoch
 */
const _T0 = 1_000_000;

/**
 * Applies updates to a console panel's state, in order
 * @param actions The updates
 * @param state The state to start from; the initial state by default
 * @returns The state after them
 */
function _apply(actions: ConsoleAction[], state: ConsoleState = INITIAL_CONSOLE_STATE): ConsoleState {
  return actions.reduce(updateConsole, state);
}

/**
 * Creates the update of a batch of `log` lines, by their texts, or of lines given whole
 * @param lines The lines' texts, or the lines
 * @param now The time the batch comes at
 * @param dropped The number of lines the frame script dropped before them
 * @returns The update
 */
function _lines(lines: (string | ConsoleLine)[], now = _T0, dropped = 0): ConsoleAction {
  return { type: 'lines', lines: lines.map((line) => (typeof line === 'string' ? { level: 'log', text: line } : line)), dropped, now };
}

/**
 * Renders a node on the server, inside FluentUI's providers
 * @param node The node
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(node: React.ReactNode): string {
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>{node}</FluentProvider>
    </SSRProvider>,
  ).replaceAll('<!-- -->', '');
}

/**
 * A showcase shown as a block
 */
const _SHOWCASE: LoadedShowcase = {
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
  tabs: [{ label: 'HTML', path: 'README.showcase-1.html', language: 'html', source: { kind: 'virtual', content: '<p>Hi</p>' } }],
  url: 'showcases/README.md/1/index.html?hash=00000001',
};

describe('app/console', () => {
  // Tests the console panel's state as a pure function of the showcase frame's messages and the user's actions (updateConsole()), the fading lines
  // and their timing computed from the state's time, the texts, and the console panel rendered on the server with a given state, alone and over a
  // showcase frame, inline and in a block (effects don't run there, so no timer ticks and nothing is focused).

  describe('State', () => {
    // Tests updateConsole() on hand-written batches.

    it('Starts empty and closed', () => {
      expect(INITIAL_CONSOLE_STATE).toMatchObject({ lines: [], dropped: 0, count: 0, errors: 0, open: false, autoOpened: false });
    });

    it('Adds batches, numbering their lines and noting their time', () => {
      const state = _apply([_lines(['a', 'b']), _lines([{ level: 'warn', text: 'c' }], _T0 + 10)]);
      expect(state.lines).toEqual([
        { level: 'log', text: 'a', id: 0, time: _T0, quiet: false },
        { level: 'log', text: 'b', id: 1, time: _T0, quiet: false },
        { level: 'warn', text: 'c', id: 2, time: _T0 + 10, quiet: false },
      ]);
      expect(state).toMatchObject({ count: 3, dropped: 0, now: _T0 + 10 });
    });

    it('Keeps the newest lines only, counting those the frame script and the console panel dropped', () => {
      const many = Array.from({ length: CONSOLE_MAX_LINES }, (_, index) => String(index + 1));
      const state = _apply([_lines(many, _T0, 4), _lines(['one more', 'and another'])]);
      expect(state.lines).toHaveLength(CONSOLE_MAX_LINES);
      expect(state.lines[0].text).toBe('3');
      expect(state.lines.at(-1)?.text).toBe('and another');
      expect(state).toMatchObject({ dropped: 6, count: CONSOLE_MAX_LINES + 6 });
    });

    it('Counts error lines as unseen while closed, until opened', () => {
      let state = _apply([_lines([{ level: 'error', text: 'x' }, 'y', { level: 'error', text: 'z' }])]);
      expect(state.errors).toBe(2);
      state = _apply([{ type: 'open' }, _lines([{ level: 'error', text: 'seen' }])], state);
      expect(state).toMatchObject({ open: true, errors: 0 });
      state = _apply([{ type: 'close' }, _lines([{ level: 'error', text: 'unseen' }])], state);
      expect(state).toMatchObject({ open: false, errors: 1, count: 5 });
    });

    it('Opens by itself on the first uncaught error of a load only', () => {
      // D563: later ones only turn the counter red, until the next load
      const uncaught: ConsoleLine = { level: 'error', text: 'Uncaught Error: x', uncaught: true };
      let state = _apply([_lines(['a', uncaught])]);
      expect(state).toMatchObject({ open: true, autoOpened: true, errors: 0 });
      state = _apply([{ type: 'close' }, _lines([uncaught])], state);
      expect(state).toMatchObject({ open: false, errors: 1 });
      state = _apply([{ type: 'start' }, _lines([uncaught])], state);
      expect(state).toMatchObject({ open: true, count: 1 });
    });

    it('Starts afresh on every load', () => {
      const state = _apply([_lines(['a', { level: 'error', text: 'b' }]), { type: 'open' }, { type: 'start' }]);
      expect(state).toEqual(INITIAL_CONSOLE_STATE);
    });

    it("Counts a load's warnings and errors, dropped ones included, apart from the unseen errors", () => {
      // The runtime status mark's numbers (D592, .workflow/PLAN-P15.5-status-marks.md): opening the console panel clears only the unseen errors
      const lines: ConsoleLine[] = [
        { level: 'warn', text: 'w' },
        { level: 'error', text: 'e' },
        { level: 'error', text: 'Uncaught', uncaught: true },
      ];
      let state = _apply([{ type: 'lines', lines, dropped: 5, droppedWarnings: 2, droppedErrors: 1, now: _T0 }]);
      expect(state).toMatchObject({ warningCount: 3, errorCount: 3, errors: 0, open: true });
      // Lines the console panel drops past CONSOLE_MAX_LINES stay counted
      state = _apply([_lines(Array.from({ length: CONSOLE_MAX_LINES }, (_, index) => String(index)))], state);
      expect(state.lines.some((entry) => entry.level !== 'log')).toBe(false);
      expect(state).toMatchObject({ warningCount: 3, errorCount: 3 });
    });

    it('Is pending until the page is ready, and again after every load', () => {
      let state = _apply([_lines(['a'])]);
      expect(state.ready).toBe(false);
      state = updateConsole(state, { type: 'ready' });
      expect(state.ready).toBe(true);
      expect(updateConsole(state, { type: 'ready' })).toBe(state);
      state = _apply([_lines([{ level: 'warn', text: 'w' }]), { type: 'start' }], state);
      expect(state).toMatchObject({ ready: false, warningCount: 0, errorCount: 0 });
    });

    it('Finds the first kept error line, else the first kept warning line', () => {
      expect(getFirstIssueLine(_apply([_lines(['a', { level: 'warn', text: 'w' }, { level: 'error', text: 'e' }])]))).toBe(2);
      expect(getFirstIssueLine(_apply([_lines(['a', { level: 'warn', text: 'w' }])]))).toBe(1);
      expect(getFirstIssueLine(_apply([_lines(['a'])]))).toBeUndefined();
    });

    it('Changes nothing when opened while open, or closed while closed', () => {
      const closed = _apply([_lines(['a'])]);
      expect(updateConsole(closed, { type: 'close' })).toBe(closed);
      const open = updateConsole(closed, { type: 'open' });
      expect(updateConsole(open, { type: 'open' })).toBe(open);
    });
  });

  describe('Fading lines', () => {
    // Tests which lines fade at the bottom of a showcase frame, at the state's time, and when they change next.

    it('Shows the newest lines, each for a while, then fading, then gone', () => {
      let state = _apply([_lines(['1', '2', '3', '4']), _lines(['5'], _T0 + 1000)]);
      const texts = () => getFadingLines(state).map(({ entry, faded }) => `${entry.text}${faded ? ' (faded)' : ''}`);
      expect(texts()).toEqual(['3', '4', '5']);
      expect(CONSOLE_FADING_LINES).toBe(3);
      expect(getNextFadeTime(state)).toBe(_T0 + CONSOLE_LINE_SHOWN_MS);
      state = updateConsole(state, { type: 'tick', now: _T0 + CONSOLE_LINE_SHOWN_MS });
      expect(texts()).toEqual(['1 (faded)', '2 (faded)', '3 (faded)', '4 (faded)', '5'].slice(-3));
      expect(getNextFadeTime(state)).toBe(_T0 + 1000 + CONSOLE_LINE_SHOWN_MS);
      state = updateConsole(state, { type: 'tick', now: _T0 + CONSOLE_LINE_SHOWN_MS + CONSOLE_LINE_FADE_MS });
      expect(texts()).toEqual(['5 (faded)']);
      state = updateConsole(state, { type: 'tick', now: _T0 + 1000 + CONSOLE_LINE_SHOWN_MS + CONSOLE_LINE_FADE_MS });
      expect(texts()).toEqual([]);
      expect(getNextFadeTime(state)).toBeUndefined();
    });

    it('Shows none while open, and never the lines from before it was opened, or that came while it was open', () => {
      let state = _apply([_lines(['before']), { type: 'open' }]);
      expect(getFadingLines(state)).toEqual([]);
      state = _apply([_lines(['while open'], _T0 + 10), { type: 'close' }, _lines(['after'], _T0 + 20)], state);
      expect(getFadingLines(state).map(({ entry }) => entry.text)).toEqual(['after']);
    });
  });

  describe('Texts and heights', () => {
    // Tests the counter's text and label, the title, the dropped line, and the least height of a showcase frame's box.

    it('Says the count and the unseen errors', () => {
      const state = _apply([_lines(['a', { level: 'error', text: 'b' }])]);
      expect(getCounterText(state)).toBe('>_ 2 · 1 error');
      expect(getCounterLabel(state)).toBe('Open the console: 2 lines, 1 error');
      expect(getCounterText(_apply([_lines(['a'])]))).toBe('>_ 1');
      expect(getCounterLabel(_apply([_lines(['a'])]))).toBe('Open the console: 1 line');
      expect(getConsoleTitle(state)).toBe('Console · 2 lines');
      expect(getDroppedText(1)).toBe('… 1 earlier line dropped');
      expect(getDroppedText(3)).toBe('… 3 earlier lines dropped');
    });

    it("Grows the showcase frame's box to the counter's row once anything is logged, and to the open console panel", () => {
      // D565: a short showcase frame shown inline holds the counter; D531: opening the console panel grows the box to fit it
      expect(getConsoleMinHeight(INITIAL_CONSOLE_STATE)).toBe(0);
      const logged = _apply([_lines(['a'])]);
      expect(getConsoleMinHeight(logged)).toBe(CONSOLE_ROW_HEIGHT);
      // D576: no room left at the top, in a block or not, as the cycling button sits in the header bar
      expect(getConsoleMinHeight(updateConsole(logged, { type: 'open' }))).toBe(CONSOLE_PANEL_HEIGHT);
    });

    it('Follows the newest line only while scrolled to the bottom', () => {
      expect(isScrolledToBottom(100, 50, 150)).toBe(true);
      // Browsers round scroll positions
      expect(isScrolledToBottom(98, 50, 150)).toBe(true);
      expect(isScrolledToBottom(90, 50, 150)).toBe(false);
      expect(isScrolledToBottom(0, 50, 50)).toBe(true);
    });
  });

  describe('Console panel', () => {
    // Renders ConsolePanel, ShowcaseFrame and ShowcaseBlock on the server with a given state.

    const dispatch = () => undefined;

    it('Renders nothing while nothing is logged', () => {
      expect(_render(<ConsolePanel state={INITIAL_CONSOLE_STATE} dispatch={dispatch} />)).toBe(_render(null));
    });

    it('Renders the fading lines by their first line, and the counter, closed', () => {
      const state = _apply([_lines(['first\nsecond', { level: 'error', text: 'oops' }])]);
      const html = _render(<ConsolePanel state={state} dispatch={dispatch} />);
      expect(html).toMatch(/aria-hidden="true">.*>first<\/div>.*>oops<\/div>/s);
      expect(html).not.toContain('second');
      expect(html).toContain(`aria-label="${getCounterLabel(state)}"`);
      expect(html).toContain('&gt;_ 2 · 1 error');
      expect(html).not.toContain('role="region"');
    });

    it('Renders the open console panel: its title, close button, dropped line and every line kept', () => {
      const state = _apply([_lines(['a', { level: 'warn', text: 'b\nc' }], _T0, 2), { type: 'open' }]);
      const html = _render(<ConsolePanel state={state} dispatch={dispatch} />);
      expect(html).toContain('role="region" aria-label="Console"');
      expect(html).toContain('Console · 4 lines');
      expect(html).toContain('aria-label="Close the console"');
      expect(html).toMatch(/… 2 earlier lines dropped<\/div><div [^>]*>a<\/div><div [^>]*>b\nc<\/div>/);
      expect(html).not.toContain('Open the console');
    });

    it('Renders over a showcase frame shown inline, its box at least as high as the console panel needs', () => {
      const showcase: LoadedShowcase = { ..._SHOWCASE, display: 'inline' };
      const empty = _render(<ShowcaseFrame showcase={showcase} />);
      expect(empty).toMatch(/<div class="[^"]*"><iframe [^>]*><\/iframe><\/div><\/div>$/);
      const logged = _render(<ShowcaseFrame showcase={showcase} initialConsole={_apply([_lines(['a'])])} />);
      expect(logged).toMatch(new RegExp(`<div class="[^"]*" style="min-height:${CONSOLE_ROW_HEIGHT}px"><iframe [^>]*></iframe><div [^>]*>.*&gt;_ 1`, 's'));
      const open = _render(<ShowcaseFrame showcase={showcase} initialConsole={_apply([_lines(['a']), { type: 'open' }])} />);
      expect(open).toContain(`style="min-height:${CONSOLE_PANEL_HEIGHT}px"`);
    });

    it("Grows a block's demo view to the open console panel, with no room left at its top", () => {
      const html = _render(<ShowcaseBlock showcase={_SHOWCASE} documentation={[]} initialConsole={_apply([_lines(['a']), { type: 'open' }])} />);
      expect(html).toContain(`style="min-height:${CONSOLE_PANEL_HEIGHT}px"`);
      expect(html).toContain('role="region" aria-label="Console"');
    });
  });

  describe('Console view', () => {
    // Renders ConsoleView, and blocks with a console view, on the server with a given state.

    it('Shows a greyed placeholder while nothing is logged', () => {
      const html = _render(<ConsoleView state={INITIAL_CONSOLE_STATE} />);
      expect(html).toContain('role="log" aria-label="Console"');
      expect(html).toContain(`>${NO_OUTPUT_TEXT}</div>`);
    });

    it('Shows every line kept, after the dropped line, with no counter or fading lines', () => {
      const html = _render(<ConsoleView state={_apply([_lines(['a', { level: 'error', text: 'b' }], _T0, 3)])} />);
      expect(html).toMatch(/… 3 earlier lines dropped<\/div><div [^>]*>a<\/div><div [^>]*>b<\/div>/);
      expect(html).not.toContain(NO_OUTPUT_TEXT);
      expect(html).not.toContain('Open the console');
    });

    it('Takes the console out of the demo view when the block shows a console view too', () => {
      // The user's caveat on D498: no console over the demo when the console is a view of its own
      const state = _apply([_lines(['a'])]);
      const both = _render(<ShowcaseBlock showcase={{ ..._SHOWCASE, views: ['demo', 'console'] }} documentation={[]} initialConsole={state} />);
      expect(both).not.toContain('Open the console');
      expect(both).toContain('role="log" aria-label="Console"');
      expect(both).toMatch(/data-showcase-view="console"><div [^>]*role="log"[^>]*><div [^>]*>a<\/div>/);
      const demo = _render(<ShowcaseBlock showcase={_SHOWCASE} documentation={[]} initialConsole={state} />);
      expect(demo).toContain('Open the console');
      expect(demo).not.toContain('role="log"');
    });

    it('Runs the showcase frame hidden at the top of a console view with no demo view', () => {
      // D570: laid out at its real width, invisible, clipped to no height, out of reach of the pointer, the keyboard and screen readers
      const html = _render(<ShowcaseBlock showcase={{ ..._SHOWCASE, views: ['source', 'console'] }} documentation={[]} />);
      expect(html).toMatch(/data-showcase-view="console"><div class="[^"]+"><iframe [^>]*aria-hidden="true"[^>]*><\/iframe><\/div><div [^>]*role="log"/);
      expect(html).toMatch(/<iframe [^>]*tabindex="-1"/i);
      expect(html).not.toMatch(/<iframe [^>]*loading="lazy"/);
      expect(html).toContain(NO_OUTPUT_TEXT);
    });
  });

  describe('Recording', () => {
    // Tests a recorded showcase's console state (getRecordingConsole(), the `recording` action) and its `console` view, rendered on the server.

    const recording = {
      lines: [
        { level: 'log' as const, text: 'hi' },
        { level: 'error' as const, text: 'oops' },
      ],
      dropped: 2,
      droppedErrors: 1,
      exitCode: 0,
    };

    it('Ends with its end line, an error line when its exit failed it', () => {
      expect(getRecordingEndLine({ lines: [], dropped: 0, exitCode: 0 })).toEqual({ level: 'info', text: 'Exited with code 0' });
      expect(getRecordingEndLine({ lines: [], dropped: 0, exitCode: 134 })).toEqual({ level: 'error', text: 'Exited with code 134' });
      expect(getRecordingEndLine({ lines: [], dropped: 0, timedOut: true, timeLimit: 30000 })).toEqual({
        level: 'error',
        text: 'Stopped after the 30 s time limit',
      });
      expect(getRecordingEndLine({ lines: [], dropped: 0, signal: 'SIGABRT' })).toEqual({ level: 'error', text: 'Ended by signal SIGABRT' });
    });

    it('Holds its lines, loaded, closed, with its warnings and errors counted, none unseen and none fading', () => {
      const state = getRecordingConsole({ ...recording, cut: true });
      expect(state.lines.map(({ level, text }) => ({ level, text }))).toEqual([
        { level: 'log', text: 'hi' },
        { level: 'error', text: 'oops' },
        { level: 'info', text: RECORDING_CUT_TEXT },
        { level: 'info', text: 'Exited with code 0' },
      ]);
      expect(state).toMatchObject({ dropped: 2, count: 6, errorCount: 2, warningCount: 0, errors: 0, ready: true, open: false, recorded: true });
      expect(getFadingLines(state)).toEqual([]);
      // A non-zero exit with nothing on standard error still counts an error, for the runtime status mark (PLAN-P20 D790 C2)
      expect(getRecordingConsole({ lines: [], dropped: 0, exitCode: 1 }).errorCount).toBe(1);
      // The recording action replaces whatever the state held
      expect(updateConsole(_apply([_lines(['x'])]), { type: 'recording', recording })).toEqual(getRecordingConsole(recording));
    });

    it('Shows it under its title, "Recorded output", in the console view', () => {
      const html = _render(<ConsoleView state={getRecordingConsole(recording)} />);
      expect(html).toContain(`role="log" aria-label="${RECORDED_OUTPUT_TITLE}"`);
      expect(html).toMatch(new RegExp(`>${RECORDED_OUTPUT_TITLE}</div><div [^>]*>… 2 earlier lines dropped</div><div [^>]*>hi</div>`));
      expect(html).toContain('>Exited with code 0</div>');
    });
  });
});
