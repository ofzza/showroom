/**
 * The frame script: the small, framework-free script `showroom` adds to every showcase frame page, and its `postMessage` contract with the showroom.
 * The showcase frame says when it starts, reports its content's height and what it writes to the console, and the showroom tells it the theme.
 * Browser code, Node-free, imported by the showroom (the message types and constants) and by `src/showcases/` (the script, inlined into each page).
 * Internal, never re-exported.
 */

// #region Messages

/**
 * Represents the name of a theme the showroom tells a showcase frame
 */
export type FrameTheme = 'light' | 'dark';

/**
 * Value of `source` in every message a showcase frame posts to the showroom
 */
export const FRAME_MESSAGE_SOURCE = 'showroom-frame';

/**
 * Value of `source` in every message the showroom posts to a showcase frame
 */
export const SHOWROOM_MESSAGE_SOURCE = 'showroom';

/**
 * Name of the query parameter of a showcase frame's URL giving its initial theme (e.g. `?theme=dark`)
 */
export const THEME_PARAMETER = 'theme';

/**
 * Name of the query parameter of a showcase frame's URL opting it into overlays over the page (`?overlays=1`), for a showcase whose marker has the
 * `overlays` key
 */
export const OVERLAYS_PARAMETER = 'overlays';

/**
 * Attribute the frame script sets on a showcase frame's `<html>` to the current theme, for the showcase's `[data-showroom-theme=dark]` selectors
 */
export const THEME_ATTRIBUTE = 'data-showroom-theme';

/**
 * Number of growths in a row, each by the same amount, after which the frame script stops reporting growth: a showcase sized to its viewport
 * (e.g. `100vh`) grows each time its iframe does
 */
export const MAX_REPEATED_GROWTHS = 3;

/**
 * Console methods the frame script captures, each a level of its own
 */
export const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

/**
 * Represents the level of a console line: the console method that wrote it, or `error` for an uncaught error or a rejected promise
 */
export type ConsoleLevel = (typeof CONSOLE_LEVELS)[number];

/**
 * Number of console lines kept at most: in each `console` message the frame script posts, and in the showroom's console panel; older ones are
 * dropped, and counted
 */
export const CONSOLE_MAX_LINES = 128;

/**
 * Time the frame script waits after a console line before posting the lines waiting, in milliseconds, so a showcase logging in a loop posts a batch
 * at most this often
 */
export const CONSOLE_FLUSH_MS = 50;

/**
 * Number of characters a console line keeps at most: a longer one is cut, ending in how many characters were left out
 */
export const CONSOLE_MAX_LINE_LENGTH = 10000;

/**
 * Represents a line a showcase frame wrote to its console, formatted inside the showcase frame
 */
export interface ConsoleLine {
  /**
   * Level of the line
   */
  level: ConsoleLevel;
  /**
   * Text of the line: its values formatted and joined by spaces, possibly over several lines, cut at CONSOLE_MAX_LINE_LENGTH characters
   */
  text: string;
  /**
   * True for an uncaught error or a rejected promise
   */
  uncaught?: boolean;
}

/**
 * Represents the box of an overlay reaching out of a showcase frame's content, in the page's pixels from its top left
 */
export interface OverhangBox {
  /**
   * Left edge
   */
  left: number;
  /**
   * Top edge
   */
  top: number;
  /**
   * Right edge
   */
  right: number;
  /**
   * Bottom edge
   */
  bottom: number;
}

/**
 * Represents the phase of a press: `down` (its `pointerdown`), or `click` (its `click`, once released)
 */
export type PressPhase = 'down' | 'click';

/**
 * Represents what a showcase frame opted into overlays over the page reports with its height: how far its page is pushed down for overlays above
 * its top (`offset`), the bottom of its in-flow content (`flow`), the boxes of its overlays reaching out of `offset`…`flow`, and whether any overlay
 * shows (`open`)
 */
