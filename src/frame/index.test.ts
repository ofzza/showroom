/**
 * Tests of the frame script and its message contract
 */

import { describe, expect, it } from 'vitest';
import {
  CONSOLE_GROWTH_EVENT,
  FRAME_MESSAGE_SOURCE,
  MAX_REPEATED_GROWTHS,
  SHOWROOM_MESSAGE_SOURCE,
  THEME_ATTRIBUTE,
  createThemeMessage,
  getFrameScript,
  getThemedFrameUrl,
  isFrameMessage,
} from './index.js';

/**
 * Represents a stubbed showcase frame `window`, and the handles a test drives it through
 */
interface _FakeFrame {
  /**
   * The stubbed `window`
   */
  window: Record<string, unknown>;
  /**
   * Messages posted to the parent, with their target origins
   */
  posted: { message: unknown; origin: string }[];
  /**
   * Attributes set on `<html>`
   */
  attributes: Map<string, string>;
  /**
   * Style of `<html>`
   */
  rootStyle: Record<string, string>;
  /**
   * The parent `window`
   */
  parent: Record<string, unknown>;
  /**
   * Elements the ResizeObserver observes
   */
  observed: unknown[];
  /**
   * Sets the bottom of `<body>`'s last child, as layout would
   * @param bottom Bottom of the child, in pixels from the viewport's top
   */
  setBottom: (bottom: number) => void;
  /**
   * Sets the bottom of `<body>` itself, as when text directly in it reaches below its children
   * @param bottom Bottom of `<body>`, in pixels from the viewport's top
   */
  setBodyBottom: (bottom: number) => void;
  /**
   * Sets the bottom margin of `<body>`'s child
   * @param margin The margin, in pixels
   */
  setChildMargin: (margin: number) => void;
  /**
   * Calls the ResizeObserver's callback, as the browser would after a resize
   */
  resize: () => void;
  /**
   * Dispatches an event to the window's listeners
   * @param type Type of the event
   * @param event The event
   */
  dispatch: (type: string, event?: unknown) => void;
  /**
   * Dispatches an event to the document's listeners
   * @param type Type of the event
   */
  dispatchDocument: (type: string) => void;
}

/**
 * Creates a stubbed showcase frame `window`: a `<body>` with one child, margins, an optional parent, and a ResizeObserver that runs its callback only
 * when told to
 * @param options The URL's query, whether the frame has a parent other than itself, and the document's ready state
 * @returns The stubbed frame and its handles
 */
function _createFrame(options: { search?: string; parent?: boolean; readyState?: string } = {}): _FakeFrame {
  const posted: { message: unknown; origin: string }[] = [];
  const attributes = new Map<string, string>();
  const rootStyle: Record<string, string> = {};
  const listeners = new Map<string, ((event?: unknown) => void)[]>();
  const documentListeners = new Map<string, (() => void)[]>();
  const observed: unknown[] = [];
  let bottom = 100.2;
  let bodyBottom: number | undefined;
  let childMargin = 0;
  let callback: (() => void) | undefined;
  const child = { getBoundingClientRect: () => ({ bottom }) };
  // `<body>` holds its child, plus its own 2 px bottom padding, unless a test moves its bottom (e.g. text directly in it)
  const body = { children: [child], getBoundingClientRect: () => ({ top: 8, bottom: bodyBottom ?? bottom + 2 }) };
  const parent: Record<string, unknown> = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
  const window: Record<string, unknown> = {
    document: {
      documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value), style: rootStyle },
      body,
      readyState: options.readyState ?? 'interactive',
      addEventListener: (type: string, listener: () => void) => documentListeners.set(type, [...(documentListeners.get(type) ?? []), listener]),
    },
    location: { search: options.search ?? '' },
    URLSearchParams,
    scrollY: 0,
    getComputedStyle: (element: unknown) =>
      element === body ? { paddingBottom: '2px', borderBottomWidth: '0px', marginBottom: '8px' } : { marginBottom: `${childMargin}px` },
    ResizeObserver: class {
      constructor(run: () => void) {
        callback = run;
      }
      observe(element: unknown) {
        if (!observed.includes(element)) observed.push(element);
      }
    },
    addEventListener: (type: string, listener: (event?: unknown) => void) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
  };
  window.parent = options.parent === false ? window : parent;
  return {
    window,
    posted,
    attributes,
    rootStyle,
    parent,
    observed,
    setBottom: (value) => void (bottom = value),
    setBodyBottom: (value) => void (bodyBottom = value),
    setChildMargin: (value) => void (childMargin = value),
    resize: () => callback?.(),
    dispatch: (type, event) => listeners.get(type)?.forEach((listener) => listener(event)),
    dispatchDocument: (type) => documentListeners.get(type)?.forEach((listener) => listener()),
  };
}

