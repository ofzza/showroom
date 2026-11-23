/**
 * The code pane: a showcase shown as a block, its header bar (its status marks, and the code pane's cycling button) and its issue list above its
 * showcase views, stacked in their order, beside its code (a tab per file, marked with its issues); the code hidden, beside the views, or in the
 * showcase sidebar, switched by the cycling button; side by side, or stacked when the block is narrow, by a container query alone, around views that
 * are never moved, so a showcase frame never reloads. A showcase that doesn't build shows "Not built" in place of its showcase frame. Also a linked
 * showcase shown inline, shown as a block in the showcase sidebar, its code pane always shown: below its views, or filling it while they are collapsed.
 */

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import {
  CheckmarkCircle16Filled,
  ChevronDown16Regular,
  ChevronUp16Regular,
  Code16Regular,
  Dismiss16Regular,
  DismissCircle16Filled,
  Info16Regular,
  PanelRight16Regular,
  Warning16Filled,
} from '@fluentui/react-icons';
import type { DocumentationFile, ShowcaseView } from '../../host/index.js';
import { getRelativePath } from '../../markdown/index.js';
import { CopyButton, countLines, getCodeHeight, MAX_CODE_LINES } from '../code/index.js';
import {
  NewTabLink,
  ShowcaseSidebar,
  ShowcaseSidebarDrawer,
  ShownTabList,
  ShownTabView,
  getFetchedTabUrl,
  getMarkdownMarkers,
  getShownTabText,
  getTabId,
  getTabMarks,
  useLinkedFileContent,
} from '../showcase-sidebar/index.js';
import { isBuiltShowcase, isLoadedShowcase, type ShownIssue, type ShownShowcase } from '../host/index.js';
import {
  CONSOLE_LINE_ATTRIBUTE,
  CONSOLE_VIEW_HEIGHT,
  ConsoleView,
  getFirstIssueLine,
  getRecordingConsole,
  useConsole,
  type ConsoleAction,
  type ConsoleState,
} from '../console/index.js';
import { getOverhangStyle, MarkdownView, ShowcaseFrame, SourceView, type ShownOverhang } from '../showcases/index.js';

// #region States

/**
 * Represents the state of a code pane: hidden (the views alone), half (the code pane beside the views, or below them when stacked), or sidebar (on a
 * page: the views alone, its tabs in the showcase sidebar, without the cycling button until the showcase sidebar closes; in the showcase sidebar: the
 * code pane filling it, the views running hidden)
 */
export type CodePaneState = 'hidden' | 'half' | 'sidebar';

/**
 * The state every code pane starts in, each time a page is shown
 */
export const INITIAL_CODE_PANE_STATE: CodePaneState = 'hidden';

/**
 * Gets the state the cycling button switches a code pane to: hidden, then half, then sidebar; closing the showcase sidebar goes back to hidden
 * @param state The code pane's state
 * @returns The next state
 */
export function getNextCodePaneState(state: CodePaneState): CodePaneState {
  return state === 'hidden' ? 'half' : state === 'half' ? 'sidebar' : 'hidden';
}

/**
 * Labels of the cycling button (its tooltip and accessible name), by the code pane's state: each says what the button switches to; there is no
 * cycling button while the showcase sidebar is open
 */
export const CODE_PANE_BUTTON_LABELS: Record<Exclude<CodePaneState, 'sidebar'>, string> = {
  hidden: 'Show the code',
  half: 'Show the code in a sidebar',
};

/**
 * Label of the button hiding a code pane shown beside (or below) the views, on a page: it sits right of the cycling button in the half state, so
 * hiding the code pane needn't go through the showcase sidebar (D629)
 */
export const CODE_PANE_HIDE_LABEL = 'Hide the code';

/**
 * Represents the state of a block's views in the showcase sidebar (a linked showcase shown inline's), its code pane always shown: expanded (the
 * views, the code pane below them; its code pane's `half` state) or collapsed (the views running hidden, the code pane filling the showcase sidebar;
 * its code pane's `sidebar` state)
 */
export type SidebarViewsState = 'expanded' | 'collapsed';

/**
 * Gets the state of a block's views in the showcase sidebar from its code pane's state
 * @param state The code pane's state (`half` or `sidebar`, as it is never hidden there)
 * @returns Expanded or collapsed
 */
export function getSidebarViewsState(state: CodePaneState): SidebarViewsState {
  return state === 'sidebar' ? 'collapsed' : 'expanded';
}

/**
 * Gets the state the toggle button of a block in the showcase sidebar switches its code pane to: below the views (expanded), then filling the
 * showcase sidebar (collapsed), and back
 * @param state The code pane's state
 * @returns The next state
 */
export function getNextSidebarCodePaneState(state: CodePaneState): CodePaneState {
  return state === 'sidebar' ? 'half' : 'sidebar';
}

/**
 * Labels of the toggle button of a block in the showcase sidebar, by its views' state: each says what the button does (D628)
 */
export const SIDEBAR_VIEWS_BUTTON_LABELS: Record<SidebarViewsState, string> = {
  expanded: 'Collapse the showcase',
  collapsed: 'Expand the showcase',
};

