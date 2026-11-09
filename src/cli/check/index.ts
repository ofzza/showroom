/**
 * Check: collects the host information from a host repository, reporting every issue found along the way
 */

import ignore from 'ignore';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { getStackAdapter, getStackAdapterNames } from '../../adapters/stack/index.js';
import { readConfiguration, CONFIGURATION_FILE_NAME } from '../../configuration/index.js';
import type { DocumentationFile, DocumentationKind, HostInformation, ProjectInformation } from '../../host/index.js';

// #region Types

/**
 * Represents the severity of a check issue: errors fail the check, warnings don't
 */
export type CheckIssueSeverity = 'error' | 'warning';

/**
 * Represents an issue found while checking a host repository
 */
export interface CheckIssue {
  /**
   * Severity of the issue
   */
  severity: CheckIssueSeverity;
  /**
   * Description of the issue
   */
  message: string;
  /**
   * POSIX-style path the issue concerns, relative to the host repository's root, if it concerns one
   */
  path?: string;
}

/**
 * Represents the outcome of checking a host repository
 */
export interface CheckResult {
  /**
   * True if the check found no errors (warnings don't fail it)
   */
  passed: boolean;
  /**
   * Host information, only present when the check passed
   */
  host?: HostInformation;
  /**
   * Every issue found, errors and warnings
   */
  issues: CheckIssue[];
}

// #endregion

// #region Built-in documentation

/**
 * Built-in documentation patterns, the start of the documentation pattern list: `README` anywhere, and `LICENSE` and `CONTRIBUTE` in the root, in UK
 * and US spelling, with the `.md` or `.txt` extension or none. Matching is case-insensitive.
 */
export const BUILT_IN_DOCUMENTATION: readonly string[] = [
  ...['README'].flatMap((name) => [name, `${name}.md`, `${name}.txt`]),
  ...['LICENSE', 'LICENCE', 'CONTRIBUTE', 'CONTRIBUTING'].flatMap((name) => [`/${name}`, `/${name}.md`, `/${name}.txt`]),
];

/**
 * Documentation kinds of the built-in file names, by lower-case name without extension
 */
const _KINDS: Record<string, DocumentationKind> = {
  readme: 'readme',
  license: 'license',
  licence: 'license',
  contribute: 'contribute',
  contributing: 'contribute',
};

/**
 * Priority of extensions when one folder holds several files of the same built-in kind: lower wins
 */
const _EXTENSION_PRIORITY: Record<string, number> = { '.md': 0, '': 1, '.txt': 2 };

/**
 * Gets the documentation kind of a file from its name
 * @param name File name
 * @param extension Extension of the file name
 * @returns Documentation kind of the file
 */
function _getKind(name: string, extension: string): DocumentationKind {
  const stem = ['.md', '.txt'].includes(extension.toLowerCase()) ? name.slice(0, -extension.length) : name;
  return _KINDS[stem.toLowerCase()] ?? 'other';
}

// #endregion

// #region Check

/**
 * Checks a host repository and collects its host information
 * @param root Path of the host repository's root
 * @returns The outcome of the check: whether it passed, the host information if it did, and every issue found
 */
