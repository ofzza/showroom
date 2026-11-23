/**
 * Showcase builds: building every showcase of a host repository into its showcase frame, in memory, or its recording, with its showcase adapter, and
 * adding the frame script to each showcase frame page; the host copy, synced before any build when a showcase adapter uses it; checking what showcase
 * adapters return, a recording's `runtime` check, and placing their errors in the documentation. Used by `check --showcases`, `serve` and `build`.
 * Node code, internal, never re-exported.
 */

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShowcaseAdapter, ShowcaseBuildFile, ShowcaseBuildIssue, ShowcaseConsoleLine, ShowcaseRecording } from '../adapters/showcase/index.js';
import {
  createShowcaseAdapter,
  getShowcaseAdapterEnvironmentNames,
  loadCustomShowcaseAdapters,
  usesMermaidBundle,
} from '../adapters/showcase/registry/index.js';
import type { ShownIssue } from '../app/host/index.js';
import type { CheckIssue } from '../cli/check/index.js';
import { getShowcaseProject, resolveStack } from '../adapters/stack/resolve/index.js';
import { resolveOutputFolder } from '../cli/check/internal/index.js';
import { CONFIGURATION_FILE_NAME, type Configuration } from '../configuration/index.js';
import { getFrameScript } from '../frame/index.js';
import type { HostInformation, Showcase, VirtualFile } from '../host/index.js';
import { createRunSession, type HostCopy, type RunSession } from '../host-copy/index.js';
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
  /**
   * True if its page loads the shared Mermaid bundle (see MERMAID_FOLDER): only a built-in showcase adapter's can (see usesMermaidBundle())
   */
  mermaid?: boolean;
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
 * Name of the query parameter of a showcase frame's URL carrying its content's hash (not `v`, which Vite's dev server treats as a dependency's
 * version, and serves as immutable)
 */
export const HASH_PARAMETER = 'hash';

/**
 * Gets the hash of a showcase frame's content: the SHA-256 of its files, sorted by path, each path and content preceded by its length in bytes
 * @param files Files of the showcase frame, its page with the frame script
 * @returns The first 8 hexadecimal digits of the hash
 */
export function getShowcaseFrameHash(files: readonly ShowcaseBuildFile[]): string {
  const hash = createHash('sha256');
  const encoder = new TextEncoder();
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    for (const part of [encoder.encode(file.path), typeof file.content === 'string' ? encoder.encode(file.content) : file.content]) {
      hash.update(`${part.byteLength}:`);
      hash.update(part);
    }
  }
  return hash.digest('hex').slice(0, 8);
}

/**
 * Gets the URL of a showcase frame's page, relative to the showroom's page, each path segment URL-encoded, with its content's hash as its query,
 * so a changed showcase frame gets a new URL, and a browser never shows a cached earlier page
 * @param frame The showcase frame
 * @returns The relative URL
 */
export function getShowcaseFrameUrl(frame: Pick<ShowcaseFrame, 'folder' | 'page' | 'files'>): string {
  const path = `${frame.folder}/${frame.page}`.split('/').map(encodeURIComponent).join('/');
  return `${path}?${HASH_PARAMETER}=${getShowcaseFrameHash(frame.files)}`;
}

// #endregion

// #region The shared Mermaid bundle

/**
 * Name of the output folder's folder holding the shared Mermaid bundle, beside the showcase frames' folder: emitted by `build`, and served by
 * `serve`, only while a showcase frame uses it
 */
export const MERMAID_FOLDER = 'mermaid';

/**
 * File name of the shared Mermaid bundle's entry point, which a showcase frame's page imports (`npm run build-mermaid` writes it)
 */
export const MERMAID_ENTRY_FILE = 'mermaid.js';

/**
 * Gets the folder of the shared Mermaid bundle inside the package: `dist/mermaid/`, beside the showroom's folder (see getAppDir()), which
 * `npm run build` fills, but a compilation alone (`tsc`) doesn't
 * @returns Path of the folder
 */
export function getMermaidDir(): string {
  return fileURLToPath(new URL('../mermaid/', import.meta.url));
}

