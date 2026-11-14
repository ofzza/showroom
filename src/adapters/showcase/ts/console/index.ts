/**
 * The console panel: the part of a `ts` showcase frame listing what the showcase writes to the browser's console, its uncaught errors and its
 * rejected promises. On its own at a fixed height while the showcase renders nothing; otherwise hidden behind fading lines and a counter that opens
 * it over the showcase. Its script is self-contained, inlined into the showcase frame's page as its source text, like the frame script, and its
 * element sits after the showcase frame root. Browser code, Node-free, imported by the `ts` showcase adapter. Internal, never re-exported.
 */

import { CONSOLE_GROWTH_EVENT } from '../../../../frame/index.js';

// #region Page

/**
 * Id of the showcase frame root: the empty element of a `ts` showcase frame's page the showcase may write to
 */
export const SHOWCASE_FRAME_ROOT_ID = 'root';

/**
 * Id of the console panel's element in a `ts` showcase frame's page, after the showcase frame root; the console panel lives in its shadow root
 */
export const CONSOLE_PANEL_ID = 'showroom-console';

/**
 * Number of lines the console panel shows, on its own or open over the showcase (its fixed height), before it scrolls
 */
export const CONSOLE_PANEL_LINES = 8;

/**
 * Room the open console panel always leaves at the top of a showcase frame, in pixels, so it never covers the code pane's cycling button floating
 * over the showcase frame's top-right corner (the height of the code pane's header row, `src/app/code-pane/`)
 */
export const CONSOLE_TOP_ROOM = 32;

/**
 * Number of the newest lines shown at the bottom of a showcase frame at once, while the console panel is hidden
 */
export const CONSOLE_FADING_LINES = 3;

/**
 * Time a line shows at the bottom of a showcase frame, while the console panel is hidden, before it fades, in milliseconds
 */
export const CONSOLE_LINE_SHOWN_MS = 3000;

/**
 * Time a line takes to fade, in milliseconds
 */
export const CONSOLE_LINE_FADE_MS = 1000;

/**
 * Time after the window's `load` event at which the console panel picks its mode, so content rendered just after it counts, in milliseconds
 */
export const CONSOLE_GRACE_MS = 100;

/**
 * Time after `DOMContentLoaded` at which the console panel picks its mode at the latest, even if `load` never fires, in milliseconds
 */
export const CONSOLE_MODE_CEILING_MS = 2000;

/**
 * Console methods the console panel lists, each a level of its own
 */
export const CONSOLE_LEVELS: readonly string[] = ['log', 'info', 'warn', 'error', 'debug'];

// #endregion

// #region Console script

/**
 * Represents the constants the console script receives as its argument, as it references no outer names
 */
export interface ConsoleScriptConstants {
  /**
   * See SHOWCASE_FRAME_ROOT_ID
   */
  rootId: string;
  /**
   * See CONSOLE_PANEL_ID
   */
  panelId: string;
  /**
   * See CONSOLE_PANEL_LINES
   */
  panelLines: number;
  /**
   * See CONSOLE_TOP_ROOM
   */
  topRoom: number;
  /**
   * See CONSOLE_FADING_LINES
   */
  fadingLines: number;
  /**
   * See CONSOLE_LINE_SHOWN_MS
   */
  lineShownMs: number;
  /**
   * See CONSOLE_LINE_FADE_MS
   */
  lineFadeMs: number;
  /**
   * See CONSOLE_GRACE_MS
   */
  graceMs: number;
  /**
   * See CONSOLE_MODE_CEILING_MS
   */
  ceilingMs: number;
  /**
   * See CONSOLE_LEVELS
   */
  levels: readonly string[];
  /**
   * See CONSOLE_GROWTH_EVENT (`src/frame/`)
   */
  growthEvent: string;
}

/**
 * The console script's constants
 */
