/**
 * Showcases in the showroom: the remark plugin placing each showcase frame right before the block holding its entry point, or a showcase block (the
 * showcase frame with its code pane) in place of its entry point, and the showcase frame's iframe, sized by the showcase frame's `resize` messages
 * and told the theme, with its console panel over it
 */

import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { createThemeMessage, getThemedFrameUrl, isFrameMessage } from '../../frame/index.js';
import { ConsolePanel, getConsoleMinHeight, useConsole, type ConsoleState } from '../console/index.js';
import type { ShownShowcase } from '../host/index.js';
import { ThemeContext } from '../theme/index.js';

// #region Placement

/**
 * Name of the element the remark plugin inserts for each showcase frame, mapped to ShowcaseFrame by the Markdown component
 */
export const SHOWCASE_FRAME_ELEMENT = 'showroom-showcase-frame';

/**
 * Name of the element the remark plugin puts in place of a showcase shown as a block (its fence, or the paragraph holding its link), mapped to the
 * code pane's block by the Markdown component
 */
export const SHOWCASE_BLOCK_ELEMENT = 'showroom-showcase-block';

/**
 * Name of the property of those elements holding their showcase's id (as React receives it)
 */
export const SHOWCASE_ID_PROPERTY = 'data-showcase-id';

/**
 * Types of the Markdown syntax tree's flow-content blocks a showcase frame is placed before: the nearest one holding its entry point (a fence is
 * its own)
 */
const _FLOW_BLOCKS = new Set(['paragraph', 'heading', 'table', 'code']);

/**
 * Represents the few fields of a Markdown syntax tree's nodes that placing showcase frames reads and writes
 */
interface _Node {
  type: string;
  children?: _Node[];
  position?: { start: { offset?: number } };
  data?: Record<string, unknown>;
}

/**
 * Represents the options of the remark plugin placing showcase frames
 */
export interface ShowcaseFramesOptions {
  /**
   * The showcases of the documentation file being rendered
   */
  showcases: ShownShowcase[];
}

/**
 * Remark plugin placing showcase frames. A showcase shown inline gets its showcase frame right before the nearest flow-content block (a paragraph,
 * heading, table or code block) holding its entry point, found by its offset (a link); several before one block in document order. A showcase shown
 * as a block replaces its entry point: a code block showcase's fence, or the paragraph holding its link (one in any other parent is placed as one
 * shown inline). A showcase whose offset matches no fence or link is skipped, leaving its entry point as it is. Each showcase frame is an element
 * named SHOWCASE_FRAME_ELEMENT, each block one named SHOWCASE_BLOCK_ELEMENT, with its showcase's id.
 * @param options The showcases of the documentation file
 * @returns The transform of the syntax tree
 */
export function remarkShowcaseFrames({ showcases }: ShowcaseFramesOptions): (tree: unknown) => void {
  return (tree) => {
    if (!showcases.length) return;
    const byOffset = new Map(showcases.map((showcase) => [showcase.offset, showcase]));
    // By parent, its children to place showcase frames before, and those to replace with a block
    const placed = new Map<_Node, Map<_Node, { before: ShownShowcase[]; block?: ShownShowcase }>>();
    const at = (parent: _Node, child: _Node) => {
      const children = placed.get(parent) ?? new Map<_Node, { before: ShownShowcase[]; block?: ShownShowcase }>();
      placed.set(parent, children);
      const entry = children.get(child) ?? { before: [] };
      children.set(child, entry);
      return entry;
    };
    const visit = (node: _Node, ancestors: _Node[]): void => {
      const offset = node.position?.start.offset;
      const showcase = (node.type === 'code' || node.type === 'link') && offset !== undefined ? byOffset.get(offset) : undefined;
      if (showcase) {
        const chain = [...ancestors, node];
        const parent = ancestors[ancestors.length - 1];
        if (showcase.display === 'block' && node.type === 'code' && parent) {
          at(parent, node).block = showcase;
        } else if (showcase.display === 'block' && parent?.type === 'paragraph' && ancestors.length >= 2) {
          at(ancestors[ancestors.length - 2], parent).block = showcase;
        } else {
          const index = chain.findLastIndex((ancestor, position) => position > 0 && _FLOW_BLOCKS.has(ancestor.type));
          if (index > 0) at(chain[index - 1], chain[index]).before.push(showcase);
        }
      }
      node.children?.forEach((child) => visit(child, [...ancestors, node]));
    };
    visit(tree as _Node, []);
    for (const [parent, children] of placed) {
      parent.children = parent.children!.flatMap((child) => {
        const entry = children.get(child);
        if (!entry) return [child];
        return [...entry.before.map(_createFrameNode), entry.block ? _createBlockNode(entry.block) : child];
      });
    }
  };
}

/**
 * Creates the syntax tree node of a showcase frame, which becomes a SHOWCASE_FRAME_ELEMENT element
 * @param showcase The showcase
 * @returns The node
 */
function _createFrameNode(showcase: ShownShowcase): _Node {
  return { type: 'showroomShowcaseFrame', data: { hName: SHOWCASE_FRAME_ELEMENT, hProperties: { dataShowcaseId: showcase.id } } };
}

