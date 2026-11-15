/**
 * The console panel: what a showcase frame writes to its console, its uncaught errors and its rejected promises, as the frame script posts them,
 * shown by the showroom over the showcase frame, or as a showcase's `console` view. Its state is a pure function of the showcase frame's messages
 * and the user's actions; the overlay shows the newest lines briefly at the bottom of the showcase frame, then fades them, beside a counter (red
 * while errors are unseen) that opens the whole console panel over the showcase; the `console` view shows every line, always.
 */

import { useEffect, useLayoutEffect, useReducer, useRef, type Dispatch, type KeyboardEvent, type ReactNode } from 'react';
import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Dismiss16Regular } from '@fluentui/react-icons';
import { CONSOLE_MAX_LINES, type ConsoleLine } from '../../frame/index.js';

// #region State

/**
 * Number of lines the open console panel shows (its fixed height), before it scrolls
 */
export const CONSOLE_PANEL_LINES = 8;

/**
 * Number of the newest lines shown at the bottom of a showcase frame at once, while the console panel is closed
 */
export const CONSOLE_FADING_LINES = 3;

/**
 * Time a line shows at the bottom of a showcase frame, while the console panel is closed, before it fades, in milliseconds
 */
export const CONSOLE_LINE_SHOWN_MS = 3000;

/**
 * Time a line takes to fade, in milliseconds
 */
export const CONSOLE_LINE_FADE_MS = 1000;

/**
 * Height of the counter's row, in pixels: the least a showcase frame's box is high once anything is logged, so the counter and the fading lines fit
 */
export const CONSOLE_ROW_HEIGHT = 32;

/**
 * Height of a line of the console panel, in pixels
 */
const _LINE_HEIGHT = 18;

/**
 * Height of the open console panel, in pixels: its top border, its header bar with its border, and its lines with their padding
 */
export const CONSOLE_PANEL_HEIGHT = 1 + 25 + CONSOLE_PANEL_LINES * _LINE_HEIGHT + 8;

/**
 * Height of a `console` view, in pixels: its CONSOLE_PANEL_LINES lines, and their padding
 */
export const CONSOLE_VIEW_HEIGHT = CONSOLE_PANEL_LINES * _LINE_HEIGHT + 8;

/**
 * Name of the attribute of a console view's line holding its id, by which the `runtime` status mark finds it
 */
export const CONSOLE_LINE_ATTRIBUTE = 'data-console-line';

/**
 * Represents a line kept by the console panel
 */
export interface ConsoleEntry extends ConsoleLine {
  /**
   * Number of the line since the showcase frame's load, from 0, also its React key
   */
  id: number;
  /**
   * Time the showroom received the line, in milliseconds since the epoch
   */
  time: number;
  /**
   * True if the line came while the console panel was open, so it never shows as a fading line
   */
  quiet: boolean;
}

/**
 * Represents the state of a showcase frame's console panel
 */
export interface ConsoleState {
  /**
   * The newest lines, CONSOLE_MAX_LINES at most, oldest first
   */
  lines: ConsoleEntry[];
  /**
   * Number of earlier lines dropped, by the frame script or by the console panel
   */
  dropped: number;
  /**
   * Number of lines written since the showcase frame's load, dropped ones included
   */
  count: number;
  /**
   * Number of error lines written while the console panel was closed, since it was last open
   */
  errors: number;
  /**
   * Number of warning lines (`warn`) written since the showcase frame's load, dropped ones included
   */
  warningCount: number;
  /**
   * Number of error lines (`error`, uncaught errors, rejected promises) written since the showcase frame's load, dropped ones included
   */
  errorCount: number;
  /**
   * True once the showcase frame's page has loaded (`ready`) since its load started
   */
  ready: boolean;
  /**
   * True while the console panel is open
   */
  open: boolean;
  /**
   * True once the first uncaught error or rejected promise of the load has opened the console panel by itself
   */
  autoOpened: boolean;
  /**
   * Id of the first line that may show as a fading line: the lines before it came before the console panel was last opened
   */
  fadeFrom: number;
  /**
   * Id of the next line
   */
  next: number;
  /**
   * Time of the latest update, in milliseconds since the epoch, which the fading lines are judged by
   */
  now: number;
}

