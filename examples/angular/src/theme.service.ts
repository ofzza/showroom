/**
 * A service reading the theme a page is shown in: the showroom's, from the `data-showroom-theme` attribute of `<html>`, or the system's outside it
 */

import { Injectable, signal } from '@angular/core';

/**
 * Represents a theme
 */
export type Theme = 'light' | 'dark';

/**
 * Reads the current theme
 * @returns The showroom's theme, or the system's
 */
function _readTheme(): Theme {
  const attribute = document.documentElement.getAttribute('data-showroom-theme');
  if (attribute === 'light' || attribute === 'dark') return attribute;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Provides the current theme, following its changes, once for the whole application
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /**
   * The current theme
   */
  private readonly _theme = signal(_readTheme());

  /**
   * The current theme, read only
   */
  readonly theme = this._theme.asReadonly();

  /**
   * Creates the service, following the theme for as long as the page lives
   */
  constructor() {
    new MutationObserver(() => this._theme.set(_readTheme())).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-showroom-theme'],
    });
  }
}
