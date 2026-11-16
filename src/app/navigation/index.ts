/**
 * The showroom's navigation: the one `showroom.json` configures, resolved by check; or the default one, README (the home page), CONTRIBUTING and
 * LICENSE, then a page per other documentation file, labelled by its first heading
 */

import type { DocumentationFile, DocumentationKind, NavigationItem } from '../../host/index.js';
import { getRootReadme, isRootReadme } from '../host/index.js';
import { formatRoute } from '../routing/index.js';

// #region Navigation

/**
 * Represents an item of the navigation as the showroom shows it: a page, an absolute URL, or a group of items
 */
export type ShownNavigationItem =
  | {
      kind: 'page';
      /**
       * Label of the item
       */
      label: string;
      /**
       * URL hash the item leads to, with its anchor
       */
      href: string;
      /**
       * URL hash of the item's page, without its anchor, to tell whether it is the current page
       */
      route: string;
      /**
       * The heading id the item leads to, if any, to tell which of a page's items is the current one
       */
      anchor?: string;
      /**
       * POSIX-style path of the item's documentation file (the root `README`'s for the home page, if there is one), shown as its tooltip
       */
      path?: string;
    }
  | {
      kind: 'url';
      /**
       * Label of the item
       */
      label: string;
      /**
       * The absolute URL the item leads to, opened in a new tab
       */
      href: string;
    }
  | {
      kind: 'group';
      /**
       * Caption of the group
       */
      label: string;
      /**
       * The group's items
       */
      items: ShownNavigationItem[];
    };

/**
 * Label of the home page's item in the default navigation, whether or not the host repository has a root `README`
 */
export const HOME_LABEL = 'README';

/**
 * Labels of the root's built-in documentation files other than the `README`, in their order in the default navigation, whatever their file names
 * (e.g. `CONTRIBUTE.md`, `licence.txt`)
 */
const _ROOT_LABELS: [DocumentationKind, string][] = [
  ['contribute', 'CONTRIBUTING'],
  ['license', 'LICENSE'],
];

/**
 * Gets the navigation items: the navigation `showroom.json` configures, if any; otherwise the default one, README (the home page), then the root's
 * CONTRIBUTING and LICENSE files, then every other documentation file in the order given, labelled by its first heading, or by its path where it has
 * none or another item has the same label. The root `README` is only shown on the home page.
 * @param documentation Documentation files, sorted by path
 * @param navigation The navigation `showroom.json` configures, as check resolved it; undefined for the default one
 * @returns The navigation items
 */
export function getNavigationItems(documentation: DocumentationFile[], navigation?: NavigationItem[]): ShownNavigationItem[] {
  const rootReadme = getRootReadme(documentation);
  const home = (label: string, anchor?: string): ShownNavigationItem => ({
    kind: 'page',
    label,
    href: formatRoute(undefined, anchor),
    route: formatRoute(),
    ...(anchor !== undefined ? { anchor } : {}),
    ...(rootReadme ? { path: rootReadme.path } : {}),
  });
  const page = (label: string, path: string, anchor?: string): ShownNavigationItem => ({
    kind: 'page',
    label,
    href: formatRoute(path, anchor),
    route: formatRoute(path),
    ...(anchor !== undefined ? { anchor } : {}),
    path,
  });
  if (navigation) {
    const show = (items: NavigationItem[]): ShownNavigationItem[] =>
      items.map((item) => {
        if (item.kind === 'group') return { kind: 'group', label: item.label, items: show(item.items) };
        if (item.kind === 'url') return { kind: 'url', label: item.label, href: item.url };
        return item.path ? page(item.label, item.path, item.anchor) : home(item.label, item.anchor);
      });
    return show(navigation);
  }
  const isRoot = (file: DocumentationFile) => !file.path.includes('/');
  const labelled = _ROOT_LABELS.flatMap(([kind, label]) => documentation.filter((file) => isRoot(file) && file.kind === kind).map((file) => ({ file, label })));
  const rest = documentation
    .filter((file) => !isRootReadme(file) && !labelled.some((item) => item.file === file))
    .map((file) => ({ file, label: file.heading ?? file.path }));
  const labels = [HOME_LABEL, ...labelled.map(({ label }) => label), ...rest.map(({ label }) => label)];
  const unique = (label: string) => labels.indexOf(label) === labels.lastIndexOf(label);
  return [
    home(HOME_LABEL),
    ...labelled.map(({ file, label }) => page(label, file.path)),
    ...rest.map(({ file, label }) => page(unique(label) ? label : file.path, file.path)),
  ];
}

/**
 * Gets the current item of the navigation: of the page shown's items, the one whose anchor the route names, else the first without an anchor, else
 * the first
 * @param items The navigation items
 * @param current URL hash of the page shown, without its anchor, or undefined if no item is
 * @param anchor The route's anchor, if it has one
 * @returns URL hash the current item leads to, or undefined if no item is the page shown's
 */
export function getCurrentItemHref(items: ShownNavigationItem[], current: string | undefined, anchor?: string): string | undefined {
  if (current === undefined) return undefined;
  const flatten = (list: ShownNavigationItem[]): Extract<ShownNavigationItem, { kind: 'page' }>[] =>
    list.flatMap((item) => (item.kind === 'group' ? flatten(item.items) : item.kind === 'page' && item.route === current ? [item] : []));
  const pages = flatten(items);
  const item = (anchor !== undefined ? pages.find((page) => page.anchor === anchor) : undefined) ?? pages.find((page) => page.anchor === undefined) ?? pages[0];
  return item?.href;
}

/**
 * Checks if a navigation item is, or holds, the current item
 * @param item A navigation item
 * @param current URL hash the current item leads to (getCurrentItemHref()), or undefined if no item is
 * @returns True if the item is the current one, or a group holding it
 */
export function holdsCurrentItem(item: ShownNavigationItem, current: string | undefined): boolean {
  if (current === undefined) return false;
  if (item.kind === 'group') return item.items.some((child) => holdsCurrentItem(child, current));
  return item.kind === 'page' && item.href === current;
}

/**
 * Checks if a navigation group is expanded: it is, unless it was collapsed, and expands again once the current item changes to one of its items
 * @param group The group
 * @param collapsedOn URL hash the current item led to when the group was collapsed (in an object, as it can be undefined), or null if it wasn't
 * @param current URL hash the current item leads to (getCurrentItemHref()), or undefined if no item is
 * @returns True if the group is expanded
 */
export function isNavigationGroupExpanded(group: ShownNavigationItem, collapsedOn: { page?: string } | null, current: string | undefined): boolean {
  return collapsedOn === null || (holdsCurrentItem(group, current) && collapsedOn.page !== current);
}
