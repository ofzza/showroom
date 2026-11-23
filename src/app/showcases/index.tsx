/**
 * Showcases in the showroom: the remark plugin placing a showcase block (its header bar, its showcase views and its code pane) in place of its entry
 * point, and a shown virtual file in place of its fence; the showcase frame's iframe, sized by the showcase frame's `resize` messages and told the
 * theme, with its console panel over it, or running hidden for a `console` view; and the `markdown` and `source` views
 */

import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode } from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { createOutsidePointerMessage, createThemeMessage, getThemedFrameUrl, isFrameMessage, type OverhangBox, type PressPhase } from '../../frame/index.js';
import { HighlightedCode, SegmentedCode, type CodeSegment, type LineMarkers } from '../code/index.js';
import { getFetchedTabUrl, ShownTabView, useLinkedFileContent } from '../showcase-sidebar/index.js';
import { ConsolePanel, getConsoleMinHeight, useConsole, type ConsoleAction, type ConsoleState } from '../console/index.js';
import type { DocumentationFile } from '../../host/index.js';
import type { LoadedShowcase, ShownShowcase, ShownTab, ShownVirtualFile } from '../host/index.js';
import { ThemeContext } from '../theme/index.js';

// #region Placement

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
 * Remark plugin placing showcase blocks. A showcase shown as a block replaces its entry point, found by its offset: a code block showcase's fence,
 * or the paragraph holding its link (one in any other parent stays a link); with the view `none`, its entry point is removed. A linked showcase
 * shown inline stays a link, opening the showcase sidebar. A shown virtual file replaces its fence, or removes it with the view `none`. A showcase
 * whose offset matches no fence or link is skipped, leaving its entry point as it is. Each block is an element named SHOWCASE_BLOCK_ELEMENT, with its
 * showcase's id; each shown virtual file one named SHOWCASE_VIRTUAL_FILE_ELEMENT, with its path.
 * @param options The showcases and shown virtual files of the documentation file
 * @returns The transform of the syntax tree
 */
