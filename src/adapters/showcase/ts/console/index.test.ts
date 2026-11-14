/**
 * Tests of the console panel's script
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSOLE_GROWTH_EVENT } from '../../../../frame/index.js';
import {
  CONSOLE_FADING_LINES,
  CONSOLE_GRACE_MS,
  CONSOLE_LEVELS,
  CONSOLE_LINE_FADE_MS,
  CONSOLE_LINE_SHOWN_MS,
  CONSOLE_MAX_LINES,
  CONSOLE_MODE_CEILING_MS,
  CONSOLE_PANEL_ID,
  CONSOLE_PANEL_LINES,
  CONSOLE_TOP_ROOM,
  SHOWCASE_FRAME_ROOT_ID,
  getConsoleScript,
} from './index.js';

// #region Stubbed page

/**
 * Height of a line of the stubbed console panel, in pixels
 */
const _LINE_HEIGHT = 18;

/**
 * Height of the stubbed console panel's log: its lines, and its padding
 */
const _LOG_HEIGHT = CONSOLE_PANEL_LINES * _LINE_HEIGHT + 8;

/**
 * Height the stubbed console panel adds to the page while alone: its margin, its border and its log
 */
const _ALONE_HEIGHT = 9 + _LOG_HEIGHT;

/**
 * Height of the console panel while open: its border, its header bar with its border, and its log
 */
const _OPEN_HEIGHT = 26 + _LOG_HEIGHT;

/**
 * Represents the state shared by a stubbed page's nodes
 */
interface _Page {
  /**
   * The focused element, if any
   */
  focused?: _FakeElement;
  /**
   * Height of the page's content, without the console panel, in pixels
   */
  height: number;
  /**
   * `<body>`'s computed `min-height`
   */
  minHeight: string;
}

/**
 * Represents a node of the stubbed document
 */
class _FakeNode {
  public parentNode: _FakeElement | null = null;
  public childNodes: _FakeNode[] = [];
  public connected = false;
  public constructor(
    public nodeType: number,
    public nodeName: string,
    public text = '',
  ) {}
  public get textContent(): string {
    return this.text + this.childNodes.map((child) => child.textContent).join('');
  }
  public set textContent(value: string) {
    this.text = value;
    this.childNodes = [];
  }
  public get isConnected(): boolean {
    let node: _FakeNode | null = this.parentNode;
    while (node && !node.connected) node = node.parentNode;
    return this.connected || !!node;
  }
  public contains(node: _FakeNode | null | undefined): boolean {
    for (let current = node; current; current = current.parentNode) if (current === this) return true;
    return false;
  }
}

/**
 * Represents an element of the stubbed document
 */
