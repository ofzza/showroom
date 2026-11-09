/**
 * Link resolution: what a link or image in a documentation file's Markdown points to inside the showcase application
 */

import type { DocumentationFile } from '../../host/index.js';
import { findDocumentationFile, findFolderReadme, getFolder } from '../host/index.js';
import { getDocumentationRoute } from '../routing/index.js';

// #region Links

/**
 * Represents what a link in a documentation file points to
 */
export type ResolvedLink =
  | {
      /**
       * An absolute URL (including `mailto:`), opened unchanged, in a new tab
       */
      kind: 'external';
      /**
       * The URL
       */
      href: string;
    }
  | {
      /**
       * A page of the showcase application
       */
      kind: 'route';
      /**
       * URL hash of the page
       */
      href: string;
      /**
       * Id of the heading the link scrolls to
       */
      anchor?: string;
    }
  | {
      /**
       * Anything else (e.g. a code file), shown as plain text
       */
      kind: 'unresolved';
    };

/**
 * Checks if a URL is absolute: it has a scheme (e.g. `https:`, `mailto:`), or is protocol-relative (`//`)
 * @param url URL
 * @returns True if the URL is absolute
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//');
}

/**
 * Resolves a link in a documentation file's Markdown
 * @param href The link's target, as written in the Markdown
 * @param from The documentation file holding the link
 * @param documentation Documentation files
 * @returns What the link points to: an absolute URL; the page of the documentation file it names, or of the `README` of the folder it names; or
 * nothing in the showcase application
 */
export function resolveLink(href: string, from: DocumentationFile, documentation: DocumentationFile[]): ResolvedLink {
  if (isAbsoluteUrl(href)) {
    return { kind: 'external', href };
  }

  // Split the link into its path and anchor, dropping any query, and URL-decode them
  const hashIndex = href.indexOf('#');
  const encodedPath = (hashIndex < 0 ? href : href.slice(0, hashIndex)).split('?')[0];
  let path: string;
  let anchor: string | undefined;
  try {
    path = decodeURIComponent(encodedPath);
    anchor = hashIndex < 0 || hashIndex === href.length - 1 ? undefined : decodeURIComponent(href.slice(hashIndex + 1));
  } catch {
    return { kind: 'unresolved' };
  }

  // An anchor-only (or empty) link stays on the documentation file holding it
  if (path === '') {
    return _route(from, anchor);
  }

  // Resolve the path against the folder of the file holding the link, or against the root for a path starting with `/`
  const segments = path.startsWith('/') ? [] : getFolder(from.path).split('/').filter(Boolean);
  const parts = path.split('/');
  for (const part of parts) {
    if (part === '..') {
      if (!segments.length) {
        return { kind: 'unresolved' };
      }
      segments.pop();
    } else if (part !== '' && part !== '.') {
      segments.push(part);
    }
  }
  const resolved = segments.join('/');
  const last = parts[parts.length - 1];
  const isFolder = last === '' || last === '.' || last === '..';

  // A documentation file, or a folder whose `README` is one
  const file = (!isFolder && findDocumentationFile(documentation, resolved)) || findFolderReadme(documentation, resolved);
  return file ? _route(file, anchor) : { kind: 'unresolved' };
}

/**
 * Gets the resolved link to a documentation file's page
 * @param file Documentation file
 * @param anchor Id of the heading the link scrolls to
 * @returns The resolved link
 */
function _route(file: DocumentationFile, anchor: string | undefined): ResolvedLink {
  return { kind: 'route', href: getDocumentationRoute(file, anchor), ...(anchor ? { anchor } : {}) };
}

// #endregion
