/**
 * The showcase application's navigation: Home, then a page per documentation file
 */

import type { DocumentationFile } from '../../host/index.js';
import { isRootReadme } from '../host/index.js';
import { formatRoute } from '../routing/index.js';

// #region Navigation

/**
 * Represents an item of the navigation
 */
export interface NavigationItem {
  /**
   * Label of the item: `Home`, or the documentation file's full path
   */
  label: string;
  /**
   * URL hash of the item's page
   */
  href: string;
  /**
   * POSIX-style path of the item's documentation file, or undefined for the home page
   */
  path?: string;
}

/**
 * Gets the navigation items: Home, then every documentation file other than the root `README` (which is only shown on the home page), in the order given
 * @param documentation Documentation files, sorted by path
 * @returns The navigation items
 */
export function getNavigationItems(documentation: DocumentationFile[]): NavigationItem[] {
  return [
    { label: 'Home', href: formatRoute() },
    ...documentation.filter((file) => !isRootReadme(file)).map((file) => ({ label: file.path, href: formatRoute(file.path), path: file.path })),
  ];
}

// #endregion
