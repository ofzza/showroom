/**
 * Tests of the console panel's script
 */

import { describe, expect, it } from 'vitest';
import { CONSOLE_GROWTH_EVENT } from '../../../../frame/index.js';
import { CONSOLE_LEVELS, CONSOLE_PANEL_ID, CONSOLE_PANEL_MAX_LINES, getConsoleScript } from './index.js';

/**
 * Height of a line of the stubbed console panel, in pixels
 */
const _LINE_HEIGHT = 18;

/**
 * Represents an element of the stubbed document
 */
class _FakeElement {
  public className = '';
  public textContent = '';
  public hidden = false;
  public scrollTop = 0;
  public children: _FakeElement[] = [];
  public shadow: _FakeElement | undefined;
  public constructor(public tagName: string) {}
  public appendChild(child: _FakeElement): _FakeElement {
    this.children.push(child);
    return child;
  }
  public attachShadow(): _FakeElement {
    this.shadow = new _FakeElement('#shadow-root');
    return this.shadow;
  }
  public get scrollHeight(): number {
    return this.children.length * _LINE_HEIGHT;
  }
  public getBoundingClientRect() {
    // The console panel's element is as high as its lines, up to its maximum height
    const panel = this.shadow?.children.find((child) => child.className === 'panel');
    return { height: this.hidden || !panel ? 0 : Math.min(panel.children.length, CONSOLE_PANEL_MAX_LINES) * _LINE_HEIGHT };
  }
}

/**
 * Represents a DOM node a showcase logs, as the stubbed `window.Node` constructs it
 */
class _FakeNode {
  public constructor(
    public nodeType: number,
    public nodeName: string,
    public tagName = nodeName,
    public id = '',
    public className = '',
  ) {}
}

/**
 * Creates a stubbed showcase frame `window` holding the console panel's element, runs the console script in it, and gives the handles a test
 * drives it through
 * @param withPanel Whether the page holds the console panel's element
 * @returns The stubbed frame and its handles
 */
function _run(withPanel = true) {
  const host = new _FakeElement('DIV');
  host.hidden = true;
  const original: [string, unknown[]][] = [];
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const growths: number[] = [];
  const console: Record<string, unknown> = Object.fromEntries(CONSOLE_LEVELS.map((level) => [level, (...values: unknown[]) => original.push([level, values])]));
  const window = {
    document: {
      getElementById: (id: string) => (withPanel && id === CONSOLE_PANEL_ID ? host : null),
      createElement: (tag: string) => new _FakeElement(tag.toUpperCase()),
    },
    console,
    Error,
    Map,
    Set,
    Node: _FakeNode,
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
  const panel = host.shadow?.children.find((child) => child.className === 'panel');
  return {
    host,
    panel,
    console: console as Record<string, (...values: unknown[]) => void>,
    original,
    growths,
    dispatch: (type: string, event: unknown) => listeners.get(type)?.forEach((listener) => listener(event)),
    lines: () => (panel?.children ?? []).map((line) => [line.className, line.textContent]),
  };
}

describe('adapters/showcase/ts/console', () => {
  // Tests the console script by running its inserted source text (getConsoleScript()) with a stubbed `window`: a document holding the console
  // panel's element, a console whose methods record their calls, and listeners driven by hand.

  it('Is a self-contained script call, safe inside a <script> element', () => {
    // The function is inlined as source text, so it can't close over the module's names (see AGENTS.md › The console script is self-contained)
    const script = getConsoleScript();
    expect(script).toMatch(/^\(function consoleScript\(/);
    expect(script).toContain(JSON.stringify(CONSOLE_GROWTH_EVENT));
    expect(script).not.toMatch(/<\/script/i);
    expect(script).not.toMatch(/CONSOLE_PANEL_ID|CONSOLE_GROWTH_EVENT|__vite|import/);
  });

  it('Stays hidden until the first line, then lists each call, styled by its level, still calling the originals', () => {
    const frame = _run();
    expect(frame.host.hidden).toBe(true);
    expect(frame.host.shadow?.children.map((child) => child.tagName)).toEqual(['STYLE', 'DIV']);
    expect(frame.lines()).toEqual([]);
    frame.console.log('one', 2);
    frame.console.info('info');
    frame.console.warn('warn');
    frame.console.error('error');
    frame.console.debug('debug');
    expect(frame.host.hidden).toBe(false);
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
      new _FakeNode(1, 'BUTTON', 'BUTTON', 'go', 'primary'),
      new _FakeNode(3, '#text'),
      { node: new _FakeNode(1, 'P', 'P') },
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

  it('Has a maximum height, follows the newest line, and tells the frame script how much it grew', () => {
    // The frame script doesn't count the panel's own growth as a repeated growth (see AGENTS.md › The frame script stops reporting growth)
    const frame = _run();
    const style = frame.host.shadow?.children.find((child) => child.tagName === 'STYLE');
    expect(style?.textContent).toContain(`max-height:calc(${CONSOLE_PANEL_MAX_LINES} * 18px + 8px);overflow:auto`);
    for (let line = 1; line <= CONSOLE_PANEL_MAX_LINES + 2; line++) frame.console.log(line);
    expect(frame.growths).toEqual(Array.from({ length: CONSOLE_PANEL_MAX_LINES }, () => _LINE_HEIGHT));
    expect(frame.panel?.scrollTop).toBe((CONSOLE_PANEL_MAX_LINES + 2) * _LINE_HEIGHT);
  });

  it('Does nothing on a page without the console panel', () => {
    const frame = _run(false);
    frame.console.log('x');
    expect(frame.original).toEqual([['log', ['x']]]);
    expect(frame.lines()).toEqual([]);
  });
});