/**
 * Gets the state a block's code pane starts in: on a page, hidden; in the showcase sidebar, half (below the views, expanded), or filling it when
 * there are no views (`none`), which it then never leaves, or without trust, where its views only show its code again
 * @param views The block's views
 * @param sidebar True for a block in the showcase sidebar
 * @param trusted True if the host repository is trusted
 * @returns The state it starts in
 */
export function getInitialCodePaneState(views: readonly ShowcaseView[], sidebar: boolean, trusted = true): CodePaneState {
  return !sidebar ? INITIAL_CODE_PANE_STATE : _showsNothing(views) || !trusted ? 'sidebar' : 'half';
}

/**
 * Checks if showcase views show nothing (`none`)
 * @param views The views
 * @returns True if the views are `none`
 */
function _showsNothing(views: readonly ShowcaseView[]): boolean {
  return views.length === 1 && views[0] === 'none';
}

// #endregion

// #region Sizes

/**
 * The fewest lines of code the code pane shows, unless its selected tab has fewer: a shorter showcase sits in a block at least this tall
 */
export const CODE_PANE_MIN_LINES = 6;

/**
 * The most lines of code the code pane shows when it takes its content's height (stacked); beyond them it scrolls
 */
export const CODE_PANE_MAX_LINES = MAX_CODE_LINES;

/**
 * Minimum height of a block's `demo` view, in pixels: a console panel's counter's row (`src/app/console/`), as the cycling button sits in the header
 * bar (D576)
 */
export const SHOWCASE_BLOCK_FRAME_MIN_HEIGHT = 32;

/**
 * Height of a block's header bar, in pixels: the row of its status marks and its cycling button
 */
export const HEADER_BAR_HEIGHT = 32;

/**
 * Width of the block, in pixels, below which the code pane is stacked below the views
 */
export const CODE_PANE_STACK_WIDTH = 720;

/**
 * Gets the code pane's minimum number of lines: the selected tab's own, when it has fewer than CODE_PANE_MIN_LINES, so short code beside a short
 * showcase takes no more room than it needs; CODE_PANE_MIN_LINES while the tab's text isn't at hand
 * @param text The selected tab's text, if at hand
 * @returns The number of lines
 */
export function getCodePaneMinLines(text: string | undefined): number {
  return text === undefined ? CODE_PANE_MIN_LINES : Math.min(CODE_PANE_MIN_LINES, countLines(text));
}

/**
 * Name of the CSS custom property holding the code pane's minimum number of lines (see getCodePaneMinLines()), set on the block
 */
const _MIN_LINES_PROPERTY = '--showroom-code-pane-min-lines';

/**
 * The code's minimum height: the minimum number of lines, and room for a horizontal scrollbar
 */
const _MIN_CODE_HEIGHT = getCodeHeight(`var(${_MIN_LINES_PROPERTY})`);

/**
 * The code's maximum height: the maximum number of lines, and room for a horizontal scrollbar
 */
const _MAX_CODE_HEIGHT = getCodeHeight(CODE_PANE_MAX_LINES);

/**
 * Height of the code pane's header row: the small tab list's
 */
const _HEADER_HEIGHT = '32px';

/**
 * The container query of a narrow block, where the code pane is stacked below the views
 */
const _STACKED = `@container (max-width: ${CODE_PANE_STACK_WIDTH - 1}px)`;

// #endregion

// #region Status marks

/**
 * Represents a status mark's status: passed (✓), warnings (⚠), errors (✗), or, for `runtime`, pending until the page has loaded
 */
export type StatusMarkStatus = 'passed' | 'warning' | 'error' | 'pending';

/**
 * Represents a status mark of a showcase's header bar: its build's, one of its checks', or its page's at run time
 */
export interface StatusMark {
  /**
   * What it is the status of: the showcase's build, one of its checks, or its page at run time
   */
  kind: 'build' | 'check' | 'runtime';
  /**
   * Its name: `build`, the check's name (e.g. `type check`), or `runtime`
   */
  name: string;
  /**
   * Its status
   */
  status: StatusMarkStatus;
  /**
   * Number of errors, with the `error` status; of warnings, with the `warning` status; 0 otherwise
   */
  count: number;
  /**
   * True on a `runtime` status mark of a recording, recorded when the showcase was built
   */
  recorded?: true;
}

/**
 * Name of the build's status mark
 */
export const BUILD_MARK_NAME = 'build';

/**
 * Name of the page's status mark at run time
 */
export const RUNTIME_MARK_NAME = 'runtime';

/**
 * Gets a status from numbers of errors and warnings
 * @param errors The number of errors
 * @param warnings The number of warnings
 * @returns The status, and the number it shows
 */
function _getStatus(errors: number, warnings: number): Pick<StatusMark, 'status' | 'count'> {
  if (errors) return { status: 'error', count: errors };
  return warnings ? { status: 'warning', count: warnings } : { status: 'passed', count: 0 };
}

/**
 * Gets a status from issues
 * @param issues The issues
 * @returns The status, and the number it shows
 */
function _getIssuesStatus(issues: readonly ShownIssue[]): Pick<StatusMark, 'status' | 'count'> {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  return _getStatus(errors, issues.length - errors);
}