export const CONSOLE_SCRIPT_CONSTANTS: ConsoleScriptConstants = {
  rootId: SHOWCASE_FRAME_ROOT_ID,
  panelId: CONSOLE_PANEL_ID,
  panelLines: CONSOLE_PANEL_LINES,
  topRoom: CONSOLE_TOP_ROOM,
  fadingLines: CONSOLE_FADING_LINES,
  lineShownMs: CONSOLE_LINE_SHOWN_MS,
  lineFadeMs: CONSOLE_LINE_FADE_MS,
  graceMs: CONSOLE_GRACE_MS,
  ceilingMs: CONSOLE_MODE_CEILING_MS,
  levels: CONSOLE_LEVELS,
  growthEvent: CONSOLE_GROWTH_EVENT,
};

/**
 * The console script, run in a `ts` showcase frame before the showcase's module: it wraps the console's methods (still calling the originals) and
 * listens to uncaught errors and rejected promises, keeping a line for each, styled by its level. Values are shown readably: strings as they are, an
 * `Error` as its stack, objects and arrays as indented JSON (`[Circular]` for cycles, `BigInt`s, `Map`s, `Set`s, DOM nodes and functions
 * described), and anything else by `String()`.
 *
 * It picks its mode once the window has loaded and the grace period has passed (or at the ceiling after `DOMContentLoaded`): **alone** if the
 * showcase has rendered nothing, the panel in the page's flow at a fixed height, shown from its first line (dispatching the growth event as it
 * appears); **hidden** once it has, for good: the panel's element 0 px high, the newest lines shown briefly at the bottom of the showcase frame then
 * faded, and a counter (red while errors are unseen) opening the whole panel over the showcase, below the room it leaves at the top, closed by its
 * close button or Escape. The first
 * uncaught error or rejected promise after the showcase rendered opens it by itself, once. Opening it over shorter content grows `<body>`'s
 * `min-height` to fit it, until it closes. It is inlined into the page as its source text, so it references no outer names: everything it uses comes
 * from `window`, and its constants from its argument.
 * @param constants The console script's constants
 */
