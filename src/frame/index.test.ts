/**
 * Tests of the frame script and its message contract
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONSOLE_FLUSH_MS,
  CONSOLE_LEVELS,
  CONSOLE_MAX_LINE_LENGTH,
  CONSOLE_MAX_LINES,
  FRAME_MESSAGE_SOURCE,
  MAX_REPEATED_GROWTHS,
  SHOWROOM_MESSAGE_SOURCE,
  THEME_ATTRIBUTE,
  createThemeMessage,
  getFrameScript,
  getThemedFrameUrl,
  isFrameMessage,
} from './index.js';
import type { ConsoleLine, FrameMessage } from './index.js';

/**
 * Represents a DOM node a showcase logs, as the stubbed `window.Node` constructs it
 */
class _LoggedNode {
  public constructor(
    public nodeType: number,
    public nodeName: string,
    public tagName = nodeName,
    public id = '',
    public className = '',
  ) {}
}

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
   * The stubbed console, whose methods the frame script wraps
   */
  console: Record<string, (...values: unknown[]) => void>;
  /**
   * Calls of the stubbed console's original methods, as their levels and values
   */
  original: [string, unknown[]][];
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
  const original: [string, unknown[]][] = [];
  const console = Object.fromEntries(CONSOLE_LEVELS.map((level) => [level, (...values: unknown[]) => void original.push([level, values])]));
  const window: Record<string, unknown> = {
    document: {
      documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value), style: rootStyle },
      body,
      readyState: options.readyState ?? 'interactive',
      addEventListener: (type: string, listener: () => void) => documentListeners.set(type, [...(documentListeners.get(type) ?? []), listener]),
    },
    location: { search: options.search ?? '' },
    URLSearchParams,
    console,
    Error,
    Map,
    Set,
    Node: _LoggedNode,
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout> | undefined) => clearTimeout(timer),
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
    console,
    original,
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
 * Gets the messages posted, of every type
 * @param frame The stubbed frame
 * @returns The messages, in order
 */
function _messages(frame: _FakeFrame): FrameMessage[] {
  return frame.posted.flatMap(({ message }) => (isFrameMessage(message) ? [message] : []));
}

/**
 * Gets the `console` messages posted, as their lines and dropped counts
 * @param frame The stubbed frame
 * @returns The batches, in order
 */
function _batches(frame: _FakeFrame): { lines: ConsoleLine[]; dropped: number }[] {
  return _messages(frame).flatMap((message) => (message.type === 'console' ? [{ lines: message.lines, dropped: message.dropped }] : []));
}

/**
 * Gets the texts of the console lines posted, in order, flushing the lines waiting first
 * @param frame The stubbed frame
 * @returns The texts
 */