/**
 * Gets a showcase's status marks, in order: `build`, where it shows one (see ShownShowcase's `buildMark`), from the issues naming no check; one per
 * check its build ran, from that check's issues, but `runtime`; and `runtime`, where its page runs (it builds, and a `demo` or `console` view loads
 * it), from its console's warnings and errors since the page's load, pending until the page has loaded; or where it has a recording, from the
 * recording, whatever its views
 * @param showcase The shown showcase
 * @param console The state of its console
 * @returns The status marks
 */
export function getStatusMarks(showcase: ShownShowcase, console: ConsoleState): StatusMark[] {
  const marks: StatusMark[] = [];
  if (showcase.buildMark)
    marks.push({ kind: 'build', name: BUILD_MARK_NAME, ..._getIssuesStatus(showcase.issues.filter((issue) => issue.check === undefined)) });
  for (const check of showcase.checks) {
    if (check === RUNTIME_MARK_NAME) continue;
    marks.push({ kind: 'check', name: check, ..._getIssuesStatus(showcase.issues.filter((issue) => issue.check === check)) });
  }
  if (showcase.recording !== undefined) {
    const recorded = console.recorded ? console : getRecordingConsole(showcase.recording);
    marks.push({ kind: 'runtime', name: RUNTIME_MARK_NAME, ..._getStatus(recorded.errorCount, recorded.warningCount), recorded: true });
    return marks;
  }
  if (isLoadedShowcase(showcase)) {
    const status = console.ready ? _getStatus(console.errorCount, console.warningCount) : ({ status: 'pending', count: 0 } as const);
    marks.push({ kind: 'runtime', name: RUNTIME_MARK_NAME, ...status });
  }
  return marks;
}

/**
 * Symbols of the statuses, in a status mark's text
 */
const _STATUS_SYMBOLS: Record<StatusMarkStatus, string> = { passed: '✓', warning: '⚠', error: '✗', pending: '…' };

/**
 * Gets a status mark's text, as it reads: its name, its status's symbol, and on ⚠ and ✗ the number (e.g. `type check ✗ 3`, `runtime …`)
 * @param mark The status mark
 * @returns The text
 */
export function getStatusMarkText(mark: StatusMark): string {
  return `${mark.name} ${_STATUS_SYMBOLS[mark.status]}${mark.count ? ` ${mark.count}` : ''}`;
}

/**
 * Says an amount of something, in the singular or plural
 * @param amount The amount
 * @param word The word, in the singular
 * @returns E.g. `1 error`, `2 errors`
 */
function _plural(amount: number, word: string): string {
  return `${amount} ${word}${amount === 1 ? '' : 's'}`;
}

/**
 * Checks if a status mark does something when clicked: a ✗ or ⚠ of the build or a check toggles the issue list; `runtime` opens the console, or
 * shows the `console` view's first issue line; a recording's `runtime` only where the showcase has a `console` view
 * @param mark The status mark
 * @param consoleView True if the showcase has a `console` view
 * @returns True if it is a button
 */
export function isStatusMarkButton(mark: StatusMark, consoleView = true): boolean {
  if (mark.kind === 'runtime') return !mark.recorded || consoleView;
  return mark.status === 'error' || mark.status === 'warning';
}

/**
 * Gets a status mark's accessible name and tooltip: its name and status, and what clicking it does
 * @param mark The status mark
 * @param expanded True while the issue list is expanded
 * @param consoleView True if the showcase has a `console` view, which the `runtime` status mark scrolls to its first issue line
 * @returns The label (e.g. `type check: 3 errors. Hide the issues`)
 */
export function getStatusMarkLabel(mark: StatusMark, expanded: boolean, consoleView: boolean): string {
  const status =
    mark.status === 'pending' ? 'loading' : mark.status === 'passed' ? 'passed' : _plural(mark.count, mark.status === 'error' ? 'error' : 'warning');
  if (mark.kind === 'runtime') {
    const issue = mark.status === 'error' ? 'error' : mark.status === 'warning' ? 'warning' : undefined;
    const recorded = mark.recorded ? ', recorded when built' : '';
    if (mark.recorded && !consoleView) return `${mark.name}: ${status}${recorded}`;
    return `${mark.name}: ${status}${recorded}. ${consoleView ? (issue ? `Show the first ${issue} in the console` : 'Show the console') : 'Open the console'}`;
  }
  return `${mark.name}: ${status}${isStatusMarkButton(mark) ? `. ${expanded ? 'Hide' : 'Show'} the issues` : ''}`;
}

/**
 * Styles of the header bar's status marks and the issue list
 */
