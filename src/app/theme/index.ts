/**
 * The showcase application's theme: FluentUI's built-in light and dark themes, starting from the browser's preference, with the toggle's choice kept in
 * `localStorage`. Every access to `window` is guarded or in an effect, so the application also renders on the server.
 */

import { useEffect } from 'react';
import { webDarkTheme, webLightTheme, type Theme } from '@fluentui/react-components';

// #region Themes

/**
 * Represents the name of a theme
 */
export type ThemeName = 'light' | 'dark';

/**
 * Key under which the toggle's choice of theme is kept in `localStorage`
 */
export const THEME_STORAGE_KEY = 'tsshowcase-theme';

/**
 * Gets the FluentUI theme of a theme name
 * @param name Name of the theme
 * @returns FluentUI's web light or dark theme
 */
export function getTheme(name: ThemeName): Theme {
  return name === 'dark' ? webDarkTheme : webLightTheme;
}

/**
 * Gets the theme to start with: the toggle's earlier choice if one is kept, otherwise the browser's `prefers-color-scheme`, and light when neither can be
 * read (e.g. on the server, or when storage is blocked)
 * @returns Name of the theme
 */
export function getInitialTheme(): ThemeName {
  if (typeof window === 'undefined') {
    return 'light';
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // Storage can be unavailable (e.g. blocked site data); fall back to the browser's preference
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Keeps the toggle's choice of theme in `localStorage`, ignoring storage that is unavailable
 * @param name Name of the theme
 */
export function storeTheme(name: ThemeName): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch {
    // Storage can be unavailable; the choice then only lasts until the page is reloaded
  }
}

/**
 * Styles the page's `body` for a theme: no margin, and the theme's background, so the page follows the theme everywhere
 * @param name Name of the theme
 */
export function useBodyStyle(name: ThemeName): void {
  useEffect(() => {
    const theme = getTheme(name);
    document.body.style.margin = '0';
    document.body.style.background = theme.colorNeutralBackground1;
    document.body.style.colorScheme = name;
  }, [name]);
}

// #endregion
