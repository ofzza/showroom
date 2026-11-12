/**
 * The showroom's navigation: README (the home page), CONTRIBUTING and LICENSE, then a page per other documentation file
 */

import type { DocumentationFile, DocumentationKind } from '../../host/index.js';
import { isRootReadme } from '../host/index.js';
import { formatRoute } from '../routing/index.js';

// #region Navigation

/**
 * Represents an item of the navigation
 */
export interface NavigationItem {
  /**
   * Label of the item: `README` for the home page, `CONTRIBUTING` or `LICENSE` for the root's contribute and license files, or the documentation file's
   * full path for any other
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
 * Label of the home page's navigation item, whether or not the host repository has a root `README`
 */
export const HOME_LABEL = 'README';

/**
 * Labels of the root's built-in documentation files other than the `README`, in their navigation order, whatever their file names (e.g. `CONTRIBUTE.md`,
 * `licence.txt`)
 */
const _ROOT_LABELS: [DocumentationKind, string][] = [
  ['contribute', 'CONTRIBUTING'],
  ['license', 'LICENSE'],
];

/**
 * Gets the navigation items: README (the home page), then the root's CONTRIBUTING and LICENSE files, then every other documentation file by its full
 * path, in the order given. The root `README` is only shown on the home page.
 * @param documentation Documentation files, sorted by path
 * @returns The navigation items
 */
export function getNavigationItems(documentation: DocumentationFile[]): NavigationItem[] {
  const isRoot = (file: DocumentationFile) => !file.path.includes('/');
  const labelled = _ROOT_LABELS.flatMap(([kind, label]) => documentation.filter((file) => isRoot(file) && file.kind === kind).map((file) => ({ file, label })));
  const rest = documentation.filter((file) => !isRootReadme(file) && !labelled.some((item) => item.file === file)).map((file) => ({ file, label: file.path }));
  return [
    { label: HOME_LABEL, href: formatRoute() },
    ...[...labelled, ...rest].map(({ file, label }) => ({ label, href: formatRoute(file.path), path: file.path })),
  ];
}

// #endregion
