/**
 * Tests of the showcase application's theme
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { webDarkTheme, webLightTheme } from '@fluentui/react-components';
import { THEME_STORAGE_KEY, getInitialTheme, getTheme, storeTheme } from './index.js';

/**
 * Stubs the browser's `window`, with its storage and colour scheme preference
 * @param options What the stub holds: the stored theme, the preferred colour scheme, and whether storage or `matchMedia` throw
 * @returns The stubbed storage's items
 */
function _stubWindow(options: { stored?: string; dark?: boolean; storageThrows?: boolean; matchMediaThrows?: boolean }): Map<string, string> {
  const items = new Map<string, string>(options.stored === undefined ? [] : [[THEME_STORAGE_KEY, options.stored]]);
  const localStorage = {
    getItem: (key: string) => {
      if (options.storageThrows) throw new Error('blocked');
      return items.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (options.storageThrows) throw new Error('blocked');
      items.set(key, value);
    },
  };
  const matchMedia = (query: string) => {
    if (options.matchMediaThrows) throw new Error('unsupported');
    return { matches: query === '(prefers-color-scheme: dark)' && !!options.dark };
  };
  vi.stubGlobal('window', { localStorage, matchMedia });
  return items;
}

describe('app/theme', () => {
  // Tests the theme functions with a stubbed `window` (its `localStorage` and `matchMedia`), and without any, as when rendering on the server.

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Gets FluentUI's web themes", () => {
    expect(getTheme('light')).toBe(webLightTheme);
    expect(getTheme('dark')).toBe(webDarkTheme);
  });

  it('Starts light outside a browser', () => {
    expect(getInitialTheme()).toBe('light');
  });

  it("Starts from the toggle's stored choice", () => {
    _stubWindow({ stored: 'dark' });
    expect(getInitialTheme()).toBe('dark');
    _stubWindow({ stored: 'light', dark: true });
    expect(getInitialTheme()).toBe('light');
  });

  it('Starts from the preferred colour scheme without a valid stored choice', () => {
    _stubWindow({ dark: true });
    expect(getInitialTheme()).toBe('dark');
    _stubWindow({ stored: 'purple', dark: false });
    expect(getInitialTheme()).toBe('light');
  });

  it('Never breaks when storage or matchMedia throw', () => {
    _stubWindow({ storageThrows: true, dark: true });
    expect(getInitialTheme()).toBe('dark');
    expect(() => storeTheme('dark')).not.toThrow();
    _stubWindow({ storageThrows: true, matchMediaThrows: true });
    expect(getInitialTheme()).toBe('light');
  });

  it("Stores the toggle's choice", () => {
    const items = _stubWindow({});
    storeTheme('dark');
    expect(items.get(THEME_STORAGE_KEY)).toBe('dark');
  });
});