/**
 * Represents an update of a console panel's state: the showcase frame's `start` (a new load), its `ready`, and a batch of its lines (with how many
 * of the lines dropped before them were warnings and errors), given the time they came; the user opening or closing the console panel; and the time
 * passing, for the fading lines
 */
export type ConsoleAction =
  | { type: 'start' }
  | { type: 'ready' }
  | { type: 'lines'; lines: ConsoleLine[]; dropped: number; droppedWarnings?: number; droppedErrors?: number; now: number }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'tick'; now: number };

/**
 * The state of a console panel before anything is logged, and after every load
 */
export const INITIAL_CONSOLE_STATE: ConsoleState = {
  lines: [],
  dropped: 0,
  count: 0,
  errors: 0,
  warningCount: 0,
  errorCount: 0,
  ready: false,
  open: false,
  autoOpened: false,
  fadeFrom: 0,
  next: 0,
  now: 0,
};

/**
 * Opens a console panel: its unseen errors are seen, and the lines so far never fade in later
 * @param state The state
 * @returns The state, open
 */
function _open(state: ConsoleState): ConsoleState {
  return { ...state, open: true, errors: 0, fadeFrom: state.next };
}

/**
 * Updates a console panel's state. A batch of lines is added to the lines kept, the oldest beyond CONSOLE_MAX_LINES dropped and counted, its error
 * lines counted as unseen while the console panel is closed, and its warnings and errors counted for the load, dropped ones too; its first uncaught
 * error or rejected promise of the load opens the console panel, once. `ready` marks the page loaded. `start` clears everything, so every load starts
 * afresh, pending.
 * @param state The state
 * @param action The update
 * @returns The new state
 */
export function updateConsole(state: ConsoleState, action: ConsoleAction): ConsoleState {
  switch (action.type) {
    case 'start':
      return INITIAL_CONSOLE_STATE;
    case 'ready':
      return state.ready ? state : { ...state, ready: true };
    case 'open':
      return state.open ? state : _open(state);
    case 'close':
      return state.open ? { ...state, open: false } : state;
    case 'tick':
      return { ...state, now: action.now };
    case 'lines': {
      if (!action.lines.length && !action.dropped) return { ...state, now: action.now };
      const added = action.lines.map((line, index) => ({ ...line, id: state.next + index, time: action.now, quiet: state.open }));
      const lines = [...state.lines, ...added];
      const overflow = Math.max(0, lines.length - CONSOLE_MAX_LINES);
      const errorLines = action.lines.filter((line) => line.level === 'error').length;
      const warningLines = action.lines.filter((line) => line.level === 'warn').length;
      const errors = state.open ? 0 : state.errors + errorLines;
      const updated: ConsoleState = {
        ...state,
        lines: lines.slice(overflow),
        dropped: state.dropped + action.dropped + overflow,
        count: state.count + action.dropped + action.lines.length,
        errors,
        warningCount: state.warningCount + warningLines + (action.droppedWarnings ?? 0),
        errorCount: state.errorCount + errorLines + (action.droppedErrors ?? 0),
        next: state.next + action.lines.length,
        now: action.now,
      };
      if (!state.autoOpened && action.lines.some((line) => line.uncaught)) return { ..._open(updated), autoOpened: true };
      return updated;
    }
  }
}

/**
 * Represents a line shown fading at the bottom of a showcase frame
 */
export interface FadingLine {
  /**
   * The line
   */
  entry: ConsoleEntry;
  /**
   * True once it is fading out
   */
  faded: boolean;
}

/**
 * Gets the lines shown fading at the bottom of a showcase frame, at the state's time: while the console panel is closed, the newest
 * CONSOLE_FADING_LINES lines that came while it was closed since it was last open, each for CONSOLE_LINE_SHOWN_MS, then fading for
 * CONSOLE_LINE_FADE_MS
 * @param state The state
 * @returns The lines, oldest first
 */