/**
 * Gets the hash of the shared Mermaid bundle's entry point, which a page's URL of it carries, so a cached entry point never asks for chunks an
 * upgrade removed
 * @param mermaidDir Folder of the bundle
 * @returns The hash (as getShowcaseFrameHash() gives it for the file alone), or undefined if the bundle is missing
 */
export async function getMermaidHash(mermaidDir: string): Promise<string | undefined> {
  const content = await readFile(join(mermaidDir, MERMAID_ENTRY_FILE)).catch(() => undefined);
  return content && getShowcaseFrameHash([{ path: MERMAID_ENTRY_FILE, content }]);
}

/**
 * Gets the URL of the shared Mermaid bundle's entry point, relative to a showcase frame's page: up from the page's own folder (its showcase frame's
 * folder, then the page's folders) to the output folder's root, so it works in `serve`, in `build` and under any base path
 * @param showcase The showcase
 * @param page POSIX-style path of its page among its showcase frame's files
 * @param hash The hash of the bundle's entry point (see getMermaidHash()); none when the bundle is missing
 * @returns The relative URL, with the hash as its query when given
 */
export function getMermaidUrl(showcase: Pick<Showcase, 'id' | 'documentation'>, page: string, hash: string | undefined): string {
  const depth = getShowcaseFrameFolder(showcase).split('/').length + page.split('/').length - 1;
  return `${'../'.repeat(depth)}${MERMAID_FOLDER}/${MERMAID_ENTRY_FILE}${hash === undefined ? '' : `?${HASH_PARAMETER}=${hash}`}`;
}

/**
 * Module specifier a showcase frame's page imports the shared Mermaid bundle by (`import mermaid from 'showroom-mermaid'`), which the import map
 * buildShowcases() inserts into a showcase frame using the bundle resolves (see getMermaidImportMap())
 */
export const MERMAID_SPECIFIER = 'showroom-mermaid';

/**
 * Gets the import map mapping MERMAID_SPECIFIER to the shared Mermaid bundle's entry point, as an HTML element
 * @param url URL of the bundle's entry point, relative to the page (see getMermaidUrl())
 * @returns The `<script type="importmap">` element, its JSON never closing the element early
 */
