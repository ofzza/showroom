/**
 * The `html` showcase adapter: its entry point is an HTML page or fragment, built without following its relative references (they are neither
 * resolved nor copied), next to the resources of its documentation file's folder and its included files; it takes no options and needs nothing
 * from the host repository. Internal, never re-exported.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Showcase } from '../../../host/index.js';
import { getFolder } from '../../../markdown/index.js';
import type { ShowcaseAdapter, ShowcaseBuildError, ShowcaseBuildFile, ShowcaseBuildRequest, ShowcaseBuildResult, ShowcaseValidation } from '../index.js';

/**
 * Represents the `html` showcase adapter
 */
export class HtmlShowcaseAdapter implements ShowcaseAdapter {
  /**
   * Validates a showcase: it takes no options, its entry point must be an `html` or `htm` code block, or a linked `.html` or `.htm` file, and its
   * included files must be inside its entry point's folder, none where the page goes (`index.html`, in any case)
   * @param showcase The showcase
   * @returns No options, or the errors found
   */
  public validate(showcase: Showcase): ShowcaseValidation {
    const errors: string[] = [];
    if ('options' in showcase) {
      errors.push('The html showcase adapter takes no options');
    }
    if (!/\.html?$/i.test(showcase.entry)) {
      errors.push(
        showcase.kind === 'code-block'
          ? 'The html showcase adapter needs an "html" or "htm" code block'
          : `The html showcase adapter needs a link to an .html or .htm file, not "${showcase.entry}"`,
      );
    }
    for (const path of showcase.include) {
      const placed = _getPlacedPath(showcase, path);
      if (placed === undefined) {
        errors.push(`The html showcase adapter can't include "${path}": it must be inside the entry point's folder ("${getFolder(showcase.entry) || '.'}")`);
      } else if (placed.toLowerCase() === HTML_PAGE) {
        errors.push(`The html showcase adapter can't include "${path}": it would replace the showcase frame's page`);
      }
    }
    return errors.length ? { errors } : { errors: [] };
  }

  /**
   * Builds a showcase's showcase frame: its entry point as the page, a fragment wrapped into a complete page, every resource of its documentation
   * file's folder next to it, under its name, whether the page uses it or not, and its included files, at their paths relative to the entry point's
   * folder (a virtual file from memory, any other read from disk as it is); a code block showcase's entry point comes from its virtual file, a
   * linked one is read from disk as UTF-8. A resource named like the page, an included file landing where a resource does (unless it is that
   * resource), and an included file that can't be read fail the build. Its reads are the files read from disk, and the documentation files holding
   * the virtual files it uses.
   * @param request What to build
   * @returns The showcase frame's page and resources, or the build errors
   */
  public async build({ root, showcase, virtualFiles, hostVirtualFiles }: ShowcaseBuildRequest): Promise<ShowcaseBuildResult> {
    let content: string;
    let reads: string[];
    if (showcase.kind === 'code-block') {
      reads = [showcase.documentation];
      const file = virtualFiles.find((virtualFile) => virtualFile.path === showcase.entry);
      if (!file) {
        return { reads, errors: [{ message: `The entry point's virtual file "${showcase.entry}" is missing` }] };
      }
      content = file.content;
    } else {
      reads = [showcase.entry];
      try {
        content = await readFile(join(root, showcase.entry), 'utf8');
      } catch (err) {
        return { reads, errors: [{ message: `The entry point can't be read: ${(err as Error).message}`, path: showcase.entry }] };
      }
    }
    const resources = virtualFiles.filter((file) => file.kind === 'resource');
    reads = [...new Set([...reads, ...resources.map((file) => file.documentation)])];
    const clashing = resources.filter((file) => _getName(file.path).toLowerCase() === HTML_PAGE);
    if (clashing.length) {
      return {
        reads,
        errors: clashing.map((file) => ({ message: `The resource "${_getName(file.path)}" would replace the showcase frame's page`, path: file.path })),
      };
    }

    // The included files, next to the page as they sit next to the entry point
    const files: ShowcaseBuildFile[] = [
      { path: HTML_PAGE, content: isHtmlPage(content) ? content : wrapHtmlFragment(content) },
      ...resources.map((file) => ({ path: _getName(file.path), content: file.content })),
    ];
    const errors: ShowcaseBuildError[] = [];
    for (const path of showcase.include) {
      const placed = _getPlacedPath(showcase, path) ?? path;
      const resource = resources.find((file) => _getName(file.path).toLowerCase() === placed.toLowerCase());
      if (resource?.path === path) continue; // The resource itself, copied already
      if (resource) {
        errors.push({ message: `The included file "${path}" would land where the resource "${resource.path}" does ("${placed}")`, path });
        continue;
      }
      const virtual = hostVirtualFiles.find((file) => file.path === path);
      if (virtual) {
        reads = [...new Set([...reads, virtual.documentation])];
        files.push({ path: placed, content: virtual.content });
        continue;
      }
      reads = [...new Set([...reads, path])];
      try {
        files.push({ path: placed, content: new Uint8Array(await readFile(join(root, path))) });
      } catch (err) {
        errors.push({ message: `The included file can't be read: ${(err as Error).message}`, path });
      }
    }
    return errors.length ? { reads, errors } : { page: HTML_PAGE, files, reads };
  }
}

/**
 * Gets where an included file goes in a showcase frame: its path relative to the entry point's folder
 * @param showcase The showcase
 * @param path POSIX-style path of the included file, relative to the root
 * @returns Its path relative to the entry point's folder, or undefined if it isn't inside that folder
 */
function _getPlacedPath(showcase: Showcase, path: string): string | undefined {
  const folder = getFolder(showcase.entry);
  if (!folder) return path;
  return path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : undefined;
}

/**
 * Gets a virtual file's name: the last segment of its POSIX-style path
 * @param path The virtual file's path
 * @returns Its name
 */
function _getName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

// #region Pages and fragments

/**
 * Path of the page the html showcase adapter builds, in its showcase frame's folder
 */
export const HTML_PAGE = 'index.html';

/**
 * Skips whitespace and comments in HTML
 * @param html The HTML
 * @param start Index to start at
 * @returns Index of the first character that is neither, the end of the HTML, or -1 when a comment is never closed
 */
export function skipHtmlSpaceAndComments(html: string, start: number): number {
  let index = start;
  while (index < html.length) {
    if (/\s/.test(html[index])) {
      index++;
    } else if (html.startsWith('<!--', index)) {
      const end = html.indexOf('-->', index + 4);
      if (end < 0) return -1;
      index = end + 3;
    } else {
      break;
    }
  }
  return index;
}

/**
 * Checks if an html entry point is a complete page: after a byte order mark, whitespace and comments, it starts with `<!doctype`, `<html`, `<head`
 * or `<?xml`, in any case
 * @param html Content of the entry point
 * @returns True for a page, false for a fragment
 */
export function isHtmlPage(html: string): boolean {
  const start = skipHtmlSpaceAndComments(html, html.charCodeAt(0) === 0xfeff ? 1 : 0);
  return start >= 0 && /^(<!doctype|<\?xml|<html(?=[\s/>]|$)|<head(?=[\s/>]|$))/i.test(html.slice(start, start + 9));
}

/**
 * Wraps an HTML fragment into a complete page: UTF-8, with a viewport for mobile devices
 * @param html The fragment
 * @returns The page
 */
export function wrapHtmlFragment(html: string): string {
  const fragment = html.charCodeAt(0) === 0xfeff ? html.slice(1) : html;
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    `<body>${fragment}</body></html>`
  );
}

// #endregion
