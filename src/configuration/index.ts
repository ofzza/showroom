/**
 * Configuration: reading and validating a host repository's mandatory `showroom.json` file
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getStackAdapterNames } from '../adapters/stack/index.js';
import type { ShowcaseView } from '../host/index.js';
import { checkShowcaseViews } from '../markdown/index.js';
import { NAVIGATION_URL_SCHEMES, isAllowedNavigationUrl, isNavigationGlob, isNavigationUrl } from '../navigation/index.js';

// #region Configuration

/**
 * Name of the configuration file, expected in the host repository's root
 */
export const CONFIGURATION_FILE_NAME = 'showroom.json';

/**
 * Represents a host repository's configuration, as written in its `showroom.json` file
 */
export interface Configuration {
  /**
   * Name of the host repository's stack: a built-in stack adapter's name (e.g. `typescript`, selected exactly as written) runs that stack adapter;
   * any other name (`custom` if left out) runs none, and only names the stack for showcase adapters. A built-in stack adapter's name in another
   * case is refused
   */
  stack?: string;
  /**
   * The project: the project file's path, the project information and the patterns, each overriding what the stack adapter gives (`null`
   * unsetting it); without a stack adapter, the project information itself, `name` required
   */
  project?: ProjectConfiguration;
  /**
   * Output directory of the showroom, relative to the host repository's root; defaults to `./showroom`
   */
  outDir?: string;
  /**
   * Custom showcase adapters (experimental): paths of their JavaScript modules, relative to the host repository's root, by showcase adapter name
   */
  customShowcaseAdapters?: Record<string, string>;
  /**
   * Default showcase views by showcase adapter name (a built-in showcase adapter's, or one of `customShowcaseAdapters`): a view, or a list of views,
   * for the showcase adapter's showcases shown as blocks whose marker has no `view=`, in place of the showcase adapter's own default
   */
  showcaseViews?: Record<string, ShowcaseView | ShowcaseView[]>;
  /**
   * The showroom's navigation, in place of the default one: its items, in their order; documentation files it doesn't list are left out of it
   */
  navigation?: NavigationEntry[];
}

/**
 * Represents `showroom.json`'s `project`: every field optional. With a stack adapter, each field overrides what it gives, and `null` unsets it (a
 * pattern list's `null` drops the stack adapter's patterns); without one, `null` is the same as leaving a field out
 */
export interface ProjectConfiguration {
  /**
   * Path of the file the stack adapter reads the project information from, relative to the host repository's root (e.g. a `.csproj`); defaults
   * to the stack adapter's (`package.json` for `typescript`), and the `dotnet` stack adapter requires it. Only a stack adapter reads it
   */
  path?: string | null;
  /**
   * Name of the project, replacing the stack adapter's; required without a stack adapter
   */
  name?: string | null;
  /**
   * Version of the project, replacing the stack adapter's
   */
  version?: string | null;
  /**
   * Short description of the project, replacing the stack adapter's
   */
  description?: string | null;
  /**
   * License identifier of the project (e.g. `MIT`), replacing the stack adapter's
   */
  license?: string | null;
  /**
   * Author of the project, replacing the stack adapter's
   */
  author?: string | null;
  /**
   * Homepage URL of the project, replacing the stack adapter's
   */
  homepage?: string | null;
  /**
   * Source repository URL of the project, replacing the stack adapter's
   */
  repository?: string | null;
  /**
   * Source root directory, relative to the host repository's root; defaults to the stack adapter's, and to the root (`.`) when `null` or without one
   */
  sourceRoot?: string | null;
  /**
   * `.gitignore`-style patterns of files to ignore, appended to the stack adapter's
   */
  ignore?: string[] | null;
  /**
   * `.gitignore`-style patterns of code files, relative to the source root, appended to the stack adapter's
   */
  code?: string[] | null;
  /**
   * `.gitignore`-style patterns of documentation files, appended to the built-in ones and the stack adapter's
   */
  documentation?: string[] | null;
}

/**
 * Represents an item of `showroom.json`'s `navigation`: a page, by its `path` (a documentation file's path, optionally followed by
 * `#<heading id>`; `/` for the home page; an absolute URL, `http:`, `https:`, `mailto:` or protocol-relative; or a `.gitignore`-style pattern standing for every documentation file it matches),
 * labelled by its `title` or else by its documentation file's first heading; or a group of items, captioned by its `title`, collapsed at first with
 * `collapsed: true` (expanded once the current page is one of its items), and starting as its parent group does when it has no `collapsed`
 */
export type NavigationEntry =
  | { title?: string; path: string; items?: undefined; collapsed?: undefined }
  | { title: string; items: NavigationEntry[]; path?: undefined; collapsed?: boolean };

/**
 * Default output directory of the showroom
 */
export const DEFAULT_OUT_DIR = './showroom';

/**
 * Built-in documentation patterns, the start of the documentation pattern list: `README` anywhere, and `LICENSE` and `CONTRIBUTE` in the root, in UK
 * and US spelling, with the `.md` or `.txt` extension or none. Matching is case-insensitive.
 */