export function getMermaidImportMap(url: string): string {
  const json = JSON.stringify({ imports: { [MERMAID_SPECIFIER]: url } }).replace(/</g, '\\u003c');
  return `<script type="importmap">${json}</script>`;
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
 * @param after HTML inserted right after the script (e.g. an import map, see getMermaidImportMap()); none if not given
 * @returns The page with the script
 */
export function insertFrameScript(html: string, script: string, after = ''): string {
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
  return `${html.slice(0, at)}${charset}<script>${script}</script>${after}${html.slice(at)}`;
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
 * Represents a showcase adapter's build result, once checked: its checks and issues (empty when it has none), with its page and files, or its
 * recording, unless an error of the build itself (one naming no check) prevented building it; and warnings about what was left out of it
 */
type _CheckedResult =
  | {
      page?: string;
      files?: ShowcaseBuildFile[];
      recording?: ShowcaseRecording;
      reads: string[];
      checks: string[];
      issues: ShowcaseBuildIssue[];
      warnings: string[];
      problem?: undefined;
    }
  | { problem: string };

/**
 * Name of the check of a recording, which `showroom` adds, and a showcase adapter can't list
 */
export const RUNTIME_CHECK = 'runtime';

/**
 * Levels of a recording's lines
 */
const _RECORDING_LEVELS: readonly unknown[] = ['log', 'info', 'warn', 'error', 'debug'];

/**
 * Most characters of a standard error line a failed recording's reasons quote, before an ellipsis
 */
export const RECORDING_FAILURE_QUOTE_LENGTH = 160;

/**
 * Checks if a value is a count: a whole number from 0
 * @param value The value
 * @returns True if it is one
 */
function _isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Checks a recording's shape: its lines (each with a level and a text), its dropped counts, and how it ended (an exit code, a signal or the time
 * limit, exactly one)
 * @param value The recording
 * @returns The problem with it, if any
 */
export function checkRecording(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return '"recording" must be an object';
  const { lines, dropped, droppedWarnings, droppedErrors, cut, exitCode, signal, timedOut, timeLimit } = value as Record<string, unknown>;
  const isLine = (line: unknown) =>
    typeof line === 'object' &&
    line !== null &&
    _RECORDING_LEVELS.includes((line as ShowcaseConsoleLine).level) &&
    typeof (line as ShowcaseConsoleLine).text === 'string';
  if (!Array.isArray(lines) || !lines.every(isLine)) return '"recording.lines" must be a list of lines, each with a level and a text';
  if (!_isCount(dropped)) return '"recording.dropped" must be a whole number from 0';
  for (const [name, count] of [
    ['droppedWarnings', droppedWarnings],
    ['droppedErrors', droppedErrors],
  ] as const) {
    if (count !== undefined && !_isCount(count)) return `"recording.${name}" must be a whole number from 0`;
  }
  if (cut !== undefined && typeof cut !== 'boolean') return '"recording.cut" must be a boolean';
  if (exitCode !== undefined && !(typeof exitCode === 'number' && Number.isInteger(exitCode))) return '"recording.exitCode" must be a whole number';
  if (signal !== undefined && typeof signal !== 'string') return '"recording.signal" must be a string';
  if (timedOut !== undefined && timedOut !== true) return '"recording.timedOut" must be true, if given';
  if (timeLimit !== undefined && !(typeof timeLimit === 'number' && timeLimit > 0)) return '"recording.timeLimit" must be a positive number';
  if ([exitCode, signal, timedOut].filter((end) => end !== undefined).length !== 1) {
    return 'a recording must end in exactly one of "exitCode", "signal" and "timedOut"';
  }
  return undefined;
}

/**
 * Gets why a recording failed: a non-zero exit code, a signal, the time limit, or anything written to standard error (its `error` lines, dropped
 * ones included, quoting the first one kept (the only one, the first, or the first kept), cut at RECORDING_FAILURE_QUOTE_LENGTH characters)
 * @param recording The recording
 * @returns The reasons, joined, or undefined if it didn't fail
 */
export function getRecordingFailure(recording: ShowcaseRecording): string | undefined {
  const reasons: string[] = [];
  if (recording.timedOut) {
    reasons.push(recording.timeLimit === undefined ? 'stopped by the time limit' : `stopped after the ${recording.timeLimit / 1000} s time limit`);
  } else if (recording.signal !== undefined) {
    reasons.push(`ended by signal ${recording.signal}`);
  } else if (recording.exitCode !== 0) {
    reasons.push(`exited with code ${recording.exitCode}`);
  }
  const errors = recording.lines.filter((line) => line.level === 'error').length + (recording.droppedErrors ?? 0);
  if (errors) {
    const first = recording.lines.find((line) => line.level === 'error')?.text.trim();
    const quote = first ? (first.length > RECORDING_FAILURE_QUOTE_LENGTH ? `${first.slice(0, RECORDING_FAILURE_QUOTE_LENGTH)}…` : first) : undefined;
    const which = errors === 1 ? ':' : recording.droppedErrors ? ', the first kept:' : ', the first:';
    reasons.push(`wrote ${errors} ${errors === 1 ? 'line' : 'lines'} to standard error${quote ? `${which} "${quote}"` : ''}`);
  }
  return reasons.length ? reasons.join(', and ') : undefined;
}

/**
 * Checks if a value is a list of distinct, non-empty strings
 * @param value The value
 * @returns True if it is one
 */
function _isNameList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((name) => typeof name === 'string' && !!name) && new Set(value).size === value.length;
}

/**
 * Checks if a value is a build issue: an object with a severity (`error` or `warning`), a message, and a check that is a string, if it has one
 * @param value The value
 * @returns True if it is one
 */
function _isBuildIssue(value: unknown): value is ShowcaseBuildIssue {
  if (typeof value !== 'object' || value === null) return false;
  const { severity, message, check } = value as Record<string, unknown>;
  return (severity === 'error' || severity === 'warning') && typeof message === 'string' && (check === undefined || typeof check === 'string');
}