/**
 * Runs the frame script, as inserted into a showcase frame page, in a stubbed `window`
 * @param frame The stubbed frame
 */
function _run(frame: _FakeFrame): void {
  new Function('window', getFrameScript())(frame.window);
}

/**
 * Gets the heights of the `resize` messages posted
 * @param frame The stubbed frame
 * @returns The heights, in order
 */
function _heights(frame: _FakeFrame): number[] {
  return frame.posted.flatMap(({ message }) => (isFrameMessage(message) && message.type === 'resize' ? [message.height] : []));
}

describe('frame', () => {
  // Tests the message helpers on hand-written messages, and the frame script by running its inserted source text (getFrameScript()) with a
  // stubbed `window`: its document, parent, ResizeObserver and listeners, driven by hand.

  describe('Messages', () => {
    // Tests telling showcase frames' messages apart, and the showroom's message and URLs.

    it('Recognises the messages of showcase frames', () => {
      expect(isFrameMessage({ source: FRAME_MESSAGE_SOURCE, type: 'ready' })).toBe(true);
      expect(isFrameMessage({ source: FRAME_MESSAGE_SOURCE, type: 'resize', height: 120 })).toBe(true);
      expect(isFrameMessage({ source: FRAME_MESSAGE_SOURCE, type: 'resize' })).toBe(false);
      expect(isFrameMessage({ source: FRAME_MESSAGE_SOURCE, type: 'resize', height: -1 })).toBe(false);
      expect(isFrameMessage({ source: FRAME_MESSAGE_SOURCE, type: 'resize', height: Infinity })).toBe(false);
      expect(isFrameMessage({ source: 'other', type: 'ready' })).toBe(false);
      expect(isFrameMessage({ source: FRAME_MESSAGE_SOURCE, type: 'other' })).toBe(false);
      expect(isFrameMessage(null)).toBe(false);
      expect(isFrameMessage('ready')).toBe(false);
    });

    it('Creates the theme message and the themed URL', () => {
      expect(createThemeMessage('dark')).toEqual({ source: SHOWROOM_MESSAGE_SOURCE, type: 'theme', theme: 'dark' });
      expect(getThemedFrameUrl('showcases/README.md/1/index.html', 'light')).toBe('showcases/README.md/1/index.html?theme=light');
      expect(getThemedFrameUrl('showcases/README.md/1/index.html?hash=0123abcd', 'dark')).toBe('showcases/README.md/1/index.html?hash=0123abcd&theme=dark');
    });
  });

  describe('Frame script', () => {
    // Runs the inserted script on a stubbed frame whose `<body>` has one child; by default, the height reported is the child's bottom plus `<body>`'s
    // bottom padding (2 px) and margin (8 px), rounded up.

    it('Is a self-contained script call, safe inside a <script> element', () => {
      // The function is inlined as source text, so it can't close over the module's names (see AGENTS.md › The frame script is self-contained)
      const script = getFrameScript();
      expect(script).toMatch(/^\(function frameScript\(/);
      expect(script).toContain(JSON.stringify(SHOWROOM_MESSAGE_SOURCE));
      expect(script).not.toMatch(/<\/script/i);
      expect(script).not.toMatch(/FRAME_MESSAGE_SOURCE|THEME_ATTRIBUTE|__vite|import/);
    });

    it('Applies the theme from the query, then from the showroom', () => {
      const frame = _createFrame({ search: '?theme=dark' });
      _run(frame);
      expect(frame.attributes.get(THEME_ATTRIBUTE)).toBe('dark');
      expect(frame.rootStyle.colorScheme).toBe('dark');
      frame.dispatch('message', { source: frame.parent, data: createThemeMessage('light') });
      expect(frame.attributes.get(THEME_ATTRIBUTE)).toBe('light');
      expect(frame.rootStyle.colorScheme).toBe('light');
    });

    it("Ignores themes that aren't one, and messages from other windows", () => {
      const frame = _createFrame({ search: '?theme=purple' });
      _run(frame);
      expect(frame.attributes.has(THEME_ATTRIBUTE)).toBe(false);
      frame.dispatch('message', { source: {}, data: createThemeMessage('dark') });
      frame.dispatch('message', { source: frame.parent, data: { source: 'other', type: 'theme', theme: 'dark' } });
      frame.dispatch('message', { source: frame.parent, data: { ...createThemeMessage('dark'), theme: 'purple' } });
      frame.dispatch('message', { source: frame.parent, data: null });
      expect(frame.attributes.has(THEME_ATTRIBUTE)).toBe(false);
    });

    it('Posts ready, then the height, to any origin', () => {
      const frame = _createFrame();
      _run(frame);
      expect(frame.posted).toEqual([
        { message: { source: FRAME_MESSAGE_SOURCE, type: 'ready' }, origin: '*' },
        { message: { source: FRAME_MESSAGE_SOURCE, type: 'resize', height: 111 }, origin: '*' },
      ]);
      expect(frame.observed).toHaveLength(2);
    });

    it('Waits for the document to load before starting', () => {
      const frame = _createFrame({ readyState: 'loading' });
      _run(frame);
      expect(frame.posted).toEqual([]);
      frame.dispatchDocument('DOMContentLoaded');
      expect(_heights(frame)).toEqual([111]);
    });

    it('Posts nothing outside an iframe, but still applies the theme', () => {
      const frame = _createFrame({ search: '?theme=dark', parent: false });
      _run(frame);
      expect(frame.posted).toEqual([]);
      expect(frame.attributes.get(THEME_ATTRIBUTE)).toBe('dark');
    });

    it('Posts each change of height once, on resizes and on load', () => {
      const frame = _createFrame();
      _run(frame);
      frame.resize();
      frame.setBottom(300);
      frame.resize();
      frame.resize();
      frame.setBottom(50);
      frame.dispatch('load');
      expect(_heights(frame)).toEqual([111, 310, 60]);
    });

    it("Measures text directly in <body>, and a child's bottom margin collapsing through <body>'s", () => {
      // Regressions found in the browser check: a fragment's text outside any element, and a paragraph's 16 px margin, were cut off
      const frame = _createFrame();
      frame.setBodyBottom(130);
      _run(frame);
      frame.setBodyBottom(100.2);
      frame.setChildMargin(16);
      frame.resize();
      expect(_heights(frame)).toEqual([138, 119]);
    });

    it('Stops reporting growth when the height grows by the same amount again and again', () => {
      // A showcase sized to its viewport (e.g. `100vh`) grows each time its iframe does; without the guard, the iframe would grow forever
      const frame = _createFrame();
      _run(frame);
      for (let step = 1; step <= MAX_REPEATED_GROWTHS + 2; step++) {
        frame.setBottom(100.2 + step * 20);
        frame.resize();
      }
      expect(_heights(frame)).toEqual([111, 131, 151]);
      // Shrinking is still reported, growth isn't
      frame.setBottom(40);
      frame.resize();
      frame.setBottom(400);
      frame.resize();
      expect(_heights(frame)).toEqual([111, 131, 151, 50]);
    });

    it('Keeps reporting growth by varying amounts', () => {
      const frame = _createFrame();
      _run(frame);
      for (const bottom of [120, 150, 170, 210, 230]) {
        frame.setBottom(bottom);
        frame.resize();
      }
      expect(_heights(frame)).toEqual([111, 130, 160, 180, 220, 240]);
    });

    it("Never counts the console panel's own growth as a repeated growth", () => {
      // A showcase logging one line at a time grows its console panel by the same amount again and again (see AGENTS.md › The frame script
      // stops reporting growth)
      const frame = _createFrame();
      _run(frame);
      for (let step = 1; step <= MAX_REPEATED_GROWTHS + 2; step++) {
        frame.dispatch(CONSOLE_GROWTH_EVENT, { detail: 18 });
        frame.setBottom(100.2 + step * 18);
        frame.resize();
      }
      expect(_heights(frame)).toEqual([111, 129, 147, 165, 183, 201]);
      // Growth beyond the console panel's is counted again, and an invalid detail is ignored
      frame.dispatch(CONSOLE_GROWTH_EVENT, { detail: 'x' });
      for (let step = 1; step <= MAX_REPEATED_GROWTHS + 1; step++) {
        frame.setBottom(190.2 + step * 20);
        frame.resize();
      }
      expect(_heights(frame).slice(6)).toEqual([221, 241]);
    });
  });
});
