/**
 * Showcases in the showroom: the remark plugin placing each showcase frame right before the block holding its entry point, a showcase block (its
 * header bar, its showcase views and its code pane) in place of its entry point, and a shown virtual file in place of its fence; the showcase
 * frame's iframe, sized by the showcase frame's `resize` messages and told the theme, with its console panel over it, or running hidden for a
 * `console` view; and the `markdown` and `source` views
 */

import { useCallback, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { createThemeMessage, getThemedFrameUrl, isFrameMessage } from '../../frame/index.js';
import { HighlightedCode, SegmentedCode, type CodeSegment } from '../code/index.js';
import { getFetchedTabUrl, ShownTabView, useLinkedFileContent } from '../code-sidebar/index.js';
import { ConsolePanel, getConsoleMinHeight, useConsole, type ConsoleAction, type ConsoleState } from '../console/index.js';
import type { DocumentationFile } from '../../host/index.js';
import type { LoadedShowcase, ShownShowcase, ShownTab, ShownVirtualFile } from '../host/index.js';
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
 * Name of the element the remark plugin puts in place of a shown virtual file's fence (a virtual file with no showcase adapter whose views aren't
 * `source` alone), mapped to its views by the Markdown component
 */
export const SHOWCASE_VIRTUAL_FILE_ELEMENT = 'showroom-virtual-file';

/**
 * Name of the property of those elements holding their showcase's id, or their virtual file's path (as React receives it)
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
  /**
   * The shown virtual files of the documentation file being rendered; none if not given
   */
  virtualFiles?: ShownVirtualFile[];
}

/**
 * Checks if showcase views show nothing (`none`)
 * @param views The views
 * @returns True if the views are `none`
 */
function _showsNothing(views: readonly string[]): boolean {
  return views.length === 1 && views[0] === 'none';
}

/**
 * Remark plugin placing showcase frames. A showcase shown inline gets its showcase frame right before the nearest flow-content block (a paragraph,
 * heading, table or code block) holding its entry point, found by its offset (a link); several before one block in document order. A showcase shown
 * as a block replaces its entry point: a code block showcase's fence, or the paragraph holding its link (one in any other parent is placed as one
 * shown inline); with the view `none`, its entry point is removed. A shown virtual file replaces its fence, or removes it with the view `none`. A
 * showcase whose offset matches no fence or link is skipped, leaving its entry point as it is. Each showcase frame is an element named
 * SHOWCASE_FRAME_ELEMENT, each block one named SHOWCASE_BLOCK_ELEMENT, with its showcase's id; each shown virtual file one named
 * SHOWCASE_VIRTUAL_FILE_ELEMENT, with its path.
 * @param options The showcases and shown virtual files of the documentation file
 * @returns The transform of the syntax tree
 */