function _texts(frame: _FakeFrame): string[] {
  vi.advanceTimersByTime(CONSOLE_FLUSH_MS);
  return _batches(frame).flatMap((batch) => batch.lines.map((line) => line.text));
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
  // stubbed `window`: its document, parent, console, ResizeObserver and listeners, driven by hand, and Vitest's fake timers for the console's
  // batches.

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Messages', () => {
    // Tests telling showcase frames' messages apart, and the showroom's message and URLs.

    it('Recognises the messages of showcase frames', () => {
      expect(isFrameMessage({ source: FRAME_MESSAGE_SOURCE, type: 'start' })).toBe(true);
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

    it('Recognises console messages, only with well-formed lines', () => {
      const console = (lines: unknown, dropped: unknown = 0) => isFrameMessage({ source: FRAME_MESSAGE_SOURCE, type: 'console', lines, dropped });
      expect(console([])).toBe(true);
      expect(
        console(
          [
            { level: 'log', text: 'x' },
            { level: 'error', text: 'y', uncaught: true },
          ],
          3,
        ),
      ).toBe(true);
      expect(console([{ level: 'trace', text: 'x' }])).toBe(false);
      expect(console([{ level: 'log', text: 1 }])).toBe(false);
      expect(console([{ level: 'log', text: 'x', uncaught: 'yes' }])).toBe(false);
      expect(console([null])).toBe(false);
      expect(console('x')).toBe(false);
      expect(console([], -1)).toBe(false);
      expect(console([], 1.5)).toBe(false);
      expect(isFrameMessage({ source: FRAME_MESSAGE_SOURCE, type: 'console', lines: [] })).toBe(false);
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

    it('Posts start, ready, then the height, to any origin', () => {
      const frame = _createFrame();
      _run(frame);
      expect(frame.posted).toEqual([
        { message: { source: FRAME_MESSAGE_SOURCE, type: 'start' }, origin: '*' },
        { message: { source: FRAME_MESSAGE_SOURCE, type: 'ready' }, origin: '*' },
        { message: { source: FRAME_MESSAGE_SOURCE, type: 'resize', height: 111 }, origin: '*' },
      ]);
      expect(frame.observed).toHaveLength(2);
    });

    it('Waits for the document to load before starting', () => {
      const frame = _createFrame({ readyState: 'loading' });
      _run(frame);
      // Only `start`, at once: the showroom clears its console panel before the page's own scripts log anything
      expect(_messages(frame).map((message) => message.type)).toEqual(['start']);
      frame.dispatchDocument('DOMContentLoaded');
      expect(_heights(frame)).toEqual([111]);
    });

    it('Posts nothing outside an iframe, and leaves the console alone, but still applies the theme', () => {
      const frame = _createFrame({ search: '?theme=dark', parent: false });
      const log = frame.console.log;
      _run(frame);
      expect(frame.console.log).toBe(log);
      frame.dispatch('error', { error: new Error('x'), message: 'x' });
      vi.advanceTimersByTime(CONSOLE_FLUSH_MS);
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
  });

  describe('Console', () => {
    // Tests capturing the console inside the showroom: each line formatted at once, posted in batches by a timer, capped, and cut.

    it('Captures the console from the start, before the document loads, still calling the originals', () => {
      const frame = _createFrame({ readyState: 'loading' });
      _run(frame);
      frame.console.log('early', 1);
      frame.console.warn('careful');
      expect(frame.original).toEqual([
        ['log', ['early', 1]],
        ['warn', ['careful']],
      ]);
      expect(_batches(frame)).toEqual([]);
      vi.advanceTimersByTime(CONSOLE_FLUSH_MS);
      expect(_batches(frame)).toEqual([
        {
          lines: [
            { level: 'log', text: 'early 1' },
            { level: 'warn', text: 'careful' },
          ],
          dropped: 0,
        },
      ]);
      expect(_messages(frame).map((message) => message.type)).toEqual(['start', 'console']);
    });

    it('Captures every level', () => {
      const frame = _createFrame();
      _run(frame);
      for (const level of CONSOLE_LEVELS) frame.console[level](level);
      vi.advanceTimersByTime(CONSOLE_FLUSH_MS);
      expect(_batches(frame)[0].lines.map((line) => line.level)).toEqual([...CONSOLE_LEVELS]);
    });

    it('Posts a batch at most every flush interval, timed from its first line', () => {
      const frame = _createFrame();
      _run(frame);
      frame.console.log('a');
      vi.advanceTimersByTime(CONSOLE_FLUSH_MS - 1);
      frame.console.log('b');
      expect(_batches(frame)).toHaveLength(0);
      vi.advanceTimersByTime(1);
      expect(_batches(frame).map((batch) => batch.lines.length)).toEqual([2]);
      frame.console.log('c');
      vi.advanceTimersByTime(CONSOLE_FLUSH_MS);
      vi.advanceTimersByTime(CONSOLE_FLUSH_MS * 4);
      expect(_batches(frame).map((batch) => batch.lines.map((line) => line.text))).toEqual([['a', 'b'], ['c']]);
    });

    it('Posts the newest lines only, with the number dropped before them', () => {
      const frame = _createFrame();
      _run(frame);
      for (let line = 1; line <= CONSOLE_MAX_LINES + 5; line++) frame.console.log(line);
      vi.advanceTimersByTime(CONSOLE_FLUSH_MS);
      const [batch] = _batches(frame);
      expect(batch.dropped).toBe(5);
      expect(batch.lines).toHaveLength(CONSOLE_MAX_LINES);
      expect(batch.lines[0].text).toBe('6');
      // The next batch counts afresh
      frame.console.log('next');
      vi.advanceTimersByTime(CONSOLE_FLUSH_MS);
      expect(_batches(frame)[1]).toEqual({ lines: [{ level: 'log', text: 'next' }], dropped: 0 });
    });

    it('Cuts a line too long, saying how many characters were left out', () => {
      // A large value formatted as indented JSON can be megabytes, cloned through postMessage and kept in the showroom
      const frame = _createFrame();
      _run(frame);
      frame.console.log('x'.repeat(CONSOLE_MAX_LINE_LENGTH));
      frame.console.log('y'.repeat(CONSOLE_MAX_LINE_LENGTH + 25));
      const [whole, cut] = _texts(frame);
      expect(whole).toBe('x'.repeat(CONSOLE_MAX_LINE_LENGTH));
      expect(cut).toBe(`${'y'.repeat(CONSOLE_MAX_LINE_LENGTH)}… (25 more characters)`);
    });

    it('Posts the lines waiting at once when the page goes', () => {
      const frame = _createFrame();
      _run(frame);
      frame.console.log('last words');
      frame.dispatch('pagehide');
      expect(_batches(frame)).toEqual([{ lines: [{ level: 'log', text: 'last words' }], dropped: 0 }]);
      // Nothing waiting, nothing posted
      frame.dispatch('pagehide');
      vi.advanceTimersByTime(CONSOLE_FLUSH_MS);
      expect(_batches(frame)).toHaveLength(1);
    });

    it('Lists uncaught errors and rejected promises, marked as uncaught', () => {
      const frame = _createFrame();
      _run(frame);
      const error = new Error('thrown');
      error.stack = 'Error: thrown\n    at showcase.ts:3';
      frame.dispatch('error', { error, message: 'Uncaught Error: thrown' });
      frame.dispatch('error', { error: 'a string', message: 'Uncaught a string' });
      frame.dispatch('error', { error: undefined, message: '' });
      frame.dispatch('unhandledrejection', { reason: error });
      frame.dispatch('unhandledrejection', { reason: { code: 7 } });
      frame.console.error('logged');
      vi.advanceTimersByTime(CONSOLE_FLUSH_MS);
      expect(_batches(frame)[0].lines).toEqual([
        { level: 'error', text: 'Uncaught Error: thrown\n    at showcase.ts:3', uncaught: true },
        { level: 'error', text: 'Uncaught a string', uncaught: true },
        { level: 'error', text: 'Uncaught undefined', uncaught: true },
        { level: 'error', text: 'Uncaught (in promise) Error: thrown\n    at showcase.ts:3', uncaught: true },
        { level: 'error', text: 'Uncaught (in promise) {\n  "code": 7\n}', uncaught: true },
        { level: 'error', text: 'logged' },
      ]);
    });

    it('Formats values readably', () => {
      const frame = _createFrame();
      _run(frame);
      const cycle: Record<string, unknown> = { name: 'cycle' };
      cycle.self = cycle;
      const shared = { shared: true };
      const map = new Map<unknown, unknown>([
        ['a', 1],
        [2, { b: 2n }],
      ]);
      map.set('map', map);
      const error = new Error('boom');
      error.stack = 'Error: boom\n    at showcase.ts:1';
      const values: unknown[] = [
        'text',
        42,
        true,
        null,
        undefined,
        10n,
        Symbol('s'),
        function named() {},
        { a: [1, 'x'], nested: { n: null, u: undefined, inf: Infinity } },
        cycle,
        [shared, shared],
        map,
        new Set([1, 'two']),
        error,
        { error: new TypeError('inner') },
        new _LoggedNode(1, 'BUTTON', 'BUTTON', 'go', 'primary'),
        new _LoggedNode(3, '#text'),
        { node: new _LoggedNode(1, 'P', 'P') },
      ];
      for (const value of values) frame.console.log(value);
      expect(_texts(frame)).toEqual([
        'text',
        '42',
        'true',
        'null',
        'undefined',
        '10n',
        'Symbol(s)',
        '[Function named]',
        '{\n  "a": [\n    1,\n    "x"\n  ],\n  "nested": {\n    "n": null,\n    "u": "[undefined]",\n    "inf": "Infinity"\n  }\n}',
        '{\n  "name": "cycle",\n  "self": "[Circular]"\n}',
        // The same object twice is no cycle
        '[\n  {\n    "shared": true\n  },\n  {\n    "shared": true\n  }\n]',
        'Map(3) {\n  "2": {\n    "b": "2n"\n  },\n  "a": 1,\n  "map": "[Circular]"\n}',
        'Set(2) [\n  1,\n  "two"\n]',
        'Error: boom\n    at showcase.ts:1',
        '{\n  "error": "TypeError: inner"\n}',
        '<button id="go" class="primary">',
        '[#text]',
        '{\n  "node": "<p>"\n}',
      ]);
    });

    it('Formats a value at the time it is logged', () => {
      // The showroom gets the line later, in a batch: a value changed after logging must still show as it was
      const frame = _createFrame();
      _run(frame);
      const value = { count: 1 };
      frame.console.log(value);
      value.count = 2;
      expect(_texts(frame)).toEqual(['{\n  "count": 1\n}']);
    });

    it("Never breaks the showcase's own logging", () => {
      const frame = _createFrame();
      _run(frame);
      const unprintable = {
        toString: () => {
          throw new Error('no');
        },
        toJSON: () => {
          throw new Error('no');
        },
      };
      expect(() => frame.console.log(unprintable)).not.toThrow();
      expect(frame.original).toEqual([['log', [unprintable]]]);
    });
  });
});