export function remarkShowcaseFrames({ showcases, virtualFiles = [] }: ShowcaseFramesOptions): (tree: unknown) => void {
  return (tree) => {
    if (!showcases.length && !virtualFiles.length) return;
    const byOffset = new Map(showcases.map((showcase) => [showcase.offset, showcase]));
    const filesByOffset = new Map(virtualFiles.map((file) => [file.offset, file]));
    // By parent, its children to replace with a block or a shown virtual file (or nothing)
    type _Placed = { block?: ShownShowcase; file?: ShownVirtualFile };
    const placed = new Map<_Node, Map<_Node, _Placed>>();
    const at = (parent: _Node, child: _Node) => {
      const children = placed.get(parent) ?? new Map<_Node, _Placed>();
      placed.set(parent, children);
      const entry = children.get(child) ?? {};
      children.set(child, entry);
      return entry;
    };
    const visit = (node: _Node, ancestors: _Node[]): void => {
      const offset = node.position?.start.offset;
      const showcase = (node.type === 'code' || node.type === 'link') && offset !== undefined ? byOffset.get(offset) : undefined;
      const file = node.type === 'code' && offset !== undefined ? filesByOffset.get(offset) : undefined;
      if (file && ancestors.length) at(ancestors[ancestors.length - 1], node).file = file;
      if (showcase?.display === 'block') {
        const parent = ancestors[ancestors.length - 1];
        if (node.type === 'code' && parent) {
          at(parent, node).block = showcase;
        } else if (parent?.type === 'paragraph' && ancestors.length >= 2) {
          at(ancestors[ancestors.length - 2], parent).block = showcase;
        }
      }
      node.children?.forEach((child) => visit(child, [...ancestors, node]));
    };
    visit(tree as _Node, []);
    for (const [parent, children] of placed) {
      parent.children = parent.children!.flatMap((child) => {
        const entry = children.get(child);
        if (!entry) return [child];
        return entry.block
          ? _showsNothing(entry.block.views)
            ? []
            : [_createBlockNode(entry.block)]
          : entry.file
            ? _showsNothing(entry.file.views)
              ? []
              : [_createVirtualFileNode(entry.file)]
            : [child];
      });
    }
  };
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

// #region Overlays over the page

/**
 * Represents what a showcase frame opted into overlays over the page last reported of its overhang (S19 and P25 in .workflow/)
 */
export interface ShownOverhang {
  /**
   * Height of the whole page, overlays included, in pixels
   */
  height: number;
  /**
   * How far its page is pushed down for overlays reaching above its top, in pixels
   */
  offset: number;
  /**
   * Bottom of its in-flow content, the push included, in pixels
   */
  flow: number;
  /**
   * Boxes of its overlays reaching out of its content
   */
  boxes: OverhangBox[];
  /**
   * True if any overlay shows in it
   */
  open: boolean;
}

/**
 * Width of the content's rectangle in a showcase frame's clip, in pixels: larger than any showcase frame, as its box clips it sideways anyway, so
 * the clip never depends on the showcase frame's width (D922)
 */
export const OVERHANG_CLIP_WIDTH = 100000;

/**
 * Gets the clip of a showcase frame with overlays out: its content's rectangle and each overlay's box, as clockwise rectangles, whose union the
 * nonzero rule fills; `clip-path` clips both painting and hit-testing, so only the overlays cover the page around the showcase frame
 * @param top Top of the content, in the showcase frame's pixels (its push)
 * @param bottom Bottom of the content
 * @param boxes Boxes of the overlays reaching out of it
 * @returns The `clip-path` value
 */
export function getOverhangClipPath(top: number, bottom: number, boxes: readonly OverhangBox[]): string {
  const rectangle = (left: number, rectTop: number, right: number, rectBottom: number) => `M${left} ${rectTop}H${right}V${rectBottom}H${left}Z`;
  const shapes = [rectangle(0, top, OVERHANG_CLIP_WIDTH, bottom), ...boxes.map((box) => rectangle(box.left, box.top, box.right, box.bottom))];
  return `path('${shapes.join('')}')`;
}

/**
 * Gets how a showcase frame's iframe lets its overlays out over the page: as high as its whole page, pulled up by its push and back by what reaches
 * below its content, so it takes its content's height on the page, and clipped to its content and its overlays
 * @param overhang The showcase frame's overhang
 * @param minHeight Minimum height of its content, in pixels (a block's `demo` view's)
 * @returns The iframe's height, margins and clip, and the height it takes on the page; or undefined when no overlay reaches out
 */
export function getOverhangStyle(
  overhang: ShownOverhang,
  minHeight = 0,
): { height: number; marginTop: number; marginBottom: number; clipPath: string; content: number } | undefined {
  const content = Math.max(overhang.flow - overhang.offset, minHeight);
  const bottom = overhang.offset + content;
  const height = Math.max(overhang.height, bottom);
  if (overhang.offset <= 0 && height <= bottom) return undefined;
  return {
    height,
    marginTop: -overhang.offset,
    marginBottom: -(height - bottom),
    clipPath: getOverhangClipPath(overhang.offset, bottom, overhang.boxes),
    content,
  };
}

/**
 * Represents a showcase frame in the registry of overlays over the page: its iframe, whether presses outside are relayed to it (opted in and shown),
 * whether an overlay shows in it, whether its overlays are out (its block raised), and when its overlay last opened
 */
export interface OverhangEntry {
  /**
   * Its iframe
   */
  frame: HTMLIFrameElement;
  /**
   * True if presses outside are relayed to it
   */
  relay: boolean;
  /**
   * True if an overlay shows in it
   */
  open: boolean;
  /**
   * True if its overlays are out over the page
   */
  raised: boolean;
  /**
   * Order in which its overlay last opened (higher is later)
   */
  openedAt: number;
}

/**
 * Gets the showcase frames a press outside is relayed to: those relayed to, with an overlay open, other than the one pressed in
 * @param entries The registered showcase frames
 * @param except The showcase frame pressed in, if any
 * @returns The showcase frames to relay the press to
 */
export function getRelayTargets(entries: Iterable<OverhangEntry>, except?: HTMLIFrameElement): OverhangEntry[] {
  return [...entries].filter((entry) => entry.relay && entry.open && entry.frame !== except);
}

/**
 * Gets the raised showcase frame whose overlay opened last, which is raised above the others (D927)
 * @param entries The registered showcase frames
 * @returns Its entry, or undefined when none is raised
 */
export function getTopOverhang<TEntry extends OverhangEntry>(entries: Iterable<TEntry>): TEntry | undefined {
  let top: TEntry | undefined;
  for (const entry of entries) if (entry.raised && (!top || entry.openedAt > top.openedAt)) top = entry;
  return top;
}

/**
 * The registry of showcase frames, on the page and in the showcase sidebar: an external store of the raised one on top, which also relays the
 * showroom's own real presses to them, while any is registered
 */
const _registry = {
  entries: new Map<object, OverhangEntry>(),
  listeners: new Set<() => void>(),
  top: undefined as object | undefined,
  opened: 0,
};

/**
 * Relays a press at a point of the showroom's viewport to every showcase frame it is outside of, in each one's own coordinates
 * @param phase The press's phase
 * @param x Horizontal position of the press in the showroom's viewport
 * @param y Vertical position of the press in the showroom's viewport
 * @param except The showcase frame pressed in, if any
 */
function _relay(phase: PressPhase, x: number, y: number, except?: HTMLIFrameElement): void {
  for (const { frame } of getRelayTargets(_registry.entries.values(), except)) {
    const rect = frame.getBoundingClientRect();
    frame.contentWindow?.postMessage(createOutsidePointerMessage(phase, x - rect.left, y - rect.top), '*');
  }
}

/**
 * Relays the showroom's own real `pointerdown` as the `down` phase of a press outside every showcase frame
 * @param event The event
 */
function _onShowroomPointerDown(event: PointerEvent): void {
  if (event.isTrusted) _relay('down', event.clientX, event.clientY);
}

/**
 * Relays the showroom's own real `click` as the `click` phase of a press outside every showcase frame
 * @param event The event
 */
function _onShowroomClick(event: MouseEvent): void {
  if (event.isTrusted) _relay('click', event.clientX, event.clientY);
}

/**
 * Registers, updates or removes a showcase frame, notifying the components when the raised one on top changes, and listening to the showroom's
 * presses while any is registered
 * @param key The showcase frame's own key
 * @param entry Its entry, or undefined to remove it
 */
function _register(key: object, entry: OverhangEntry | undefined): void {
  const before = _registry.entries.size;
  const previous = _registry.entries.get(key);
  if (entry) {
    // Its overlay opening is the latest
    _registry.entries.set(key, { ...entry, openedAt: entry.open && !previous?.open ? ++_registry.opened : (previous?.openedAt ?? 0) });
  } else {
    _registry.entries.delete(key);
  }
  const after = _registry.entries.size;
  if (!before && after) {
    window.document.addEventListener('pointerdown', _onShowroomPointerDown, true);
    window.document.addEventListener('click', _onShowroomClick, true);
  } else if (before && !after) {
    window.document.removeEventListener('pointerdown', _onShowroomPointerDown, true);
    window.document.removeEventListener('click', _onShowroomClick, true);
  }
  const topEntry = getTopOverhang(_registry.entries.values());
  const top = [..._registry.entries].find(([, value]) => value === topEntry)?.[0];
  if (top !== _registry.top) {
    _registry.top = top;
    _registry.listeners.forEach((listener) => listener());
  }
}

/**
 * Subscribes to the raised showcase frame on top
 * @param listener Called when it changes
 * @returns Unsubscribes
 */
function _subscribe(listener: () => void): () => void {
  _registry.listeners.add(listener);
  return () => void _registry.listeners.delete(listener);
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
    // Its own formatting context, so the iframe's negative margins (overlays out) never collapse through it (D920)
    display: 'flow-root',
  },
  boxBlock: { margin: '0', border: 'none', borderRadius: '0' },
  // Overlays out over the page: let out above and below, still clipped sideways, the box raised over what follows it
  boxOut: { overflowX: 'clip', overflowY: 'visible' },
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
  /**
   * Called with each height the showcase frame reports (its block keeps the latest, for its "Not built" placeholder): its content's height, without
   * its overlays out, for a showcase opted into overlays over the page
   */
  onResize?: (height: number) => void;
  /**
   * False to keep its overlays in, and relay it no presses, while its views aren't shown (collapsed in the showcase sidebar); true by default
   */
  overhang?: boolean;
  /**
   * The overhang to start with, for a showcase opted into overlays over the page (the tests' server-side rendering sets it, as no message comes there)
   */
  initialOverhang?: ShownOverhang;
  /**
   * Called with the level its block is raised to while its overlays are out: 0 when none is, 1, or 2 for the one whose overlay opened last (D927)
   */
  onOverhang?: (level: number) => void;
}