export interface FrameOverhang {
  /**
   * How far the page is pushed down, in pixels, for overlays reaching above its top
   */
  offset: number;
  /**
   * Bottom of the page's in-flow content, in pixels, the push included
   */
  flow: number;
  /**
   * Boxes of the overlays reaching out of `offset`…`flow`
   */
  boxes: OverhangBox[];
  /**
   * True if any overlay shows, reaching out or not
   */
  open: boolean;
}

/**
 * Represents a message a showcase frame posts to the showroom: `start` as the frame script starts, before any of the page's own scripts; `ready` once
 * loaded; `resize` whenever its content's height changes (or, opted into overlays over the page, its overhang); `pointer`, a real press inside it;
 * and `console`, a batch of the lines it wrote to its console, with the number of lines left out before them, and how many of those were warnings
 * and errors
 */
export type FrameMessage =
  | { source: typeof FRAME_MESSAGE_SOURCE; type: 'start' }
  | { source: typeof FRAME_MESSAGE_SOURCE; type: 'ready' }
  | ({ source: typeof FRAME_MESSAGE_SOURCE; type: 'resize'; height: number } & Partial<FrameOverhang>)
  | { source: typeof FRAME_MESSAGE_SOURCE; type: 'pointer'; phase: PressPhase; x: number; y: number }
  | {
      source: typeof FRAME_MESSAGE_SOURCE;
      type: 'console';
      lines: ConsoleLine[];
      dropped: number;
      /**
       * Number of the dropped lines that were warnings (`warn`), when any were
       */
      droppedWarnings?: number;
      /**
       * Number of the dropped lines that were errors (`error`, uncaught errors, rejected promises), when any were
       */
      droppedErrors?: number;
    };

/**
 * Represents a message the showroom posts to a showcase frame: the current theme, or a press outside it (`outside-pointer`, at a point in its own
 * coordinates, possibly outside its viewport), for a showcase frame opted into overlays over the page
 */
export type ShowroomMessage =
  | { source: typeof SHOWROOM_MESSAGE_SOURCE; type: 'theme'; theme: FrameTheme }
  | { source: typeof SHOWROOM_MESSAGE_SOURCE; type: 'outside-pointer'; phase: PressPhase; x: number; y: number };

/**
 * Checks if a value is a well-formed console line
 * @param value The value
 * @returns True if it is one
 */
function _isConsoleLine(value: unknown): value is ConsoleLine {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    (CONSOLE_LEVELS as readonly unknown[]).includes(line.level) &&
    typeof line.text === 'string' &&
    (line.uncaught === undefined || typeof line.uncaught === 'boolean')
  );
}

/**
 * Checks if a value is a count: a whole number from 0
 * @param value The value
 * @returns True if it is one
 */
function _isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Checks if a value is a finite number
 * @param value The value
 * @returns True if it is one
 */
function _isFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Checks if a value is a well-formed overhang box
 * @param value The value
 * @returns True if it is one
 */
function _isOverhangBox(value: unknown): value is OverhangBox {
  if (typeof value !== 'object' || value === null) return false;
  const box = value as Record<string, unknown>;
  return _isFinite(box.left) && _isFinite(box.top) && _isFinite(box.right) && _isFinite(box.bottom);
}

/**
 * Checks if a message's data is a message from a showcase frame
 * @param data Data of the message
 * @returns True if it is a well-formed `start`, `ready`, `resize`, `pointer` or `console` message
 */