/**
 * Checks a showcase adapter's build result: its checks, distinct non-empty names, never `runtime`; its issues, each with a severity, a message, and
 * a check among the checks, if it names one; its files, or its recording from a recorded showcase adapter, left out exactly when an error names no
 * check. Files have valid, unique (case-insensitively) paths, string or byte content, and a page among them that is an `.html` or `.htm` file; a
 * recording has its shape (see checkRecording()). A recorded showcase adapter's files, and another's recording, are left out, with a warning.
 * @param result The build result, as the showcase adapter returned it
 * @param recorded True if the showcase adapter declares `recorded`
 * @returns The result, its page's content decoded as UTF-8 when given as bytes; or the problem with it
 */
export function checkBuildResult(result: unknown, recorded = false): _CheckedResult {
  if (typeof result !== 'object' || result === null) return { problem: 'it is not an object' };
  const { page, files, recording, reads = [], checks = [], issues = [] } = result as Record<string, unknown>;
  if (!Array.isArray(reads) || !reads.every((path) => typeof path === 'string')) return { problem: '"reads" must be a list of paths' };
  if (!_isNameList(checks)) return { problem: '"checks" must be a list of distinct, non-empty names' };
  if (checks.includes(RUNTIME_CHECK)) return { problem: `"checks" can't list "${RUNTIME_CHECK}", which showroom adds for a recording` };
  if (!Array.isArray(issues) || !issues.every(_isBuildIssue)) {
    return { problem: '"issues" must be a list of build issues, each with a severity ("error" or "warning") and a message' };
  }
  const unlisted = issues.find((issue) => issue.check !== undefined && !checks.includes(issue.check));
  if (unlisted) return { problem: `an issue names the check "${unlisted.check}", which "checks" doesn't list` };
  if (recording !== undefined) {
    const problem = checkRecording(recording);
    if (problem) return { problem };
  }
  if (issues.some((issue) => issue.severity === 'error' && issue.check === undefined)) {
    if (files !== undefined || page !== undefined) return { problem: 'an error naming no check means there are no files: leave out "page" and "files"' };
    if (recording !== undefined) return { problem: 'an error naming no check means there is no recording: leave out "recording"' };
    return { reads, checks, issues, warnings: [] };
  }
  if (recorded) {
    if (recording === undefined) return { problem: 'a recorded showcase adapter must return a "recording", unless an error names no check' };
    const warnings = files !== undefined || page !== undefined ? ['a recorded showcase adapter\'s "page" and "files" are left out'] : [];
    return { recording: recording as ShowcaseRecording, reads, checks, issues, warnings };
  }
  const warnings = recording === undefined ? [] : ['the "recording" of a showcase adapter that isn\'t recorded is left out'];
  if (!Array.isArray(files)) return { problem: '"files" must be a list of files, unless an error names no check' };
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
  return { page, files: decoded, reads, checks, issues, warnings };
}

// #endregion

// #region Build errors

/**
 * Gets the check issue of a showcase's build issue, placed where it is: in a virtual file, at its documentation file's fence's line plus the
 * issue's line; in a real file, there; otherwise (no path, or an invalid one), at the showcase's entry point. Its message names the showcase and
 * its entry point's location, then its check, if it names one (`type check: …`), and it keeps its severity and its check.
 * @param showcase The showcase
 * @param virtualFiles Virtual files of the host repository
 * @param issue The build issue
 * @returns The check issue
 */
export function getBuildIssue(showcase: Showcase, virtualFiles: VirtualFile[], issue: ShowcaseBuildIssue): CheckIssue {
  const { severity, check } = issue;
  const message = `Showcase ${showcase.id} (${showcase.documentation}:${showcase.line}): ${check === undefined ? '' : `${check}: `}${issue.message}`;
  const line = _isLine(issue.line) ? issue.line : undefined;
  const checked = check === undefined ? {} : { check };
  if (isValidBuildPath(issue.path)) {
    const virtualFile = virtualFiles.find((file) => file.path === issue.path);
    if (virtualFile) {
      return { severity, message, path: virtualFile.documentation, line: virtualFile.line + (line ?? 0), ...checked };
    }
    return { severity, message, path: issue.path, ...(line ? { line } : {}), ...checked };
  }
  return { severity, message, path: showcase.documentation, line: showcase.line, ...checked };
}

