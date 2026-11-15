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
 * Represents a message a showcase frame posts to the showroom: `start` as the frame script starts, before any of the page's own scripts; `ready` once
 * loaded; `resize` whenever its content's height changes; and `console`, a batch of the lines it wrote to its console, with the number of lines left
 * out before them, and how many of those were warnings and errors
 */
export type FrameMessage =
  | { source: typeof FRAME_MESSAGE_SOURCE; type: 'start' }
  | { source: typeof FRAME_MESSAGE_SOURCE; type: 'ready' }
  | { source: typeof FRAME_MESSAGE_SOURCE; type: 'resize'; height: number }
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
 * Represents a message the showroom posts to a showcase frame: the current theme
 */
export interface ShowroomMessage {
  /**
   * Source of the message
   */
  source: typeof SHOWROOM_MESSAGE_SOURCE;
  /**
   * Type of the message
   */
  type: 'theme';
  /**
   * The current theme
   */
  theme: FrameTheme;
}

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
 * Checks if a message's data is a message from a showcase frame
 * @param data Data of the message
 * @returns True if it is a well-formed `start`, `ready`, `resize` or `console` message
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
      return typeof message.height === 'number' && Number.isFinite(message.height) && message.height >= 0;
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
 * Gets the URL of a showcase frame, with its initial theme
 * @param url URL of the showcase frame's page, with or without a query (e.g. its hash)
 * @param theme The initial theme
 * @returns The URL with the theme added to its query
 */
export function getThemedFrameUrl(url: string, theme: FrameTheme): string {
  return `${url}${url.includes('?') ? '&' : '?'}${THEME_PARAMETER}=${theme}`;
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
 * the document is loaded, it posts `ready`, and `resize` whenever its content's height changes; growth by the same amount again and again stops
 * being reported. It is inlined into each showcase frame page as its source text, so it references no outer names: everything it uses comes from
 * `window`, and its constants from its argument.
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
  try {
    applyTheme(new window.URLSearchParams(window.location.search).get(constants.themeParameter));
  } catch (_err) {
    // A page without a readable location keeps the default theme
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
    if (event.source !== parent || typeof data !== 'object' || data === null) return;
    if (data.source === constants.showroomSource && data.type === 'theme') applyTheme(data.theme);
  });

  // Measures the content: the larger of `<body>`'s own bottom (which holds its text and in-flow content) plus its bottom margin, and the bottom of the
  // lowest of its children plus that child's bottom margin (which may collapse through `<body>`'s) and `<body>`'s bottom padding and border
  let observer: ResizeObserver | undefined;
  let last = -1;
  let lastGrowth = 0;
  let growths = 0;
  let growing = true;
  const measure = () => {
    const body = window.document.body;
    if (!body) return;
    const style = window.getComputedStyle(body);
    const scroll = window.scrollY || 0;
    let bottom = body.getBoundingClientRect().bottom + (parseFloat(style.marginBottom) || 0);
    const below = (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    for (const child of Array.from(body.children)) {
      observer?.observe(child);
      const childBottom = child.getBoundingClientRect().bottom + (parseFloat(window.getComputedStyle(child).marginBottom) || 0);
      bottom = Math.max(bottom, childBottom + below);
    }
    const height = Math.max(0, Math.ceil(bottom + scroll));
    if (height === last) return;
    // Growing by the same amount again and again means the content follows the iframe's own height: stop reporting growth then
    if (last >= 0 && height > last) {
      if (!growing) return;
      const growth = height - last;
      growths = growth === lastGrowth ? growths + 1 : 1;
      lastGrowth = growth;
      if (growths >= constants.maxRepeatedGrowths) {
        growing = false;
        return;
      }
    } else if (height < last) {
      growths = 0;
      lastGrowth = 0;
    }
    last = height;
    post({ type: 'resize', height });
  };

  // Starts once the document is loaded
  const start = () => {
    post({ type: 'ready' });
    if (typeof window.ResizeObserver === 'function' && window.document.body) {
      observer = new window.ResizeObserver(measure);
      observer.observe(window.document.body);
    }
    measure();
    window.addEventListener('load', measure);
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