export function isFrameMessage(data: unknown): data is FrameMessage {
  if (typeof data !== 'object' || data === null) return false;
  const message = data as Record<string, unknown>;
  if (message.source !== FRAME_MESSAGE_SOURCE) return false;
  switch (message.type) {
    case 'start':
    case 'ready':
      return true;
    case 'resize':
      return (
        _isFinite(message.height) &&
        message.height >= 0 &&
        (message.offset === undefined || (_isFinite(message.offset) && message.offset >= 0)) &&
        (message.flow === undefined || (_isFinite(message.flow) && message.flow >= 0)) &&
        (message.boxes === undefined || (Array.isArray(message.boxes) && message.boxes.every(_isOverhangBox))) &&
        (message.open === undefined || typeof message.open === 'boolean')
      );
    case 'pointer':
      return (message.phase === 'down' || message.phase === 'click') && _isFinite(message.x) && _isFinite(message.y);
    case 'console':
      return (
        Array.isArray(message.lines) &&
        message.lines.every(_isConsoleLine) &&
        _isCount(message.dropped) &&
        (message.droppedWarnings === undefined || _isCount(message.droppedWarnings)) &&
        (message.droppedErrors === undefined || _isCount(message.droppedErrors))
      );
    default:
      return false;
  }
}

/**
 * Creates the message telling a showcase frame the current theme
 * @param theme The current theme
 * @returns The message
 */
export function createThemeMessage(theme: FrameTheme): ShowroomMessage {
  return { source: SHOWROOM_MESSAGE_SOURCE, type: 'theme', theme };
}

/**
 * Creates the message telling a showcase frame of a press outside it
 * @param phase The press's phase
 * @param x Horizontal position of the press, in the showcase frame's own pixels from its left (possibly outside it)
 * @param y Vertical position of the press, in the showcase frame's own pixels from its top (possibly outside it)
 * @returns The message
 */
export function createOutsidePointerMessage(phase: PressPhase, x: number, y: number): ShowroomMessage {
  return { source: SHOWROOM_MESSAGE_SOURCE, type: 'outside-pointer', phase, x, y };
}

/**
 * Gets the URL of a showcase frame, with its initial theme, and opted into overlays over the page where asked
 * @param url URL of the showcase frame's page, with or without a query (e.g. its hash)
 * @param theme The initial theme
 * @param overlays True to opt the showcase frame into overlays over the page
 * @returns The URL with the theme (and `overlays=1`) added to its query
 */
export function getThemedFrameUrl(url: string, theme: FrameTheme, overlays = false): string {
  return `${url}${url.includes('?') ? '&' : '?'}${THEME_PARAMETER}=${theme}${overlays ? `&${OVERLAYS_PARAMETER}=1` : ''}`;
}

// #endregion

// #region Frame script

/**
 * Represents the constants the frame script receives as its argument, as it references no outer names
 */
export interface FrameScriptConstants {
  /**
   * See FRAME_MESSAGE_SOURCE
   */
  frameSource: string;
  /**
   * See SHOWROOM_MESSAGE_SOURCE
   */
  showroomSource: string;
  /**
   * See THEME_PARAMETER
   */
  themeParameter: string;
  /**
   * See THEME_ATTRIBUTE
   */
  themeAttribute: string;
  /**
   * See OVERLAYS_PARAMETER
   */
  overlaysParameter: string;
  /**
   * See MAX_REPEATED_GROWTHS
   */
  maxRepeatedGrowths: number;
  /**
   * See CONSOLE_LEVELS
   */
  consoleLevels: readonly string[];
  /**
   * See CONSOLE_MAX_LINES
   */
  consoleMaxLines: number;
  /**
   * See CONSOLE_FLUSH_MS
   */
  consoleFlushMs: number;
  /**
   * See CONSOLE_MAX_LINE_LENGTH
   */
  consoleMaxLineLength: number;
}

/**
 * The frame script's constants
 */
export const FRAME_SCRIPT_CONSTANTS: FrameScriptConstants = {
  frameSource: FRAME_MESSAGE_SOURCE,
  showroomSource: SHOWROOM_MESSAGE_SOURCE,
  themeParameter: THEME_PARAMETER,
  themeAttribute: THEME_ATTRIBUTE,
  overlaysParameter: OVERLAYS_PARAMETER,
  maxRepeatedGrowths: MAX_REPEATED_GROWTHS,
  consoleLevels: CONSOLE_LEVELS,
  consoleMaxLines: CONSOLE_MAX_LINES,
  consoleFlushMs: CONSOLE_FLUSH_MS,
  consoleMaxLineLength: CONSOLE_MAX_LINE_LENGTH,
};