export const BUILT_IN_DOCUMENTATION: readonly string[] = [
  ...['README'].flatMap((name) => [name, `${name}.md`, `${name}.txt`]),
  ...['LICENSE', 'LICENCE', 'CONTRIBUTE', 'CONTRIBUTING'].flatMap((name) => [`/${name}`, `/${name}.md`, `/${name}.txt`]),
];

/**
 * Represents the outcome of reading a configuration: either the configuration, or the errors that prevented reading it
 */
export type ConfigurationResult = { configuration: Configuration; errors: [] } | { configuration?: undefined; errors: string[] };

// #endregion

// #region Validation

/**
 * Keys a configuration may hold, each with a check of its value
 */
const _KEYS: Record<keyof Configuration, (value: unknown) => boolean> = {
  stack: (value) => typeof value === 'string' && value.length > 0,
  project: _isObject,
  outDir: (value) => typeof value === 'string' && value.length > 0,
  customShowcaseAdapters: _isStringRecord,
  showcaseViews: (value) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string' || _isStringArray(item)),
  navigation: Array.isArray,
};

/**
 * Describes the value each configuration key expects, for error messages
 */
const _EXPECTED: Record<keyof Configuration, string> = {
  stack: 'a non-empty string',
  project: 'an object',
  outDir: 'a non-empty string',
  customShowcaseAdapters: 'an object mapping showcase adapter names to paths (non-empty strings)',
  showcaseViews: 'an object mapping showcase adapter names to a view or an array of views',
  navigation: 'an array of navigation items',
};

/**
 * Checks if a value is a plain object (not null, not an array)
 * @param value Value to check
 * @returns True if the value is an object
 */
function _isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks if a value is an array of strings
 * @param value Value to check
 * @returns True if the value is an array of strings
 */
function _isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Checks if a value is an object whose values are all non-empty strings
 * @param value Value to check
 * @returns True if the value is such an object
 */
function _isStringRecord(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((item) => typeof item === 'string' && item.length > 0)
  );
}

/**
 * Keys `project` may hold, each with what its value must be besides `null`: a non-empty string, or an array of strings
 */
const _PROJECT_KEYS: Record<keyof ProjectConfiguration, 'string' | 'list'> = {
  path: 'string',
  name: 'string',
  version: 'string',
  description: 'string',
  license: 'string',
  author: 'string',
  homepage: 'string',
  repository: 'string',
  sourceRoot: 'string',
  ignore: 'list',
  code: 'list',
  documentation: 'list',
};

/**
 * Checks `project`'s keys and their values: each key known, each value `null`, a non-empty string or an array of strings, as its key expects
 * @param project The object to check
 * @returns The problems found, each naming its key
 */
function _checkProject(project: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(project)) {
    if (!Object.hasOwn(_PROJECT_KEYS, key)) {
      // A top-level key written inside the object is the likely mistake
      problems.push(`"project": unknown key "${key}"${key in _KEYS ? `; "${key}" is a top-level key of ${CONFIGURATION_FILE_NAME}` : ''}`);
    } else if (value === null) {
      continue;
    } else if (_PROJECT_KEYS[key as keyof ProjectConfiguration] === 'string' && (typeof value !== 'string' || !value)) {
      problems.push(`"project": "${key}" must be a non-empty string or null`);
    } else if (_PROJECT_KEYS[key as keyof ProjectConfiguration] === 'list' && !_isStringArray(value)) {
      problems.push(`"project": "${key}" must be an array of strings or null`);
    }
  }
  return problems;
}

/**
 * Checks what a host repository without a stack adapter must and can't give in `project` (D888, D893): a `name`, and no `path`
 * @param record The configuration's value
 * @returns The problems found
 */
function _checkWithoutStackAdapter(record: Record<string, unknown>): string[] {
  const { stack, project } = record;
  // A stack given but invalid is reported already, and a built-in stack adapter's name in another case is only refused
  if (stack !== undefined && (typeof stack !== 'string' || !stack)) return [];
  const names = getStackAdapterNames();
  if (typeof stack === 'string') {
    if (names.includes(stack)) return [];
    const builtIn = names.find((name) => name.toLowerCase() === stack.toLowerCase());
    if (builtIn) {
      return [`"stack" "${stack}" names no stack adapter, as a stack adapter is selected by its name exactly as written: write "${builtIn}" for it`];
    }
  }
  // A project that isn't an object is reported already
  if (project !== undefined && !_isObject(project)) return [];
  const reason =
    stack === undefined
      ? `"stack" is left out; the stack adapters are: ${names.join(', ')}`
      : `"stack" "${stack as string}" names no stack adapter; they are: ${names.join(', ')}`;
  const problems: string[] = [];
  if (project?.path !== undefined && project.path !== null) problems.push(`"project": "path" is only read by a stack adapter (${reason})`);
  if (project?.name === undefined || project.name === null) {
    problems.push(`"project" has no "name", which a host repository without a stack adapter must give (${reason})`);
  }
  return problems;
}

/**
 * Keys a navigation item may hold
 */
const _NAVIGATION_KEYS = ['title', 'path', 'items', 'collapsed'];

