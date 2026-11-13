/**
 * The console panel: the part of a `ts` showcase frame listing what the showcase writes to the browser's console, its uncaught errors and its
 * rejected promises. Its script is self-contained, inlined into the showcase frame's page as its source text, like the frame script, and its
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
 * Number of lines the console panel shows at most before it scrolls
 */
export const CONSOLE_PANEL_MAX_LINES = 12;

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
   * See CONSOLE_PANEL_ID
   */
  panelId: string;
  /**
   * See CONSOLE_PANEL_MAX_LINES
   */
  maxLines: number;
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
  panelId: CONSOLE_PANEL_ID,
  maxLines: CONSOLE_PANEL_MAX_LINES,
  levels: CONSOLE_LEVELS,
  growthEvent: CONSOLE_GROWTH_EVENT,
};

/**
 * The console script, run in a `ts` showcase frame before the showcase's module: it wraps the console's methods (still calling the originals) and
 * listens to uncaught errors and rejected promises, adding a line to the console panel for each, styled by its level. Values are shown readably:
 * strings as they are, an `Error` as its stack, objects and arrays as indented JSON (`[Circular]` for cycles, `BigInt`s, `Map`s, `Set`s, DOM nodes
 * and functions described), and anything else by `String()`. The panel is hidden until its first line, has a maximum height, scrolls to its
 * newest line, and dispatches the growth event each time it grows. It is inlined into the page as its source text, so it references no outer
 * names: everything it uses comes from `window`, and its constants from its argument.
 * @param constants The console script's constants
 */
export function consoleScript(constants: ConsoleScriptConstants): void {
  const document = window.document;
  const host = document.getElementById(constants.panelId);
  if (!host) return;

  // The panel, in a shadow root of its own, so the showcase's styles and the panel's never mix; light-dark() follows the color-scheme the frame
  // script sets on `<html>`, which the shadow root inherits
  const shadow = typeof host.attachShadow === 'function' ? host.attachShadow({ mode: 'open' }) : host;
  const style = document.createElement('style');
  style.textContent =
    `:host{display:block}:host([hidden]){display:none}` +
    `.panel{margin:8px 0 0;padding:4px 0;max-height:calc(${constants.maxLines} * 18px + 8px);overflow:auto;` +
    `font:12px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:light-dark(#242424,#d6d6d6);` +
    `background:light-dark(#f5f5f5,#1f1f1f);border-top:1px solid light-dark(#d1d1d1,#424242)}` +
    `.line{padding:0 8px;white-space:pre-wrap;overflow-wrap:anywhere}` +
    `.info{color:light-dark(#0f6cbd,#479ef5)}.debug{opacity:.7}` +
    `.warn{color:light-dark(#8a5b00,#f2c661);background:light-dark(#fff9f0,#3a2e10)}` +
    `.error{color:light-dark(#a4262c,#f1707b);background:light-dark(#fdf3f4,#3b1d20)}`;
  const panel = document.createElement('div');
  panel.className = 'panel';
  shadow.appendChild(style);
  shadow.appendChild(panel);

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

  // Adds a line to the panel, showing it, scrolling to the line, and telling the frame script how much the panel grew
  const add = (level: string, values: unknown[]) => {
    const line = document.createElement('div');
    line.className = `line ${level}`;
    line.textContent = values.map(format).join(' ');
    const before = host.hidden ? 0 : host.getBoundingClientRect().height;
    host.hidden = false;
    panel.appendChild(line);
    panel.scrollTop = panel.scrollHeight;
    const growth = host.getBoundingClientRect().height - before;
    if (growth > 0) window.dispatchEvent(new window.CustomEvent(constants.growthEvent, { detail: growth }));
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
    add('error', [event.error instanceof window.Error || !event.message ? `Uncaught ${format(event.error)}` : event.message]);
  });
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    add('error', [`Uncaught (in promise) ${format(event.reason)}`]);
  });
}

/**
 * Gets the console script as the source text of a `<script>` element's content: the function called with its constants
 * @returns The script's source text
 */
export function getConsoleScript(): string {
  return `(${consoleScript.toString()})(${JSON.stringify(CONSOLE_SCRIPT_CONSTANTS)});`;
}

// #endregion