const _useMarkStyles = makeStyles({
  marks: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalXS, flex: '1 1 auto', minWidth: '0' },
  mark: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXXS,
    padding: `0 ${tokens.spacingHorizontalS}`,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
  },
  button: { minWidth: '0', fontWeight: tokens.fontWeightRegular, fontSize: tokens.fontSizeBase200 },
  pending: { color: tokens.colorNeutralForegroundDisabled },
  passed: { color: tokens.colorPaletteGreenForeground1 },
  warning: { color: tokens.colorPaletteMarigoldForeground1 },
  error: { color: tokens.colorPaletteRedForeground1 },
  info: { display: 'inline-flex', cursor: 'help' },
  list: {
    margin: '0',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    listStyleType: 'none',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  },
  item: { display: 'flex', alignItems: 'flex-start', columnGap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalXXS} 0` },
  icon: { flex: 'none', marginTop: '1px' },
  check: { flex: 'none', color: tokens.colorNeutralForeground3 },
  location: { flex: 'none', color: tokens.colorNeutralForeground2 },
  message: { flex: '1 1 auto', minWidth: '0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
});

/**
 * Renders a status's icon: a green check, a yellow warning or a red cross (FluentUI's filled icons); none while pending
 * @param props Properties of the component: the status, and the class name of its colour
 * @returns The icon
 */
function _StatusIcon({ status, className }: { status: StatusMarkStatus; className?: string }): ReactNode {
  switch (status) {
    case 'passed':
      return <CheckmarkCircle16Filled className={className} aria-hidden="true" />;
    case 'warning':
      return <Warning16Filled className={className} aria-hidden="true" />;
    case 'error':
      return <DismissCircle16Filled className={className} aria-hidden="true" />;
    case 'pending':
      return null;
  }
}

/**
 * Represents the properties of the status marks
 */
interface _StatusMarksProps {
  /**
   * The shown showcase
   */
  showcase: ShownShowcase;
  /**
   * The state of its console
   */
  console: ConsoleState;
  /**
   * True while the issue list is expanded
   */
  expanded: boolean;
  /**
   * Id of the issue list, which the buttons toggling it control
   */
  listId: string;
  /**
   * Toggles the issue list
   */
  onToggle: () => void;
  /**
   * Called when the `runtime` status mark is clicked
   */
  onRuntime: () => void;
}

/**
 * Renders a showcase's status marks, a row on its header bar's left: each its name, its icon and, on ⚠ and ✗, the number; a mark that does something
 * a subtle small button, a ✓ of the build or a check plain text, `runtime …` greyed while pending
 * @param props Properties of the component
 * @returns The status marks
 */
function _StatusMarks({ showcase, console, expanded, listId, onToggle, onRuntime }: _StatusMarksProps): ReactNode {
  const styles = _useMarkStyles();
  const consoleView = showcase.views.includes('console');
  return (
    <div className={styles.marks}>
      {getStatusMarks(showcase, console).map((mark) => {
        const label = getStatusMarkLabel(mark, expanded, consoleView);
        const content = (
          <>
            {mark.name}
            {mark.status === 'pending' ? ' …' : <_StatusIcon status={mark.status} className={styles[mark.status]} />}
            {mark.count ? mark.count : null}
          </>
        );
        const key = `${mark.kind}:${mark.name}`;
        const className = mergeClasses(styles.mark, mark.status === 'pending' && styles.pending);
        if (!isStatusMarkButton(mark, consoleView)) {
          return (
            <span key={key} className={className} title={label} aria-label={label} role="img" data-status-mark={mark.status}>
              {content}
            </span>
          );
        }
        const toggles = mark.kind !== 'runtime';
        return (
          <Button
            key={key}
            className={mergeClasses(className, styles.button)}
            appearance="subtle"
            size="small"
            title={label}
            aria-label={label}
            data-status-mark={mark.status}
            {...(toggles ? { 'aria-expanded': expanded, 'aria-controls': listId } : {})}
            onClick={toggles ? onToggle : onRuntime}
          >
            {content}
          </Button>
        );
      })}
    </div>
  );
}

// #region Trust notice

/**
 * Context telling the blocks whether the host repository is trusted (the shown host information's `trusted`); trusted by default
 */
export const TrustedContext = createContext(true);

/**
 * Text of the notice a block's header bar shows in place of its status marks without trust
 */
export const TRUST_NOTICE_TEXT = 'Source only: not trusted';

/**
 * Tooltip of the trust notice's (i) icon, explaining it
 */
export const TRUST_NOTICE_TOOLTIP =
  "Running this showcase would run the host repository's code, which showroom only does when the person running it trusts the repository " +
  '(answer yes when showroom asks, or pass --trust). Until then, the showcase shows its source.';

/**
 * Renders the trust notice, in place of the status marks without trust: its text, and an (i) icon whose tooltip explains it
 * @returns The notice
 */
function _TrustNotice(): ReactNode {
  const styles = _useMarkStyles();
  return (
    <div className={styles.marks}>
      <span className={styles.mark} data-trust-notice="">
        {TRUST_NOTICE_TEXT}
        <span className={styles.info} title={TRUST_NOTICE_TOOLTIP} aria-label={TRUST_NOTICE_TOOLTIP} role="img" tabIndex={0}>
          <Info16Regular aria-hidden="true" />
        </span>
      </span>
    </div>
  );
}

// #endregion

// #region Issue list

/**
 * Name an issue of the build itself (one naming no check) is listed under
 */
export const BUILD_CHECK_LABEL = 'build';

/**
 * Gets where an issue is, as the issue list shows it: its file's tab label when a tab shows the file (the entry point's label for a code block
 * showcase's own virtual file), else its path relative to the documentation file; then its line
 * @param showcase The shown showcase
 * @param issue The issue
 * @returns The location (e.g. `TS:3`, `src/a.ts:2`)
 */
export function getIssueLocation(showcase: Pick<ShownShowcase, 'documentation' | 'tabs'>, issue: ShownIssue): string {
  const tab = showcase.tabs.find((candidate) => !candidate.markdown && candidate.path === issue.path);
  const label = tab?.label ?? getRelativePath(showcase.documentation, issue.path);
  return issue.line === undefined ? label : `${label}:${issue.line}`;
}

/**
 * Checks if the issue list expands again by itself: when a showcase with no issues gets some
 * @param previous The number of issues the showcase had
 * @param next The number it has now
 * @returns True if the issue list expands
 */
export function shouldExpandIssues(previous: number, next: number): boolean {
  return previous === 0 && next > 0;
}

/**
 * Keeps whether a showcase's issue list is expanded: at first, and again whenever a showcase with no issues gets some; otherwise as the reader left it,
 * while the block is mounted
 * @param count The number of the showcase's issues
 * @returns Whether it is expanded, and the function toggling it
 */
export function useIssueList(count: number): [boolean, () => void] {
  const [expanded, setExpanded] = useState(true);
  const [previous, setPrevious] = useState(count);
  if (previous !== count) {
    // Adjusting state while rendering, as React recommends for state derived from a changed prop
    setPrevious(count);
    if (shouldExpandIssues(previous, count)) setExpanded(true);
  }
  return [expanded, () => setExpanded((value) => !value)];
}

/**
 * Renders a showcase's issue list: each issue on its rows, its icon, its check (`build` for none), where it is, and its message, wrapped
 * @param props Properties of the component: the shown showcase, and the list's id
 * @returns The issue list
 */
export function IssueList({ showcase, id }: { showcase: ShownShowcase; id?: string }): ReactNode {
  const styles = _useMarkStyles();
  return (
    <ul id={id} className={styles.list} aria-label="Issues">
      {showcase.issues.map((issue, index) => (
        <li key={index} className={styles.item} data-issue-severity={issue.severity}>
          <_StatusIcon status={issue.severity} className={mergeClasses(styles.icon, styles[issue.severity])} />
          <span className={styles.check}>{issue.check ?? BUILD_CHECK_LABEL}</span>
          <span className={styles.location}>{getIssueLocation(showcase, issue)}</span>
          <span className={styles.message}>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

// #endregion

// #region Header bar

/**
 * Styles of the header bar and the "Not built" placeholder
 */
const _useBarStyles = makeStyles({
  // The status marks on its left, the cycling button (a block's) at its right end
  bar: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    minHeight: `${HEADER_BAR_HEIGHT}px`,
    padding: `0 ${tokens.spacingHorizontalXS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  },
  end: { marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center' },
  placeholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForegroundDisabled,
    fontStyle: 'italic',
  },
});

