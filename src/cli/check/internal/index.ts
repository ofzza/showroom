/**
 * Internals of the check shared with `tsshowcase serve`, and so not re-exported: the ignore matcher (which files of a host repository are ignored), and
 * the formatting of check issues as output
 */

import ignore, { type Ignore } from 'ignore';
import { getStackAdapter, type StackAdapter } from '../../../adapters/stack/index.js';
import { readConfiguration, type Configuration } from '../../../configuration/index.js';
import type { CheckIssue } from '../index.js';

// #region Ignore matcher

/**
 * Creates the ignore matcher of a host repository: the stack adapter's `ignore` patterns, then the configuration's
 * @param adapter Stack adapter of the host repository
 * @param configuration Configuration of the host repository
 * @returns Matcher of the ignored files and folders, tested against POSIX-style paths relative to the host repository's root (folders with a trailing `/`)
 */
export function createIgnoreMatcher(adapter: StackAdapter, configuration: Configuration): Ignore {
  return ignore().add([...adapter.ignore, ...(configuration.ignore ?? [])]);
}

/**
 * Reads a host repository's configuration and creates its ignore matcher
 * @param root Path of the host repository's root
 * @returns The ignore matcher, or undefined if the configuration is invalid or names an unknown stack
 */
export async function readIgnoreMatcher(root: string): Promise<Ignore | undefined> {
  const { configuration } = await readConfiguration(root);
  const adapter = configuration && getStackAdapter(configuration.stack);
  return configuration && adapter ? createIgnoreMatcher(adapter, configuration) : undefined;
}

// #endregion

// #region Issues

/**
 * Formats check issues as lines of output, e.g. `warning: README.md: Several readme files ...`
 * @param issues Issues to format
 * @returns One line per issue, each with its line break, or an empty string without issues
 */
export function formatIssues(issues: CheckIssue[]): string {
  return issues.map((issue) => `${issue.severity}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}\n`).join('');
}

// #endregion
