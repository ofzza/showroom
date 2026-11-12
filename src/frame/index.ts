/**
 * The frame script: the small, framework-free script `showroom` adds to every showcase frame page, and its `postMessage` contract with the showroom.
 * The showcase frame reports its content's height, and the showroom tells it the theme. Browser code, Node-free, imported by the showroom (the
 * message types and constants) and by `src/showcases/` (the script, inlined into each page). Internal, never re-exported.
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
 * Represents a message a showcase frame posts to the showroom: `ready` once loaded, and `resize` whenever its content's height changes
 */
export type FrameMessage = { source: typeof FRAME_MESSAGE_SOURCE; type: 'ready' } | { source: typeof FRAME_MESSAGE_SOURCE; type: 'resize'; height: number };

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
 * Checks if a message's data is a message from a showcase frame
 * @param data Data of the message
 * @returns True if it is a well-formed `ready` or `resize` message
 */
export function isFrameMessage(data: unknown): data is FrameMessage {
  if (typeof data !== 'object' || data === null) return false;
  const message = data as Record<string, unknown>;
  if (message.source !== FRAME_MESSAGE_SOURCE) return false;
  return (
    message.type === 'ready' || (message.type === 'resize' && typeof message.height === 'number' && Number.isFinite(message.height) && message.height >= 0)
  );
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
};

/**
 * The frame script, run in a showcase frame: it applies the theme (from the URL's query, then from the showroom's messages) to `<html>`, posts
 * `ready` once the document is loaded, and `resize` whenever its content's height changes. It is inlined into each showcase frame page as its source
 * text, so it references no outer names: everything it uses comes from `window`, and its constants from its argument.
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
}

/**
 * Gets the frame script as the source text of a `<script>` element's content: the function called with its constants
 * @returns The script's source text
 */
export function getFrameScript(): string {
  return `(${frameScript.toString()})(${JSON.stringify(FRAME_SCRIPT_CONSTANTS)});`;
}

// #endregion