class _FakeElement extends _FakeNode {
  public className = '';
  public hidden = false;
  public scrollTop = 0;
  public style: Record<string, string> = {};
  public shadow: _FakeElement | undefined;
  public attributes = new Map<string, string>();
  public listeners = new Map<string, (() => void)[]>();
  public classList = { add: (name: string) => void (this.className = `${this.className} ${name}`) };
  public constructor(
    tagName: string,
    private _page: _Page,
  ) {
    super(1, tagName);
  }
  public get children(): _FakeElement[] {
    return this.childNodes.filter((child): child is _FakeElement => child instanceof _FakeElement);
  }
  public get activeElement(): _FakeElement | null {
    return this._page.focused && this.contains(this._page.focused) ? this._page.focused : null;
  }
  public appendChild<TNode extends _FakeNode>(child: TNode): TNode {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  public get firstChild(): _FakeNode | null {
    return this.childNodes[0] ?? null;
  }
  public insertBefore<TNode extends _FakeNode>(child: TNode, before: _FakeNode | null): TNode {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    const index = before ? this.childNodes.indexOf(before) : -1;
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
    return child;
  }
  public removeChild<TNode extends _FakeNode>(child: TNode): TNode {
    this.childNodes = this.childNodes.filter((node) => node !== child);
    child.parentNode = null;
    return child;
  }
  public attachShadow(): _FakeElement {
    this.shadow = new _FakeElement('#shadow-root', this._page);
    this.shadow.parentNode = this;
    return this.shadow;
  }
  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  public hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  public removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  public addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  public click(): void {
    this.listeners.get('click')?.forEach((listener) => listener());
  }
  public focus(): void {
    this._page.focused = this;
  }
  public get clientHeight(): number {
    return this.className === 'log' ? _LOG_HEIGHT : 0;
  }
  public get scrollHeight(): number {
    return this.className === 'log' ? Math.max(_LOG_HEIGHT, this.children.length * _LINE_HEIGHT + 8) : 0;
  }
}

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
 * Represents a stubbed `MutationObserver`, called by hand
 */
class _FakeObserver {
  public static last: _FakeObserver | undefined;
  public observed = false;
  public disconnected = false;
  public constructor(public callback: (records: unknown[]) => void) {
    _FakeObserver.last = this;
  }
  public observe(): void {
    this.observed = true;
  }
  public disconnect(): void {
    this.disconnected = true;
  }
}

/**
 * Represents the options of a stubbed showcase frame
 */
interface _RunOptions {
  /**
   * Whether the page holds the console panel's element (default: true)
   */
  withPanel?: boolean;
  /**
   * The document's `readyState` as the script starts (default: `interactive`)
   */
  readyState?: 'loading' | 'interactive' | 'complete';
  /**
   * Whether the window has a `MutationObserver` (default: true)
   */
  observer?: boolean;
}

/**
 * Creates a stubbed showcase frame `window` whose `<body>` holds the showcase frame root and the console panel's element, runs the console script in
 * it, and gives the handles a test drives it through; timers are Vitest's fake timers
 * @param options The stubbed showcase frame's options
 * @returns The stubbed frame and its handles
 */
function _run(options: _RunOptions = {}) {
  const page: _Page = { height: 100, minHeight: '0px' };
  const create = (tag: string) => new _FakeElement(tag.toUpperCase(), page);
  const body = create('body');
  body.connected = true;
  const root = body.appendChild(create('div'));
  const host = create('div');
  host.hidden = true;
  if (options.withPanel !== false) body.appendChild(host);
  body.appendChild(create('script'));
  const original: [string, unknown[]][] = [];
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const documentListeners = new Map<string, (() => void)[]>();
  const growths: number[] = [];
  const console: Record<string, unknown> = Object.fromEntries(CONSOLE_LEVELS.map((level) => [level, (...values: unknown[]) => original.push([level, values])]));
  _FakeObserver.last = undefined;
  const window = {
    document: {
      body,
      readyState: options.readyState ?? 'interactive',
      documentElement: {
        get scrollHeight() {
          const alone = host.getAttribute('data-mode') === 'alone' && !host.hidden ? _ALONE_HEIGHT : 0;
          return Math.max(page.height + alone, parseFloat(body.style.minHeight ?? '') || 0);
        },
      },
      getElementById: (id: string) => (id === SHOWCASE_FRAME_ROOT_ID ? root : id === CONSOLE_PANEL_ID && host.parentNode ? host : null),
      createElement: create,
      addEventListener: (type: string, listener: () => void) => documentListeners.set(type, [...(documentListeners.get(type) ?? []), listener]),
    },
    console,
    Error,
    Map,
    Set,
    Node: _LoggedNode,
    MutationObserver: options.observer === false ? undefined : _FakeObserver,
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout> | undefined) => clearTimeout(timer),
    getComputedStyle: () => ({ minHeight: page.minHeight }),
    CustomEvent: class {
      public constructor(
        public type: string,
        public init: { detail: number },
      ) {}
    },
    dispatchEvent: (event: { type: string; init: { detail: number } }) => void (event.type === CONSOLE_GROWTH_EVENT && growths.push(event.init.detail)),
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, [...(listeners.get(type) ?? []), listener]),
  };
  new Function('window', getConsoleScript())(window);
  const shadow = host.shadow;
  const find = (parent: _FakeElement | undefined, className: string) => parent?.children.find((child) => child.className === className);
  const panel = find(shadow, 'panel');
  const header = find(panel, 'header');
  const bar = find(shadow, 'bar');
  const dispatch = (type: string, event: unknown) => listeners.get(type)?.forEach((listener) => listener(event));
  return {
    page,
    body,
    root,
    host,
    shadow,
    panel,
    title: find(header, 'title'),
    close: find(header, 'close'),
    log: find(panel, 'log'),
    fading: find(bar, 'fading'),
    counter: find(bar, 'counter'),
    observer: _FakeObserver.last as _FakeObserver | undefined,
    console: console as Record<string, (...values: unknown[]) => void>,
    original,
    growths,
    create,
    dispatch,
    mode: () => host.getAttribute('data-mode'),
    isOpen: () => host.hasAttribute('data-open'),
    // Fires `DOMContentLoaded`
    parsed: () => documentListeners.get('DOMContentLoaded')?.forEach((listener) => listener()),
    // Fires `load`, and lets the grace period pass, so the mode is picked
    load: () => {
      dispatch('load', {});
      vi.advanceTimersByTime(CONSOLE_GRACE_MS);
    },
    // Adds a node to a parent, and tells the observer, as the browser would
    add: (parent: _FakeElement, node: _FakeNode) => {
      parent.appendChild(node);
      _FakeObserver.last?.callback([{ type: 'childList', addedNodes: [node] }]);
      return node;
    },
    // Lists the console panel's lines, as their classes and texts
    lines: () => (find(panel, 'log')?.children ?? []).map((line) => [line.className, line.textContent]),
    // Lists the fading lines' texts
    fadingLines: () => (find(bar, 'fading')?.children ?? []).map((line) => line.textContent),
    // Presses a key in the showcase frame
    press: (key: string) => dispatch('keydown', { key }),
  };
}

