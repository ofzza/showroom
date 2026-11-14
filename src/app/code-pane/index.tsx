/**
 * The code pane: a showcase shown as a block, its showcase frame beside its code (a tab per file), the code hidden, beside the showcase frame or over
 * it, switched by one cycling button; side by side, or stacked when the block is narrow, by a container query alone, around a showcase frame that is
 * never moved, so it never reloads
 */

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { ArrowMaximize16Regular, Code16Regular, EyeOff16Regular } from '@fluentui/react-icons';
import type { DocumentationFile } from '../../host/index.js';
import { CopyButton, countLines } from '../code/index.js';
import { ShownTabList, ShownTabView, getFetchedTabUrl, getShownTabText, getTabId, useLinkedFileContent } from '../file-modal/index.js';
import type { ShownShowcase } from '../host/index.js';
import { ShowcaseFrame } from '../showcases/index.js';

// #region States

/**
 * Represents the state of a code pane: hidden (the showcase frame alone), half (the code pane beside the showcase frame, or below it when stacked),
 * or full (the code pane over the showcase frame, covering it)
 */
export type CodePaneState = 'hidden' | 'half' | 'full';

/**
 * The state every code pane starts in, each time a page is shown
 */
export const INITIAL_CODE_PANE_STATE: CodePaneState = 'hidden';

/**
 * Gets the state the cycling button switches a code pane to: hidden, then half, then full, then hidden again
 * @param state The code pane's state
 * @returns The next state
 */
export function getNextCodePaneState(state: CodePaneState): CodePaneState {
  return state === 'hidden' ? 'half' : state === 'half' ? 'full' : 'hidden';
}

/**
 * Labels of the cycling button (its tooltip and accessible name), by the code pane's state: each says what the button switches to
 */
export const CODE_PANE_BUTTON_LABELS: Record<CodePaneState, string> = {
  hidden: 'Show the code',
  half: 'Show the code over the showcase',
  full: 'Hide the code',
};

// #endregion

// #region Sizes

/**
 * The fewest lines of code the code pane shows, unless its selected tab has fewer: a shorter showcase sits in a block at least this tall
 */
export const CODE_PANE_MIN_LINES = 6;

/**
 * The most lines of code the code pane shows when it takes its content's height (stacked, or full); beyond them it scrolls
 */
export const CODE_PANE_MAX_LINES = 20;

/**
 * Minimum height of the showcase frame in a block, in pixels: the cycling button's row, floating over its top-right corner while the code pane is
 * hidden, and a console panel's counter's row at its bottom (`src/adapters/showcase/ts/console/`), so the two never overlap
 */
export const SHOWCASE_BLOCK_FRAME_MIN_HEIGHT = 64;

/**
 * Width of the block, in pixels, below which the code pane is stacked below the showcase frame
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
 * The code pane's minimum number of lines, in CSS
 */
const _MIN_LINES = `var(${_MIN_LINES_PROPERTY})`;

/**
 * Height of a number of code lines, as the code block shows them: its line height, and its code's padding above and below
 * @param lines The number of lines (a number, or a CSS expression)
 * @returns The CSS height
 */
function _linesHeight(lines: number | string): string {
  return `calc(${lines} * ${tokens.lineHeightBase300} + 2 * ${tokens.spacingHorizontalM})`;
}

/**
 * Room for a horizontal scrollbar below the code, added to the minimum and the maximum, so long lines don't scroll the code vertically too
 */
const _SCROLLBAR_ROOM = '16px';

/**
 * The code's minimum height: the minimum number of lines, and room for a horizontal scrollbar
 */
const _MIN_CODE_HEIGHT = `calc(${_linesHeight(_MIN_LINES)} + ${_SCROLLBAR_ROOM})`;

/**
 * The code's maximum height: the maximum number of lines, and room for a horizontal scrollbar
 */
const _MAX_CODE_HEIGHT = `calc(${_linesHeight(CODE_PANE_MAX_LINES)} + ${_SCROLLBAR_ROOM})`;

/**
 * Height of the code pane's header row: the small tab list's
 */
const _HEADER_HEIGHT = '32px';

/**
 * The container query of a narrow block, where the code pane is stacked below the showcase frame
 */
const _STACKED = `@container (max-width: ${CODE_PANE_STACK_WIDTH - 1}px)`;

// #endregion

// #region Block

/**
 * Styles of a showcase block: the container (outside, as a container query applies to its descendants only) and its grid, whose template alone the
 * states change, so the showcase frame never moves
 */
