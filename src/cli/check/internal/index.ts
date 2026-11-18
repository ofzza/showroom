/**
 * Internals of the check shared with `showroom serve`, `showroom build` and the `ts` showcase adapter, and so not re-exported: the output folder,
 * the ignore matcher (which files of a host repository are ignored), the formatting of check issues as output, escaping control characters written
 * to the terminal, the trust prompt, the custom showcase adapter modules, and the bundler warnings left out
 */

import ignore, { type Ignore } from 'ignore';
import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { resolveStack, type StackDefaults } from '../../../adapters/stack/resolve/index.js';
import { DEFAULT_OUT_DIR, readConfiguration, type Configuration } from '../../../configuration/index.js';
import type { CheckIssue, TrustRequest } from '../index.js';

// #region Output folder

/**
 * Represents the output folder, resolved
 */
export interface OutputFolder {
  /**
   * Absolute path of the output folder
   */
  path: string;
  /**
   * POSIX-style path of the output folder, relative to the host repository's root
   */
  relativePath: string;
}

/**
 * Resolves the output folder: the override if given (relative to the current directory), else the configuration's `outDir` (relative to the host
 * repository's root), else `./showroom`
 * @param root Path of the host repository's root
 * @param configuration Configuration of the host repository
 * @param override Output folder given on the command line, if any
 * @returns The output folder, or an error message when it is the host repository's root or outside it
 */
export function resolveOutputFolder(root: string, configuration: Configuration, override?: string): OutputFolder | { error: string } {
  const given = override ?? configuration.outDir ?? DEFAULT_OUT_DIR;
  const path = override !== undefined ? resolve(override) : resolve(root, given);
  const relativePath = relative(resolve(root), path).split(sep).join('/');
  if (!relativePath) {
    return { error: `Output folder "${given}" is the host repository's root` };
  }
  if (relativePath === '..' || relativePath.startsWith('../') || isAbsolute(relativePath)) {
    return { error: `Output folder "${given}" is outside the host repository` };
  }
  return { path, relativePath };
}

/**
 * Escapes a path for use in a `.gitignore`-style pattern, so it matches literally
 * @param path POSIX-style path
 * @returns The path with the pattern's special characters, and trailing spaces, escaped
 */
