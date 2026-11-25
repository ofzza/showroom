/**
 * The console panel: what a showcase frame writes to its console, its uncaught errors and its rejected promises, as the frame script posts them,
 * shown by the showroom over the showcase frame, or as a showcase's `console` view; or a recorded showcase's recording, shown as its `console` view.
 * Its state is a pure function of the showcase frame's messages (or the recording) and the user's actions; the block's header bar shows the newest
 * line briefly, then fades it (`ConsoleHeaderLine`), and it or the `runtime` status mark opens the console panel over the showcase; the `console`
 * view shows every line, always (D939, D941, SPEC-S12-showcase-views.md).
 */

import { useEffect, useLayoutEffect, useReducer, useRef, type Dispatch, type KeyboardEvent, type ReactNode } from 'react';
import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Dismiss16Regular } from '@fluentui/react-icons';
import type { ShowcaseRecording } from '../../adapters/showcase/index.js';
import { CONSOLE_MAX_LINES, type ConsoleLine } from '../../frame/index.js';

// #region State

/**
 * Number of lines the open console panel shows (its fixed height), before it scrolls
 */
export const CONSOLE_PANEL_LINES = 8;

/**
 * Time a line shows in the block's header bar, while the console panel is closed, before it fades, in milliseconds
 */
export const CONSOLE_LINE_SHOWN_MS = 3000;

/**
 * Time a line takes to fade, in milliseconds
 */
export const CONSOLE_LINE_FADE_MS = 1000;

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
   * True if the line came while the console panel was open, so it never shows in the header bar
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
   * Id of the first line that may show in the header bar: the lines before it came before the console panel was last opened
   */
  fadeFrom: number;
  /**
   * Id of the next line
   */
  next: number;
  /**
   * Time of the latest update, in milliseconds since the epoch, which the header bar's line is judged by
   */
  now: number;
  /**
   * True if it holds a recording, recorded when the showcase was built, rather than a showcase frame's console
   */
  recorded: boolean;
}

/**
 * Represents an update of a console panel's state: the showcase frame's `start` (a new load), its `ready`, and a batch of its lines (with how many
 * of the lines dropped before them were warnings and errors), given the time they came; the user opening or closing the console panel; and the time
 * passing, for the header bar's line
 */
export type ConsoleAction =
  | { type: 'start' }
  | { type: 'ready' }
  | { type: 'lines'; lines: ConsoleLine[]; dropped: number; droppedWarnings?: number; droppedErrors?: number; now: number }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'tick'; now: number }
  | { type: 'recording'; recording: ShowcaseRecording };

/**
 * The state of a console panel before anything is logged, and after every load
 */
export const INITIAL_CONSOLE_STATE: ConsoleState = {
  lines: [],
  dropped: 0,
  count: 0,
  warningCount: 0,
  errorCount: 0,
  ready: false,
  open: false,
  fadeFrom: 0,
  next: 0,
  now: 0,
  recorded: false,
};

/**
 * The text of the line saying that a recording's output went past its cap, before its end line
 */
export const RECORDING_CUT_TEXT = '… output past 1 MB left out';

/**
 * Gets a recording's end line, the showroom's own: how its run ended (e.g. `Exited with code 0`, `Stopped after the 30 s time limit`, `Ended by
 * signal SIGABRT`); an `error` line when its exit failed it (a non-zero exit code, the time limit, a signal), an `info` line otherwise
 * @param recording The recording
 * @returns The line
 */
export function getRecordingEndLine(recording: ShowcaseRecording): ConsoleLine {
  if (recording.timedOut) {
    const limit = recording.timeLimit === undefined ? 'its' : `the ${recording.timeLimit / 1000} s`;
    return { level: 'error', text: `Stopped after ${limit} time limit` };
  }
  if (recording.signal !== undefined) return { level: 'error', text: `Ended by signal ${recording.signal}` };
  const code = recording.exitCode ?? 0;
  return { level: code === 0 ? 'info' : 'error', text: `Exited with code ${code}` };
}

/**
 * Gets the console state of a recording: its lines, the line saying its output was cut (if it was) and its end line, loaded, closed, with its
 * warnings and errors counted (dropped ones included), none of them shown in the header bar
 * @param recording The recording
 * @returns The state
 */