/**
 * Represents the properties of a header bar
 */
export interface HeaderBarProps {
  /**
   * The shown showcase
   */
  showcase: ShownShowcase;
  /**
   * The state of its console, and its update function
   */
  console: [ConsoleState, (action: ConsoleAction) => void];
  /**
   * Called when the `runtime` status mark is clicked
   */
  onRuntime: () => void;
  /**
   * What sits at its right end (a block's cycling button, and in the showcase sidebar its close button), if anything
   */
  end?: ReactNode;
  /**
   * False without trust: the trust notice shows in place of the status marks; trusted if not given
   */
  trusted?: boolean;
}

/**
 * Renders a showcase's header bar, its status marks (or without trust, the trust notice) on its left and what is given at its right end, and its
 * issue list under it while expanded
 * @param props Properties of the component
 * @returns The header bar and the issue list
 */
export function HeaderBar({ showcase, console, onRuntime, end, trusted = true }: HeaderBarProps): ReactNode {
  const styles = _useBarStyles();
  const listId = useId();
  const [expanded, toggle] = useIssueList(showcase.issues.length);
  return (
    <>
      <div className={styles.bar}>
        {trusted ? (
          <_StatusMarks showcase={showcase} console={console[0]} expanded={expanded} listId={listId} onToggle={toggle} onRuntime={onRuntime} />
        ) : (
          <_TrustNotice />
        )}
        {end && <div className={styles.end}>{end}</div>}
      </div>
      {expanded && showcase.issues.length > 0 && <IssueList showcase={showcase} id={listId} />}
    </>
  );
}

/**
 * The placeholder's text, in place of the showcase frame of a showcase that doesn't build
 */
export const NOT_BUILT_TEXT = 'Not built';

/**
 * Gets the "Not built" placeholder's height: a `console` view keeps its own; a `demo` view keeps the height its showcase frame last reported in
 * this page, so breaking the build while editing doesn't make the page jump, else the `console` view's
 * @param view The view the placeholder is in
 * @param lastHeight The height the showcase frame last reported in this page, in pixels, if any
 * @returns The height, in pixels
 */
export function getPlaceholderHeight(view: 'demo' | 'console', lastHeight?: number): number {
  return view === 'demo' && lastHeight !== undefined ? Math.max(lastHeight, SHOWCASE_BLOCK_FRAME_MIN_HEIGHT) : CONSOLE_VIEW_HEIGHT;
}

/**
 * Renders the "Not built" placeholder, centred and greyed, in place of the showcase frame of a showcase that doesn't build
 * @param props Properties of the component: its height, in pixels
 * @returns The placeholder
 */
function _NotBuilt({ height }: { height: number }): ReactNode {
  const styles = _useBarStyles();
  return (
    <div className={styles.placeholder} style={{ height: `${height}px` }} data-not-built="">
      {NOT_BUILT_TEXT}
    </div>
  );
}

// #endregion

// #region Block