const _useStyles = makeStyles({
  container: { containerType: 'inline-size', margin: `${tokens.spacingVerticalM} 0` },
  grid: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: 'auto',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  // Half: side by side, the row at least the minimum's height; stacked below a narrow block
  gridHalf: {
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gridTemplateRows: `minmax(calc(${_HEADER_HEIGHT} + ${_MIN_CODE_HEIGHT}), auto)`,
    [_STACKED]: { gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'auto auto' },
  },
  // The showcase frame keeps its own height, never stretched to the row
  frame: { gridColumn: '1', gridRow: '1', alignSelf: 'start', minWidth: '0' },
  frameIframe: { margin: '0', border: 'none', borderRadius: '0' },
  pane: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: '0',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  paneHidden: { display: 'none' },
  // Side by side, the code pane never sizes the row, and fills it; stacked, below the showcase frame, as high as its content
  paneHalf: {
    gridColumn: '2',
    gridRow: '1',
    contain: 'size',
    borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    [_STACKED]: {
      gridColumn: '1',
      gridRow: '2',
      contain: 'none',
      borderLeft: 'none',
      borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    },
  },
  // Over the showcase frame, in its cell, at least as high as it
  paneFull: { gridColumn: '1', gridRow: '1', zIndex: 1 },
  // The tab list, then the copy button at its right end, room left for the cycling button beside it
  header: { display: 'flex', alignItems: 'center', minHeight: _HEADER_HEIGHT, paddingRight: '36px', overflowX: 'auto' },
  copy: { marginLeft: 'auto', flexShrink: 0 },
  code: { flex: '1 1 auto', minHeight: '0', display: 'flex', flexDirection: 'column' },
  // Stacked, or full: the code takes its content's height, between the minimum and the maximum
  codeBounded: { minHeight: _MIN_CODE_HEIGHT, maxHeight: _MAX_CODE_HEIGHT },
  codeHalf: { [_STACKED]: { minHeight: _MIN_CODE_HEIGHT, maxHeight: _MAX_CODE_HEIGHT } },
  // The cycling button: in the code pane's top-right corner, or the showcase frame's while the code pane is hidden
  button: { gridColumn: '1', gridRow: '1', justifySelf: 'end', alignSelf: 'start', zIndex: 2, margin: tokens.spacingVerticalXS },
  buttonHalf: { gridColumn: '2', [_STACKED]: { gridColumn: '1', gridRow: '2' } },
  buttonHidden: { backgroundColor: tokens.colorNeutralBackground1 },
});

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
}

/**
 * Renders a showcase shown as a block: its showcase frame and its code pane (the tab list and the copy button above the selected tab's code), and
 * the cycling button
 * @param props Properties of the component
 * @returns The block
 */
export function ShowcaseBlock({ showcase, documentation, initialState = INITIAL_CODE_PANE_STATE }: ShowcaseBlockProps): ReactNode {
  const styles = _useStyles();
  const idPrefix = useId();
  const [state, setState] = useState<CodePaneState>(initialState);
  const [selected, setSelected] = useState(0);
  const tabs = showcase.tabs;
  const index = Math.min(selected, tabs.length - 1);
  const tab = tabs[index];
  // Fetched once shown: never while the code pane is hidden
  const content = useLinkedFileContent(state === 'hidden' ? undefined : getFetchedTabUrl(tab));
  const text = getShownTabText(tab, documentation, content);
  const label = CODE_PANE_BUTTON_LABELS[state];
  return (
    <div className={styles.container} data-code-pane-state={state} style={{ [_MIN_LINES_PROPERTY]: getCodePaneMinLines(text) } as CSSProperties}>
      <div className={mergeClasses(styles.grid, state === 'half' && styles.gridHalf)}>
        <div className={styles.frame} inert={state === 'full'}>
          <ShowcaseFrame showcase={showcase} className={styles.frameIframe} minHeight={SHOWCASE_BLOCK_FRAME_MIN_HEIGHT} />
        </div>
        <div
          className={mergeClasses(
            styles.pane,
            state === 'hidden' && styles.paneHidden,
            state === 'half' && styles.paneHalf,
            state === 'full' && styles.paneFull,
          )}
        >
          <div className={styles.header}>
            <ShownTabList tabs={tabs} selected={index} onSelect={setSelected} idPrefix={idPrefix} />
            {text !== undefined && <CopyButton text={text} className={styles.copy} />}
          </div>
          <div
            className={mergeClasses(styles.code, state === 'full' && styles.codeBounded, state === 'half' && styles.codeHalf)}
            role="tabpanel"
            aria-labelledby={getTabId(idPrefix, index)}
          >
            {tab && <ShownTabView tab={tab} documentation={documentation} content={content} fill copy={false} />}
          </div>
        </div>
        <Button
          className={mergeClasses(styles.button, state === 'half' && styles.buttonHalf, state === 'hidden' && styles.buttonHidden)}
          appearance="subtle"
          size="small"
          icon={state === 'hidden' ? <Code16Regular /> : state === 'half' ? <ArrowMaximize16Regular /> : <EyeOff16Regular />}
          aria-label={label}
          title={label}
          onClick={() => setState(getNextCodePaneState)}
        />
      </div>
    </div>
  );
}

// #endregion