/**
 * Gets the shown issue of a showcase's build issue, as the showcase adapter reported it, for the showroom: its own message, without the command line's
 * prefix; its path and line where its path is valid (a virtual file's own), otherwise at the showcase's entry point, with no line
 * @param showcase The showcase
 * @param issue The build issue
 * @returns The shown issue
 */
export function getShownIssue(showcase: Pick<Showcase, 'entry'>, issue: ShowcaseBuildIssue): ShownIssue {
  const { severity, message, check } = issue;
  const checked = check === undefined ? {} : { check };
  if (!isValidBuildPath(issue.path)) return { severity, message, ...checked, path: showcase.entry };
  return { severity, message, ...checked, path: issue.path, ...(_isLine(issue.line) ? { line: issue.line } : {}) };
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
  /**
   * Mode to build in: `development` in `serve`, `production` (the default) in `build` and `check --showcases`
   */
  mode?: 'development' | 'production';
  /**
   * True if the host repository's code may run, as the check decided (see CheckResult's `trusted`); `false` by default: no showcase is built, no
   * custom showcase adapter loaded, and nothing is reported, as the check warned already
   */
  trust?: boolean;
  /**
   * The run session holding the host copy and the showcases' own folders, kept across `serve`'s runs; one of its own, removed at the end, if not
   * given
   */
  session?: RunSession;
  /**
   * Output folder given on the command line, overriding the configuration's, which the host copy leaves out
   */
  outDir?: string;
  /**
   * Folder of the shared Mermaid bundle, whose entry point's hash the import map of a showcase frame using it carries (see getMermaidImportMap());
   * the package's if not given (see getMermaidDir())
   */
  mermaidDir?: string;
}

/**
 * Represents the outcome of building the showcases
 */
export interface BuildShowcasesResult {
  /**
   * The showcase frames of the showcases that built, by showcase id: those whose result has files, whether their checks found errors or not
   */
  frames: Map<string, ShowcaseFrame>;
  /**
   * The errors of the showcases that have any, of their build or their checks, by showcase id, each placed where it is in the documentation
   */
  errors: Map<string, CheckIssue[]>;
  /**
   * The warnings of the showcases, built or not, in showcase order, each placed where it is in the documentation; they fail nothing
   */
  warnings: CheckIssue[];
  /**
   * The issues of each showcase, built or not, errors and warnings, by showcase id, as the showroom shows them (see getShownIssue()); empty for a
   * showcase without issues
   */
  shownIssues: Map<string, ShownIssue[]>;
  /**
   * The checks each showcase's build ran to completion, by showcase id (empty for a showcase whose build ran none); `runtime` for a recording
   */
  checks: Map<string, string[]>;
  /**
   * The recordings of the recorded showcases that built, by showcase id
   */
  recordings: Map<string, ShowcaseRecording>;
  /**
   * The issues of the run that belong to no single showcase: a custom showcase adapter that doesn't load, one failing to close
   */
  issues: CheckIssue[];
  /**
   * POSIX-style paths, relative to the host repository's root, of the files to watch for changes: every showcase's reads, whether it built or not,
   * and the custom showcase adapter modules `showroom.json` lists; sorted, without duplicates
   */
  watched: string[];
}

/**
 * Gets every issue of building the showcases, in one list: the run's own issues first, then each showcase's build errors, in showcase order, then
 * the build warnings
 * @param result The outcome of buildShowcases()
 * @returns The issues; none if every showcase built without warnings
 */
export function getBuildShowcasesIssues(result: Pick<BuildShowcasesResult, 'errors' | 'issues' | 'warnings'>): CheckIssue[] {
  return [...result.issues, ...[...result.errors.values()].flat(), ...result.warnings];
}

/**
 * Gets a custom showcase adapter module's path as `showroom.json` lists it, relative to the host repository's root, in POSIX style
 * @param root Absolute path of the host repository's root
 * @param path Path of the module, as listed
 * @returns The POSIX-style path, or undefined for one outside the host repository
 */
