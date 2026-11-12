/**
 * The `html` showcase adapter: its entry point is an HTML page or fragment, built alone (its relative references are neither resolved nor copied),
 * next to the resources of its documentation file's folder; it takes no options and needs nothing from the host repository. Internal, never
 * re-exported.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Showcase } from '../../../host/index.js';
import type { ShowcaseAdapter, ShowcaseBuildRequest, ShowcaseBuildResult, ShowcaseValidation } from '../index.js';

/**
 * Represents the `html` showcase adapter
 */
export class HtmlShowcaseAdapter implements ShowcaseAdapter {
  /**
   * Validates a showcase: it takes no options, and its entry point must be an `html` or `htm` code block, or a linked `.html` or `.htm` file
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
        showcase.kind === 'inline'
          ? 'The html showcase adapter needs an "html" or "htm" code block'
          : `The html showcase adapter needs a link to an .html or .htm file, not "${showcase.entry}"`,
      );
    }
    return errors.length ? { errors } : { errors: [] };
  }

  /**
   * Builds a showcase's showcase frame: its entry point as the page, a fragment wrapped into a complete page, and every resource of its
   * documentation file's folder next to it, under its name, whether the page uses it or not; an inline entry point comes from its virtual file, a
   * linked one is read from disk as UTF-8. A resource named like the page fails the build.
   * @param request What to build
   * @returns The showcase frame's page and resources, or the build errors
   */
  public async build({ root, showcase, virtualFiles }: ShowcaseBuildRequest): Promise<ShowcaseBuildResult> {
    let content: string;
    let reads: string[];
    if (showcase.kind === 'inline') {
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
    return {
      page: HTML_PAGE,
      files: [
        { path: HTML_PAGE, content: isHtmlPage(content) ? content : wrapHtmlFragment(content) },
        ...resources.map((file) => ({ path: _getName(file.path), content: file.content })),
      ],
      reads,
    };
  }
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
