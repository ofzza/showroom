/**
 * Showcase builds: building every showcase of a host repository into its showcase frame, in memory, with its showcase adapter, and adding the frame
 * script to each showcase frame page; checking what showcase adapters return, and placing their errors in the documentation. Used by `check
 * --showcases` and `build`. Node code, internal, never re-exported.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ShowcaseAdapter, ShowcaseBuildError, ShowcaseBuildFile } from '../adapters/showcase/index.js';
import { createShowcaseAdapter, loadCustomShowcaseAdapters } from '../adapters/showcase/registry/index.js';
import type { CheckIssue } from '../cli/check/index.js';
import { CONFIGURATION_FILE_NAME, type Configuration } from '../configuration/index.js';
import { getFrameScript } from '../frame/index.js';
import type { HostInformation, Showcase, VirtualFile } from '../host/index.js';
import { getFolder } from '../markdown/index.js';

// #region Showcase frames

/**
 * Represents a built showcase frame, in memory: its files, with the frame script in its page
 */
export interface ShowcaseFrame {
  /**
   * POSIX-style path of the showcase frame's folder, relative to the output folder (see getShowcaseFrameFolder())
   */
  folder: string;
  /**
   * POSIX-style path of the showcase frame's page among its files
   */
  page: string;
  /**
   * Files of the showcase frame, by POSIX-style path relative to its folder; the page's content is a string
   */
  files: ShowcaseBuildFile[];
  /**
   * POSIX-style paths, relative to the host repository's root, of the files the build read
   */
  reads: string[];
}

/**
 * Name of the folder of the output folder holding every showcase frame
 */
export const SHOWCASE_FRAMES_FOLDER = 'showcases';

/**
 * Gets the folder of a showcase's showcase frame: `showcases/<documentation file's path>/<n>`, `<n>` being the showcase's position in its
 * documentation file (the part of its id after the last `#`)
 * @param showcase The showcase
 * @returns POSIX-style path of the folder, relative to the output folder
 */
export function getShowcaseFrameFolder(showcase: Pick<Showcase, 'id' | 'documentation'>): string {
  return `${SHOWCASE_FRAMES_FOLDER}/${showcase.documentation}/${showcase.id.slice(showcase.id.lastIndexOf('#') + 1)}`;
}

/**
 * Gets the URL of a showcase frame's page, relative to the showroom's page, each path segment URL-encoded
 * @param frame The showcase frame
 * @returns The relative URL
 */
export function getShowcaseFrameUrl(frame: Pick<ShowcaseFrame, 'folder' | 'page'>): string {
  return `${frame.folder}/${frame.page}`.split('/').map(encodeURIComponent).join('/');
}

// #endregion

// #region Frame script insertion

/**
 * Finds the end of an HTML tag, skipping `>` inside quoted attribute values
 * @param html The HTML
 * @param start Index of the tag's `<`
 * @returns Index right after the tag's `>`, or -1 if the tag never ends
 */
function _getTagEnd(html: string, start: number): number {
  let quote: string | undefined;
  for (let index = start + 1; index < html.length; index++) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index + 1;
    }
  }
  return -1;
}

/**
 * Skips whitespace and comments in HTML
 * @param html The HTML
 * @param start Index to start at
 * @returns Index of the first character that is neither, or the end of the HTML (also when a comment never ends)
 */
function _skipSpaceAndComments(html: string, start: number): number {
  let index = start;
  while (index < html.length) {
    if (/\s/.test(html[index])) {
      index++;
    } else if (html.startsWith('<!--', index)) {
      const end = html.indexOf('-->', index + 4);
      if (end < 0) return html.length;
      index = end + 3;
    } else {
      break;
    }
  }
  return index;
}

/**
 * Inserts a script into a showcase frame page, as early as it can run: after the page's prolog (a byte order mark, whitespace, comments, the
 * doctype, an optional `<html …>`, then an optional `<head …>`), and after a `<meta charset>` right after it; a page without one there gets
 * `<meta charset="utf-8">` before the script. The script never goes before the doctype.
 * @param html The page
 * @param script Source text of the script
 * @returns The page with the script
 */