function _getModulePath(root: string, path: string): string | undefined {
  const relativePath = relative(root, resolve(root, path));
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return undefined;
  return relativePath.split(sep).join('/');
}

/**
 * Builds every showcase of a host repository with its showcase adapter, one at a time, each with a scratch folder of its own inside one temporary
 * folder per run (removed afterwards), and adds the frame script to each showcase frame page. Custom showcase adapters are loaded again, so the
 * run gets fresh showcase adapter objects, each closed at its end. When a showcase adapter with showcases to build uses the host copy, the host copy
 * is synced first, before any build. A recording's failure is an error of its `runtime` check. A showcase that doesn't build never stops the others.
 * The files to watch are the custom showcase adapter modules, every showcase's included files (an included virtual file's documentation file), and
 * the files each build read. Without trust, it builds nothing and loads nothing: every showcase has no checks and no issues, and the files to watch
 * are the custom showcase adapter modules and the included files. A built-in showcase adapter's showcase frame that uses the shared Mermaid bundle
 * gets its import map right after the frame script, the bundle's entry point's hash read once per run.
 * @param options What to build
 * @returns The showcase frames and recordings of the showcases that built, the errors and warnings of each (placed, and as shown), the checks each
 * ran, and the run's own issues
 */
export async function buildShowcases({
  root,
  host,
  configuration,
  mode = 'production',
  trust = false,
  session,
  outDir,
  mermaidDir = getMermaidDir(),
}: BuildShowcasesOptions): Promise<BuildShowcasesResult> {
  const issues: CheckIssue[] = [];
  const errors = new Map<string, CheckIssue[]>();
  const warnings: CheckIssue[] = [];
  const checks = new Map<string, string[]>();
  const shownIssues = new Map<string, ShownIssue[]>();
  const frames = new Map<string, ShowcaseFrame>();
  const recordings = new Map<string, ShowcaseRecording>();
  const absoluteRoot = resolve(root);
  const script = getFrameScript();
  const listed = configuration.customShowcaseAdapters ?? {};
  // The stack, whose name showcase adapters are given, with the project (the host information's, merged already)
  const stack = resolveStack(configuration);
  const watched = new Set(Object.values(listed).flatMap((path) => _getModulePath(absoluteRoot, path) ?? []));
  let mermaidHash: Promise<string | undefined> | undefined;
  const done = (): BuildShowcasesResult => ({ frames, recordings, errors, warnings, shownIssues, checks, issues, watched: [...watched].sort() });

  // Without trust, nothing is built or loaded
  if (!trust) {
    for (const showcase of host.showcases) {
      checks.set(showcase.id, []);
      shownIssues.set(showcase.id, []);
      for (const path of showcase.include) watched.add(host.virtualFiles.find((file) => file.path === path)?.documentation ?? path);
    }
    return done();
  }

  // Load the custom showcase adapters, and create the built-in ones in use
  const custom = await loadCustomShowcaseAdapters(root, listed);
  issues.push(...custom.errors.map((message) => ({ severity: 'error' as const, message, path: CONFIGURATION_FILE_NAME })));
  const adapters = new Map<string, ShowcaseAdapter>(custom.adapters);
  for (const showcase of host.showcases) {
    if (adapters.has(showcase.adapter)) continue;
    const adapter = createShowcaseAdapter(showcase.adapter);
    if (adapter) adapters.set(showcase.adapter, adapter);
  }

  const owned = session === undefined;
  const runSession = session ?? createRunSession();
  const scratch = await mkdtemp(join(tmpdir(), 'showroom-showcases-'));
  try {
    // The host copy, synced before any build, when a showcase adapter with showcases to build uses it
    const contents = [...new Set(host.showcases.flatMap((showcase) => adapters.get(showcase.adapter)?.hostCopy ?? []))];
    let hostCopy: HostCopy | undefined;
    let hostCopyError: string | undefined;
    if (contents.length) {
      try {
        const outputFolder = resolveOutputFolder(absoluteRoot, configuration, outDir);
        hostCopy = await runSession.getHostCopy(absoluteRoot);
        await hostCopy.sync(contents, host.virtualFiles, 'error' in outputFolder ? undefined : outputFolder.relativePath);
      } catch (err) {
        hostCopy = undefined;
        hostCopyError = (err as Error).message;
      }
    }

    for (const [index, showcase] of host.showcases.entries()) {
      const add = (issue: ShowcaseBuildIssue) => {
        const placed = getBuildIssue(showcase, host.virtualFiles, issue);
        shownIssues.get(showcase.id)!.push(getShownIssue(showcase, issue));
        if (issue.severity === 'warning') warnings.push(placed);
        else errors.set(showcase.id, [...(errors.get(showcase.id) ?? []), placed]);
      };
      const fail = (message: string) => add({ severity: 'error', message });
      checks.set(showcase.id, []);
      shownIssues.set(showcase.id, []);

      // Its included files are watched, whatever its showcase adapter and whether it builds: a virtual one by its documentation file
      for (const path of showcase.include) {
        watched.add(host.virtualFiles.find((file) => file.path === path)?.documentation ?? path);
      }

      // Its showcase adapter, and the host copy where it uses one
      const adapter = adapters.get(showcase.adapter);
      if (!adapter) {
        fail(`Showcase adapter "${showcase.adapter}" is not available`);
        continue;
      }
      if (adapter.hostCopy && !hostCopy) {
        fail(`The host copy could not be made: ${hostCopyError ?? 'unknown error'}`);
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
          hostVirtualFiles: [...host.virtualFiles],
          mode,
          scratchFolder,
          project: getShowcaseProject(configuration, stack, host.project),
          stack: stack.name,
          ...(adapter.hostCopy && hostCopy
            ? {
                hostCopy: runSession.createShowcaseHostCopy(hostCopy, {
                  root: absoluteRoot,
                  folder,
                  names: custom.adapters.has(showcase.adapter) ? [] : getShowcaseAdapterEnvironmentNames(showcase.adapter),
                }),
              }
            : {}),
          ...(adapter.hostCopy || adapter.recorded ? { showcaseFolder: await runSession.getShowcaseFolder(showcase.id) } : {}),
        });
      } catch (err) {
        fail(`Showcase adapter "${showcase.adapter}" failed to build the showcase: ${(err as Error).message}`);
        continue;
      }
      const checked = checkBuildResult(result, adapter.recorded === true);
      if (checked.problem !== undefined) {
        fail(`Showcase adapter "${showcase.adapter}" returned an invalid build result: ${checked.problem}`);
        continue;
      }
      checked.reads.forEach((path) => watched.add(path));
      checks.set(showcase.id, checked.checks);
      checked.warnings.forEach((message) => add({ severity: 'warning', message: `Showcase adapter "${showcase.adapter}": ${message}` }));
      checked.issues.forEach(add);
      const { page, files, recording } = checked;
      if (recording !== undefined) {
        // The recording ran to its end: its runtime check fails when it did
        recordings.set(showcase.id, recording);
        checks.set(showcase.id, [...checked.checks, RUNTIME_CHECK]);
        const failure = getRecordingFailure(recording);
        if (failure) add({ severity: 'error', message: `The recording failed: it ${failure}`, check: RUNTIME_CHECK });
      } else if (page !== undefined && files !== undefined) {
        // Only a built-in showcase adapter's showcase frames may use the shared Mermaid bundle, through its import map
        const mermaid = !custom.adapters.has(showcase.adapter) && usesMermaidBundle(showcase.adapter);
        mermaidHash ??= mermaid ? getMermaidHash(mermaidDir) : undefined;
        const importMap = mermaid ? getMermaidImportMap(getMermaidUrl(showcase, page, await mermaidHash)) : '';
        const scripted = files.map((file) =>
          file.path === page ? { path: file.path, content: insertFrameScript(file.content as string, script, importMap) } : file,
        );
        frames.set(showcase.id, { folder: getShowcaseFrameFolder(showcase), page, files: scripted, reads: checked.reads, ...(mermaid ? { mermaid } : {}) });
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
    if (owned) await runSession.dispose();
  }
  return done();
}

// #endregion