export function getFadingLines(state: ConsoleState): FadingLine[] {
  if (state.open) return [];
  return state.lines
    .filter((entry) => !entry.quiet && entry.id >= state.fadeFrom && state.now - entry.time < CONSOLE_LINE_SHOWN_MS + CONSOLE_LINE_FADE_MS)
    .slice(-CONSOLE_FADING_LINES)
    .map((entry) => ({ entry, faded: state.now - entry.time >= CONSOLE_LINE_SHOWN_MS }));
}

/**
 * Gets the next time the fading lines change: a line starting to fade, or going
 * @param state The state
 * @returns The time, in milliseconds since the epoch, or undefined if no line is fading
 */
export function getNextFadeTime(state: ConsoleState): number | undefined {
  const times = getFadingLines(state).map(({ entry, faded }) => entry.time + CONSOLE_LINE_SHOWN_MS + (faded ? CONSOLE_LINE_FADE_MS : 0));
  return times.length ? Math.min(...times) : undefined;
}

/**
 * Gets the least height of a showcase frame's box for its console panel: nothing while nothing is logged; the counter's row once anything is; and
 * the open console panel
 * @param state The state
 * @returns The height, in pixels
 */
export function getConsoleMinHeight(state: ConsoleState): number {
  if (state.open) return CONSOLE_PANEL_HEIGHT;
  return state.count ? CONSOLE_ROW_HEIGHT : 0;
}

/**
 * Gets the line the `runtime` status mark scrolls a `console` view to: its first kept error line, else its first kept warning line
 * @param state The state
 * @returns The line's id, or undefined if no kept line is an error or a warning
 */
export function getFirstIssueLine(state: ConsoleState): number | undefined {
  return (state.lines.find((entry) => entry.level === 'error') ?? state.lines.find((entry) => entry.level === 'warn'))?.id;
}

/**
 * Checks if a scrolled log is at its bottom (within 2 pixels, as browsers round), so new lines scroll it on; once the reader scrolls up, it stays
 * where they left it
 * @param scrollTop The log's scroll position
 * @param clientHeight Its visible height
 * @param scrollHeight Its whole height
 * @returns True if it is scrolled to its bottom
 */
export function isScrolledToBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollTop + clientHeight >= scrollHeight - 2;
}

/**
 * Keeps a showcase frame's console panel's state, ticking the time while lines are fading
 * @param initial The state to start with (the tests' server-side rendering sets it); INITIAL_CONSOLE_STATE by default
 * @returns The state, and its update function
 */
export function useConsole(initial: ConsoleState = INITIAL_CONSOLE_STATE): [ConsoleState, Dispatch<ConsoleAction>] {
  const [state, dispatch] = useReducer(updateConsole, initial);
  const next = getNextFadeTime(state);
  useEffect(() => {
    if (next === undefined) return;
    const timer = window.setTimeout(() => dispatch({ type: 'tick', now: Date.now() }), Math.max(0, next - Date.now()));
    return () => window.clearTimeout(timer);
  }, [next]);
  return [state, dispatch];
}

// #endregion

// #region Texts

/**
 * Says an amount of something, in the singular or plural
 * @param amount The amount
 * @param word The word, in the singular
 * @returns E.g. `1 line`, `2 lines`
 */
function _plural(amount: number, word: string): string {
  return `${amount} ${word}${amount === 1 ? '' : 's'}`;
}

/**
 * Gets the counter's text: `>_ <count>`, and the unseen errors
 * @param state The state
 * @returns The text
 */
export function getCounterText(state: ConsoleState): string {
  return `>_ ${state.count}${state.errors ? ` · ${_plural(state.errors, 'error')}` : ''}`;
}

/**
 * Gets the counter's accessible name and tooltip
 * @param state The state
 * @returns The label
 */
export function getCounterLabel(state: ConsoleState): string {
  return `Open the console: ${_plural(state.count, 'line')}${state.errors ? `, ${_plural(state.errors, 'error')}` : ''}`;
}

/**
 * Gets the open console panel's title
 * @param state The state
 * @returns `Console · <count> lines`
 */
export function getConsoleTitle(state: ConsoleState): string {
  return `Console · ${_plural(state.count, 'line')}`;
}

/**
 * The `console` view's placeholder, while nothing is logged
 */
export const NO_OUTPUT_TEXT = 'No output';

/**
 * Gets the console panel's first line, saying how many earlier lines were dropped
 * @param dropped The number of lines dropped
 * @returns The line
 */