/**
 * Renders a showcase frame: its iframe, the width of the text, as high as the showcase frame reports, in the theme of the ThemeContext, with its
 * console panel over it (unless left out), in a box at least as high as the console panel needs; or hidden. Its URL is set with the theme of the
 * moment: at mount, and again when the showcase's URL changes (a rebuilt showcase frame in `serve`), keeping its height until the showcase frame
 * reports its new one; later themes are only posted to it, so a theme change never reloads it. Its console is cleared on every load (`start`), fed
 * its `console` messages, and told when it is `ready`. Its real presses are relayed to the other showcase frames as presses outside them. Opted into
 * overlays over the page (the showcase's `overlays`, shown), its URL says so, and its overlays reaching out of its content are drawn over the page
 * around it (its iframe as high as its whole page, pulled back by negative margins, clipped to its content and its overlays, its box raised), and
 * presses outside it are relayed to it.
 * @param props Properties of the component
 * @returns The showcase frame
 */
export function ShowcaseFrame({
  showcase,
  block = false,
  minHeight,
  initialConsole,
  console,
  overlay = true,
  hidden = false,
  onResize,
  overhang: shown = true,
  initialOverhang,
  onOverhang,
}: ShowcaseFrameProps): ReactNode {
  const styles = _useStyles();
  const theme = useContext(ThemeContext);
  const frame = useRef<HTMLIFrameElement>(null);
  // A hidden showcase frame is never opted in (D912): nothing shows it
  const overlays = showcase.overlays === true && !hidden;
  const [loaded, setLoaded] = useState(() => ({ url: showcase.url, overlays, src: getThemedFrameUrl(showcase.url, theme, overlays) }));
  if (loaded.url !== showcase.url || loaded.overlays !== overlays) {
    // Adjusting state while rendering, as React recommends for state derived from a changed prop
    setLoaded({ url: showcase.url, overlays, src: getThemedFrameUrl(showcase.url, theme, overlays) });
  }
  const src = loaded.src;
  const [height, setHeight] = useState<number>();
  const [reported, setReported] = useState<ShownOverhang | undefined>(initialOverhang);
  const own = useConsole(initialConsole);
  const [consoleState, dispatchConsole] = console ?? own;
  const latestOnResize = useRef(onResize);
  useEffect(() => {
    latestOnResize.current = onResize;
  }, [onResize]);

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
      if (message.type === 'start') {
        dispatchConsole({ type: 'start' });
        setReported(undefined);
      } else if (message.type === 'pointer') {
        // A press inside it is outside every other showcase frame
        const rect = frame.current.getBoundingClientRect();
        _relay(message.phase, rect.left + message.x, rect.top + message.y, frame.current);
      } else if (message.type === 'console') {
        const { lines, dropped, droppedWarnings, droppedErrors } = message;
        dispatchConsole({ type: 'lines', lines, dropped, droppedWarnings, droppedErrors, now: Date.now() });
      } else if (message.type === 'ready') {
        dispatchConsole({ type: 'ready' });
        sendTheme();
      } else if (message.type === 'resize') {
        const { height: reportedHeight, offset, flow, boxes, open } = message;
        setHeight(reportedHeight);
        const next = offset !== undefined && flow !== undefined ? { height: reportedHeight, offset, flow, boxes: boxes ?? [], open: open ?? false } : undefined;
        setReported(next);
        latestOnResize.current?.(next ? next.flow - next.offset : reportedHeight);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [sendTheme, dispatchConsole]);

  // Overlays out over the page, while shown; the block raised one level higher for the one whose overlay opened last
  const out = overlays && shown && reported ? getOverhangStyle(reported, minHeight) : undefined;
  const relayed = overlays && shown;
  const open = relayed && (reported?.open ?? false);
  const raised = out !== undefined;
  const [key] = useState<object>(() => ({}));
  useEffect(() => {
    if (!frame.current) return;
    _register(key, { frame: frame.current, relay: relayed, open, raised, openedAt: 0 });
  }, [key, relayed, open, raised]);
  useEffect(() => () => _register(key, undefined), [key]);
  const top = useSyncExternalStore(
    _subscribe,
    () => _registry.top,
    () => undefined,
  );
  const level = out ? (top === key ? 2 : 1) : 0;
  const latestOnOverhang = useRef(onOverhang);
  useEffect(() => {
    latestOnOverhang.current = onOverhang;
  }, [onOverhang]);
  useEffect(() => latestOnOverhang.current?.(level), [level]);

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
        height: `${out?.height ?? height ?? DEFAULT_FRAME_HEIGHT}px`,
        ...(minHeight === undefined ? {} : { minHeight: `${minHeight}px` }),
        ...(out ? { marginTop: `${out.marginTop}px`, marginBottom: `${out.marginBottom}px`, clipPath: out.clipPath } : {}),
        colorScheme: theme,
      }}
      onLoad={sendTheme}
      {...(hidden ? { 'aria-hidden': true, tabIndex: -1 } : {})}
    />
  );
  if (hidden) return <div className={styles.hiddenBox}>{iframe}</div>;
  return (
    <div
      className={mergeClasses(styles.box, block && styles.boxBlock, out && styles.boxOut)}
      style={{ ...(consoleMinHeight ? { minHeight: `${consoleMinHeight}px` } : {}), ...(level ? { zIndex: level } : {}) }}
      data-overhang={out ? level : undefined}
    >
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
 * @param props Properties of the component: the Markdown source, whether it is in a block (see CodeBlockProps' `view`; a virtual file with no
 * showcase adapter shows its views outside a block), and its lines' markers
 * @returns The code block
 */
export function MarkdownView({ markdown, block = true, markers }: { markdown: string; block?: boolean; markers?: LineMarkers }): ReactNode {
  return <SegmentedCode segments={splitShowcaseMarkdown(markdown)} view={block} markers={markers} />;
}

/**
 * Renders a showcase's `source` view: its entry point's tab, highlighted as a code block (a linked entry point fetched once shown), or why it can't
 * be shown
 * @param props Properties of the component: the entry point's tab, the shown documentation files, and its lines' markers
 * @returns The code block, or the message
 */
export function SourceView({ tab, documentation, markers }: { tab: ShownTab; documentation: DocumentationFile[]; markers?: LineMarkers }): ReactNode {
  const content = useLinkedFileContent(getFetchedTabUrl(tab));
  return <ShownTabView tab={tab} documentation={documentation} content={content} view markers={markers} />;
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