// #endregion

describe('adapters/showcase/ts/console', () => {
  // Tests the console script by running its inserted source text (getConsoleScript()) with a stubbed `window`: a document whose `<body>` holds the
  // showcase frame root and the console panel's element, a console whose methods record their calls, a stubbed `MutationObserver` and events
  // driven by hand, and Vitest's fake timers for the grace period, the ceiling and the fading lines.

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Is a self-contained script call, safe inside a <script> element', () => {
    // The function is inlined as source text, so it can't close over the module's names (see AGENTS.md › The console script is self-contained)
    const script = getConsoleScript();
    expect(script).toMatch(/^\(function consoleScript\(/);
    expect(script).toContain(JSON.stringify(CONSOLE_GROWTH_EVENT));
    expect(script).not.toMatch(/<\/script/i);
    expect(script).not.toMatch(/CONSOLE_PANEL_ID|CONSOLE_GROWTH_EVENT|__vite|import/);
  });

  it('Has a fixed height, and keeps its element free of margins, padding and borders', () => {
    const frame = _run();
    const style = frame.shadow?.children.find((child) => child.nodeName === 'STYLE');
    expect(style?.textContent).toContain(`height:calc(${CONSOLE_PANEL_LINES} * 18px + 8px)`);
    expect(frame.host.style).toEqual({ margin: '0', padding: '0', border: '0' });
    expect(frame.panel?.getAttribute('role')).toBe('region');
    expect(frame.fading?.getAttribute('aria-hidden')).toBe('true');
  });

  describe('Picking the mode', () => {
    // Lines wait for the mode, picked once the window has loaded and the grace period has passed, or at the ceiling after `DOMContentLoaded`:
    // alone while nothing has rendered, hidden otherwise.

    it('Keeps lines back until the mode is picked, then shows them alone, still calling the originals', () => {
      const frame = _run();
      frame.console.log('one', 2);
      frame.console.info('info');
      frame.console.warn('warn');
      frame.console.error('error');
      frame.console.debug('debug');
      expect(frame.host.hidden).toBe(true);
      expect(frame.mode()).toBeNull();
      frame.dispatch('load', {});
      vi.advanceTimersByTime(CONSOLE_GRACE_MS - 1);
      expect(frame.mode()).toBeNull();
      vi.advanceTimersByTime(1);
      expect(frame.mode()).toBe('alone');
      expect(frame.host.hidden).toBe(false);
      expect(frame.growths).toEqual([_ALONE_HEIGHT]);
      expect(frame.lines()).toEqual([
        ['line log', 'one 2'],
        ['line info', 'info'],
        ['line warn', 'warn'],
        ['line error', 'error'],
        ['line debug', 'debug'],
      ]);
      expect(frame.original).toEqual([
        ['log', ['one', 2]],
        ['info', ['info']],
        ['warn', ['warn']],
        ['error', ['error']],
        ['debug', ['debug']],
      ]);
    });

    it('Shows nothing alone until the first line, then grows the page once', () => {
      // The frame script doesn't count the panel's own growth as a repeated growth (see AGENTS.md › The frame script stops reporting growth)
      const frame = _run();
      frame.load();
      expect(frame.mode()).toBe('alone');
      expect(frame.host.hidden).toBe(true);
      expect(frame.growths).toEqual([]);
      for (let line = 1; line <= CONSOLE_PANEL_LINES + 2; line++) frame.console.log(line);
      expect(frame.host.hidden).toBe(false);
      expect(frame.growths).toEqual([_ALONE_HEIGHT]);
      expect(frame.log?.scrollTop).toBe((CONSOLE_PANEL_LINES + 2) * _LINE_HEIGHT + 8);
    });

    it('Dispatches no growth when the page is already taller than the panel adds', () => {
      const frame = _run();
      frame.body.style.minHeight = '1000px';
      frame.load();
      frame.console.log('x');
      expect(frame.host.hidden).toBe(false);
      expect(frame.growths).toEqual([]);
    });

    it('Picks the mode at the ceiling when the window never loads', () => {
      const frame = _run({ readyState: 'loading' });
      frame.console.log('x');
      vi.advanceTimersByTime(CONSOLE_MODE_CEILING_MS * 2);
      expect(frame.mode()).toBeNull();
      frame.parsed();
      vi.advanceTimersByTime(CONSOLE_MODE_CEILING_MS - 1);
      expect(frame.mode()).toBeNull();
      vi.advanceTimersByTime(1);
      expect(frame.mode()).toBe('alone');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('Picks the mode after the grace period on a page already loaded', () => {
      const frame = _run({ readyState: 'complete' });
      vi.advanceTimersByTime(CONSOLE_GRACE_MS);
      expect(frame.mode()).toBe('alone');
      // The ceiling's timer is cleared with the pick
      expect(vi.getTimerCount()).toBe(0);
    });

    it('Hides behind the counter when the showcase rendered before the pick, counting earlier lines', () => {
      const frame = _run();
      frame.console.log('one');
      frame.console.log('two');
      frame.add(frame.root, frame.create('div'));
      frame.load();
      expect(frame.mode()).toBe('hidden');
      expect(frame.host.hidden).toBe(false);
      expect(frame.counter?.textContent).toBe('>_ 2');
      // Earlier lines are counted, never replayed as fading lines
      expect(frame.fadingLines()).toEqual([]);
      expect(frame.growths).toEqual([]);
      expect(frame.observer?.disconnected).toBe(true);
    });

    it('Counts content seen and removed before the pick', () => {
      // A loading message shown and removed before the pick still means the showcase renders
      const frame = _run();
      const spinner = frame.add(frame.root, frame.create('div'));
      frame.root.removeChild(spinner);
      frame.load();
      expect(frame.mode()).toBe('hidden');
    });

    it('Scans the page at the pick without a MutationObserver', () => {
      const empty = _run({ observer: false });
      empty.load();
      expect(empty.mode()).toBe('alone');
      const rendered = _run({ observer: false });
      rendered.root.appendChild(rendered.create('canvas'));
      rendered.load();
      expect(rendered.mode()).toBe('hidden');
    });

    it('Judges what counts as rendered', () => {
      // Empty containers outside the showcase frame root (a library's portal) and text inside a style never count (D430, D433)
      const cases: [string, (frame: ReturnType<typeof _run>) => _FakeNode, boolean][] = [
        ['whitespace in the body', (frame) => frame.add(frame.body, new _FakeNode(3, '#text', ' \n ')), false],
        [
          'text in a style in the body',
          (frame) => frame.add(frame.add(frame.body, frame.create('style')) as _FakeElement, new _FakeNode(3, '#text', 'p{}')),
          false,
        ],
        ['an empty div outside the root', (frame) => frame.add(frame.body, frame.create('div')), false],
        ['a line inside the console panel', (frame) => frame.add(frame.host, frame.create('p')), false],
        ['a canvas outside the root', (frame) => frame.add(frame.body, frame.create('canvas')), true],
        ['text outside the root', (frame) => frame.add(frame.body, new _FakeNode(3, '#text', 'Hello')), true],
        [
          'a div with text outside the root',
          (frame) => {
            const div = frame.create('div');
            div.appendChild(new _FakeNode(3, '#text', 'Hi'));
            return frame.add(frame.body, div);
          },
          true,
        ],
        ['an empty span inside the root', (frame) => frame.add(frame.root, frame.create('span')), true],
      ];
      for (const [name, add, rendered] of cases) {
        const frame = _run();
        add(frame);
        frame.load();
        expect([name, frame.mode()]).toEqual([name, rendered ? 'hidden' : 'alone']);
      }
      // Text written into an existing node
      const frame = _run();
      const text = frame.root.appendChild(new _FakeNode(3, '#text', ''));
      text.text = 'Typed';
      frame.observer?.callback([{ type: 'characterData', target: text }]);
      frame.load();
      expect(frame.mode()).toBe('hidden');
    });

    it('Switches from alone to hidden for good when content appears', () => {
      const frame = _run();
      frame.load();
      frame.console.log('x');
      expect(frame.mode()).toBe('alone');
      const content = frame.add(frame.root, frame.create('p'));
      expect(frame.mode()).toBe('hidden');
      expect(frame.observer?.disconnected).toBe(true);
      expect(frame.counter?.hidden).toBe(false);
      expect(frame.counter?.textContent).toBe('>_ 1');
      expect(frame.fadingLines()).toEqual([]);
      frame.root.removeChild(content);
      frame.console.log('y');
      expect(frame.mode()).toBe('hidden');
    });
  });

  describe('Hidden', () => {
    // Once the showcase has rendered: the newest lines fade at the bottom, and the counter opens the whole panel over the showcase.

    /**
     * Runs a stubbed showcase frame whose showcase has rendered, with its mode picked
     * @returns The stubbed frame
     */
    const _hidden = () => {
      const frame = _run();
      frame.add(frame.root, frame.create('div'));
      frame.load();
      return frame;
    };

    it('Shows the newest lines fading, each by its first line, then removes them', () => {
      const frame = _hidden();
      expect(frame.counter?.hidden).toBe(true);
      frame.console.log('one');
      frame.console.log('two\nlines');
      frame.console.warn('three');
      frame.console.log('four');
      expect(frame.fadingLines()).toEqual(['two', 'three', 'four']);
      expect(frame.fading?.children.length).toBe(CONSOLE_FADING_LINES);
      // The line pushed out has its timers cleared: two for each line shown
      expect(vi.getTimerCount()).toBe(2 * CONSOLE_FADING_LINES);
      vi.advanceTimersByTime(CONSOLE_LINE_SHOWN_MS);
      expect(frame.fading?.children.map((line) => line.className)).toEqual(['line log faded', 'line warn faded', 'line log faded']);
      vi.advanceTimersByTime(CONSOLE_LINE_FADE_MS);
      expect(frame.fadingLines()).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      // Every line is still in the panel
      expect(frame.lines().map(([, text]) => text)).toEqual(['one', 'two\nlines', 'three', 'four']);
    });

    it('Counts lines on the counter, red with unseen errors until opened', () => {
      const frame = _hidden();
      frame.console.log('one');
      expect(frame.counter?.textContent).toBe('>_ 1');
      expect(frame.counter?.className).toBe('counter');
      expect(frame.counter?.getAttribute('aria-label')).toBe('Open the console: 1 line');
      frame.console.error('bad');
      expect(frame.counter?.textContent).toBe('>_ 2 · 1 error');
      expect(frame.counter?.className).toBe('counter errors');
      frame.console.error('worse');
      expect(frame.counter?.textContent).toBe('>_ 3 · 2 errors');
      expect(frame.counter?.getAttribute('aria-label')).toBe('Open the console: 3 lines, 2 errors');
      frame.counter?.click();
      frame.close?.click();
      expect(frame.counter?.textContent).toBe('>_ 3');
      expect(frame.counter?.className).toBe('counter');
    });

    it('Opens over the showcase from the counter, and closes by its button or Escape, moving focus', () => {
      const frame = _hidden();
      frame.console.log('one');
      frame.console.log('two');
      frame.press('Escape');
      expect(frame.isOpen()).toBe(false);
      frame.counter?.click();
      expect(frame.isOpen()).toBe(true);
      expect(frame.title?.textContent).toBe('Console · 2 lines');
      expect(frame.close?.getAttribute('aria-label')).toBe('Close the console');
      expect(frame.page.focused).toBe(frame.close);
      expect(frame.fadingLines()).toEqual([]);
      // Lines logged while open don't fade: they are seen
      frame.console.error('three');
      expect(frame.fadingLines()).toEqual([]);
      expect(frame.title?.textContent).toBe('Console · 3 lines');
      frame.press('Escape');
      expect(frame.isOpen()).toBe(false);
      expect(frame.page.focused).toBe(frame.counter);
      expect(frame.counter?.textContent).toBe('>_ 3');
      frame.counter?.click();
      frame.close?.click();
      expect(frame.isOpen()).toBe(false);
    });

    it('Leaves room at the top while open', () => {
      // The open panel never covers the code pane's cycling button over the showcase frame's top-right corner
      const frame = _hidden();
      const style = frame.shadow?.children.find((child) => child.nodeName === 'STYLE');
      expect(style?.textContent).toContain(`max-height:calc(100vh - ${CONSOLE_TOP_ROOM}px)`);
    });

    it('Grows a shorter page to fit the open panel and the room above it, and restores its own minimum height', () => {
      const frame = _hidden();
      frame.console.log('x');
      frame.body.style.minHeight = '50px';
      frame.page.minHeight = '50px';
      frame.counter?.click();
      expect(frame.body.style.minHeight).toBe(`${_OPEN_HEIGHT + CONSOLE_TOP_ROOM}px`);
      expect(frame.growths).toEqual([_OPEN_HEIGHT + CONSOLE_TOP_ROOM - frame.page.height]);
      frame.close?.click();
      expect(frame.body.style.minHeight).toBe('50px');
      // A taller page is left alone
      frame.page.height = 1000;
      frame.counter?.click();
      expect(frame.body.style.minHeight).toBe('50px');
      expect(frame.growths).toEqual([_OPEN_HEIGHT + CONSOLE_TOP_ROOM - 100]);
    });

    it('Opens by itself on the first uncaught error after rendering, once per load, never taking focus', () => {
      const frame = _hidden();
      frame.dispatch('error', { error: new Error('thrown'), message: 'Uncaught Error: thrown' });
      expect(frame.isOpen()).toBe(true);
      expect(frame.page.focused).toBeUndefined();
      frame.close?.click();
      frame.dispatch('unhandledrejection', { reason: 'again' });
      frame.dispatch('error', { error: new Error('again'), message: 'Uncaught Error: again' });
      expect(frame.isOpen()).toBe(false);
      expect(frame.counter?.textContent).toBe('>_ 3 · 2 errors');
      // A console.error never opens it
      const logged = _hidden();
      logged.console.error('logged');
      expect(logged.isOpen()).toBe(false);
    });

    it('Opens by itself when an uncaught error came before the showcase was found rendered', () => {
      const frame = _run();
      frame.dispatch('error', { error: new Error('early'), message: 'Uncaught Error: early' });
      frame.add(frame.root, frame.create('div'));
      frame.load();
      expect(frame.mode()).toBe('hidden');
      expect(frame.isOpen()).toBe(true);
      // Shown alone, an early error needs no opening
      const alone = _run();
      alone.dispatch('error', { error: new Error('early'), message: 'Uncaught Error: early' });
      alone.load();
      expect(alone.mode()).toBe('alone');
      expect(alone.isOpen()).toBe(false);
    });
  });

  it('Keeps the newest lines only, saying how many were dropped, still counting every line', () => {
    const frame = _run();
    frame.add(frame.root, frame.create('div'));
    frame.load();
    for (let line = 1; line <= CONSOLE_MAX_LINES; line++) frame.console.log(line);
    expect(frame.lines()).toHaveLength(CONSOLE_MAX_LINES);
    frame.console.log('one more');
    expect(frame.lines()).toHaveLength(CONSOLE_MAX_LINES + 1);
    expect(frame.lines()[0]).toEqual(['line debug dropped', '… 1 earlier line dropped']);
    expect(frame.lines()[1]).toEqual(['line log', '2']);
    frame.console.log('and another');
    frame.console.error('and an error');
    expect(frame.lines()[0]).toEqual(['line debug dropped', '… 3 earlier lines dropped']);
    expect(frame.lines()[1]).toEqual(['line log', '4']);
    expect(frame.lines().at(-1)).toEqual(['line error', 'and an error']);
    expect(frame.lines()).toHaveLength(CONSOLE_MAX_LINES + 1);
    expect(frame.counter?.textContent).toBe(`>_ ${CONSOLE_MAX_LINES + 3} · 1 error`);
    frame.counter?.click();
    expect(frame.title?.textContent).toBe(`Console · ${CONSOLE_MAX_LINES + 3} lines`);
  });

  it('Follows new lines only while scrolled to the bottom', () => {
    const frame = _run();
    frame.load();
    for (let line = 1; line <= 20; line++) frame.console.log(line);
    expect(frame.log?.scrollTop).toBe(20 * _LINE_HEIGHT + 8);
    if (frame.log) frame.log.scrollTop = 0;
    frame.console.log('more');
    expect(frame.log?.scrollTop).toBe(0);
  });

  it('Does nothing in the panel once the showcase detaches it, never throwing', () => {
    // A showcase replacing `document.body`'s content detaches the console panel's element
    const frame = _run();
    frame.load();
    frame.body.removeChild(frame.host);
    frame.console.log('x');
    expect(frame.original).toEqual([['log', ['x']]]);
    expect(frame.lines()).toEqual([]);
  });

  it('Does nothing on a page without the console panel', () => {
    const frame = _run({ withPanel: false });
    frame.console.log('x');
    expect(frame.original).toEqual([['log', ['x']]]);
    expect(frame.lines()).toEqual([]);
  });

  it('Shows values readably', () => {
    const frame = _run();
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
    expect(frame.lines().map(([, text]) => text)).toEqual([
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

  it('Lists uncaught errors and rejected promises', () => {
    const frame = _run();
    const error = new Error('thrown');
    error.stack = 'Error: thrown\n    at showcase.ts:3';
    frame.dispatch('error', { error, message: 'Uncaught Error: thrown' });
    frame.dispatch('error', { error: 'a string', message: 'Uncaught a string' });
    frame.dispatch('error', { error: undefined, message: '' });
    frame.dispatch('unhandledrejection', { reason: error });
    frame.dispatch('unhandledrejection', { reason: { code: 7 } });
    expect(frame.lines()).toEqual([
      ['line error', 'Uncaught Error: thrown\n    at showcase.ts:3'],
      ['line error', 'Uncaught a string'],
      ['line error', 'Uncaught undefined'],
      ['line error', 'Uncaught (in promise) Error: thrown\n    at showcase.ts:3'],
      ['line error', 'Uncaught (in promise) {\n  "code": 7\n}'],
    ]);
  });
});