export function getDroppedText(dropped: number): string {
  return `… ${_plural(dropped, 'earlier line')} dropped`;
}

// #endregion

// #region Console panel

/**
 * Styles of the console panel
 */
const _useStyles = makeStyles({
  // Over the showcase frame's box, letting clicks through to the showcase but on its own parts
  overlay: { position: 'absolute', inset: '0', zIndex: 1, pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' },
  text: { fontFamily: tokens.fontFamilyMonospace, fontSize: '12px', lineHeight: `${_LINE_HEIGHT}px` },
  bar: { display: 'flex', alignItems: 'flex-end', gap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}` },
  fading: { flex: '1 1 auto', minWidth: '0', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' },
  fadingLine: {
    whiteSpace: 'pre',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    padding: `0 ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground3,
    opacity: 0.85,
    transitionProperty: 'opacity',
    transitionDuration: `${CONSOLE_LINE_FADE_MS}ms`,
  },
  faded: { opacity: 0 },
  counter: { flex: 'none', pointerEvents: 'auto', minWidth: '0', opacity: 0.75, ':hover': { opacity: 1 }, ':focus-visible': { opacity: 1 } },
  counterErrors: {
    opacity: 0.9,
    color: tokens.colorNeutralForegroundOnBrand,
    backgroundColor: tokens.colorPaletteRedBackground3,
    ':hover': { color: tokens.colorNeutralForegroundOnBrand, backgroundColor: tokens.colorPaletteRedForeground1 },
  },
  panel: {
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '100%',
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground3,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    boxShadow: tokens.shadow8,
  },
  header: {
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '24px',
    padding: `0 ${tokens.spacingHorizontalXS} 0 ${tokens.spacingHorizontalS}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  },
  log: {
    flex: '0 1 auto',
    minHeight: '0',
    boxSizing: 'border-box',
    height: `${CONSOLE_VIEW_HEIGHT}px`,
    padding: '4px 0',
    overflow: 'auto',
  },
  line: { padding: `0 ${tokens.spacingHorizontalS}`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  // The console view: the log alone, always CONSOLE_PANEL_LINES lines high
  view: { color: tokens.colorNeutralForeground1, backgroundColor: tokens.colorNeutralBackground3, flex: 'none' },
  placeholder: { padding: `0 ${tokens.spacingHorizontalS}`, color: tokens.colorNeutralForegroundDisabled, fontStyle: 'italic' },
  info: { color: tokens.colorPaletteBlueForeground2 },
  debug: { opacity: 0.7 },
  warn: { color: tokens.colorPaletteMarigoldForeground2, backgroundColor: tokens.colorPaletteYellowBackground1 },
  error: { color: tokens.colorPaletteRedForeground1, backgroundColor: tokens.colorPaletteRedBackground1 },
});

/**
 * Represents the properties of a console panel
 */
export interface ConsolePanelProps {
  /**
   * The console panel's state
   */
  state: ConsoleState;
  /**
   * Updates the console panel's state, with the user's actions
   */
  dispatch: Dispatch<ConsoleAction>;
}

/**
 * Renders a showcase frame's console panel, over its box (which is positioned): nothing while nothing is logged; closed, the fading lines and the
 * counter at the bottom; open, the console panel with its header bar (its title and close button) and its lines, scrolled to the newest while
 * scrolled to the bottom. The counter opens it, moving focus to its close button; the close button, or Escape while focus is in it, closes it,
 * moving focus back to the counter. Opened by itself, it never takes focus.
 * @param props Properties of the component
 * @returns The console panel
 */
export function ConsolePanel({ state, dispatch }: ConsolePanelProps): ReactNode {
  const styles = _useStyles();
  const panel = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const counter = useRef<HTMLButtonElement>(null);
  // Focus to move once the console panel opens or closes, as the user asked
  const focus = useRef<'close' | 'counter'>(undefined);
  // Whether the log is scrolled to its bottom, so new lines scroll it on
  const following = useRef(true);

  useEffect(() => {
    const target = state.open ? (focus.current === 'close' ? close.current : undefined) : focus.current === 'counter' ? counter.current : undefined;
    focus.current = undefined;
    target?.focus();
  }, [state.open]);

  // The log opens scrolled to its newest line, and follows new lines while scrolled to its bottom
  const newest = state.lines.at(-1)?.id;
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (state.open && !wasOpen.current) following.current = true;
    wasOpen.current = state.open;
    if (state.open && following.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [state.open, newest]);

  if (!state.count && !state.open) return null;

  const closePanel = () => {
    if (panel.current?.contains(document.activeElement)) focus.current = 'counter';
    dispatch({ type: 'close' });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    closePanel();
  };
  const level = (entry: ConsoleLine) => (entry.level === 'log' ? undefined : styles[entry.level]);

  if (state.open) {
    return (
      <div className={styles.overlay}>
        <div ref={panel} className={mergeClasses(styles.panel, styles.text)} role="region" aria-label="Console" onKeyDown={onKeyDown}>
          <div className={styles.header}>
            <span>{getConsoleTitle(state)}</span>
            <Button
              ref={close}
              appearance="subtle"
              size="small"
              icon={<Dismiss16Regular />}
              aria-label="Close the console"
              title="Close the console"
              onClick={closePanel}
            />
          </div>
          <div
            ref={log}
            className={styles.log}
            onScroll={(event) => {
              const element = event.currentTarget;
              following.current = isScrolledToBottom(element.scrollTop, element.clientHeight, element.scrollHeight);
            }}
          >
            <_ConsoleLines state={state} />
          </div>
        </div>
      </div>
    );
  }

  const label = getCounterLabel(state);
  return (
    <div className={styles.overlay}>
      <div className={mergeClasses(styles.bar, styles.text)}>
        <div className={styles.fading} aria-hidden="true">
          {getFadingLines(state).map(({ entry, faded }) => (
            <div key={entry.id} className={mergeClasses(styles.fadingLine, level(entry), faded && styles.faded)}>
              {entry.text.split('\n')[0]}
            </div>
          ))}
        </div>
        <Button
          ref={counter}
          className={mergeClasses(styles.counter, styles.text, state.errors > 0 && styles.counterErrors)}
          size="small"
          shape="circular"
          aria-label={label}
          title={label}
          onClick={() => {
            focus.current = 'close';
            dispatch({ type: 'open' });
          }}
        >
          {getCounterText(state)}
        </Button>
      </div>
    </div>
  );
}

// #endregion

// #region Console view

/**
 * Renders a console's lines: the line saying how many earlier ones were dropped, then each line, styled by its level
 * @param props Properties of the component: the console's state
 * @returns The lines
 */
function _ConsoleLines({ state }: { state: ConsoleState }): ReactNode {
  const styles = _useStyles();
  return (
    <>
      {state.dropped > 0 && <div className={mergeClasses(styles.line, styles.debug)}>{getDroppedText(state.dropped)}</div>}
      {state.lines.map((entry) => (
        <div
          key={entry.id}
          className={mergeClasses(styles.line, entry.level === 'log' ? undefined : styles[entry.level])}
          {...{ [CONSOLE_LINE_ATTRIBUTE]: entry.id }}
        >
          {entry.text}
        </div>
      ))}
    </>
  );
}

/**
 * Renders a showcase's `console` view: the console's lines alone, always shown, CONSOLE_PANEL_LINES lines high and scrolling beyond them, following
 * the newest line unless the reader has scrolled up; a greyed placeholder while nothing is logged
 * @param props Properties of the component: the console's state
 * @returns The console view
 */
export function ConsoleView({ state }: { state: ConsoleState }): ReactNode {
  const styles = _useStyles();
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const newest = state.lines.at(-1)?.id;
  useLayoutEffect(() => {
    if (following.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [newest]);
  return (
    <div
      ref={log}
      className={mergeClasses(styles.view, styles.log, styles.text)}
      role="log"
      aria-label="Console"
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget;
        following.current = isScrolledToBottom(element.scrollTop, element.clientHeight, element.scrollHeight);
      }}
    >
      {state.count || state.dropped ? <_ConsoleLines state={state} /> : <div className={styles.placeholder}>{NO_OUTPUT_TEXT}</div>}
    </div>
  );
}

// #endregion
