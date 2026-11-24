/**
 * The navigation: resolving `showroom.json`'s `navigation` against the documentation files (Node-free); used by the configuration's validation and
 * by check, never re-exported
 */

import ignore from 'ignore';
import type { NavigationEntry } from '../configuration/index.js';
import type { DocumentationFile, NavigationItem } from '../host/index.js';
import { isAbsoluteUrl } from '../markdown/index.js';

// #region Paths

/**
 * Path naming the home page in the navigation, whether or not the host repository has a root `README`
 */
export const NAVIGATION_HOME_PATH = '/';

/**
 * Checks if a navigation item's path is an absolute URL (it has a scheme, e.g. `https:`, or is protocol-relative)
 * @param path Path of a navigation item
 * @returns True if the path is an absolute URL
 */
export function isNavigationUrl(path: string): boolean {
  return isAbsoluteUrl(path);
}

/**
 * Schemes a navigation item's absolute URL may have; a protocol-relative URL is allowed too
 */
export const NAVIGATION_URL_SCHEMES: readonly string[] = ['http:', 'https:', 'mailto:'];

/**
 * Checks if a navigation item's absolute URL has an allowed scheme (see NAVIGATION_URL_SCHEMES), case-insensitively, or is protocol-relative, so no
 * item runs a script (`javascript:`) or opens a document of another kind (`data:`, `file:`)
 * @param url The absolute URL
 * @returns True if it is allowed
 */
export function isAllowedNavigationUrl(url: string): boolean {
  if (url.startsWith('//')) return true;
  const scheme = /^[a-z][a-z\d+.-]*:/i.exec(url)?.[0].toLowerCase();
  return scheme !== undefined && NAVIGATION_URL_SCHEMES.includes(scheme);
}

/**
 * Checks if a navigation item's path is a `.gitignore`-style pattern, standing for every documentation file it matches (it holds `*`, `?` or `[`)
 * @param path Path of a navigation item, not an absolute URL
 * @returns True if the path is a pattern
 */