export function remarkShowcaseFrames({ showcases, virtualFiles = [] }: ShowcaseFramesOptions): (tree: unknown) => void {
  return (tree) => {
    if (!showcases.length && !virtualFiles.length) return;
    const byOffset = new Map(showcases.map((showcase) => [showcase.offset, showcase]));
    const filesByOffset = new Map(virtualFiles.map((file) => [file.offset, file]));
    // By parent, its children to place showcase frames before, and those to replace with a block or a shown virtual file (or nothing)
    type _Placed = { before: ShownShowcase[]; block?: ShownShowcase; file?: ShownVirtualFile };
    const placed = new Map<_Node, Map<_Node, _Placed>>();
    const at = (parent: _Node, child: _Node) => {
      const children = placed.get(parent) ?? new Map<_Node, _Placed>();
      placed.set(parent, children);
      const entry = children.get(child) ?? { before: [] };
      children.set(child, entry);
      return entry;
    };
    const visit = (node: _Node, ancestors: _Node[]): void => {
      const offset = node.position?.start.offset;
      const showcase = (node.type === 'code' || node.type === 'link') && offset !== undefined ? byOffset.get(offset) : undefined;
      const file = node.type === 'code' && offset !== undefined ? filesByOffset.get(offset) : undefined;
      if (file && ancestors.length) at(ancestors[ancestors.length - 1], node).file = file;
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
        const replaced = entry.block
          ? _showsNothing(entry.block.views)
            ? []
            : [_createBlockNode(entry.block)]
          : entry.file
            ? _showsNothing(entry.file.views)
              ? []
              : [_createVirtualFileNode(entry.file)]
            : [child];
        return [...entry.before.map(_createFrameNode), ...replaced];
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

/**
 * Creates the syntax tree node of a shown virtual file, which becomes a SHOWCASE_VIRTUAL_FILE_ELEMENT element
 * @param file The shown virtual file
 * @returns The node
 */
function _createVirtualFileNode(file: ShownVirtualFile): _Node {
  return { type: 'showroomVirtualFile', data: { hName: SHOWCASE_VIRTUAL_FILE_ELEMENT, hProperties: { dataShowcaseId: file.path } } };
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
  // Running hidden (a console view's): laid out at its real width and height, invisible, in a box with no height that clips it (D570)
  hiddenBox: { height: '0', overflow: 'hidden' },
  hiddenFrame: { opacity: 0, pointerEvents: 'none' },
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
   * The showcase, whose views load its showcase frame
   */
  showcase: LoadedShowcase;
  /**
   * True for a showcase frame in a block: no margin, no border of its own (the block's)
   */
  block?: boolean;
  /**
   * Minimum height of the iframe, in pixels, however short the showcase frame reports itself (e.g. a block's `demo` view); none by default
   */
  minHeight?: number;
  /**
   * The console panel's state to start with (the tests' server-side rendering sets it, as no message comes there); empty by default, and ignored
   * with `console`
   */
  initialConsole?: ConsoleState;
  /**
   * The console's state and its update function, kept by a block whose `console` view shows them too; the showcase frame keeps its own by default
   */
  console?: [ConsoleState, Dispatch<ConsoleAction>];
  /**
   * False to leave out the console panel over the showcase frame (a block with a `console` view); true by default
   */
  overlay?: boolean;
  /**
   * True to run the showcase frame hidden (a `console` view with no `demo` view): laid out at its real width and height, invisible, clipped to no
   * height, out of reach of the pointer, the keyboard and screen readers
   */
  hidden?: boolean;
}

/**
 * Renders a showcase frame: its iframe, the width of the text, as high as the showcase frame reports, in the theme of the ThemeContext, with its
 * console panel over it (unless left out), in a box at least as high as the console panel needs; or hidden. Its URL is set with the theme of the
 * moment: at mount, and again when the showcase's URL changes (a rebuilt showcase frame in `serve`), keeping its height until the showcase frame
 * reports its new one; later themes are only posted to it, so a theme change never reloads it. Its console is cleared on every load (`start`), and
 * fed its `console` messages.
 * @param props Properties of the component
 * @returns The showcase frame
 */
export function ShowcaseFrame({ showcase, block = false, minHeight, initialConsole, console, overlay = true, hidden = false }: ShowcaseFrameProps): ReactNode {
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
  const own = useConsole(initialConsole);
  const [consoleState, dispatchConsole] = console ?? own;

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

  const consoleMinHeight = overlay && !hidden ? getConsoleMinHeight(consoleState) : 0;
  const iframe = (
    <iframe
      ref={frame}
      className={mergeClasses(styles.frame, hidden && styles.hiddenFrame)}
      src={src}
      title={getShowcaseFrameTitle(showcase)}
      // A hidden showcase frame is loaded at once, as nothing scrolls it into view
      loading={hidden ? undefined : 'lazy'}
      style={{
        height: `${height ?? DEFAULT_FRAME_HEIGHT}px`,
        ...(minHeight === undefined ? {} : { minHeight: `${minHeight}px` }),
        colorScheme: theme,
      }}
      onLoad={sendTheme}
      {...(hidden ? { 'aria-hidden': true, tabIndex: -1 } : {})}
    />
  );
  if (hidden) return <div className={styles.hiddenBox}>{iframe}</div>;
  return (
    <div className={mergeClasses(styles.box, block && styles.boxBlock)} style={consoleMinHeight ? { minHeight: `${consoleMinHeight}px` } : undefined}>
      {iframe}
      {overlay && <ConsolePanel state={consoleState} dispatch={dispatchConsole} />}
    </div>
  );
}

// #endregion

// #region Markdown and source views

/**
 * Represents a fence's parts: its opening line, its inside with its language, and its closing line
 */
interface _FenceParts {
  open: string;
  inside?: CodeSegment;
  close?: string;
}

/**
 * Parses a fence, as written at the start of a line (not inside a blockquote or a list item)
 * @param markdown The Markdown source
 * @returns Its parts, or undefined if it isn't such a fence
 */
function _parseFence(markdown: string): _FenceParts | undefined {
  const lines = markdown.split(/\r\n|\r|\n/);
  const open = /^(`{3,}|~{3,})\s*([^\s`~]*)/.exec(lines[0]);
  if (!open || lines.length < 2) return undefined;
  const marker = open[1];
  const last = lines.length - 1;
  const closed = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`).test(lines[last]);
  const inside = lines.slice(1, closed ? last : undefined);
  return {
    open: lines[0],
    ...(inside.length ? { inside: { text: inside.join('\n'), language: open[2].toLowerCase() } } : {}),
    ...(closed ? { close: lines[last] } : {}),
  };
}

/**
 * Splits a showcase's Markdown source (a fence, or a link) into the segments its `markdown` view highlights: a fence's opening and closing lines as
 * Markdown, and its inside as the fence's language; anything else (a link, a fence inside a blockquote or a list item) as Markdown, whole
 * @param markdown The Markdown source, as written
 * @returns The segments, in order
 */
export function splitShowcaseMarkdown(markdown: string): CodeSegment[] {
  const fence = _parseFence(markdown);
  if (!fence) return [{ text: markdown, language: 'md' }];
  return [
    { text: fence.open, language: 'md' },
    ...(fence.inside ? [fence.inside] : []),
    ...(fence.close === undefined ? [] : [{ text: fence.close, language: 'md' }]),
  ];
}

/**
 * Gets a fence's inside, with the fence's language: what a virtual file with no showcase adapter shows as its `source` view
 * @param markdown The fence, as written
 * @returns Its inside, empty if it has none
 */
export function getFenceInside(markdown: string): CodeSegment {
  return _parseFence(markdown)?.inside ?? { text: '', language: '' };
}

/**
 * Renders a `markdown` view: a showcase's Markdown source as one code block, a fence's lines highlighted as Markdown and its inside as its language
 * @param props Properties of the component: the Markdown source, and whether it is in a block (see CodeBlockProps' `view`); a virtual file with no
 * showcase adapter shows its views outside a block
 * @returns The code block
 */
export function MarkdownView({ markdown, block = true }: { markdown: string; block?: boolean }): ReactNode {
  return <SegmentedCode segments={splitShowcaseMarkdown(markdown)} view={block} />;
}

/**
 * Renders a showcase's `source` view: its entry point's tab, highlighted as a code block (a linked entry point fetched once shown), or why it can't
 * be shown
 * @param props Properties of the component: the entry point's tab, and the shown documentation files
 * @returns The code block, or the message
 */
export function SourceView({ tab, documentation }: { tab: ShownTab; documentation: DocumentationFile[] }): ReactNode {
  const content = useLinkedFileContent(getFetchedTabUrl(tab));
  return <ShownTabView tab={tab} documentation={documentation} content={content} view />;
}

/**
 * Styles of a shown virtual file's views
 */
const _useFileStyles = makeStyles({
  views: { margin: `${tokens.spacingVerticalM} 0`, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
});

/**
 * Renders a shown virtual file (a virtual file with no showcase adapter): its views alone, with no header bar or code pane; `source` as its fence's
 * inside, highlighted, as an ordinary code block
 * @param props Properties of the component: the shown virtual file
 * @returns Its views
 */
export function VirtualFileViews({ file }: { file: ShownVirtualFile }): ReactNode {
  const styles = _useFileStyles();
  const inside = getFenceInside(file.markdown);
  return (
    <div className={styles.views}>
      {file.views.map((view) =>
        view === 'markdown' ? (
          <MarkdownView key={view} markdown={file.markdown} block={false} />
        ) : view === 'source' ? (
          <HighlightedCode key={view} content={inside.text} language={inside.language} />
        ) : null,
      )}
    </div>
  );
}

// #endregion
