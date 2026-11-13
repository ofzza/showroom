/**
 * Internals of the check shared with `showroom serve`, `showroom build` and the `ts` showcase adapter, and so not re-exported: the output folder,
 * the ignore matcher (which files of a host repository are ignored), the formatting of check issues as output, and the bundler warnings left out
 */

import ignore, { type Ignore } from 'ignore';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { getStackAdapter, type StackAdapter } from '../../../adapters/stack/index.js';
import { DEFAULT_OUT_DIR, readConfiguration, type Configuration } from '../../../configuration/index.js';
import type { CheckIssue } from '../index.js';

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
 * Creates the ignore matcher of a host repository: the stack adapter's `ignore` patterns, then the configuration's, then the output folder
 * @param adapter Stack adapter of the host repository
 * @param configuration Configuration of the host repository
 * @param outputFolder POSIX-style path of the output folder, relative to the host repository's root, if it is inside it
 * @returns Matcher of the ignored files and folders, tested against POSIX-style paths relative to the host repository's root (folders with a trailing `/`)
 */
export function createIgnoreMatcher(adapter: StackAdapter, configuration: Configuration, outputFolder?: string): Ignore {
  return ignore().add([...adapter.ignore, ...(configuration.ignore ?? []), ...(outputFolder ? [`/${_escapePattern(outputFolder)}/`] : [])]);
}

/**
 * Reads a host repository's configuration and creates its ignore matcher
 * @param root Path of the host repository's root
 * @param outDir Output folder given on the command line, if any (see resolveOutputFolder())
 * @returns The ignore matcher, or undefined if the configuration is invalid or names an unknown stack
 */
export async function readIgnoreMatcher(root: string, outDir?: string): Promise<Ignore | undefined> {
  const { configuration } = await readConfiguration(root);
  const adapter = configuration && getStackAdapter(configuration.stack);
  if (!configuration || !adapter) {
    return undefined;
  }
  const outputFolder = resolveOutputFolder(root, configuration, outDir);
  return createIgnoreMatcher(adapter, configuration, 'error' in outputFolder ? undefined : outputFolder.relativePath);
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
    .map((issue) => `${issue.severity}: ${issue.path ? `${issue.path}${issue.line !== undefined ? `:${issue.line}` : ''}: ` : ''}${issue.message}\n`)
    .join('');
}

// #endregion

// #region Silenced warnings

/**
 * Codes of the bundler warnings left out of the output of `build`, and of the `ts` showcase adapter's build warnings: FluentUI's and Griffel's
 * `'use client'` directives (and any other package's), which only matter to server-side React frameworks, and are warned about once per file
 */
export const SILENCED_WARNINGS: readonly string[] = ['MODULE_LEVEL_DIRECTIVE'];

// #endregion