export async function check(root: string): Promise<CheckResult> {
  const issues: CheckIssue[] = [];
  const fail = (): CheckResult => ({ passed: false, issues });

  // Read the configuration
  const { configuration, errors } = await readConfiguration(root);
  if (!configuration) {
    issues.push(...errors.map((message) => ({ severity: 'error' as const, message, path: CONFIGURATION_FILE_NAME })));
    return fail();
  }

  // Get the stack adapter
  const adapter = getStackAdapter(configuration.stack);
  if (!adapter) {
    issues.push({
      severity: 'error',
      message: `Unknown stack "${configuration.stack}"; the stack adapters are: ${getStackAdapterNames().join(', ')}`,
      path: CONFIGURATION_FILE_NAME,
    });
    return fail();
  }

  // Read the project information
  let project: ProjectInformation | undefined;
  try {
    project = await adapter.readProject(root);
  } catch (err) {
    issues.push({ severity: 'error', message: (err as Error).message });
  }

  // Resolve the source root
  const sourceRoot = _toPosix(relative(resolve(root), resolve(root, configuration.sourceRoot ?? adapter.sourceRoot)));
  if (sourceRoot === '..' || sourceRoot.startsWith('../') || isAbsolute(sourceRoot)) {
    issues.push({ severity: 'error', message: `Source root "${configuration.sourceRoot}" is outside the host repository`, path: CONFIGURATION_FILE_NAME });
    return fail();
  }
  if (!(await _isDirectory(join(root, sourceRoot)))) {
    issues.push({ severity: 'error', message: `Source root "${sourceRoot || '.'}" is not a directory` });
    return fail();
  }

  // Walk the host repository
  const ignored = ignore().add([...adapter.ignore, ...(configuration.ignore ?? [])]);
  const files = await _walk(root, '', ignored);

  // Collect the code file index
  const codeMatcher = ignore().add([...adapter.code, ...(configuration.code ?? [])]);
  const code = files.filter((path) => {
    if (sourceRoot && !path.startsWith(`${sourceRoot}/`)) return false;
    return codeMatcher.ignores(sourceRoot ? path.slice(sourceRoot.length + 1) : path);
  });

  // Collect the documentation files
  const documentationMatcher = ignore().add([...BUILT_IN_DOCUMENTATION, ...adapter.documentation, ...(configuration.documentation ?? [])]);
  const candidates = files.filter((path) => documentationMatcher.ignores(path));
  const documentation: DocumentationFile[] = [];
  for (const path of _pickDuplicates(candidates, issues)) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const extension = extname(name);
    documentation.push({ path, kind: _getKind(name, extension), extension, content: await readFile(join(root, path), 'utf8') });
  }

  // Report the outcome
  if (!project || issues.some((issue) => issue.severity === 'error')) return fail();
  return { passed: true, host: { project, documentation, code }, issues };
}

/**
 * Walks a directory, collecting the files that aren't ignored; symbolic links are not followed
 * @param root Path of the host repository's root
 * @param directory POSIX-style path of the directory to walk, relative to the root ('' for the root itself)
 * @param ignored Matcher of the ignored files
 * @returns POSIX-style paths of the files found, relative to the root, sorted
 */
async function _walk(root: string, directory: string, ignored: ReturnType<typeof ignore>): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => _compare(a.name, b.name))) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!ignored.ignores(`${path}/`)) files.push(...(await _walk(root, path, ignored)));
    } else if (entry.isFile()) {
      if (!ignored.ignores(path)) files.push(path);
    }
  }
  return files.sort(_compare);
}

/**
 * Picks one file where a folder holds several documentation files of the same built-in kind (e.g. `README.md` and `README.txt`), by extension
 * priority (`.md`, then none, then `.txt`, then any other), reporting a warning for each such folder
 * @param paths POSIX-style paths of the documentation files, sorted
 * @param issues Issues to add the warnings to
 * @returns The paths kept, sorted
 */
function _pickDuplicates(paths: string[], issues: CheckIssue[]): string[] {
  // Group the files of a built-in kind by folder and kind
  const groups = new Map<string, string[]>();
  const kept: string[] = [];
  for (const path of paths) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const kind = _getKind(name, extname(name));
    if (kind === 'other') {
      kept.push(path);
      continue;
    }
    const key = `${path.slice(0, Math.max(path.lastIndexOf('/'), 0))}\0${kind}`;
    groups.set(key, [...(groups.get(key) ?? []), path]);
  }
  // Keep one file of each group
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => _priority(a) - _priority(b) || _compare(a, b));
    kept.push(sorted[0]);
    if (sorted.length > 1) {
      const [folder, kind] = key.split('\0');
      issues.push({
        severity: 'warning',
        message: `Several ${kind} files in ${folder ? `"${folder}"` : 'the root'} (${sorted.join(', ')}); using ${sorted[0]}`,
        path: sorted[0],
      });
    }
  }
  return kept.sort(_compare);
}

/**
 * Gets the extension priority of a documentation file
 * @param path Path of the file
 * @returns Priority: lower wins
 */
function _priority(path: string): number {
  return _EXTENSION_PRIORITY[extname(path.slice(path.lastIndexOf('/') + 1)).toLowerCase()] ?? 3;
}

/**
 * Compares two strings by code unit, for a sort order that doesn't depend on the locale
 * @param a First string
 * @param b Second string
 * @returns Negative, zero or positive, as `Array.prototype.sort` expects
 */
function _compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Converts a path to POSIX style
 * @param path Path to convert
 * @returns The path with `/` separators
 */
function _toPosix(path: string): string {
  return path.split(sep).join('/');
}

/**
 * Checks if a path is a directory
 * @param path Path to check
 * @returns True if the path exists and is a directory
 */
async function _isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (_err) {
    return false;
  }
}

// #endregion