/**
 * Creates the syntax tree node of a showcase shown as a block, which becomes a SHOWCASE_BLOCK_ELEMENT element
 * @param showcase The showcase
 * @returns The node
 */
function _createBlockNode(showcase: ShownShowcase): _Node {
  return { type: 'showroomShowcaseBlock', data: { hName: SHOWCASE_BLOCK_ELEMENT, hProperties: { dataShowcaseId: showcase.id } } };
}

// #endregion

// #region Showcase frame

/**
 * Height of a showcase frame's iframe until the showcase frame reports its own, in pixels
 */
export const DEFAULT_FRAME_HEIGHT = 150;

/**
 * Styles of a showcase frame: its box, holding the iframe and the console panel over it, and the iframe
 */
const _useStyles = makeStyles({
  // The box holds the border, so the console panel's counter and the open console panel sit inside it, whatever the iframe's height
  box: {
    position: 'relative',
    boxSizing: 'border-box',
    margin: `${tokens.spacingVerticalM} 0`,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  boxBlock: { margin: '0', border: 'none', borderRadius: '0' },
  frame: { display: 'block', width: '100%', border: 'none', backgroundColor: 'transparent' },
});

/**
 * Gets a showcase frame's title
 * @param showcase The showcase
 * @returns `Showcase <n> of <documentation file>`
 */
export function getShowcaseFrameTitle(showcase: ShownShowcase): string {
  return `Showcase ${showcase.id.slice(showcase.id.lastIndexOf('#') + 1)} of ${showcase.documentation}`;
}

/**
 * Represents the properties of a showcase frame
 */
export interface ShowcaseFrameProps {
  /**
   * The showcase
   */
  showcase: ShownShowcase;
  /**
   * True for a showcase frame in a code pane's block: no margin, no border of its own (the block's), and the open console panel leaving the room at
   * its top for the cycling button
   */
  block?: boolean;
  /**
   * Minimum height of the iframe, in pixels, however short the showcase frame reports itself (e.g. the code pane's block, whose cycling button
   * floats over its top-right corner); none by default
   */
  minHeight?: number;
  /**
   * The console panel's state to start with (the tests' server-side rendering sets it, as no message comes there); empty by default
   */
  initialConsole?: ConsoleState;
}

/**
 * Renders a showcase frame: its iframe, the width of the text, as high as the showcase frame reports, in the theme of the ThemeContext, with its
 * console panel over it, in a box at least as high as the console panel needs. Its URL is set with the theme of the moment: at mount, and again when
 * the showcase's URL changes (a rebuilt showcase frame in `serve`), keeping its height until the showcase frame reports its new one; later themes are
 * only posted to it, so a theme change never reloads it. Its console panel is cleared on every load (`start`), and fed its `console` messages.
 * @param props Properties of the component
 * @returns The showcase frame
 */
export function ShowcaseFrame({ showcase, block = false, minHeight, initialConsole }: ShowcaseFrameProps): ReactNode {
  const styles = _useStyles();
  const theme = useContext(ThemeContext);
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(() => ({ url: showcase.url, src: getThemedFrameUrl(showcase.url, theme) }));
  if (loaded.url !== showcase.url) {
    // Adjusting state while rendering, as React recommends for state derived from a changed prop
    setLoaded({ url: showcase.url, src: getThemedFrameUrl(showcase.url, theme) });
  }
  const src = loaded.src;
  const [height, setHeight] = useState<number>();
  const [consoleState, dispatchConsole] = useConsole(initialConsole);

  // Tell the showcase frame the theme on every change, and whenever it is (re)loaded or ready
  const latestTheme = useRef(theme);
  const sendTheme = useCallback(() => frame.current?.contentWindow?.postMessage(createThemeMessage(latestTheme.current), '*'), []);
  useEffect(() => {
    latestTheme.current = theme;
    sendTheme();
  }, [theme, sendTheme]);

  // Listen to the showcase frame's own messages only
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow || !isFrameMessage(event.data)) return;
      const message = event.data;
      if (message.type === 'start') dispatchConsole({ type: 'start' });
      else if (message.type === 'console') dispatchConsole({ type: 'lines', lines: message.lines, dropped: message.dropped, now: Date.now() });
      else if (message.type === 'ready') sendTheme();
      else setHeight(message.height);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [sendTheme, dispatchConsole]);

  const consoleMinHeight = getConsoleMinHeight(consoleState, block);
  return (
    <div className={mergeClasses(styles.box, block && styles.boxBlock)} style={consoleMinHeight ? { minHeight: `${consoleMinHeight}px` } : undefined}>
      <iframe
        ref={frame}
        className={styles.frame}
        src={src}
        title={getShowcaseFrameTitle(showcase)}
        loading="lazy"
        style={{
          height: `${height ?? DEFAULT_FRAME_HEIGHT}px`,
          ...(minHeight === undefined ? {} : { minHeight: `${minHeight}px` }),
          colorScheme: theme,
        }}
        onLoad={sendTheme}
      />
      <ConsolePanel state={consoleState} dispatch={dispatchConsole} topRoom={block} />
    </div>
  );
}

// #endregion