export function insertFrameScript(html: string, script: string): string {
  let at = html.charCodeAt(0) === 0xfeff ? 1 : 0;
  /**
   * Moves past a tag at the next position that isn't whitespace or a comment, if it matches
   * @param pattern Pattern of the tag's start
   * @returns True if it moved
   */
  const skipTag = (pattern: RegExp): boolean => {
    const start = _skipSpaceAndComments(html, at);
    if (!pattern.test(html.slice(start, start + 10))) return false;
    const end = _getTagEnd(html, start);
    if (end < 0) return false;
    at = end;
    return true;
  };
  skipTag(/^<!doctype/i);
  skipTag(/^<html(?=[\s/>]|$)/i);
  skipTag(/^<head(?=[\s/>]|$)/i);
  let charset = '<meta charset="utf-8">';
  const start = _skipSpaceAndComments(html, at);
  if (/^<meta\s/i.test(html.slice(start, start + 6))) {
    const end = _getTagEnd(html, start);
    if (end >= 0 && /\scharset\s*=/i.test(html.slice(start, end))) {
      at = end;
      charset = '';
    }
  }
  return `${html.slice(0, at)}${charset}<script>${script}</script>${html.slice(at)}`;
}

// #endregion

// #region Build results

/**
 * Checks if a path in a build result is a relative, POSIX-style path: not empty, with no `\`, drive letter, leading `/`, empty segment, `.` or `..`
 * @param path The path
 * @returns True if it is one
 */
