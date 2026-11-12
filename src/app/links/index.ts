/**
 * Link resolution: what a link or image in a documentation file's Markdown points to inside the showroom
 */

import type { DocumentationFile } from '../../host/index.js';
import { isAbsoluteUrl, resolvePath, splitLink } from '../../markdown/index.js';
import { findDocumentationFile, findFolderReadme } from '../host/index.js';
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
       * A page of the showroom
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
 * Resolves a link in a documentation file's Markdown
 * @param href The link's target, as written in the Markdown
 * @param from The documentation file holding the link
 * @param documentation Documentation files
 * @returns What the link points to: an absolute URL; the page of the documentation file it names, or of the `README` of the folder it names; or
 * nothing in the showroom
 */
export function resolveLink(href: string, from: DocumentationFile, documentation: DocumentationFile[]): ResolvedLink {
  if (isAbsoluteUrl(href)) {
    return { kind: 'external', href };
  }

  // Split the link into its path and anchor, dropping any query, and URL-decode them
  const target = splitLink(href);
  if (!target) {
    return { kind: 'unresolved' };
  }

  // An anchor-only (or empty) link stays on the documentation file holding it
  if (target.path === '') {
    return _route(from, target.anchor);
  }

  // Resolve the path against the folder of the file holding the link, or against the root for a path starting with `/`
  const resolved = resolvePath(from.path, target.path);
  if (!resolved) {
    return { kind: 'unresolved' };
  }

  // A documentation file, or a folder whose `README` is one
  const file = (!resolved.isFolder && findDocumentationFile(documentation, resolved.path)) || findFolderReadme(documentation, resolved.path);
  return file ? _route(file, target.anchor) : { kind: 'unresolved' };
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