function _escapePattern(path: string): string {
  return path.replace(/[\\*?[\]!#]/g, '\\$&').replace(/ +$/, (spaces) => spaces.replace(/ /g, '\\ '));
}

// #endregion

// #region Ignore matcher

/**
 * Creates the ignore matcher of a host repository: the stack's `ignore` patterns (its stack adapter's, or none without one), then the
 * configuration's, then the output folder
 * @param defaults The stack's defaults (see resolveStack())
 * @param configuration Configuration of the host repository
 * @param outputFolder POSIX-style path of the output folder, relative to the host repository's root, if it is inside it
 * @returns Matcher of the ignored files and folders, tested against POSIX-style paths relative to the host repository's root (folders with a trailing `/`)
 */
export function createIgnoreMatcher(defaults: Pick<StackDefaults, 'ignore'>, configuration: Configuration, outputFolder?: string): Ignore {
  return ignore().add([...defaults.ignore, ...(configuration.ignore ?? []), ...(outputFolder ? [`/${_escapePattern(outputFolder)}/`] : [])]);
}

/**
 * Reads a host repository's configuration and creates its ignore matcher
 * @param root Path of the host repository's root
 * @param outDir Output folder given on the command line, if any (see resolveOutputFolder())
 * @returns The ignore matcher, or undefined if the configuration is invalid or names an unknown stack
 */
export async function readIgnoreMatcher(root: string, outDir?: string): Promise<Ignore | undefined> {
  const { configuration } = await readConfiguration(root);
  const stack = configuration && resolveStack(configuration).stack;
  if (!configuration || !stack) {
    return undefined;
  }
  const outputFolder = resolveOutputFolder(root, configuration, outDir);
  return createIgnoreMatcher(stack.defaults, configuration, 'error' in outputFolder ? undefined : outputFolder.relativePath);
}

// #endregion

// #region Issues

/**
 * Formats check issues as lines of output, e.g. `warning: README.md: Several readme files ...`, or `error: docs/guide.md:12: Unknown showcase ...`
 * @param issues Issues to format
 * @returns One line per issue, each with its line break, or an empty string without issues
 */
export function formatIssues(issues: CheckIssue[]): string {
  return issues
    .map((issue) => {
      const location = issue.path ? `${issue.path}${issue.line !== undefined ? `:${issue.line}` : ''}: ` : '';
      return `${issue.severity}: ${escapeControlCharacters(`${location}${issue.message}`, true)}\n`;
    })
    .join('');
}

// #endregion

// #region Escaping

/**
 * Escapes the control characters of a text written to the terminal, so a string from the host repository can never move the cursor, rewrite a
 * line or reorder it: C0 controls, DEL and C1 controls are shown as `\xNN`, and Unicode's bidirectional controls (U+202A–U+202E, U+2066–U+2069)
 * as `\uNNNN`
 * @param text Text to escape
 * @param keepLineBreaks True to keep line feeds and tabs as they are (e.g. a build error's code frame), false to escape them too
 * @returns The text, with its control characters shown visibly
 */
export function escapeControlCharacters(text: string, keepLineBreaks: boolean): string {
  let escaped = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    const control = code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
    if (!control || (keepLineBreaks && (code === 0x09 || code === 0x0a))) {
      escaped += char;
    } else {
      escaped += code <= 0xff ? `\\x${code.toString(16).padStart(2, '0')}` : `\\u${code.toString(16).padStart(4, '0')}`;
    }
  }
  return escaped;
}

// #endregion

// #region Trust prompt

/**
 * Formats the prompt asking whether to trust the host repository, naming what would run (each string from the host repository escaped)
 * @param request What would run
 * @param root Absolute path of the host repository's root
 * @returns The prompt, ending where the answer is typed
 */
export function formatTrustPrompt(request: TrustRequest, root: string): string {
  const escape = (text: string) => escapeControlCharacters(text, false);
  const named = (items: { name: string; path: string }[]) => items.map(({ name, path }) => `${escape(name)} (${escape(path)})`).join(', ');
  const lines = ["showroom would run the host repository's code on this machine, with your rights:"];
  if (request.customShowcaseAdapters.length) lines.push(`  custom showcase adapters: ${named(request.customShowcaseAdapters)}`);
  if (request.tools.length) lines.push(`  tools, including: ${named(request.tools)}`);
  if (request.executables.length) lines.push(`  programs: ${named(request.executables)}`);
  if (request.showcases) lines.push(`  ${request.showcases} ${request.showcases === 1 ? 'showcase' : 'showcases'}, built and run`);
  if (request.recorded) {
    lines.push(`  of which ${request.recorded} recorded: built and run as programs on this machine, their output published with the showroom`);
  }
  lines.push('Only trust a repository whose code you would run yourself.', `Trust ${escape(root)} and run its code? [y/N] `);
  return lines.join('\n');
}

// #endregion

// #region Custom showcase adapter modules

/**
 * Gets the custom showcase adapter modules a configuration lists that exist, each by the absolute real path of its module, as the trust request
 * names them (see TrustRequest), and as `serve`'s notices compare them
 * @param root Path of the host repository's root
 * @param listed Custom showcase adapters' paths, relative to the root, by name
 * @returns The modules, in the order listed
 */
export async function getCustomShowcaseAdapterModules(root: string, listed: Record<string, string>): Promise<{ name: string; path: string }[]> {
  const modules: { name: string; path: string }[] = [];
  for (const [name, path] of Object.entries(listed)) {
    const real = await realpath(resolve(root, path)).catch(() => undefined);
    if (real !== undefined) modules.push({ name, path: real });
  }
  return modules;
}

// #endregion

// #region Silenced warnings

/**
 * Codes of the bundler warnings left out of the output of `build`, and of the `ts` showcase adapter's build warnings: FluentUI's and Griffel's
 * `'use client'` directives (and any other package's), which only matter to server-side React frameworks, and are warned about once per file; and
 * the bundler's plugin timings, which say that the build's plugins (`showroom`'s own) took most of its time, and come and go with the machine's speed
 */
export const SILENCED_WARNINGS: readonly string[] = ['MODULE_LEVEL_DIRECTIVE', 'PLUGIN_TIMINGS'];

// #endregion