/**
 * The frame script, run in a showcase frame before any of the page's own scripts: it applies the theme (from the URL's query, then from the
 * showroom's messages) to `<html>`. Inside the showroom, it posts `start` at once, then captures the console: every call of the console's methods
 * (still calling the originals), uncaught errors and rejected promises, each formatted into a line at once, and posted in batches (`console`) at most
 * every CONSOLE_FLUSH_MS, and at once on `pagehide`. Values are formatted readably: strings as they are, an `Error` as its stack, objects and arrays
 * as indented JSON (`[Circular]` for cycles, `BigInt`s, `Map`s, `Set`s, DOM nodes and functions described), and anything else by `String()`. Once
 * the document is loaded, it posts `ready`, and `resize` whenever its content's height changes, absolutely positioned content (overlays) included,
 * re-measured at most once per animation frame; growth by the same amount again and again stops being reported. It is inlined into each showcase
 * frame page as its source text, so it references no outer names: everything it uses comes from `window`, and its constants from its argument.
 * @param constants The frame script's constants
 */
export function frameScript(constants: FrameScriptConstants): void {
  const root = window.document.documentElement;

  // Applies a theme to `<html>`, ignoring anything that isn't one
  const applyTheme = (theme: unknown) => {
    if (theme !== 'light' && theme !== 'dark') return;
    root.setAttribute(constants.themeAttribute, theme);
    root.style.colorScheme = theme;
  };
  let overlaysOn = false;
  try {
    const query = new window.URLSearchParams(window.location.search);
    applyTheme(query.get(constants.themeParameter));
    overlaysOn = query.get(constants.overlaysParameter) === '1';
  } catch (_err) {
    // A page without a readable location keeps the default theme, and isn't opted into overlays over the page
  }

  // Only a showcase frame inside the showroom talks to it
  const parent = window.parent;
  if (!parent || parent === window) return;
  const post = (message: Record<string, unknown>) => parent.postMessage({ source: constants.frameSource, ...message }, '*');
  post({ type: 'start' });

  // #region Console

  // Describes a value nested in an object or an array, as JSON.stringify()'s replacer
  const describe = (value: unknown): unknown => {
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'function') return `[Function ${value.name || '(anonymous)'}]`;
    if (typeof value === 'symbol') return value.toString();
    if (value === undefined) return '[undefined]';
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    if (value instanceof window.Error) return `${value.name}: ${value.message}`;
    if (value instanceof window.Map) return Object.fromEntries(Array.from(value.entries()).map(([key, item]) => [String(key), item]));
    if (value instanceof window.Set) return Array.from(value.values());
    if (typeof window.Node === 'function' && value instanceof window.Node) {
      const node = value as unknown as Element;
      if (node.nodeType !== 1) return `[${node.nodeName}]`;
      const id = node.id ? ` id="${node.id}"` : '';
      const className = typeof node.className === 'string' && node.className ? ` class="${node.className}"` : '';
      return `<${node.tagName.toLowerCase()}${id}${className}>`;
    }
    return value;
  };

  // Formats a value logged, as a whole
  const format = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value instanceof window.Error) return value.stack || `${value.name}: ${value.message}`;
    if (value === undefined) return 'undefined';
    if (typeof value !== 'object' || value === null || (typeof window.Node === 'function' && value instanceof window.Node)) {
      return String(describe(value));
    }
    const prefix = value instanceof window.Map ? `Map(${value.size}) ` : value instanceof window.Set ? `Set(${value.size}) ` : '';
    try {
      // The objects on the path from the root, each as given and as described: a value among them is a cycle
      const ancestors: { original: unknown; described: unknown }[] = [];
      const json = JSON.stringify(
        value,
        function (this: unknown, _key: string, item: unknown) {
          while (ancestors.length && ancestors[ancestors.length - 1].described !== this) ancestors.pop();
          if (typeof item === 'object' && item !== null && ancestors.some((ancestor) => ancestor.original === item)) return '[Circular]';
          const described = describe(item);
          if (typeof described === 'object' && described !== null) ancestors.push({ original: item, described });
          return described;
        },
        2,
      );
      return `${prefix}${json}`;
    } catch (_err) {
      return String(value);
    }
  };

  // The lines waiting to be posted, the lines dropped before them (and how many were warnings and errors), and the timer posting them
  let queue: { level: string; text: string; uncaught?: boolean }[] = [];
  let dropped = 0;
  let droppedWarnings = 0;
  let droppedErrors = 0;
  let flushTimer: number | undefined;
  const flush = () => {
    window.clearTimeout(flushTimer);
    flushTimer = undefined;
    if (!queue.length) return;
    post({ type: 'console', lines: queue, dropped, ...(droppedWarnings ? { droppedWarnings } : {}), ...(droppedErrors ? { droppedErrors } : {}) });
    queue = [];
    dropped = 0;
    droppedWarnings = 0;
    droppedErrors = 0;
  };

  // Formats a line, cuts it if too long, and queues it: beyond the most lines kept, the oldest waiting is dropped, and counted
  const add = (level: string, values: unknown[], uncaught = false) => {
    let text = values.map(format).join(' ');
    if (text.length > constants.consoleMaxLineLength) {
      text = `${text.slice(0, constants.consoleMaxLineLength)}… (${text.length - constants.consoleMaxLineLength} more characters)`;
    }
    queue.push(uncaught ? { level, text, uncaught } : { level, text });
    if (queue.length > constants.consoleMaxLines) {
      const shifted = queue.shift()!;
      dropped++;
      if (shifted.level === 'warn') droppedWarnings++;
      else if (shifted.level === 'error') droppedErrors++;
    }
    if (flushTimer === undefined) flushTimer = window.setTimeout(flush, constants.consoleFlushMs);
  };

  // Wraps the console's methods, still calling the originals
  const console = window.console as unknown as Record<string, (...values: unknown[]) => void>;
  for (const level of constants.consoleLevels) {
    const original = console[level];
    console[level] = function (this: unknown, ...values: unknown[]) {
      try {
        add(level, values);
      } catch (_err) {
        // Capturing never breaks the showcase's own logging
      }
      if (typeof original === 'function') original.apply(this, values);
    };
  }

  // Uncaught errors and rejected promises
  window.addEventListener('error', (event: ErrorEvent) => {
    add('error', [event.error instanceof window.Error || !event.message ? `Uncaught ${format(event.error)}` : event.message], true);
  });
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    add('error', [`Uncaught (in promise) ${format(event.reason)}`], true);
  });

  // The lines waiting are posted before the page goes
  window.addEventListener('pagehide', flush);

  // #endregion

  // #region Theme and height

  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as Record<string, unknown> | null;
    if (event.source !== parent || typeof data !== 'object' || data === null || data.source !== constants.showroomSource) return;
    if (data.type === 'theme') applyTheme(data.theme);
    else if (data.type === 'outside-pointer' && (data.phase === 'down' || data.phase === 'click')) {
      if (typeof data.x === 'number' && Number.isFinite(data.x) && typeof data.y === 'number' && Number.isFinite(data.y)) replay(data.phase, data.x, data.y);
    }
  });

  // Gets an element's computed style, once per measure
  let styles = new Map<Element, CSSStyleDeclaration>();
  const styleOf = (element: Element) => {
    let style = styles.get(element);
    if (!style) styles.set(element, (style = window.getComputedStyle(element)));
    return style;
  };

  // Gets the containing block of an absolutely positioned element below `<body>`: its nearest ancestor that is positioned, transformed, filtered or
  // contains its paint or layout; none where that is `<body>` or above
  const containingBlock = (element: Element, body: HTMLElement): Element | null => {
    for (let ancestor = element.parentElement; ancestor && ancestor !== body; ancestor = ancestor.parentElement) {
      const style = styleOf(ancestor);
      if (
        style.position !== 'static' ||
        (style.transform && style.transform !== 'none') ||
        (style.filter && style.filter !== 'none') ||
        /paint|layout|strict|content/.test(style.contain || '')
      ) {
        return ancestor;
      }
    }
    return null;
  };

  // Checks if the browser clips an absolutely positioned element: an ancestor from its containing block upward, below `<body>` (whose overflow is
  // the viewport's), whose vertical overflow isn't visible; an absolutely positioned ancestor goes on from its own containing block, and a fixed one
  // escapes every ancestor above it
  const isClipped = (element: Element, body: HTMLElement) => {
    let ancestor = containingBlock(element, body);
    while (ancestor && ancestor !== body) {
      const style = styleOf(ancestor);
      if (style.overflowY && style.overflowY !== 'visible') return true;
      if (style.position === 'fixed') return false;
      ancestor = style.position === 'absolute' ? containingBlock(ancestor, body) : ancestor.parentElement;
    }
    return false;
  };

  // Checks if an element is inside a fixed layer: it or an ancestor below `<body>` is fixed (an overlay container, a modal's root)
  const inFixedLayer = (element: Element, body: HTMLElement) => {
    for (let node: Element | null = element; node && node !== body; node = node.parentElement) {
      if (styleOf(node).position === 'fixed') return true;
    }
    return false;
  };

  // Observes an element's size, once
  let observer: ResizeObserver | undefined;
  const observed = new WeakSet<Element>();
  const observe = (element: Element) => {
    if (!observer || observed.has(element)) return;
    observed.add(element);
    observer.observe(element);
  };

  // The overlays of the last measure; and, opted into overlays over the page, how far the page is pushed down for overlays reaching above its top,
  // the overlays that caused it (the push is reset once none of them shows), and `<html>`'s own top padding before it
  let overlays: Element[] = [];
  let offset = 0;
  let pushers: Element[] = [];
  let ownPadding: string | undefined;
  const push = (value: number) => {
    if (ownPadding === undefined) ownPadding = root.style.paddingTop;
    const base = value ? parseFloat(window.getComputedStyle(root).paddingTop) - offset || 0 : 0;
    offset = value;
    root.style.paddingTop = value ? `${base + value}px` : ownPadding;
    if (!value) ownPadding = undefined;
  };

  // Measures the content: the larger of `<body>`'s own bottom (which holds its text and in-flow content) plus its bottom margin, the bottom of the
  // lowest of its children plus that child's bottom margin (which may collapse through `<body>`'s) and `<body>`'s bottom padding and border, and the
  // bottom of the lowest overlay: an absolutely positioned element (a dropdown, a portal's content) that shows and isn't clipped. A fixed element's
  // own box is never measured: it is placed against the viewport, so it never needs more room; nor is a box filling the viewport inside a fixed
  // layer (a backdrop). Opted into overlays over the page, it also pushes the page down for overlays reaching above its top, and reports the
  // overhang: the content's bottom, and the boxes of the overlays reaching out of it. A `resize` is posted whenever what it reports changes
  let last = -1;
  let lastGrowth = 0;
  let growths = 0;
  let growing = true;
  let lastPosted = '';
  const measure = () => {
    const body = window.document.body;
    if (!body) return;
    styles = new Map();
    const style = styleOf(body);
    const scroll = window.scrollY || 0;
    let flow = body.getBoundingClientRect().bottom + (parseFloat(style.marginBottom) || 0);
    const below = (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    for (const child of Array.from(body.children)) {
      // A fixed child is never measured, and an absolutely positioned one is measured below, as every other
      const childStyle = styleOf(child);
      if (childStyle.position === 'fixed' || childStyle.position === 'absolute') continue;
      observe(child);
      const childBottom = child.getBoundingClientRect().bottom + (parseFloat(childStyle.marginBottom) || 0);
      flow = Math.max(flow, childBottom + below);
    }
    const found: { element: Element; rect: DOMRect }[] = [];
    for (const element of Array.from(body.getElementsByTagName('*'))) {
      const elementStyle = styleOf(element);
      if (elementStyle.position !== 'absolute' || elementStyle.display === 'none' || elementStyle.visibility === 'hidden') continue;
      // A clip is the visually hidden pattern, and an empty box shows nothing (a portal's own node)
      if (elementStyle.clip && elementStyle.clip !== 'auto') continue;
      const rect = element.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0) || isClipped(element, body)) continue;
      // A backdrop fills the viewport inside a fixed layer: judged by its size alone, it would follow the frame's own height
      const fills = rect.top <= 0 && rect.left <= 0 && rect.right >= window.innerWidth && rect.bottom >= window.innerHeight;
      if (fills && inFixedLayer(element, body)) continue;
      observe(element);
      found.push({ element, rect });
    }
    overlays = found.map(({ element }) => element);
    if (overlaysOn) {
      // Pushes the page down by what reaches above its top, measuring again once it moved; or back, once none of what caused it shows
      const above = found.filter(({ rect }) => rect.top + scroll < 0);
      if (above.length) {
        pushers = [...pushers, ...above.map(({ element }) => element)];
        push(offset - Math.min(...above.map(({ rect }) => rect.top + scroll)));
        styles = new Map();
        return schedule();
      }
      if (offset && !pushers.some((element) => overlays.includes(element))) {
        pushers = [];
        push(0);
        styles = new Map();
        return schedule();
      }
    }
    styles = new Map();
    const content = Math.max(0, Math.ceil(flow + scroll));
    const height = Math.max(content, ...found.map(({ rect }) => Math.ceil(rect.bottom + scroll)));
    // Growing by the same amount again and again means the content follows the iframe's own height: stop reporting growth then, holding the height
    if (height !== last) {
      if (last >= 0 && height > last) {
        const growth = height - last;
        growths = growth === lastGrowth ? growths + 1 : 1;
        lastGrowth = growth;
        if (growths >= constants.maxRepeatedGrowths) growing = false;
        if (growing) last = height;
      } else {
        growths = 0;
        lastGrowth = 0;
        last = height;
      }
    }
    const report: Record<string, unknown> = { type: 'resize', height: last };
    if (overlaysOn) {
      const reach = (rect: DOMRect) => rect.top + scroll < offset || Math.ceil(rect.bottom + scroll) > content;
      report.offset = offset;
      report.flow = Math.min(content, last);
      report.boxes = found
        .filter(({ rect }) => reach(rect))
        .map(({ rect }) => ({
          left: Math.floor(rect.left),
          top: Math.floor(rect.top + scroll),
          right: Math.ceil(rect.right),
          bottom: Math.ceil(rect.bottom + scroll),
        }));
      report.open = found.length > 0;
    }
    const posted = JSON.stringify(report);
    if (posted === lastPosted) return;
    lastPosted = posted;
    post(report);
  };

  // #endregion

  // #region Presses

  // Every real press inside the showroom's showcase frames is told to it, its `pointerdown` and its `click`, to pass on to the others as a press
  // outside them; a replayed one never is
  for (const [type, phase] of [
    ['pointerdown', 'down'],
    ['click', 'click'],
  ] as const) {
    window.document.addEventListener(
      type,
      (event: MouseEvent) => {
        if (event.isTrusted) post({ type: 'pointer', phase, x: event.clientX, y: event.clientY });
      },
      true,
    );
  }

  // Checks if an element is safe to press as "outside": in no overlay, and the page itself or inside a fixed layer (a backdrop), never its content
  const isSafe = (element: Element | null): element is Element => {
    const body = window.document.body;
    if (!element || !body || overlays.some((overlay) => overlay.contains(element))) return false;
    if (element === body || element === root) return true;
    styles = new Map();
    const safe = inFixedLayer(element, body);
    styles = new Map();
    return safe;
  };

  // Replays a press outside every overlay, opted into overlays over the page and while one shows: `pointerdown` and `mousedown` at its `down`,
  // `pointerup`, `mouseup` and `click` at its `click`, on the element at its point, or else at the viewport's corners and edges' middles, that is
  // safe to press (else on `<body>`), always at a point inside the viewport
  let pressed: { target: Element; x: number; y: number } | undefined;
  const replay = (phase: 'down' | 'click', x: number, y: number) => {
    if (!overlaysOn || !window.document.body) return;
    if (phase === 'down' || !pressed) {
      if (!overlays.length) return;
      const right = Math.max(0, window.innerWidth - 1);
      const bottom = Math.max(0, window.innerHeight - 1);
      const points = [
        [x, y],
        [0, bottom],
        [right, bottom],
        [right / 2, bottom],
        [0, 0],
        [right, 0],
        [0, bottom / 2],
        [right, bottom / 2],
      ].filter(([px, py]) => px >= 0 && py >= 0 && px <= right && py <= bottom);
      pressed = { target: window.document.body, x: 0, y: 0 };
      for (const [px, py] of points) {
        const element = window.document.elementFromPoint(px, py);
        if (isSafe(element)) {
          pressed = { target: element, x: px, y: py };
          break;
        }
      }
    }
    const { target, x: clientX, y: clientY } = pressed;
    const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, button: 0 };
    const pointer = typeof window.PointerEvent === 'function' ? window.PointerEvent : undefined;
    const pointerInit = { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    if (phase === 'down') {
      if (pointer) target.dispatchEvent(new pointer('pointerdown', { ...pointerInit, buttons: 1 }));
      target.dispatchEvent(new window.MouseEvent('mousedown', { ...init, buttons: 1 }));
    } else {
      if (pointer) target.dispatchEvent(new pointer('pointerup', pointerInit));
      target.dispatchEvent(new window.MouseEvent('mouseup', init));
      target.dispatchEvent(new window.MouseEvent('click', init));
      pressed = undefined;
    }
  };

  // #endregion

  // #region Starting

  // Asks for a measure, run once at the next animation frame however often it is asked for
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      measure();
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else window.setTimeout(run, 0);
  };

  // Starts once the document is loaded: measures at once, then again whenever a size changes, the page changes (an overlay opens by adding nodes,
  // or changing classes and styles), a transition or an animation ends (an overlay opening scaled down), and on load
  const start = () => {
    post({ type: 'ready' });
    const body = window.document.body;
    if (typeof window.ResizeObserver === 'function' && body) {
      observer = new window.ResizeObserver(schedule);
      observe(body);
    }
    if (typeof window.MutationObserver === 'function' && body) {
      new window.MutationObserver(schedule).observe(body, { childList: true, attributes: true, subtree: true });
    }
    window.document.addEventListener('transitionend', schedule, true);
    window.document.addEventListener('animationend', schedule, true);
    measure();
    window.addEventListener('load', schedule);
  };
  if (window.document.readyState === 'loading') {
    window.document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // #endregion
}

/**
 * Gets the frame script as the source text of a `<script>` element's content: the function called with its constants
 * @returns The script's source text
 */
export function getFrameScript(): string {
  return `(${frameScript.toString()})(${JSON.stringify(FRAME_SCRIPT_CONSTANTS)});`;
}

// #endregion
