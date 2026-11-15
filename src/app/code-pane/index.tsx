/**
 * The code pane: a showcase shown as a block, its header bar (with the code pane's cycling button) above its showcase views, stacked in their order,
 * beside its code (a tab per file); the code hidden, beside the views, or in the code sidebar, switched by the cycling button; side by side, or
 * stacked when the block is narrow, by a container query alone, around views that are never moved, so a showcase frame never reloads
 */

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Code16Regular, PanelRight16Regular } from '@fluentui/react-icons';
import type { DocumentationFile, ShowcaseView } from '../../host/index.js';
import { CopyButton, countLines, getCodeHeight, MAX_CODE_LINES } from '../code/index.js';
import { CodeSidebar, ShownTabList, ShownTabView, getFetchedTabUrl, getShownTabText, getTabId, useLinkedFileContent } from '../code-sidebar/index.js';
import { isLoadedShowcase, type ShownShowcase } from '../host/index.js';
import { ConsoleView, useConsole, type ConsoleState } from '../console/index.js';
import { MarkdownView, ShowcaseFrame, SourceView } from '../showcases/index.js';

// #region States

/**
 * Represents the state of a code pane: hidden (the views alone), half (the code pane beside the views, or below them when stacked), or sidebar (the
 * views alone, its tabs in the code sidebar, without the cycling button until the code sidebar closes)
 */
export type CodePaneState = 'hidden' | 'half' | 'sidebar';

/**
 * The state every code pane starts in, each time a page is shown
 */
export const INITIAL_CODE_PANE_STATE: CodePaneState = 'hidden';

/**
 * Gets the state the cycling button switches a code pane to: hidden, then half, then sidebar; closing the code sidebar goes back to hidden
 * @param state The code pane's state
 * @returns The next state
 */
export function getNextCodePaneState(state: CodePaneState): CodePaneState {
  return state === 'hidden' ? 'half' : state === 'half' ? 'sidebar' : 'hidden';
}

/**
 * Labels of the cycling button (its tooltip and accessible name), by the code pane's state: each says what the button switches to; there is no
 * cycling button while the code sidebar is open
 */
export const CODE_PANE_BUTTON_LABELS: Record<Exclude<CodePaneState, 'sidebar'>, string> = {
  hidden: 'Show the code',
  half: 'Show the code in a sidebar',
};

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
 * Height of a block's header bar, in pixels: the cycling button's row (and, later, its status marks')
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

// #region Block

/**
 * Styles of a showcase block: the container (outside, as a container query applies to its descendants only) and its grid (the header bar across
 * its top; the views, and the code pane beside or below them), whose template alone the states change, so the views never move
 */
const _useStyles = makeStyles({
  container: { containerType: 'inline-size', margin: `${tokens.spacingVerticalM} 0` },
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
  // The header bar: its left for the status marks (P15.5), the cycling button at its right end
  bar: {
    gridColumn: '1 / -1',
    gridRow: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: `${HEADER_BAR_HEIGHT}px`,
    padding: `0 ${tokens.spacingHorizontalXS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  },
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
  // The tab list, then the copy button at its right end
  header: { display: 'flex', alignItems: 'center', minHeight: _HEADER_HEIGHT, overflowX: 'auto' },
  copy: { marginLeft: 'auto', flexShrink: 0 },
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
   * The state the code pane starts in (INITIAL_CODE_PANE_STATE by default); the tests' server-side rendering sets it, as no click happens there
   */
  initialState?: CodePaneState;
  /**
   * The console's state to start with (the tests' server-side rendering sets it); empty by default
   */
  initialConsole?: ConsoleState;
}

/**
 * Renders a showcase shown as a block: its header bar with the cycling button; its views, stacked in their order (`markdown`, `source`, `demo` with
 * the console panel over it unless a `console` view shows it, `console` with the showcase frame running hidden at its top when there is no `demo`
 * view); its code pane (the tab list and the copy button above the selected tab's code); in the sidebar state, the views alone, and the code sidebar
 * with its tabs, from the selected one
 * @param props Properties of the component
 * @returns The block
 */
export function ShowcaseBlock({ showcase, documentation, initialState = INITIAL_CODE_PANE_STATE, initialConsole }: ShowcaseBlockProps): ReactNode {
  const styles = _useStyles();
  const idPrefix = useId();
  const [state, setState] = useState<CodePaneState>(initialState);
  const [selected, setSelected] = useState(0);
  const shared = useConsole(initialConsole);
  const tabs = showcase.tabs;
  const index = Math.min(selected, tabs.length - 1);
  const tab = tabs[index];
  // Fetched once shown beside the views: the code sidebar fetches its own
  const content = useLinkedFileContent(state === 'half' ? getFetchedTabUrl(tab) : undefined);
  const text = getShownTabText(tab, documentation, content);
  const frameView = getFrameView(showcase.views);
  const frame = (hidden: boolean) =>
    isLoadedShowcase(showcase) && (
      <ShowcaseFrame
        showcase={showcase}
        block
        minHeight={hidden ? undefined : SHOWCASE_BLOCK_FRAME_MIN_HEIGHT}
        console={shared}
        overlay={!showcase.views.includes('console')}
        hidden={hidden}
      />
    );
  const renderView = (view: ShowcaseView): ReactNode => {
    switch (view) {
      case 'markdown':
        return <MarkdownView markdown={showcase.markdown} />;
      case 'source':
        return tabs[showcase.entryTab] && <SourceView tab={tabs[showcase.entryTab]} documentation={documentation} />;
      case 'demo':
        return frame(false);
      case 'console':
        return (
          <>
            {frameView === 'console' && frame(true)}
            <ConsoleView state={shared[0]} />
          </>
        );
      case 'none':
        return null;
    }
  };
  return (
    <div className={styles.container} data-code-pane-state={state} style={{ [_MIN_LINES_PROPERTY]: getCodePaneMinLines(text) } as CSSProperties}>
      <div className={mergeClasses(styles.grid, state === 'half' && styles.gridHalf)}>
        <div className={styles.bar}>
          {state !== 'sidebar' && (
            <Button
              appearance="subtle"
              size="small"
              icon={state === 'hidden' ? <Code16Regular /> : <PanelRight16Regular />}
              aria-label={CODE_PANE_BUTTON_LABELS[state]}
              title={CODE_PANE_BUTTON_LABELS[state]}
              onClick={() => setState(getNextCodePaneState)}
            />
          )}
        </div>
        <div className={styles.views}>
          {showcase.views.map((view) => (
            <div key={view} className={styles.view} data-showcase-view={view}>
              {renderView(view)}
            </div>
          ))}
        </div>
        <div className={mergeClasses(styles.pane, state === 'half' ? styles.paneHalf : styles.paneHidden)}>
          <div className={styles.header}>
            <ShownTabList tabs={tabs} selected={index} onSelect={setSelected} idPrefix={idPrefix} />
            {text !== undefined && <CopyButton text={text} className={styles.copy} />}
          </div>
          <div className={mergeClasses(styles.code, styles.codeHalf)} role="tabpanel" aria-labelledby={getTabId(idPrefix, index)}>
            {tab && <ShownTabView tab={tab} documentation={documentation} content={content} fill copy={false} />}
          </div>
        </div>
      </div>
      <CodeSidebar tabs={tabs} documentation={documentation} open={state === 'sidebar'} initialTab={index} onClose={() => setState('hidden')} />
    </div>
  );
}

// #endregion