/**
 * Styles of a showcase block: the container (outside, as a container query applies to its descendants only) and its grid (the header bar across
 * its top; the views, and the code pane beside or below them), whose template alone the states change, so the views never move
 */
const _useStyles = makeStyles({
  container: { containerType: 'inline-size', margin: `${tokens.spacingVerticalM} 0` },
  // Overlays out over the page: the block (a stacking context, as a container) raised over what follows it, its grid letting them out (D920)
  containerOut: { position: 'relative' },
  gridOut: { overflow: 'visible' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: 'auto auto',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  // Half: side by side, the row at least the minimum's height; stacked below a narrow block
  gridHalf: {
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gridTemplateRows: `auto minmax(calc(${_HEADER_HEIGHT} + ${_MIN_CODE_HEIGHT}), auto)`,
    [_STACKED]: { gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'auto auto auto' },
  },
  // The header bar and the issue list, across the grid's top
  top: { gridColumn: '1 / -1', gridRow: '1', minWidth: '0' },
  // The views keep their own height, never stretched to the row, each after the first below a divider
  views: { gridColumn: '1', gridRow: '2', alignSelf: 'start', minWidth: '0', display: 'flex', flexDirection: 'column' },
  view: { minWidth: '0', ':not(:first-child)': { borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}` } },
  pane: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: '0',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  paneHidden: { display: 'none' },
  // Side by side, the code pane never sizes the row, and fills it; stacked, below the views, as high as its content
  paneHalf: {
    gridColumn: '2',
    gridRow: '2',
    contain: 'size',
    borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    [_STACKED]: {
      gridColumn: '1',
      gridRow: '3',
      contain: 'none',
      borderLeft: 'none',
      borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    },
  },
  // In the showcase sidebar: filling it, scrolling under its header bar, borderless
  // Its width given, as a container query's container (`inline-size`) never takes it from its content (D616)
  containerSidebar: { flex: '1 1 auto', width: '100%', minHeight: '0', height: '100%', margin: '0' },
  gridSidebar: { height: '100%', alignContent: 'start', overflowY: 'auto', border: 'none', borderRadius: '0' },
  // Above a raised showcase frame's box (levels 1 and 2, D927)
  topSidebar: { position: 'sticky', top: '0', zIndex: 3, backgroundColor: tokens.colorNeutralBackground1 },
  // Half, in the showcase sidebar: always stacked, the code pane below the views (D627), as high as its content, between the minimum and the maximum
  gridHalfSidebar: { gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'auto auto auto' },
  paneHalfSidebar: {
    gridColumn: '1',
    gridRow: '3',
    contain: 'none',
    borderLeft: 'none',
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  },
  codeHalfSidebar: { minHeight: _MIN_CODE_HEIGHT, maxHeight: _MAX_CODE_HEIGHT },
  // The code pane filling the showcase sidebar, the views below it running hidden (D570): at their width, in a row of no height that clips them
  gridFill: { gridTemplateRows: 'auto minmax(0, 1fr) 0', alignContent: 'stretch' },
  viewsFill: { gridRow: '3', height: '0', overflow: 'hidden', opacity: 0, pointerEvents: 'none' },
  paneFill: { gridColumn: '1', gridRow: '2', minHeight: '0' },
  // The tab list, then the "Open in a new tab" link (in the showcase sidebar) and the copy button at its right end
  header: { display: 'flex', alignItems: 'center', minHeight: _HEADER_HEIGHT, overflowX: 'auto' },
  actions: { marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  copy: { flexShrink: 0 },
  code: { flex: '1 1 auto', minHeight: '0', display: 'flex', flexDirection: 'column' },
  // Stacked: the code takes its content's height, between the minimum and the maximum
  codeHalf: { [_STACKED]: { minHeight: _MIN_CODE_HEIGHT, maxHeight: _MAX_CODE_HEIGHT } },
});

/**
 * Gets where a block's showcase frame goes: in its `demo` view; else hidden, in its `console` view; else nowhere, as no view loads it
 * @param views The block's views
 * @returns The view holding the showcase frame, or undefined
 */
export function getFrameView(views: readonly ShowcaseView[]): 'demo' | 'console' | undefined {
  return views.includes('demo') ? 'demo' : views.includes('console') ? 'console' : undefined;
}

/**
 * Represents the properties of a showcase block
 */
export interface ShowcaseBlockProps {
  /**
   * The showcase, shown as a block
   */
  showcase: ShownShowcase;
  /**
   * The shown documentation files, holding a documentation file tab's content
   */
  documentation: DocumentationFile[];
  /**
   * The state the code pane starts in (getInitialCodePaneState()'s by default); the tests' server-side rendering sets it, as no click happens there
   */
  initialState?: CodePaneState;
  /**
   * Closes the showcase sidebar: given for a block shown in it (a linked showcase shown inline's), which then has a close button in its header bar,
   * fills the showcase sidebar, and toggles its views instead of cycling its code pane
   */
  onClose?: () => void;
  /**
   * The console's state to start with (the tests' server-side rendering sets it); empty by default
   */
  initialConsole?: ConsoleState;
  /**
   * The overhang its showcase frame starts with, for a showcase opted into overlays over the page (the tests' server-side rendering sets it)
   */
  initialOverhang?: ShownOverhang;
}

/**
 * Renders a showcase shown as a block: its header bar with its status marks and the cycling button, and its issue list; its views, stacked in their
 * order (`markdown` and `source` with their issue lines marked, `demo` with the console panel over it unless a `console` view shows it, `console`
 * with the showcase frame running hidden at its top when there is no `demo` view; "Not built" in place of the showcase frame and the console when it
 * doesn't build); its code pane (the tab list and the copy button above the selected tab's code, its issue lines marked); in the sidebar state, the
 * views alone, and the showcase sidebar with its tabs, from the selected one
 * @param props Properties of the component
 * @returns The block
 */
export function ShowcaseBlock({ showcase, documentation, initialState, initialConsole, initialOverhang, onClose }: ShowcaseBlockProps): ReactNode {
  const styles = _useStyles();
  const idPrefix = useId();
  const sidebar = onClose !== undefined;
  const trusted = useContext(TrustedContext);
  const [state, setState] = useState<CodePaneState>(() => initialState ?? getInitialCodePaneState(showcase.views, sidebar, trusted));
  // In the showcase sidebar, the code pane fills it in the sidebar state
  const fill = sidebar && state === 'sidebar';
  const [selected, setSelected] = useState(0);
  const recording = showcase.recording;
  const shared = useConsole(initialConsole ?? (recording ? getRecordingConsole(recording) : undefined));
  // A new recording (from serve) replaces the one shown; a showcase that stops building has none
  const [, dispatchConsole] = shared;
  const shownRecording = useRef(recording);
  useEffect(() => {
    if (shownRecording.current === recording) return;
    shownRecording.current = recording;
    dispatchConsole(recording ? { type: 'recording', recording } : { type: 'start' });
  }, [recording, dispatchConsole]);
  const [lastHeight, setLastHeight] = useState<number>();
  // Raised while its showcase frame's overlays are out over the page: at first, as its showcase frame starts out (the tests' rendering)
  const [level, setLevel] = useState(() =>
    initialOverhang && showcase.overlays && showcase.views.includes('demo') && !fill && getOverhangStyle(initialOverhang, SHOWCASE_BLOCK_FRAME_MIN_HEIGHT)
      ? 1
      : 0,
  );
  const consoleView = useRef<HTMLDivElement>(null);
  const tabs = showcase.tabs;
  const index = Math.min(selected, tabs.length - 1);
  const tab = tabs[index];
  const tabMarks = useMemo(() => getTabMarks(showcase), [showcase]);
  // Fetched once shown beside the views, or filling the showcase sidebar: on a page, the showcase sidebar fetches its own
  const content = useLinkedFileContent(state === 'half' || fill ? getFetchedTabUrl(tab) : undefined);
  const openUrl = sidebar && tab?.source.kind === 'file' ? tab.source.url : undefined;
  const text = getShownTabText(tab, documentation, content);
  const frameView = getFrameView(showcase.views);
  const loaded = isLoadedShowcase(showcase);
  const frame = (hidden: boolean) =>
    isLoadedShowcase(showcase) && (
      <ShowcaseFrame
        showcase={showcase}
        block
        minHeight={hidden ? undefined : SHOWCASE_BLOCK_FRAME_MIN_HEIGHT}
        console={shared}
        overlay={!showcase.views.includes('console')}
        hidden={hidden}
        onResize={setLastHeight}
        overhang={!fill}
        initialOverhang={initialOverhang}
        onOverhang={setLevel}
      />
    );
  // The runtime status mark opens the console panel over the demo view, or shows the console view's first issue line
  const onRuntime = () => {
    if (!showcase.views.includes('console')) return shared[1]({ type: 'open' });
    const log = consoleView.current?.querySelector<HTMLElement>('[role="log"]');
    const id = getFirstIssueLine(shared[0]);
    log?.focus({ preventScroll: true });
    (id === undefined ? log : log?.querySelector(`[${CONSOLE_LINE_ATTRIBUTE}="${id}"]`))?.scrollIntoView({ block: 'nearest' });
  };
  const renderView = (view: ShowcaseView): ReactNode => {
    switch (view) {
      case 'markdown':
        return <MarkdownView markdown={showcase.markdown} markers={getMarkdownMarkers(showcase)} />;
      case 'source':
        return (
          tabs[showcase.entryTab] && <SourceView tab={tabs[showcase.entryTab]} documentation={documentation} markers={tabMarks[showcase.entryTab]?.markers} />
        );
      case 'demo':
        return loaded ? frame(false) : <_NotBuilt height={getPlaceholderHeight('demo', lastHeight)} />;
      case 'console':
        return isBuiltShowcase(showcase) ? (
          <>
            {loaded && frameView === 'console' && frame(true)}
            <ConsoleView state={shared[0]} />
          </>
        ) : (
          <_NotBuilt height={getPlaceholderHeight('console')} />
        );
      case 'none':
        return null;
    }
  };
  // On a page, the cycling button, none while the showcase sidebar shows the tabs; in the showcase sidebar, the views' toggle button (D628), none when
  // there are no views, as the code pane always fills it
  const views = getSidebarViewsState(state);
  const label = sidebar ? SIDEBAR_VIEWS_BUTTON_LABELS[views] : state === 'sidebar' ? undefined : CODE_PANE_BUTTON_LABELS[state];
  const cycling = label !== undefined && !(sidebar && _showsNothing(showcase.views)) && (
    <Button
      appearance="subtle"
      size="small"
      icon={
        sidebar ? views === 'expanded' ? <ChevronUp16Regular /> : <ChevronDown16Regular /> : state === 'hidden' ? <Code16Regular /> : <PanelRight16Regular />
      }
      aria-label={label}
      title={label}
      aria-expanded={sidebar ? views === 'expanded' : undefined}
      onClick={() => setState(sidebar ? getNextSidebarCodePaneState : getNextCodePaneState)}
    />
  );
  // On a page, in the half state, a button hiding the code pane at once, right of the cycling button (D629)
  const hide = !sidebar && state === 'half' && (
    <Button
      appearance="subtle"
      size="small"
      icon={<Dismiss16Regular />}
      aria-label={CODE_PANE_HIDE_LABEL}
      title={CODE_PANE_HIDE_LABEL}
      onClick={() => setState('hidden')}
    />
  );
  const close = sidebar && (
    <Button appearance="subtle" size="small" icon={<Dismiss16Regular />} aria-label={CLOSE_LABEL} title={CLOSE_LABEL} onClick={onClose} />
  );
  return (
    <div
      className={mergeClasses(styles.container, sidebar && styles.containerSidebar, level > 0 && styles.containerOut)}
      data-code-pane-state={state}
      data-showcase-sidebar={sidebar ? '' : undefined}
      style={{ [_MIN_LINES_PROPERTY]: getCodePaneMinLines(text), ...(level > 0 ? { zIndex: level } : {}) } as CSSProperties}
    >
      <div
        className={mergeClasses(
          styles.grid,
          sidebar && styles.gridSidebar,
          state === 'half' && styles.gridHalf,
          state === 'half' && sidebar && styles.gridHalfSidebar,
          fill && styles.gridFill,
          level > 0 && styles.gridOut,
        )}
      >
        <div className={mergeClasses(styles.top, sidebar && styles.topSidebar)}>
          <HeaderBar
            showcase={showcase}
            console={shared}
            onRuntime={onRuntime}
            trusted={trusted}
            end={
              (cycling || hide || close) && (
                <>
                  {cycling}
                  {hide}
                  {close}
                </>
              )
            }
          />
        </div>
        {/* Filling the showcase sidebar, the views run hidden, out of reach of the pointer, the keyboard and screen readers */}
        <div className={mergeClasses(styles.views, fill && styles.viewsFill)} aria-hidden={fill || undefined} inert={fill || undefined}>
          {showcase.views.map((view) => (
            <div key={view} ref={view === 'console' ? consoleView : undefined} className={styles.view} data-showcase-view={view}>
              {renderView(view)}
            </div>
          ))}
        </div>
        <div
          className={mergeClasses(
            styles.pane,
            state === 'half' ? styles.paneHalf : fill ? styles.paneFill : styles.paneHidden,
            state === 'half' && sidebar && styles.paneHalfSidebar,
          )}
        >
          <div className={styles.header}>
            <ShownTabList tabs={tabs} selected={index} onSelect={setSelected} idPrefix={idPrefix} marks={tabMarks} />
            <div className={styles.actions}>
              {openUrl !== undefined && <NewTabLink href={openUrl} />}
              {text !== undefined && <CopyButton text={text} className={styles.copy} />}
            </div>
          </div>
          <div
            className={mergeClasses(styles.code, !fill && styles.codeHalf, state === 'half' && sidebar && styles.codeHalfSidebar)}
            role="tabpanel"
            aria-labelledby={getTabId(idPrefix, index)}
          >
            {tab && <ShownTabView tab={tab} documentation={documentation} content={content} fill copy={false} markers={tabMarks[index]?.markers} />}
          </div>
        </div>
      </div>
      {!sidebar && (
        <ShowcaseSidebar
          tabs={tabs}
          documentation={documentation}
          open={state === 'sidebar'}
          initialTab={index}
          tabMarks={tabMarks}
          onClose={() => setState('hidden')}
        />
      )}
    </div>
  );
}

/**
 * Accessible name and tooltip of the close button of a block in the showcase sidebar
 */
export const CLOSE_LABEL = 'Close';

/**
 * Represents the properties of a linked showcase shown inline, in the showcase sidebar
 */
export interface SidebarShowcaseProps {
  /**
   * The showcase shown, while the showcase sidebar is open
   */
  showcase?: ShownShowcase;
  /**
   * The shown documentation files, holding a documentation file tab's content
   */
  documentation: DocumentationFile[];
  /**
   * Closes the showcase sidebar
   */
  onClose: () => void;
}

/**
 * Renders a linked showcase shown inline in the showcase sidebar, as a block shows it (D616): rendered only while open, so closing it unloads its
 * showcase frame and clears its console, and reopening loads it afresh (D618)
 * @param props Properties of the component
 * @returns The showcase sidebar
 */
export function SidebarShowcase({ showcase, documentation, onClose }: SidebarShowcaseProps): ReactNode {
  return (
    <ShowcaseSidebarDrawer open={showcase !== undefined} onClose={onClose}>
      {showcase && <ShowcaseBlock key={showcase.id} showcase={showcase} documentation={documentation} onClose={onClose} />}
    </ShowcaseSidebarDrawer>
  );
}

// #endregion