/**
 * Checks the items of a navigation, and of its groups, each named by its position (e.g. `"navigation" item 2.1`, the first item of the second)
 * @param items Items to check
 * @param position Position of the group holding them, or an empty string for the navigation itself
 * @returns The problems found, in the items' order
 */
function _checkNavigation(items: unknown[], position = ''): string[] {
  const problems: string[] = [];
  items.forEach((item, index) => {
    const at = `${position}${index + 1}`;
    const problem = (message: string): void => void problems.push(`"navigation" item ${at}: ${message}`);
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return problem('must be an object');
    const record = item as Record<string, unknown>;
    const unknown = Object.keys(record).filter((key) => !_NAVIGATION_KEYS.includes(key));
    if (unknown.length) return problem(`unknown key ${unknown.map((key) => `"${key}"`).join(', ')}`);
    const { title, path, items: children, collapsed } = record;
    if (title !== undefined && (typeof title !== 'string' || !title.trim())) return problem('"title" must be a non-empty string');
    if (path !== undefined && children !== undefined) return problem('a page ("path") or a group ("items"), not both');
    if (collapsed !== undefined && children === undefined) return problem('"collapsed" is only for a group ("items")');
    if (collapsed !== undefined && typeof collapsed !== 'boolean') return problem('"collapsed" must be true or false');
    if (children !== undefined) {
      if (!Array.isArray(children) || !children.length) return problem('"items" must be a non-empty array of navigation items');
      if (title === undefined) return problem('a group needs a "title"');
      return void problems.push(..._checkNavigation(children, `${at}.`));
    }
    if (path === undefined) return problem('needs a "path" (a page) or "items" (a group)');
    if (typeof path !== 'string' || !path.trim()) return problem('"path" must be a non-empty string');
    if (path.startsWith('!')) {
      problem('"path" can\'t be negated ("!")');
    } else if (isNavigationUrl(path)) {
      if (!isAllowedNavigationUrl(path)) {
        problem(`a URL must be ${NAVIGATION_URL_SCHEMES.map((scheme) => `"${scheme}"`).join(', ')} or protocol-relative ("//")`);
      } else if (title === undefined) {
        problem('a URL needs a "title"');
      }
    } else if (isNavigationGlob(path)) {
      if (title !== undefined) problem('a pattern takes no "title": each documentation file it matches is labelled by its first heading');
    }
  });
  return problems;
}

/**
 * Validates a parsed configuration value
 * @param value Parsed content of a configuration file
 * @returns The configuration, or the errors found in it
 */
export function validateConfiguration(value: unknown): ConfigurationResult {
  // Check the value is an object
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { errors: [`${CONFIGURATION_FILE_NAME} must contain a JSON object`] };
  }
  // Check every key
  const errors: string[] = [];
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(key in _KEYS)) {
      errors.push(`${CONFIGURATION_FILE_NAME}: unknown key "${key}"`);
    } else if (key === 'project' && typeof record[key] === 'string') {
      // The project file's path moved into the object (D879)
      errors.push(
        `${CONFIGURATION_FILE_NAME}: "project" must be an object; give the project file's path as "project": { "path": ${JSON.stringify(record[key])} }`,
      );
    } else if (!_KEYS[key as keyof Configuration](record[key])) {
      errors.push(`${CONFIGURATION_FILE_NAME}: "${key}" must be ${_EXPECTED[key as keyof Configuration]}`);
    } else if (key === 'showcaseViews') {
      for (const [name, views] of Object.entries(record[key] as Record<string, string | string[]>)) {
        const problem = checkShowcaseViews(typeof views === 'string' ? [views] : views);
        if (problem) errors.push(`${CONFIGURATION_FILE_NAME}: "showcaseViews" of "${name}": ${problem}`);
      }
    } else if (key === 'navigation') {
      errors.push(..._checkNavigation(record[key] as unknown[]).map((problem) => `${CONFIGURATION_FILE_NAME}: ${problem}`));
    } else if (key === 'project') {
      errors.push(..._checkProject(record[key] as Record<string, unknown>).map((problem) => `${CONFIGURATION_FILE_NAME}: ${problem}`));
    }
  }
  // Without a stack adapter, nothing reads a project file, and nothing gives a name (D877, D879, D881)
  errors.push(..._checkWithoutStackAdapter(record).map((problem) => `${CONFIGURATION_FILE_NAME}: ${problem}`));
  return errors.length ? { errors } : { configuration: record as unknown as Configuration, errors: [] };
}

/**
 * Reads and validates the configuration file in a host repository's root
 * @param root Path of the host repository's root
 * @returns The configuration, or the errors that prevented reading it
 */
export async function readConfiguration(root: string): Promise<ConfigurationResult> {
  // Read the file
  let text: string;
  try {
    text = await readFile(join(root, CONFIGURATION_FILE_NAME), 'utf8');
  } catch (_err) {
    return { errors: [`${CONFIGURATION_FILE_NAME} not found in ${root}`] };
  }
  // Parse and validate it
  try {
    return validateConfiguration(JSON.parse(text));
  } catch (err) {
    return { errors: [`${CONFIGURATION_FILE_NAME} is not valid JSON: ${(err as Error).message}`] };
  }
}

// #endregion