export function consoleScript(constants: ConsoleScriptConstants): void {
  const document = window.document;
  const host = document.getElementById(constants.panelId);
  if (!host) return;
  const body = document.body;
  const root = document.getElementById(constants.rootId);

  // The panel's element never adds margins, padding or a border of its own, whatever the showcase's CSS says: in the hidden mode it is 0 px high
  host.style.margin = '0';
  host.style.padding = '0';
  host.style.border = '0';

  // The panel, in a shadow root of its own, so the showcase's styles and the panel's never mix; light-dark() follows the color-scheme the frame
  // script sets on `<html>`, which the shadow root inherits. Only elements inside the shadow root are fixed, so the frame script never measures them
  const shadow = typeof host.attachShadow === 'function' ? host.attachShadow({ mode: 'open' }) : host;
  const top = 'z-index:2147483647;';
  const colours = 'color:light-dark(#242424,#d6d6d6);background:light-dark(#f5f5f5,#1f1f1f);';
  const border = 'light-dark(#d1d1d1,#424242)';
  const style = document.createElement('style');
  style.textContent =
    `:host{display:block}:host([hidden]),[hidden]{display:none}` +
    `.panel,.bar{font:12px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}` +
    `.panel{display:none;flex-direction:column;${colours}border-top:1px solid ${border}}` +
    `:host([data-mode=alone]) .panel{display:flex;margin:8px 0 0}` +
    `:host([data-mode=hidden][data-open]) .panel{display:flex;position:fixed;left:0;right:0;bottom:0;max-height:calc(100vh - ${constants.topRoom}px);${top}` +
    `box-shadow:0 -2px 8px rgba(0,0,0,.2)}` +
    `.header{flex:none;display:none;align-items:center;justify-content:space-between;height:24px;padding:0 4px 0 8px;border-bottom:1px solid ${border}}` +
    `:host([data-open]) .header{display:flex}` +
    `.close{font:inherit;color:inherit;background:none;border:0;border-radius:4px;padding:0 6px;cursor:pointer}` +
    `.close:hover,.close:focus-visible{background:light-dark(#e0e0e0,#333)}` +
    `.log{flex:0 1 auto;min-height:0;box-sizing:border-box;height:calc(${constants.panelLines} * 18px + 8px);padding:4px 0;overflow:auto}` +
    `.line{padding:0 8px;white-space:pre-wrap;overflow-wrap:anywhere}` +
    `.bar{display:none}` +
    `:host([data-mode=hidden]:not([data-open])) .bar{display:flex;align-items:flex-end;gap:8px;position:fixed;left:0;right:0;bottom:0;${top}` +
    `padding:4px 8px;pointer-events:none}` +
    `.fading{flex:1 1 auto;min-width:0;max-height:calc(100vh - 8px);overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end}` +
    `.fading .line{${colours}white-space:pre;overflow:hidden;text-overflow:ellipsis;border-radius:4px;opacity:.85;` +
    `transition:opacity ${constants.lineFadeMs}ms}` +
    `.fading .line.faded{opacity:0}` +
    `.counter{flex:none;pointer-events:auto;font:inherit;${colours}border:1px solid ${border};border-radius:999px;padding:0 8px;cursor:pointer;` +
    `opacity:.6}` +
    `.counter:hover,.counter:focus-visible{opacity:1}` +
    `.counter.errors{color:#fff;background:light-dark(#c50f1f,#dc626d);border-color:transparent;opacity:.9}` +
    `.info{color:light-dark(#0f6cbd,#479ef5)}.debug{opacity:.7}` +
    `.warn{color:light-dark(#8a5b00,#f2c661);background:light-dark(#fff9f0,#3a2e10)}` +
    `.error{color:light-dark(#a4262c,#f1707b);background:light-dark(#fdf3f4,#3b1d20)}`;
  const element = (tag: string, className: string, parent: { appendChild: (child: HTMLElement) => unknown }) => {
    const created = document.createElement(tag);
    created.className = className;
    parent.appendChild(created);
    return created;
  };
  shadow.appendChild(style);
  const panel = element('div', 'panel', shadow);
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Console');
  const header = element('div', 'header', panel);
  const title = element('span', 'title', header);
  const close = element('button', 'close', header);
  close.setAttribute('type', 'button');
  close.setAttribute('aria-label', 'Close the console');
  close.textContent = '✕';
  const log = element('div', 'log', panel);
  const bar = element('div', 'bar', shadow);
  const fading = element('div', 'fading', bar);
  fading.setAttribute('aria-hidden', 'true');
  const counter = element('button', 'counter', bar);
  counter.setAttribute('type', 'button');
  counter.hidden = true;

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

  // #region State

  // `pending` until the mode is picked, then `alone` or `hidden`; only `alone` ever changes, to `hidden`, never back
  let mode: 'pending' | 'alone' | 'hidden' = 'pending';
  // Whether the showcase has rendered, ever (content seen once counts, even if removed)
  let rendered = false;
  // Whether the panel is open over the showcase (the hidden mode only)
  let open = false;
  // Whether an uncaught error has opened the panel by itself, or used its one chance (once per showcase frame load)
  let autoOpened = false;
  // Whether an uncaught error came before the mode was picked
  let earlyUncaught = false;
  // Lines logged, and errors logged while no line was seen (before the pick, or hidden and closed)
  let count = 0;
  let errors = 0;
  // `<body>`'s own inline `min-height` while the open panel grows it, or undefined
  let savedMinHeight: string | undefined;

  // #endregion

  // #region Helpers

  const plural = (amount: number, word: string) => `${amount} ${word}${amount === 1 ? '' : 's'}`;

  // The height of the page, as the showcase frame's height follows it
  const pageHeight = () => document.documentElement.scrollHeight;

  // Runs a change and tells the frame script how much the page grew, so it never counts the panel's own growth as a repeated growth
  const growing = (change: () => void) => {
    const before = pageHeight();
    change();
    const growth = pageHeight() - before;
    if (growth > 0) window.dispatchEvent(new window.CustomEvent(constants.growthEvent, { detail: growth }));
  };

  // Whether a scroller is scrolled to its bottom, so a new line scrolls it on
  const atBottom = (scroller: HTMLElement) => scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;

  // Updates the counter's and the header's text
  const updateTexts = () => {
    counter.hidden = count === 0;
    counter.textContent = `>_ ${count}${errors ? ` · ${plural(errors, 'error')}` : ''}`;
    counter.className = errors ? 'counter errors' : 'counter';
    counter.setAttribute('aria-label', `Open the console: ${plural(count, 'line')}${errors ? `, ${plural(errors, 'error')}` : ''}`);
    title.textContent = `Console · ${plural(count, 'line')}`;
  };

  // #endregion

  // #region Rendered

  // Elements whose content is never what a showcase renders, and elements that render without text
  const excluded = ['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT'];
  const visual = ['IMG', 'PICTURE', 'CANVAS', 'SVG', 'VIDEO', 'AUDIO', 'IFRAME', 'EMBED', 'OBJECT', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'];
  const tagOf = (node: Node) => String(node.nodeName).toUpperCase();

  // Checks if a node counts as rendered content: any element in the showcase frame root, a visual element or text elsewhere in `<body>`; never the
  // showcase frame root itself, the panel's element, or anything inside them or an excluded element (outside the root)
  const counts = (node: Node): boolean => {
    let parent: Node | null = node;
    while (parent && parent !== body) {
      if (parent === host) return false;
      if (parent.nodeType === 1 && excluded.includes(tagOf(parent))) return false;
      parent = parent.parentNode;
    }
    if (parent !== body) return false;
    if (node.nodeType === 3) return /\S/.test(node.textContent || '');
    if (node.nodeType !== 1 || node === root) return false;
    if (root && root.contains(node)) return true;
    return visual.includes(tagOf(node)) || /\S/.test(node.textContent || '');
  };

  // Scans a node's descendants for rendered content
  const scan = (node: Node): boolean => {
    for (const child of Array.from(node.childNodes || [])) {
      if (counts(child)) return true;
      if (child.nodeType === 1 && child !== host && !excluded.includes(tagOf(child)) && scan(child)) return true;
    }
    return false;
  };

  // The showcase rendered: an alone panel hides, for good
  const markRendered = () => {
    if (rendered) return;
    rendered = true;
    if (mode === 'alone') enterHidden();
  };

  const observer =
    typeof window.MutationObserver === 'function' && body
      ? new window.MutationObserver((records: MutationRecord[]) => {
          for (const record of records) {
            if (record.type === 'characterData' ? counts(record.target) : Array.from(record.addedNodes).some((node) => counts(node) || scan(node))) {
              markRendered();
              return;
            }
          }
        })
      : undefined;
  observer?.observe(body, { childList: true, subtree: true, characterData: true });

  // #endregion

  // #region Modes

  // Alone: the panel in the flow, shown from its first line
  const showAlone = () => {
    if (count === 0 || !host.hidden) return;
    growing(() => {
      host.hidden = false;
    });
    log.scrollTop = log.scrollHeight;
  };
  const enterAlone = () => {
    mode = 'alone';
    errors = 0;
    host.setAttribute('data-mode', 'alone');
    showAlone();
  };

  // Hidden: the panel's element 0 px high, the counter and the fading lines fixed at the bottom; the observer is no longer needed
  const enterHidden = () => {
    const from = mode;
    mode = 'hidden';
    observer?.disconnect();
    if (from === 'alone') errors = 0;
    host.setAttribute('data-mode', 'hidden');
    host.hidden = count === 0;
    updateTexts();
    if (earlyUncaught && !autoOpened) {
      autoOpened = true;
      openConsole(false);
    }
  };

  // Picks the mode, once
  let graceTimer: number | undefined;
  let ceilingTimer: number | undefined;
  const pick = () => {
    if (mode !== 'pending') return;
    window.clearTimeout(graceTimer);
    window.clearTimeout(ceilingTimer);
    if (!rendered && body) rendered = scan(body);
    if (rendered) enterHidden();
    else enterAlone();
  };

  // #endregion

  // #region Fading lines

  // Each fading line with its timers, oldest first
  const shown: { line: HTMLElement; timers: number[] }[] = [];
  const removeFading = (item: { line: HTMLElement; timers: number[] }) => {
    item.timers.forEach((timer) => window.clearTimeout(timer));
    const index = shown.indexOf(item);
    if (index >= 0) shown.splice(index, 1);
    if (item.line.parentNode) fading.removeChild(item.line);
  };
  const clearFading = () => {
    while (shown.length) removeFading(shown[0]);
  };
  const addFading = (level: string, text: string) => {
    const line = element('div', `line ${level}`, fading);
    line.textContent = text.split('\n')[0];
    const item: { line: HTMLElement; timers: number[] } = { line, timers: [] };
    item.timers.push(
      window.setTimeout(() => line.classList.add('faded'), constants.lineShownMs),
      window.setTimeout(() => removeFading(item), constants.lineShownMs + constants.lineFadeMs),
    );
    shown.push(item);
    while (shown.length > constants.fadingLines) removeFading(shown[0]);
  };

  // #endregion

  // #region Open and close

  const openConsole = (byUser: boolean) => {
    if (open) return;
    open = true;
    errors = 0;
    clearFading();
    host.setAttribute('data-open', '');
    updateTexts();
    log.scrollTop = log.scrollHeight;
    // Over shorter content, `<body>` grows to fit the open panel and the room above it, at least its own minimum height: the panel's border, its
    // header bar and its border, and its lines with their padding
    const height = 1 + 25 + constants.panelLines * 18 + 8 + constants.topRoom;
    if (body && pageHeight() < height) {
      growing(() => {
        savedMinHeight = body.style.minHeight;
        const minimum = parseFloat(window.getComputedStyle(body).minHeight) || 0;
        body.style.minHeight = `${Math.max(minimum, height)}px`;
      });
    }
    if (byUser) close.focus();
  };
  const closeConsole = () => {
    if (!open) return;
    const active = (shadow as ShadowRoot).activeElement;
    const focused = !!active && panel.contains(active);
    open = false;
    host.removeAttribute('data-open');
    if (body && savedMinHeight !== undefined) body.style.minHeight = savedMinHeight;
    savedMinHeight = undefined;
    updateTexts();
    if (focused) counter.focus();
  };
  counter.addEventListener('click', () => openConsole(true));
  close.addEventListener('click', closeConsole);
  window.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (open && event.key === 'Escape') closeConsole();
    },
    true,
  );

  // #endregion

  // #region Lines

  // Adds a line: kept in the panel, scrolled to while at its bottom; in the hidden mode, also shown fading and counted
  const add = (level: string, values: unknown[], uncaught = false) => {
    if (host.isConnected === false) return;
    const text = values.map(format).join(' ');
    const follow = atBottom(log);
    const line = element('div', `line ${level}`, log);
    line.textContent = text;
    if (follow) log.scrollTop = log.scrollHeight;
    count++;
    const seen = mode === 'alone' || open;
    if (level === 'error' && !seen) errors++;
    if (mode === 'alone') showAlone();
    if (mode === 'hidden') {
      host.hidden = false;
      if (!open) addFading(level, text);
      updateTexts();
    }
    if (uncaught) {
      if (mode === 'pending') earlyUncaught = true;
      else if (mode === 'hidden' && !autoOpened) {
        autoOpened = true;
        openConsole(false);
      }
    }
  };

  // Wrap the console's methods, still calling the originals
  const console = window.console as unknown as Record<string, (...values: unknown[]) => void>;
  for (const level of constants.levels) {
    const original = console[level];
    console[level] = function (this: unknown, ...values: unknown[]) {
      try {
        add(level, values);
      } catch (_err) {
        // The panel never breaks the showcase's own logging
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

  // #endregion

  // Picks the mode after `load` and the grace period, or at the ceiling after `DOMContentLoaded`
  const loaded = () => {
    graceTimer = window.setTimeout(pick, constants.graceMs);
  };
  if (document.readyState === 'complete') loaded();
  else window.addEventListener('load', loaded);
  const parsed = () => {
    ceilingTimer = window.setTimeout(pick, constants.ceilingMs);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', parsed);
  else parsed();
}

/**
 * Gets the console script as the source text of a `<script>` element's content: the function called with its constants
 * @returns The script's source text
 */
export function getConsoleScript(): string {
  return `(${consoleScript.toString()})(${JSON.stringify(CONSOLE_SCRIPT_CONSTANTS)});`;
}

// #endregion