export function isNavigationGlob(path: string): boolean {
  return /[*?[]/.test(path);
}

// #endregion

// #region Resolution

/**
 * Represents an issue found resolving the navigation: an error or a warning, about `showroom.json` (no `path`) or about a documentation file the
 * navigation leaves out (its `path`)
 */
export interface NavigationIssue {
  /**
   * Severity of the issue
   */
  severity: 'error' | 'warning';
  /**
   * Description of the issue
   */
  message: string;
  /**
   * Path of the documentation file the issue concerns, if it concerns one rather than `showroom.json`
   */
  path?: string;
}

/**
 * Represents the outcome of resolving the navigation
 */
export interface NavigationResolution {
  /**
   * The resolved items (a group whose patterns matched nothing left out)
   */
  items: NavigationItem[];
  /**
   * The issues found, in the items' order, then the documentation files left out, in path order
   */
  issues: NavigationIssue[];
}

/**
 * Represents what resolving the navigation reads about the host repository
 */
export interface NavigationHost {
  /**
   * Documentation files, sorted by path, with their first headings
   */
  documentation: readonly DocumentationFile[];
  /**
   * Ids of each Markdown documentation file's headings, by its path
   */
  headingIds: ReadonlyMap<string, readonly string[]>;
  /**
   * Name of the project, labelling the home page when it has no `title` and no root `README` heading
   */
  projectName: string;
}

/**
 * Represents a page's path split into its documentation file's path and its anchor
 */
interface _PagePath {
  /**
   * The path, without its anchor and a leading `./`
   */
  path: string;
  /**
   * The anchor, if the path has one
   */
  anchor?: string;
}

/**
 * Resolves `showroom.json`'s `navigation`: each page's path matched to a documentation file as a route is (case-insensitively, `/` and the root
 * `README` naming the home page), labelled by its `title` or its documentation file's first heading (else its path); each pattern expanded into a page
 * per documentation file it matches, in path order, skipping those the navigation lists explicitly anywhere, and those an earlier pattern took
 * @param entries The navigation, as validated
 * @param host What the resolution reads about the host repository
 * @returns The resolved items, and the issues found
 */
export function resolveNavigation(entries: readonly NavigationEntry[], host: NavigationHost): NavigationResolution {
  const { documentation, headingIds, projectName } = host;
  const issues: NavigationIssue[] = [];
  const rootReadme = documentation.find((file) => file.kind === 'readme' && !file.path.includes('/'));
  const find = (path: string): DocumentationFile | 'home' | undefined => {
    if (path === NAVIGATION_HOME_PATH) return 'home';
    const lowerCase = path.toLowerCase();
    const file = documentation.find((candidate) => candidate.path === path) ?? documentation.find((candidate) => candidate.path.toLowerCase() === lowerCase);
    return file && file === rootReadme ? 'home' : file;
  };
  const keyOf = (file: DocumentationFile | 'home'): string => (file === 'home' ? '' : file.path);

  // The documentation files listed explicitly anywhere, which patterns skip
  const explicit = new Set<string>();
  const collect = (items: readonly NavigationEntry[]): void =>
    items.forEach((item) => {
      if (item.items) return collect(item.items);
      if (isNavigationUrl(item.path) || isNavigationGlob(item.path)) return;
      const file = find(_splitPagePath(item.path).path);
      if (file) explicit.add(keyOf(file));
    });
  collect(entries);

  // The items, in order
  const listed = new Set<string>();
  const listings = new Set<string>();
  const page = (file: DocumentationFile | 'home', at: string, title?: string, anchor?: string): NavigationItem => {
    const key = keyOf(file);
    const target = file === 'home' ? rootReadme : file;
    const name = file === 'home' ? NAVIGATION_HOME_PATH : file.path;
    // A page listed again under another anchor is no duplicate; the same page and anchor twice (or twice without one) is
    const listing = `${key}#${anchor ?? ''}`;
    if (listings.has(listing)) {
      const shown = anchor !== undefined ? `${name}#${anchor}` : name;
      issues.push({ severity: 'warning', message: `"navigation" item ${at}: "${shown}" is listed more than once` });
    }
    listings.add(listing);
    listed.add(key);
    if (anchor !== undefined && !(target && headingIds.get(target.path)?.includes(anchor))) {
      issues.push({ severity: 'warning', message: `"navigation" item ${at}: "${name}" has no heading "#${anchor}"` });
    }
    const label = title ?? target?.heading ?? (file === 'home' ? projectName : file.path);
    return { kind: 'page', label, path: key, ...(anchor !== undefined ? { anchor } : {}) };
  };
  const taken = new Set<string>();
  const resolve = (items: readonly NavigationEntry[], position: string): NavigationItem[] =>
    items.flatMap((item, index): NavigationItem[] => {
      const at = `${position}${index + 1}`;
      if (item.items) {
        const children = resolve(item.items, `${at}.`);
        return children.length ? [{ kind: 'group', label: item.title, items: children, ...(item.collapsed ? { collapsed: true as const } : {}) }] : [];
      }
      if (isNavigationUrl(item.path)) return [{ kind: 'url', label: item.title ?? item.path, url: item.path }];
      const { path, anchor } = _splitPagePath(item.path);
      if (isNavigationGlob(path)) {
        const matcher = ignore().add(path);
        const files = documentation.filter((file) => matcher.ignores(file.path) && !explicit.has(keyOf(find(file.path)!)) && !taken.has(file.path));
        if (!files.length)
          issues.push({ severity: 'warning', message: `"navigation" item ${at}: "${path}" matches no documentation file the navigation doesn't already list` });
        files.forEach((file) => taken.add(file.path));
        return files.map((file) => page(find(file.path)!, at, undefined, anchor));
      }
      const file = find(path);
      if (!file) {
        issues.push({ severity: 'error', message: `"navigation" item ${at}: "${path}" is not a documentation file` });
        return [];
      }
      return [page(file, at, item.title, anchor)];
    });
  const resolved = resolve(entries, '');

  // The documentation files left out
  for (const file of documentation) {
    if (!listed.has(keyOf(find(file.path)!))) {
      issues.push({ severity: 'warning', message: 'Not listed in showroom.json\'s "navigation", so the navigation leaves it out', path: file.path });
    }
  }
  return { items: resolved, issues };
}

/**
 * Splits a page's path into its documentation file's path, without a leading `./`, and its anchor
 * @param path Path of a navigation item, not an absolute URL
 * @returns The path and the anchor
 */
function _splitPagePath(path: string): _PagePath {
  const hash = path.indexOf('#');
  const file = (hash === -1 ? path : path.slice(0, hash)).replace(/^(\.\/)+/, '');
  return hash === -1 ? { path: file } : { path: file, anchor: path.slice(hash + 1) };
}

// #endregion
