/**
 * Tests of the frame script and its message contract
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OVERLAYS_PARAMETER,
  createOutsidePointerMessage,
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
 * Represents an element of the stubbed frame's document, below `<body>`
 */
interface _FakeElement {
  /**
   * Its parent element (`<body>` itself for a child of `<body>`)
   */
  parentElement: unknown;
  /**
   * Its computed style, over the defaults of a static, visible element
   */
  style: Record<string, string>;
  /**
   * Its box, in pixels from the viewport's top left: its top is its bottom less its height, and its left 0, unless given
   */
  rect: { bottom: number; width: number; height: number; top?: number; left?: number };
  /**
   * Gets its box, as layout would
   * @returns The box
   */
  getBoundingClientRect: () => { top: number; left: number; right: number; bottom: number; width: number; height: number };
  /**
   * Checks if it holds an element, or is it
   * @param other The element
   * @returns True if it holds it
   */
  contains: (other: unknown) => boolean;
  /**
   * Records an event dispatched on it
   * @param event The event
   * @returns True
   */
  dispatchEvent: (event: unknown) => boolean;
}

/**
 * Represents an event the stubbed `PointerEvent` and `MouseEvent` construct: its type and options
 */
class _FakeEvent {
  public constructor(
    public type: string,
    public init: Record<string, unknown>,
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
   * Calls the ResizeObserver's callback, as the browser would after a resize, then runs the animation frame it asked for
   */
  resize: () => void;
  /**
   * `<body>`'s only child at first
   */
  child: _FakeElement;
  /**
   * Adds an element, as the page would
   * @param element Its parent (`<body>`'s child by default, or `body` for `<body>` itself), computed style and box
   * @returns The element
   */
  addElement: (element: { parent?: _FakeElement | 'body'; style?: Record<string, string>; bottom: number; height?: number; width?: number }) => _FakeElement;
  /**
   * Removes an element, as the page would
   * @param element The element
   */
  removeElement: (element: _FakeElement) => void;
  /**
   * Calls the MutationObserver's callback, as the browser would after the page changes
   */
  mutate: () => void;
  /**
   * Options and target the MutationObserver observes with, if any
   */
  mutationObserved: { target: unknown; options: unknown }[];
  /**
   * Runs the animation frame callbacks waiting
   */
  nextFrame: () => void;
  /**
   * Counts the measures run, as the walks over `<body>`'s elements
   * @returns The number of measures
   */
  measures: () => number;
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
   * @param event The event (an empty object by default)
   */
  dispatchDocument: (type: string, event?: unknown) => void;
  /**
   * `<body>`
   */
  body: _FakeElement;
  /**
   * Events dispatched on elements (by the frame script's replay), as their targets, types and options, in order
   */
  dispatched: { target: unknown; type: string; init: Record<string, unknown> }[];
  /**
   * Sets what `document.elementFromPoint()` answers
   * @param find Gets the element at a point, or null
   */
  setElementFromPoint: (find: (x: number, y: number) => unknown) => void;
  /**
   * Types of the document's listeners added in the capture phase
   */
  capturing: string[];
}

/**
 * Creates a stubbed showcase frame `window`: a `<body>` with one child, margins, elements added by hand, an optional parent, a ResizeObserver and a
 * MutationObserver that run their callbacks only when told to, and animation frames run by hand
 * @param options The URL's query, whether the frame has a parent other than itself, the document's ready state, and whether it has
 * `requestAnimationFrame` and `PointerEvent`
 * @returns The stubbed frame and its handles
 */
function _createFrame(options: { search?: string; parent?: boolean; readyState?: string; animationFrame?: boolean; pointerEvent?: boolean } = {}): _FakeFrame {
  const posted: { message: unknown; origin: string }[] = [];
  const attributes = new Map<string, string>();
  const rootStyle: Record<string, string> = {};
  const listeners = new Map<string, ((event?: unknown) => void)[]>();
  const documentListeners = new Map<string, ((event?: unknown) => void)[]>();
  const dispatched: { target: unknown; type: string; init: Record<string, unknown> }[] = [];
  let elementFromPoint: (x: number, y: number) => unknown = () => null;
  const capturing: string[] = [];
  const observed: unknown[] = [];
  const mutationObserved: { target: unknown; options: unknown }[] = [];
  let bodyBottom: number | undefined;
  let callback: (() => void) | undefined;
  let mutationCallback: (() => void) | undefined;
  const frames: (() => void)[] = [];
  const nextFrame = () => frames.splice(0).forEach((run) => run());
  // `<body>` holds its child, plus its own 2 px bottom padding, unless a test moves its bottom (e.g. text directly in it)
  const body = {} as _FakeElement;
  const createElement = (parent: unknown, style: Record<string, string>, rect: _FakeElement['rect']): _FakeElement => {
    const element: _FakeElement = {
      parentElement: parent,
      style,
      rect,
      getBoundingClientRect: () => {
        const { bottom, width, height, top = bottom - height, left = 0 } = element.rect;
        return { top, left, right: left + width, bottom, width, height };
      },
      contains: (other) => {
        for (let node = other as _FakeElement | undefined; node; node = node.parentElement as _FakeElement | undefined) if (node === element) return true;
        return false;
      },
      dispatchEvent: (event) => {
        const { type, init } = event as _FakeEvent;
        dispatched.push({ target: element, type, init });
        return true;
      },
    };
    return element;
  };
  const child = createElement(body, {}, { bottom: 100.2, width: 300, height: 92.2 });
  let elements: _FakeElement[] = [child];
  let measures = 0;
  Object.defineProperties(body, {
    children: { get: () => elements.filter((element) => element.parentElement === body) },
    getElementsByTagName: {
      value: (name: string) => {
        measures++;
        return name === '*' ? elements.slice() : [];
      },
    },
    getBoundingClientRect: { value: () => ({ top: 8, bottom: bodyBottom ?? child.rect.bottom + 2 }) },
    style: { value: {} },
    contains: { value: (other: unknown) => other === body || elements.includes(other as _FakeElement) },
    dispatchEvent: {
      value: (event: unknown) => {
        const { type, init } = event as _FakeEvent;
        dispatched.push({ target: body, type, init });
        return true;
      },
    },
  });
  const defaultStyle = {
    position: 'static',
    display: 'block',
    visibility: 'visible',
    clip: 'auto',
    overflowY: 'visible',
    transform: 'none',
    filter: 'none',
    contain: 'none',
    marginBottom: '0px',
  };
  const parent: Record<string, unknown> = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
  const original: [string, unknown[]][] = [];
  const console = Object.fromEntries(CONSOLE_LEVELS.map((level) => [level, (...values: unknown[]) => void original.push([level, values])]));
  const window: Record<string, unknown> = {
    document: {
      documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value), style: rootStyle },
      body,
      readyState: options.readyState ?? 'interactive',
      elementFromPoint: (x: number, y: number) => elementFromPoint(x, y),
      addEventListener: (type: string, listener: (event?: unknown) => void, capture?: boolean) => {
        documentListeners.set(type, [...(documentListeners.get(type) ?? []), listener]);
        if (capture === true) capturing.push(type);
      },
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
    innerWidth: 300,
    innerHeight: 400,
    MouseEvent: _FakeEvent,
    ...(options.pointerEvent === false ? {} : { PointerEvent: _FakeEvent }),
    getComputedStyle: (element: unknown) =>
      element === body
        ? { ...defaultStyle, paddingBottom: '2px', borderBottomWidth: '0px', marginBottom: '8px' }
        : { ...defaultStyle, ...(element as _FakeElement).style },
    ...(options.animationFrame === false ? {} : { requestAnimationFrame: (run: () => void) => void frames.push(run) }),
    ResizeObserver: class {
      constructor(run: () => void) {
        callback = run;
      }
      observe(element: unknown) {
        if (!observed.includes(element)) observed.push(element);
      }
    },
    MutationObserver: class {
      constructor(run: () => void) {
        mutationCallback = run;
      }
      observe(target: unknown, observeOptions: unknown) {
        mutationObserved.push({ target, options: observeOptions });
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
    setBottom: (value) => void (child.rect.bottom = value),
    setBodyBottom: (value) => void (bodyBottom = value),
    setChildMargin: (value) => void (child.style.marginBottom = `${value}px`),
    resize: () => {
      callback?.();
      nextFrame();
    },
    child,
    addElement: ({ parent = child, style = {}, bottom, height = 100, width = 200 }) => {
      const element = createElement(parent === 'body' ? body : parent, style, { bottom, height, width });
      elements = [...elements, element];
      return element;
    },
    removeElement: (element) => {
      elements = elements.filter((item) => item !== element && item.parentElement !== element);
    },
    mutate: () => mutationCallback?.(),
    mutationObserved,
    nextFrame,
    measures: () => measures,
    capturing,
    console,
    original,
    dispatch: (type, event) => listeners.get(type)?.forEach((listener) => listener(event)),
    dispatchDocument: (type, event = {}) => documentListeners.get(type)?.forEach((listener) => listener(event)),
    body,
    dispatched,
    setElementFromPoint: (find) => void (elementFromPoint = find),
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
  // stubbed `window`: its document and elements, parent, console, ResizeObserver, MutationObserver, animation frames and listeners, driven by hand,
  // and Vitest's fake timers for the console's batches.

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
      // The dropped warnings and errors, when given, are counts too
      const base = { source: FRAME_MESSAGE_SOURCE, type: 'console', lines: [], dropped: 3 };
      expect(isFrameMessage({ ...base, droppedWarnings: 1, droppedErrors: 2 })).toBe(true);
      expect(isFrameMessage({ ...base, droppedWarnings: -1 })).toBe(false);
      expect(isFrameMessage({ ...base, droppedErrors: 0.5 })).toBe(false);
      expect(console([], 1.5)).toBe(false);
      expect(isFrameMessage({ source: FRAME_MESSAGE_SOURCE, type: 'console', lines: [] })).toBe(false);
    });

    it('Creates the theme message and the themed URL', () => {
      expect(createThemeMessage('dark')).toEqual({ source: SHOWROOM_MESSAGE_SOURCE, type: 'theme', theme: 'dark' });
      expect(getThemedFrameUrl('showcases/README.md/1/index.html', 'light')).toBe('showcases/README.md/1/index.html?theme=light');
      expect(getThemedFrameUrl('showcases/README.md/1/index.html?hash=0123abcd', 'dark')).toBe('showcases/README.md/1/index.html?hash=0123abcd&theme=dark');
      expect(getThemedFrameUrl('a/index.html?hash=1', 'dark', true)).toBe(`a/index.html?hash=1&theme=dark&${OVERLAYS_PARAMETER}=1`);
      expect(getThemedFrameUrl('a/index.html', 'light', false)).toBe('a/index.html?theme=light');
    });

    it('Recognises an overhang and presses, and creates the message of a press outside', () => {
      const resize = { source: FRAME_MESSAGE_SOURCE, type: 'resize', height: 400 };
      const box = { left: 0, top: 100, right: 200, bottom: 400 };
      expect(isFrameMessage({ ...resize, offset: 0, flow: 111, boxes: [box], open: true })).toBe(true);
      expect(isFrameMessage({ ...resize, offset: -1 })).toBe(false);
      expect(isFrameMessage({ ...resize, flow: Infinity })).toBe(false);
      expect(isFrameMessage({ ...resize, boxes: [{ ...box, top: 'x' }] })).toBe(false);
      expect(isFrameMessage({ ...resize, boxes: box })).toBe(false);
      expect(isFrameMessage({ ...resize, open: 'yes' })).toBe(false);
      const pointer = { source: FRAME_MESSAGE_SOURCE, type: 'pointer', phase: 'down', x: 1, y: 2 };
      expect(isFrameMessage(pointer)).toBe(true);
      expect(isFrameMessage({ ...pointer, phase: 'click' })).toBe(true);
      expect(isFrameMessage({ ...pointer, phase: 'up' })).toBe(false);
      expect(isFrameMessage({ ...pointer, x: NaN })).toBe(false);
      expect(createOutsidePointerMessage('click', -5, 600)).toEqual({
        source: SHOWROOM_MESSAGE_SOURCE,
        type: 'outside-pointer',
        phase: 'click',
        x: -5,
        y: 600,
      });
    });
  });

  describe('Frame script', () => {
    // Runs the inserted script on a stubbed frame whose `<body>` has one child; by default, the height reported is the child's bottom plus `<body>`'s
    // bottom padding (2 px) and margin (8 px), rounded up. Overlays are elements added by hand, with their computed styles and boxes, measured at
    // the next animation frame after the observers' callbacks or the document's events, which the tests call and run by hand.

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
      frame.nextFrame();
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

    it('Keeps reporting heights while the theme is toggled again and again', () => {
      // See PLAN-P21 D842: a jsonschema diagram redrawn in each theme, fitted to the width, has one height per theme; each redraw swaps the drawing
      // in at once, so the height never passes through another value, and the guard on repeated growth is never reached
      const frame = _createFrame();
      _run(frame);
      for (let toggle = 0; toggle < MAX_REPEATED_GROWTHS * 3; toggle++) {
        const theme = toggle % 2 ? 'light' : 'dark';
        frame.dispatch('message', { source: frame.parent, data: createThemeMessage(theme) });
        frame.setBottom(theme === 'dark' ? 200 : 100.2);
        frame.resize();
      }
      expect(_heights(frame)).toEqual([111, ...Array.from({ length: MAX_REPEATED_GROWTHS * 3 }, (_, toggle) => (toggle % 2 ? 111 : 210))]);
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

    it('Measures an absolutely positioned panel below its trigger', () => {
      // blox's brief: a 300 px dropdown below a 40 px trigger was cut off at the frame's bottom while only `<body>` and its children were measured
      const frame = _createFrame();
      frame.setBottom(48);
      frame.child.style.position = 'relative';
      const panel = frame.addElement({ style: { position: 'absolute' }, bottom: 348, height: 300 });
      _run(frame);
      expect(_heights(frame)).toEqual([348]);
      expect(frame.observed).toContain(panel);
    });

    it('Grows when a panel opens, and shrinks back when it closes, removed or not displayed', () => {
      const frame = _createFrame();
      frame.setBottom(48);
      frame.child.style.position = 'relative';
      _run(frame);
      const panel = frame.addElement({ style: { position: 'absolute' }, bottom: 348, height: 300 });
      frame.mutate();
      frame.nextFrame();
      panel.style.display = 'none';
      frame.mutate();
      frame.nextFrame();
      panel.style.display = 'block';
      frame.mutate();
      frame.nextFrame();
      frame.removeElement(panel);
      frame.mutate();
      frame.nextFrame();
      expect(_heights(frame)).toEqual([58, 348, 58, 348, 58]);
      expect(frame.mutationObserved).toEqual([
        { target: (frame.window.document as { body: unknown }).body, options: { childList: true, attributes: true, subtree: true } },
      ]);
    });

    it("Measures a fixed layer's panel, never the layer itself", () => {
      // Angular CDK's overlay container and MUI's modal root fill the viewport, and CDK's stays, empty, after its overlay closes: measuring the
      // layer would keep the frame at its grown height
      const frame = _createFrame();
      _run(frame);
      const layer = frame.addElement({ parent: 'body', style: { position: 'fixed' }, bottom: 111, height: 111 });
      const panel = frame.addElement({ parent: layer, style: { position: 'absolute' }, bottom: 400, height: 300 });
      frame.mutate();
      frame.nextFrame();
      // The iframe grew, and the layer with it
      layer.rect = { bottom: 400, width: 300, height: 400 };
      frame.removeElement(panel);
      frame.mutate();
      frame.nextFrame();
      expect(_heights(frame)).toEqual([111, 400, 111]);
    });

    it('Skips a panel its containing block, or an ancestor above it, clips', () => {
      const frame = _createFrame();
      const scrolling = frame.addElement({ style: { position: 'relative', overflowY: 'auto' }, bottom: 100, height: 50 });
      frame.addElement({ parent: scrolling, style: { position: 'absolute' }, bottom: 400 });
      const clipping = frame.addElement({ style: { overflowY: 'hidden' }, bottom: 100, height: 50 });
      const transformed = frame.addElement({ parent: clipping, style: { transform: 'translateX(1px)' }, bottom: 100, height: 50 });
      frame.addElement({ parent: transformed, style: { position: 'absolute' }, bottom: 500 });
      _run(frame);
      expect(_heights(frame)).toEqual([111]);
    });

    it('Measures a panel escaping a clipping box below its containing block', () => {
      // Overflow clips only what its box contains the containing block of: a dropdown in a scrolling card, positioned against something outside
      // the card, shows whole
      const frame = _createFrame();
      frame.child.style.position = 'relative';
      const card = frame.addElement({ style: { overflowY: 'auto' }, bottom: 100, height: 50 });
      frame.addElement({ parent: card, style: { position: 'absolute' }, bottom: 400 });
      // An absolutely positioned ancestor is skipped to its own containing block, and a fixed one escapes every clipping box above it
      const wrapper = frame.addElement({ parent: card, style: { position: 'absolute' }, bottom: 100, height: 20 });
      frame.addElement({ parent: wrapper, style: { position: 'absolute' }, bottom: 420 });
      const outer = frame.addElement({ style: { position: 'relative', overflowY: 'hidden' }, bottom: 100, height: 50 });
      const layer = frame.addElement({ parent: outer, style: { position: 'fixed' }, bottom: 100, height: 100 });
      frame.addElement({ parent: layer, style: { position: 'absolute' }, bottom: 450 });
      _run(frame);
      expect(_heights(frame)).toEqual([450]);
    });

    it('Skips what shows nothing: hidden, visually hidden, or an empty box', () => {
      // The visually hidden pattern (`clip`, 1×1 px) of Fluent UI, MUI, Angular CDK's live announcer and Tailwind's `sr-only`, and Fluent UI's
      // portal node, which has no height
      const frame = _createFrame();
      frame.addElement({ style: { position: 'absolute', visibility: 'hidden' }, bottom: 400 });
      frame.addElement({ style: { position: 'absolute', clip: 'rect(0px, 0px, 0px, 0px)' }, bottom: 400, height: 1, width: 1 });
      frame.addElement({ parent: 'body', style: { position: 'absolute' }, bottom: 400, height: 0 });
      _run(frame);
      expect(_heights(frame)).toEqual([111]);
    });

    it('Measures again when a transition or an animation ends', () => {
      // An overlay opening scaled down (MUI's Popover, Angular Material's menus) is measured at its first frame when it is added, and nothing
      // observes a transform
      const frame = _createFrame();
      _run(frame);
      const panel = frame.addElement({ style: { position: 'absolute' }, bottom: 250, height: 150 });
      frame.mutate();
      frame.nextFrame();
      panel.rect = { bottom: 300, width: 200, height: 200 };
      frame.dispatchDocument('transitionend');
      frame.nextFrame();
      panel.rect = { bottom: 350, width: 200, height: 250 };
      frame.dispatchDocument('animationend');
      frame.nextFrame();
      expect(_heights(frame)).toEqual([111, 250, 300, 350]);
      expect(frame.capturing).toEqual(['pointerdown', 'click', 'transitionend', 'animationend']);
    });

    it('Measures once per animation frame, however often it is asked', () => {
      const frame = _createFrame();
      _run(frame);
      frame.setBottom(200);
      frame.mutate();
      frame.setBottom(300);
      frame.mutate();
      frame.dispatchDocument('transitionend');
      expect(_heights(frame)).toEqual([111]);
      expect(frame.measures()).toBe(1);
      frame.nextFrame();
      frame.nextFrame();
      expect(_heights(frame)).toEqual([111, 310]);
      expect(frame.measures()).toBe(2);
    });

    it('Measures on a timer where there is no requestAnimationFrame', () => {
      const frame = _createFrame({ animationFrame: false });
      _run(frame);
      frame.setBottom(200);
      frame.mutate();
      frame.mutate();
      expect(_heights(frame)).toEqual([111]);
      vi.advanceTimersByTime(0);
      expect(_heights(frame)).toEqual([111, 210]);
    });

    it("Stops reporting growth for an overlay anchored to the viewport's bottom", () => {
      // An overlay placed against the window's bottom moves down each time the iframe grows: the guard on repeated growth stops it
      const frame = _createFrame();
      _run(frame);
      const layer = frame.addElement({ parent: 'body', style: { position: 'fixed' }, bottom: 111, height: 111 });
      const panel = frame.addElement({ parent: layer, style: { position: 'absolute' }, bottom: 131, height: 50 });
      for (let step = 1; step <= MAX_REPEATED_GROWTHS + 2; step++) {
        panel.rect = { ...panel.rect, bottom: 111 + step * 20 };
        frame.mutate();
        frame.nextFrame();
      }
      expect(_heights(frame)).toEqual([111, 131, 151]);
    });

    it('Leaves out a backdrop filling the viewport inside a fixed layer, never a box filling it alone', () => {
      // See PLAN-P25 D918: judged by its size alone, a showcase laid out absolutely, with nothing in flow, would fill the viewport it sizes, and
      // shrink to its minimum height for good
      const frame = _createFrame();
      const layer = frame.addElement({ parent: 'body', style: { position: 'fixed' }, bottom: 400, height: 400, width: 300 });
      frame.addElement({ parent: layer, style: { position: 'absolute' }, bottom: 400, height: 400, width: 300 });
      _run(frame);
      expect(_heights(frame)).toEqual([111]);
      frame.addElement({ style: { position: 'absolute' }, bottom: 400, height: 400, width: 300 });
      frame.mutate();
      frame.nextFrame();
      expect(_heights(frame)).toEqual([111, 400]);
    });
  });

  describe('Overlays over the page', () => {
    // A showcase frame opted in (`?overlays=1`) reports its overhang with its height, pushes its page down for overlays above its top, and replays
    // presses outside it; every showcase frame reports its own presses (S19 and P25 in .workflow/). On the stubbed frame, `<body>`'s child ends at
    // 100.2 px (its content's bottom 111 px), the viewport is 300 × 400 px, and layout after a push is moved by hand.

    const resizes = (frame: _FakeFrame) => _messages(frame).filter((message) => message.type === 'resize');
    const box = { left: 0, top: 100, right: 200, bottom: 400 };

    it('Reports only its height when not opted in', () => {
      const frame = _createFrame();
      frame.child.style.position = 'relative';
      frame.addElement({ style: { position: 'absolute' }, bottom: 400, height: 300 });
      _run(frame);
      expect(resizes(frame)).toEqual([{ source: FRAME_MESSAGE_SOURCE, type: 'resize', height: 400 }]);
    });

    it("Reports its content's bottom and the boxes of the overlays reaching out of it", () => {
      const frame = _createFrame({ search: '?theme=dark&overlays=1' });
      frame.child.style.position = 'relative';
      _run(frame);
      const panel = frame.addElement({ style: { position: 'absolute' }, bottom: 400, height: 300 });
      frame.mutate();
      frame.nextFrame();
      frame.removeElement(panel);
      frame.mutate();
      frame.nextFrame();
      const closed = { source: FRAME_MESSAGE_SOURCE, type: 'resize', height: 111, offset: 0, flow: 111, boxes: [], open: false };
      expect(resizes(frame)).toEqual([closed, { ...closed, height: 400, boxes: [box], open: true }, closed]);
    });

    it('Posts whenever its overhang changes, the height or not', () => {
      // See PLAN-P25 D919: an overlay opening inside the content changes only `open`, and one moving sideways only its box
      const frame = _createFrame({ search: '?overlays=1' });
      _run(frame);
      frame.addElement({ style: { position: 'absolute' }, bottom: 100, height: 50 });
      frame.mutate();
      frame.nextFrame();
      const panel = frame.addElement({ style: { position: 'absolute' }, bottom: 400, height: 300 });
      frame.mutate();
      frame.nextFrame();
      panel.rect = { ...panel.rect, left: 50 };
      frame.mutate();
      frame.nextFrame();
      frame.mutate();
      frame.nextFrame();
      expect(resizes(frame).map(({ height, open, boxes }) => [height, open, boxes])).toEqual([
        [111, false, []],
        [111, true, []],
        [400, true, [box]],
        [400, true, [{ ...box, left: 50, right: 250 }]],
      ]);
    });

    it('Holds its height once growth stops, still reporting its overhang', () => {
      // An overlay anchored to the viewport's bottom grows with the iframe: the guard holds the height, and the content's bottom never exceeds it
      const frame = _createFrame({ search: '?overlays=1' });
      _run(frame);
      const layer = frame.addElement({ parent: 'body', style: { position: 'fixed' }, bottom: 111, height: 111 });
      const panel = frame.addElement({ parent: layer, style: { position: 'absolute' }, bottom: 131, height: 50 });
      for (let step = 1; step <= MAX_REPEATED_GROWTHS + 1; step++) {
        panel.rect = { ...panel.rect, bottom: 111 + step * 20 };
        frame.mutate();
        frame.nextFrame();
      }
      expect(resizes(frame).map(({ height, boxes }) => [height, boxes?.[0]?.bottom])).toEqual([
        [111, undefined],
        [131, 131],
        [151, 151],
        [151, 171],
        [151, 191],
      ]);
      // Content growing past the held height is reported at it
      frame.setBottom(300);
      frame.mutate();
      frame.nextFrame();
      expect(resizes(frame).at(-1)).toMatchObject({ height: 151, flow: 151 });
      expect(resizes(frame).every(({ flow, height }) => flow! <= height)).toBe(true);
    });

    it('Pushes its page down for an overlay above its top, until what caused it closes', () => {
      // See PLAN-P25 D907 and D926: the push only grows while what caused it shows (an overlay placed above its trigger moves down with the page,
      // and would otherwise fit, be unpushed, and reach above again), and a permanent decoration never holds it; the page's own padding is kept
      const frame = _createFrame({ search: '?overlays=1' });
      frame.rootStyle.paddingTop = '4px';
      const decoration = frame.addElement({ style: { position: 'absolute' }, bottom: 50, height: 20 });
      const panel = frame.addElement({ style: { position: 'absolute' }, bottom: 0, height: 100 });
      _run(frame);
      expect(frame.rootStyle.paddingTop).toBe('104px');
      expect(resizes(frame)).toEqual([]);
      // The layout moves down by the push
      frame.setBottom(200.2);
      panel.rect = { ...panel.rect, bottom: 100 };
      decoration.rect = { ...decoration.rect, bottom: 150 };
      frame.nextFrame();
      expect(resizes(frame)).toEqual([
        {
          source: FRAME_MESSAGE_SOURCE,
          type: 'resize',
          height: 211,
          offset: 100,
          flow: 211,
          boxes: [{ left: 0, top: 0, right: 200, bottom: 100 }],
          open: true,
        },
      ]);
      frame.removeElement(panel);
      frame.mutate();
      frame.nextFrame();
      expect(frame.rootStyle.paddingTop).toBe('4px');
      frame.setBottom(100.2);
      decoration.rect = { ...decoration.rect, bottom: 50 };
      frame.nextFrame();
      expect(resizes(frame).at(-1)).toEqual({ source: FRAME_MESSAGE_SOURCE, type: 'resize', height: 111, offset: 0, flow: 111, boxes: [], open: true });
    });

    it('Reports its real presses, opted in or not, and never a replayed one', () => {
      // See PLAN-P25 D921: a replayed press reported would bounce between showcase frames
      const frame = _createFrame();
      _run(frame);
      frame.dispatchDocument('pointerdown', { isTrusted: true, clientX: 5, clientY: 6 });
      frame.dispatchDocument('click', { isTrusted: true, clientX: 5, clientY: 6 });
      frame.dispatchDocument('pointerdown', { isTrusted: false, clientX: 1, clientY: 1 });
      frame.dispatchDocument('click', { isTrusted: false, clientX: 1, clientY: 1 });
      expect(_messages(frame).filter((message) => message.type === 'pointer')).toEqual([
        { source: FRAME_MESSAGE_SOURCE, type: 'pointer', phase: 'down', x: 5, y: 6 },
        { source: FRAME_MESSAGE_SOURCE, type: 'pointer', phase: 'click', x: 5, y: 6 },
      ]);
    });

    describe('Replaying a press outside', () => {
      // A press outside is replayed in two phases, on a safe target: the page itself, or a fixed layer's backdrop, never its content or an overlay,
      // always at a point inside the viewport.

      const press = (frame: _FakeFrame, phase: 'down' | 'click', x: number, y: number, source: unknown = frame.parent) =>
        frame.dispatch('message', { source, data: createOutsidePointerMessage(phase, x, y) });
      const events = (frame: _FakeFrame) =>
        frame.dispatched.map(({ target, type, init }) => [target === frame.body ? 'body' : target, type, init.clientX, init.clientY]);
      const open = (options: Parameters<typeof _createFrame>[0] = {}) => {
        const frame = _createFrame({ search: '?overlays=1', ...options });
        frame.child.style.position = 'relative';
        const panel = frame.addElement({ style: { position: 'absolute' }, bottom: 400, height: 300 });
        _run(frame);
        return { frame, panel };
      };

      it('Replays the down phase at the press, and the click at its click, on the page', () => {
        const { frame } = open();
        // The press's own point is outside the viewport, and the first corner holds the page
        frame.setElementFromPoint((_x, y) => (y > 111 ? frame.body : frame.child));
        press(frame, 'down', 50, 500);
        expect(events(frame)).toEqual([
          ['body', 'pointerdown', 0, 399],
          ['body', 'mousedown', 0, 399],
        ]);
        press(frame, 'click', 50, 500);
        expect(events(frame).slice(2)).toEqual([
          ['body', 'pointerup', 0, 399],
          ['body', 'mouseup', 0, 399],
          ['body', 'click', 0, 399],
        ]);
      });

      it("Never presses the page's content or an overlay, falling back to <body>", () => {
        const { frame, panel } = open();
        frame.setElementFromPoint((x) => (x < 100 ? panel : frame.child));
        press(frame, 'down', 10, 10);
        expect(events(frame)).toEqual([
          ['body', 'pointerdown', 0, 0],
          ['body', 'mousedown', 0, 0],
        ]);
      });

      it("Presses a fixed layer's backdrop at the press's own point", () => {
        const { frame } = open();
        const layer = frame.addElement({ parent: 'body', style: { position: 'fixed' }, bottom: 400, height: 400, width: 300 });
        const backdrop = frame.addElement({ parent: layer, style: { position: 'absolute' }, bottom: 400, height: 400, width: 300 });
        frame.mutate();
        frame.nextFrame();
        // A popover's paper in the same layer is an overlay: never pressed, though inside a fixed layer
        const paper = frame.addElement({ parent: layer, style: { position: 'absolute' }, bottom: 300, height: 100 });
        frame.mutate();
        frame.nextFrame();
        frame.setElementFromPoint((_x, y) => (y >= 200 && y < 300 ? paper : backdrop));
        press(frame, 'down', 50, 250);
        press(frame, 'click', 50, 250);
        expect(events(frame).map(([target, , x, y]) => [target === backdrop, x, y])[0]).toEqual([true, 0, 399]);
        frame.dispatched.length = 0;
        frame.setElementFromPoint(() => backdrop);
        press(frame, 'down', 50, 200);
        press(frame, 'click', 50, 200);
        expect(events(frame).map(([target, type, x, y]) => [target === backdrop, type, x, y])).toEqual(
          ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].map((type) => [true, type, 50, 200]),
        );
      });

      it('Replays mouse events alone without PointerEvent', () => {
        const { frame } = open({ pointerEvent: false });
        frame.setElementFromPoint(() => frame.body);
        press(frame, 'down', 10, 300);
        press(frame, 'click', 10, 300);
        expect(events(frame).map(([, type]) => type)).toEqual(['mousedown', 'mouseup', 'click']);
      });

      it('Replays nothing when not opted in, with no overlay open, or from another window', () => {
        const { frame } = open();
        frame.setElementFromPoint(() => frame.body);
        press(frame, 'down', 10, 300, {});
        const closed = _createFrame({ search: '?overlays=1' });
        _run(closed);
        closed.setElementFromPoint(() => closed.body);
        press(closed, 'down', 10, 300);
        const out = _createFrame();
        out.child.style.position = 'relative';
        out.addElement({ style: { position: 'absolute' }, bottom: 400, height: 300 });
        _run(out);
        out.setElementFromPoint(() => out.body);
        press(out, 'down', 10, 300);
        expect([frame.dispatched, closed.dispatched, out.dispatched]).toEqual([[], [], []]);
      });
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

    it('Counts the warnings and errors among the lines dropped', () => {
      // The runtime status mark counts them (D592, .workflow/PLAN-P15.5-status-marks.md)
      const frame = _createFrame();
      _run(frame);
      frame.console.warn('w');
      frame.console.error('e1');
      frame.console.error('e2');
      for (let line = 1; line <= CONSOLE_MAX_LINES; line++) frame.console.log(line);
      vi.advanceTimersByTime(CONSOLE_FLUSH_MS);
      const [message] = _messages(frame).filter((candidate) => candidate.type === 'console');
      expect(message).toMatchObject({ dropped: 3, droppedWarnings: 1, droppedErrors: 2 });
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
