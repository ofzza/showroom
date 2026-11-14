/**
 * Showcases in the showroom: the remark plugin placing each showcase frame right before the block holding its entry point, or a showcase block (the
 * showcase frame with its code pane) in place of its entry point, and the showcase frame's iframe, sized by the showcase frame's `resize` messages
 * and told the theme
 */

import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { createThemeMessage, getThemedFrameUrl, isFrameMessage } from '../../frame/index.js';
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
 * Styles of a showcase frame's iframe
 */
const _useStyles = makeStyles({
  frame: {
    display: 'block',
    boxSizing: 'border-box',
    width: '100%',
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    margin: `${tokens.spacingVerticalM} 0`,
  },
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
   * Class name added to the iframe's own (e.g. the code pane's block resetting its margin)
   */
  className?: string;
}

/**
 * Renders a showcase frame's iframe: the width of the text, as high as the showcase frame reports, in the theme of the ThemeContext. Its URL is set
 * with the theme of the moment: at mount, and again when the showcase's URL changes (a rebuilt showcase frame in `serve`), keeping its height until
 * the showcase frame reports its new one; later themes are only posted to it, so a theme change never reloads it.
 * @param props Properties of the component
 * @returns The iframe
 */
export function ShowcaseFrame({ showcase, className }: ShowcaseFrameProps): ReactNode {
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
      if (event.data.type === 'ready') sendTheme();
      else setHeight(event.data.height);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [sendTheme]);

  return (
    <iframe
      ref={frame}
      className={mergeClasses(styles.frame, className)}
      src={src}
      title={getShowcaseFrameTitle(showcase)}
      loading="lazy"
      // The iframe's own border is inside its height (border-box), on top of its content's
      style={{ height: `calc(${height ?? DEFAULT_FRAME_HEIGHT}px + 2 * ${tokens.strokeWidthThin})`, colorScheme: theme }}
      onLoad={sendTheme}
    />
  );
}

// #endregion