export function getRecordingConsole(recording: ShowcaseRecording): ConsoleState {
  const lines: ConsoleLine[] = [
    ...recording.lines.map(({ level, text }) => ({ level, text })),
    ...(recording.cut ? [{ level: 'info' as const, text: RECORDING_CUT_TEXT }] : []),
    getRecordingEndLine(recording),
  ];
  const state = updateConsole(INITIAL_CONSOLE_STATE, {
    type: 'lines',
    lines,
    dropped: recording.dropped,
    droppedWarnings: recording.droppedWarnings,
    droppedErrors: recording.droppedErrors,
    now: 0,
  });
  return { ...state, lines: state.lines.map((entry) => ({ ...entry, quiet: true })), ready: true, recorded: true };
}

/**
 * Updates a console panel's state. A batch of lines is added to the lines kept, the oldest beyond CONSOLE_MAX_LINES dropped and counted, and its
 * warnings and errors counted for the load, dropped ones too; nothing opens the console panel but the user (D942, SPEC-S12-showcase-views.md).
 * Opening it shows the lines so far, so none of them shows in the header bar later. `ready` marks the page loaded. `start` clears everything, so
 * every load starts afresh, pending.
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
      return state.open ? state : { ...state, open: true, fadeFrom: state.next };
    case 'close':
      return state.open ? { ...state, open: false } : state;
    case 'tick':
      return { ...state, now: action.now };
    case 'recording':
      return getRecordingConsole(action.recording);
    case 'lines': {
      if (!action.lines.length && !action.dropped) return { ...state, now: action.now };
      const added = action.lines.map((line, index) => ({ ...line, id: state.next + index, time: action.now, quiet: state.open }));
      const lines = [...state.lines, ...added];
      const overflow = Math.max(0, lines.length - CONSOLE_MAX_LINES);
      const errorLines = action.lines.filter((line) => line.level === 'error').length;
      const warningLines = action.lines.filter((line) => line.level === 'warn').length;
      return {
        ...state,
        lines: lines.slice(overflow),
        dropped: state.dropped + action.dropped + overflow,
        count: state.count + action.dropped + action.lines.length,
        warningCount: state.warningCount + warningLines + (action.droppedWarnings ?? 0),
        errorCount: state.errorCount + errorLines + (action.droppedErrors ?? 0),
        next: state.next + action.lines.length,
        now: action.now,
      };
    }
  }
}

/**
 * Represents the line shown in the block's header bar
 */