export function isValidBuildPath(path: unknown): path is string {
  if (typeof path !== 'string' || !path || path.includes('\\') || /^[a-z]:/i.test(path)) return false;
  return path.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

/**
 * Checks if a line in a build error is one: a whole number from 1
 * @param line The line
 * @returns True if it is one
 */
function _isLine(line: unknown): line is number {
  return typeof line === 'number' && Number.isInteger(line) && line >= 1;
}

/**
 * Represents a showcase adapter's build result, once checked
 */
type _CheckedResult = { page: string; files: ShowcaseBuildFile[]; reads: string[] } | { errors: ShowcaseBuildError[]; reads: string[] } | { problem: string };

/**
 * Checks a showcase adapter's build result: build errors each with a message; or files with valid, unique (case-insensitively) paths, string or
 * byte content, and a page among them that is an `.html` or `.htm` file
 * @param result The build result, as the showcase adapter returned it
 * @returns The result, its page's content decoded as UTF-8 when given as bytes; or the problem with it
 */
export function checkBuildResult(result: unknown): _CheckedResult {
  if (typeof result !== 'object' || result === null) return { problem: 'it is not an object' };
  const { page, files, reads = [], errors } = result as Record<string, unknown>;
  if (!Array.isArray(reads) || !reads.every((path) => typeof path === 'string')) return { problem: '"reads" must be a list of paths' };
  if (errors !== undefined) {
    if (!Array.isArray(errors) || !errors.length) return { problem: '"errors" must be a list of build errors, not empty' };
    if (!errors.every((error) => typeof error === 'object' && error !== null && typeof error.message === 'string')) {
      return { problem: 'every build error must have a message' };
    }
    return { errors: errors as ShowcaseBuildError[], reads };
  }
  if (!Array.isArray(files)) return { problem: '"files" must be a list of files' };
  const seen = new Set<string>();
  for (const file of files as Record<string, unknown>[]) {
    if (typeof file !== 'object' || file === null || !isValidBuildPath(file.path)) {
      return { problem: `invalid file path ${JSON.stringify((file as Record<string, unknown> | null)?.path)}: use a relative, POSIX-style path` };
    }
    if (seen.has(file.path.toLowerCase())) return { problem: `the file path "${file.path}" is not unique` };
    seen.add(file.path.toLowerCase());
    if (typeof file.content !== 'string' && !(file.content instanceof Uint8Array)) return { problem: `the file "${file.path}" has no content` };
  }
  if (typeof page !== 'string' || !(files as ShowcaseBuildFile[]).some((file) => file.path === page)) {
    return { problem: `the page ${JSON.stringify(page)} is not among the files` };
  }
  if (!/\.html?$/i.test(page)) return { problem: `the page "${page}" must be an .html or .htm file` };
  const decoded = (files as ShowcaseBuildFile[]).map((file) =>
    file.path === page && typeof file.content !== 'string' ? { path: file.path, content: new TextDecoder().decode(file.content) } : file,
  );
  return { page, files: decoded, reads };
}

// #endregion

// #region Build errors

/**
 * Gets the check issue of a showcase's build error, placed where the error is: in a virtual file, at its documentation file's fence's line plus the
 * error's line; in a real file, there; otherwise (no path, or an invalid one), at the showcase's entry point. Its message names the showcase and its
 * entry point's location.
 * @param showcase The showcase
 * @param virtualFiles Virtual files of the host repository
 * @param error The build error
 * @returns The check issue, an error
 */
export function getBuildErrorIssue(
  showcase: Showcase,
  virtualFiles: VirtualFile[],
  error: Pick<ShowcaseBuildError, 'message'> & Partial<ShowcaseBuildError>,
): CheckIssue {
  const message = `Showcase ${showcase.id} (${showcase.documentation}:${showcase.line}): ${error.message}`;
  const line = _isLine(error.line) ? error.line : undefined;
  if (isValidBuildPath(error.path)) {
    const virtualFile = virtualFiles.find((file) => file.path === error.path);
    if (virtualFile) {
      return { severity: 'error', message, path: virtualFile.documentation, line: virtualFile.line + (line ?? 0) };
    }
    return { severity: 'error', message, path: error.path, ...(line ? { line } : {}) };
  }
  return { severity: 'error', message, path: showcase.documentation, line: showcase.line };
}

// #endregion

// #region Build

/**
 * Represents the options of building the showcases
 */
export interface BuildShowcasesOptions {
  /**
   * Path of the host repository's root
   */
  root: string;
  /**
   * Host information of a passed check, with the showcases' validated options
   */
  host: HostInformation;
  /**
   * Configuration of the host repository, listing its custom showcase adapters
   */
  configuration: Configuration;
}

/**
 * Represents the outcome of building the showcases: every showcase frame, by showcase id; or the issues that prevented building some
 */
export type BuildShowcasesResult = { frames: Map<string, ShowcaseFrame>; issues?: undefined } | { frames?: undefined; issues: CheckIssue[] };

/**
 * Builds every showcase of a host repository with its showcase adapter, one at a time, each with a scratch folder of its own inside one temporary
 * folder per run (removed afterwards), and adds the frame script to each showcase frame page. Custom showcase adapters are loaded again, so the
 * run gets fresh showcase adapter objects, each closed at its end.
 * @param options What to build
 * @returns The showcase frames, or every issue found
 */
export async function buildShowcases({ root, host, configuration }: BuildShowcasesOptions): Promise<BuildShowcasesResult> {
  const issues: CheckIssue[] = [];
  const frames = new Map<string, ShowcaseFrame>();
  const absoluteRoot = resolve(root);
  const script = getFrameScript();

  // Load the custom showcase adapters
  const custom = await loadCustomShowcaseAdapters(root, configuration.customShowcaseAdapters ?? {});
  issues.push(...custom.errors.map((message) => ({ severity: 'error' as const, message, path: CONFIGURATION_FILE_NAME })));
  const adapters = new Map<string, ShowcaseAdapter>(custom.adapters);

  const scratch = await mkdtemp(join(tmpdir(), 'showroom-showcases-'));
  try {
    for (const [index, showcase] of host.showcases.entries()) {
      const fail = (error: Pick<ShowcaseBuildError, 'message'> & Partial<ShowcaseBuildError>) =>
        void issues.push(getBuildErrorIssue(showcase, host.virtualFiles, error));

      // Its showcase adapter
      if (!adapters.has(showcase.adapter)) {
        const adapter = createShowcaseAdapter(showcase.adapter);
        if (adapter) adapters.set(showcase.adapter, adapter);
      }
      const adapter = adapters.get(showcase.adapter);
      if (!adapter) {
        fail({ message: `Showcase adapter "${showcase.adapter}" is not available` });
        continue;
      }

      // Its build
      const folder = getFolder(showcase.documentation);
      const scratchFolder = join(scratch, String(index + 1));
      await mkdir(scratchFolder);
      let result: unknown;
      try {
        result = await adapter.build({
          root: absoluteRoot,
          showcase: { ...showcase },
          options: showcase.options,
          virtualFiles: host.virtualFiles.filter((file) => getFolder(file.path) === folder),
          scratchFolder,
        });
      } catch (err) {
        fail({ message: `Showcase adapter "${showcase.adapter}" failed to build the showcase: ${(err as Error).message}` });
        continue;
      }
      const checked = checkBuildResult(result);
      if ('problem' in checked) {
        fail({ message: `Showcase adapter "${showcase.adapter}" returned an invalid build result: ${checked.problem}` });
      } else if ('errors' in checked) {
        checked.errors.forEach(fail);
      } else {
        const files = checked.files.map((file) =>
          file.path === checked.page ? { path: file.path, content: insertFrameScript(file.content as string, script) } : file,
        );
        frames.set(showcase.id, { folder: getShowcaseFrameFolder(showcase), page: checked.page, files, reads: checked.reads });
      }
    }
  } finally {
    // Let every showcase adapter clean up
    for (const [name, adapter] of adapters) {
      try {
        await adapter.close?.();
      } catch (err) {
        issues.push({ severity: 'error', message: `Showcase adapter "${name}" failed to close: ${(err as Error).message}` });
      }
    }
    await rm(scratch, { recursive: true, force: true });
  }
  return issues.length ? { issues } : { frames };
}

// #endregion
