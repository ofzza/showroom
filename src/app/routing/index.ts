/**
 * The showcase application's hash router: routes are read from, and written to, the URL's hash, so the application works on static hosting under any path
 */

import { useSyncExternalStore } from 'react';
import type { DocumentationFile } from '../../host/index.js';
import { findDocumentationFile, isRootReadme } from '../host/index.js';

// #region Routes

/**
 * Represents a route parsed from the URL's hash
 */
export type Route =
  | {
      /**
       * The home page
       */
      page: 'home';
      /**
       * Id of the heading to scroll to
       */
      anchor?: string;
    }
  | {
      /**
       * A documentation file's page
       */
      page: 'documentation';
      /**
       * POSIX-style path of the documentation file, relative to the host repository's root
       */
      path: string;
      /**
       * Id of the heading to scroll to
       */
      anchor?: string;
    }
  | {
      /**
       * The not-found page, for a hash that isn't a route
       */
      page: 'not-found';
    };

/**
 * Represents the page a route shows, once it is matched against the documentation files
 */
export type ResolvedRoute =
  | {
      /**
       * The home page
       */
      page: 'home';
      /**
       * Id of the heading to scroll to
       */
      anchor?: string;
      /**
       * Hash to replace the URL's hash with, when the route isn't the home page's own (e.g. `#/README.md`)
       */
      redirect?: string;
    }
  | {
      /**
       * A documentation file's page
       */
      page: 'documentation';
      /**
       * The documentation file shown
       */
      file: DocumentationFile;
      /**
       * Id of the heading to scroll to
       */
      anchor?: string;
      /**
       * Hash to replace the URL's hash with, when the route matched the file's path only case-insensitively
       */
      redirect?: string;
    }
  | {
      /**
       * The not-found page
       */
      page: 'not-found';
    };

/**
 * Formats a route as a URL hash: `#/` for the home page, `#/<path>` for a documentation file, each followed by `#<anchor>` when there is one
 * @param path POSIX-style path of a documentation file, or undefined for the home page
 * @param anchor Id of a heading to scroll to
 * @returns The URL hash, its path segments and anchor URI-encoded
 */
export function formatRoute(path?: string, anchor?: string): string {
  const encodedPath = path === undefined ? '' : path.split('/').map(encodeURIComponent).join('/');
  return `#/${encodedPath}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
}

/**
 * Parses a URL hash into a route
 * @param hash URL hash, with or without its leading `#`
 * @returns The route: home for an empty hash or `#/`, a documentation file for `#/<path>`, and not-found for anything else
 */
export function parseRoute(hash: string): Route {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (value === '') {
    return { page: 'home' };
  }
  if (!value.startsWith('/')) {
    return { page: 'not-found' };
  }

  // Split off the anchor, which follows a second hash
  const [encodedPath, ...encodedAnchor] = value.slice(1).split('#');
  let path: string;
  let anchor: string | undefined;
  try {
    path = encodedPath.split('/').map(decodeURIComponent).join('/');
    anchor = encodedAnchor.length && encodedAnchor.join('#') ? decodeURIComponent(encodedAnchor.join('#')) : undefined;
  } catch {
    return { page: 'not-found' };
  }

  return path === '' ? { page: 'home', ...(anchor ? { anchor } : {}) } : { page: 'documentation', path, ...(anchor ? { anchor } : {}) };
}

/**
 * Gets the route of a documentation file: the home page's for the root `README`, its own for any other
 * @param file Documentation file
 * @param anchor Id of a heading to scroll to
 * @returns The URL hash of the file's page
 */
export function getDocumentationRoute(file: DocumentationFile, anchor?: string): string {
  return isRootReadme(file) ? formatRoute(undefined, anchor) : formatRoute(file.path, anchor);
}

/**
 * Matches a route against the documentation files, to get the page it shows
 * @param route Route parsed from the URL's hash
 * @param documentation Documentation files
 * @returns The page shown: the home page (redirecting, for the root `README`'s own path), a documentation file's page, or the not-found page
 */
export function resolveRoute(route: Route, documentation: DocumentationFile[]): ResolvedRoute {
  if (route.page !== 'documentation') {
    return route;
  }
  const file = findDocumentationFile(documentation, route.path);
  if (!file) {
    return { page: 'not-found' };
  }
  const anchor = route.anchor ? { anchor: route.anchor } : {};
  if (isRootReadme(file)) {
    return { page: 'home', ...anchor, redirect: formatRoute(undefined, route.anchor) };
  }
  return { page: 'documentation', file, ...anchor, ...(file.path !== route.path ? { redirect: formatRoute(file.path, route.anchor) } : {}) };
}

// #endregion

// #region Location

/**
 * Subscribes to changes of the URL's hash
 * @param onChange Called whenever the hash changes
 * @returns Unsubscribes
 */
function _subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/**
 * Gets the URL's hash in the browser
 * @returns The URL's hash
 */
function _getSnapshot(): string {
  return window.location.hash;
}

/**
 * Gets the URL's hash when rendering on the server, where there is none
 * @returns An empty hash
 */
function _getServerSnapshot(): string {
  return '';
}

/**
 * Gets the URL's hash, rerendering whenever it changes (an empty hash when rendering on the server)
 * @returns The URL's hash
 */
export function useHash(): string {
  return useSyncExternalStore(_subscribe, _getSnapshot, _getServerSnapshot);
}

/**
 * Scrolls to a heading by its id, or to the top of the page without one
 * @param anchor Id of the heading
 */
export function scrollToAnchor(anchor?: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (anchor) {
    document.getElementById(anchor)?.scrollIntoView();
  } else {
    window.scrollTo(0, 0);
  }
}

// #endregion