export interface HeaderLine {
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
 * Gets the line shown in the block's header bar, at the state's time (D941, SPEC-S12-showcase-views.md): while the console panel is closed, the
 * newest line, if it came while the console panel was closed since it was last open, for CONSOLE_LINE_SHOWN_MS, then fading for
 * CONSOLE_LINE_FADE_MS; a newer line replaces it
 * @param state The state
 * @returns The line, or undefined if none shows
 */
export function getHeaderLine(state: ConsoleState): HeaderLine | undefined {
  const entry = state.lines.at(-1);
  if (state.open || !entry || entry.quiet || entry.id < state.fadeFrom) return undefined;
  if (state.now - entry.time >= CONSOLE_LINE_SHOWN_MS + CONSOLE_LINE_FADE_MS) return undefined;
  return { entry, faded: state.now - entry.time >= CONSOLE_LINE_SHOWN_MS };
}

/**
 * Gets the next time the header bar's line changes: starting to fade, or going
 * @param state The state
 * @returns The time, in milliseconds since the epoch, or undefined if no line shows
 */
export function getNextFadeTime(state: ConsoleState): number | undefined {
  const line = getHeaderLine(state);
  return line && line.entry.time + CONSOLE_LINE_SHOWN_MS + (line.faded ? CONSOLE_LINE_FADE_MS : 0);
}

/**
 * Gets the least height of a showcase frame's box for its console panel: the open console panel's, else nothing (D939, SPEC-S12-showcase-views.md)
 * @param state The state
 * @returns The height, in pixels
 */
export function getConsoleMinHeight(state: ConsoleState): number {
  return state.open ? CONSOLE_PANEL_HEIGHT : 0;
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
 * Keeps a showcase frame's console panel's state, ticking the time while the header bar's line shows
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
 * Gets the header bar's line's accessible name and tooltip: what clicking it does, and the line's text
 * @param line The line
 * @returns The label
 */
export function getHeaderLineLabel(line: ConsoleLine): string {
  return `Open the console: ${line.text.split('\n')[0]}`;
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
 * The title of a recorded showcase's `console` view, its first line
 */
export const RECORDED_OUTPUT_TITLE = 'Recorded output';

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
  // The header bar's line: one row, taking the room between the status marks and the buttons, cut with an ellipsis (D941)
  headerLine: {
    flex: '1 1 auto',
    minWidth: '0',
    maxWidth: 'max-content',
    display: 'block',
    margin: '0',
    padding: `0 ${tokens.spacingHorizontalS}`,
    border: 'none',
    borderRadius: tokens.borderRadiusMedium,
    whiteSpace: 'pre',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'start',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    transitionProperty: 'opacity',
    transitionDuration: `${CONSOLE_LINE_FADE_MS}ms`,
    ':hover': { color: tokens.colorNeutralForeground1 },
    ':focus-visible': { outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}` },
  },
  faded: { opacity: 0 },
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
  title: { color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightSemibold },
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
 * Renders a showcase frame's console panel, over its box (which is positioned), only while it is open: its header bar (its title and close button)
 * and its lines, scrolled to the newest while scrolled to the bottom. Only the user opens it (the `runtime` status mark, or the header bar's line);
 * opening it moves focus to its close button, and the close button, or Escape while focus is in it, closes it, moving focus back to what opened it
 * @param props Properties of the component
 * @returns The console panel, or nothing while closed
 */
export function ConsolePanel({ state, dispatch }: ConsolePanelProps): ReactNode {
  const styles = _useStyles();
  const panel = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  // What had focus when it opened, given it back once it closes, if focus was in it
  const opener = useRef<HTMLElement | null>(null);
  const giveBack = useRef(false);
  // Whether the log is scrolled to its bottom, so new lines scroll it on
  const following = useRef(true);

  useEffect(() => {
    if (state.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      close.current?.focus();
    } else {
      if (giveBack.current) opener.current?.focus();
      giveBack.current = false;
      opener.current = null;
    }
  }, [state.open]);

  // The log opens scrolled to its newest line, and follows new lines while scrolled to its bottom
  const newest = state.lines.at(-1)?.id;
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (state.open && !wasOpen.current) following.current = true;
    wasOpen.current = state.open;
    if (state.open && following.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [state.open, newest]);

  if (!state.open) return null;

  const closePanel = () => {
    giveBack.current = panel.current?.contains(document.activeElement) ?? false;
    dispatch({ type: 'close' });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    closePanel();
  };
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

/**
 * Renders the console's line in a block's header bar (D941, SPEC-S12-showcase-views.md): the newest line, its first line of text, cut with an
 * ellipsis to the room left, coloured by its level, fading once shown long enough; a button opening the console panel. Nothing while no line shows.
 * @param props Properties of the component: the console's state, and its update function
 * @returns The line, or nothing
 */
export function ConsoleHeaderLine({ state, dispatch }: ConsolePanelProps): ReactNode {
  const styles = _useStyles();
  const line = getHeaderLine(state);
  if (!line) return null;
  const { entry, faded } = line;
  const label = getHeaderLineLabel(entry);
  return (
    <button
      type="button"
      className={mergeClasses(styles.headerLine, styles.text, entry.level === 'log' ? undefined : styles[entry.level], faded && styles.faded)}
      title={label}
      aria-label={label}
      data-console-header-line={entry.level}
      onClick={() => dispatch({ type: 'open' })}
    >
      {entry.text.split('\n')[0]}
    </button>
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
 * the newest line unless the reader has scrolled up; a greyed placeholder while nothing is logged; a recording under its title, "Recorded output"
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
      aria-label={state.recorded ? RECORDED_OUTPUT_TITLE : 'Console'}
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget;
        following.current = isScrolledToBottom(element.scrollTop, element.clientHeight, element.scrollHeight);
      }}
    >
      {state.recorded && <div className={mergeClasses(styles.line, styles.title)}>{RECORDED_OUTPUT_TITLE}</div>}
      {state.count || state.dropped ? <_ConsoleLines state={state} /> : <div className={styles.placeholder}>{NO_OUTPUT_TEXT}</div>}
    </div>
  );
}

// #endregion
