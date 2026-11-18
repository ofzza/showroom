/**
 * Configuration: reading and validating a host repository's mandatory `showroom.json` file
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getStackAdapterNames } from '../adapters/stack/index.js';
import type { ProjectInformation, ShowcaseView } from '../host/index.js';
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
   * Name of the stack adapter to use (e.g. `typescript`); required unless `project` is an object, when it names the host repository's stack instead
   * (any name but a built-in stack adapter's, whatever its case; `custom` if left out), for showcase adapters
   */
  stack?: string;
  /**
   * Source root directory, relative to the host repository's root; defaults to the stack adapter's
   */
  sourceRoot?: string;
  /**
   * Path of the file the stack adapter reads the project information from, relative to the host repository's root (e.g. a `.csproj`); defaults
   * to the stack adapter's (`package.json` for `typescript`), and the `dotnet` stack adapter requires it. Or the project information itself, as
   * an object, for a host repository whose stack has no stack adapter: then none is used
   */
  project?: string | ProjectInformation;
  /**
   * Output directory of the showroom, relative to the host repository's root; defaults to `./showroom`
   */
  outDir?: string;
  /**
   * `.gitignore`-style patterns of files to ignore, appended to the stack adapter's
   */
  ignore?: string[];
  /**
   * `.gitignore`-style patterns of code files, relative to the source root, appended to the stack adapter's
   */
  code?: string[];
  /**
   * `.gitignore`-style patterns of documentation files, appended to the built-in ones and the stack adapter's
   */
  documentation?: string[];
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
 * Represents an item of `showroom.json`'s `navigation`: a page, by its `path` (a documentation file's path, optionally followed by
 * `#<heading id>`; `/` for the home page; an absolute URL, `http:`, `https:`, `mailto:` or protocol-relative; or a `.gitignore`-style pattern standing for every documentation file it matches),
 * labelled by its `title` or else by its documentation file's first heading; or a group of items, captioned by its `title`
 */
export type NavigationEntry = { title?: string; path: string; items?: undefined } | { title: string; items: NavigationEntry[]; path?: undefined };

/**
 * Default output directory of the showroom
 */
export const DEFAULT_OUT_DIR = './showroom';

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
  sourceRoot: (value) => typeof value === 'string' && value.length > 0,
  project: (value) => (typeof value === 'string' && value.length > 0) || _isObject(value),
  outDir: (value) => typeof value === 'string' && value.length > 0,
  ignore: _isStringArray,
  code: _isStringArray,
  documentation: _isStringArray,
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
  sourceRoot: 'a non-empty string',
  project: "a non-empty string (a project file's path) or an object (the project information)",
  outDir: 'a non-empty string',
  ignore: 'an array of strings',
  code: 'an array of strings',
  documentation: 'an array of strings',
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
 * Keys an object `project` may hold: the project information's
 */
const _PROJECT_KEYS: readonly (keyof ProjectInformation)[] = ['name', 'version', 'description', 'license', 'author', 'homepage', 'repository'];

/**
 * Checks an object `project`: the project information, `name` required, every key a non-empty string
 * @param project The object to check
 * @returns The problems found, each naming its key
 */
function _checkProject(project: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(project)) {
    if (!(_PROJECT_KEYS as readonly string[]).includes(key)) {
      // A top-level key written inside the object is the likely mistake
      problems.push(`"project": unknown key "${key}"${key in _KEYS ? `; "${key}" is a top-level key of ${CONFIGURATION_FILE_NAME}` : ''}`);
    } else if (typeof project[key] !== 'string' || !project[key]) {
      problems.push(`"project": "${key}" must be a non-empty string`);
    }
  }
  if (!('name' in project)) {
    problems.push('"project": "name" is required');
  }
  return problems;
}

/**
 * Keys a navigation item may hold
 */
const _NAVIGATION_KEYS = ['title', 'path', 'items'];

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
    const { title, path, items: children } = record;
    if (title !== undefined && (typeof title !== 'string' || !title.trim())) return problem('"title" must be a non-empty string');
    if (path !== undefined && children !== undefined) return problem('a page ("path") or a group ("items"), not both');
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
    } else if (!_KEYS[key as keyof Configuration](record[key])) {
      errors.push(`${CONFIGURATION_FILE_NAME}: "${key}" must be ${_EXPECTED[key as keyof Configuration]}`);
    } else if (key === 'showcaseViews') {
      for (const [name, views] of Object.entries(record[key] as Record<string, string | string[]>)) {
        const problem = checkShowcaseViews(typeof views === 'string' ? [views] : views);
        if (problem) errors.push(`${CONFIGURATION_FILE_NAME}: "showcaseViews" of "${name}": ${problem}`);
      }
    } else if (key === 'navigation') {
      errors.push(..._checkNavigation(record[key] as unknown[]).map((problem) => `${CONFIGURATION_FILE_NAME}: ${problem}`));
    } else if (key === 'project' && _isObject(record[key])) {
      errors.push(..._checkProject(record[key]).map((problem) => `${CONFIGURATION_FILE_NAME}: ${problem}`));
    }
  }
  // An object project, valid or not, makes the stack optional, and leaves no stack adapter to name (D867, D874, D876)
  if (_isObject(record.project)) {
    const stack = record.stack;
    const builtIn = typeof stack === 'string' && getStackAdapterNames().find((name) => name.toLowerCase() === stack.toLowerCase());
    if (builtIn) {
      errors.push(
        `${CONFIGURATION_FILE_NAME}: "stack" can't name the built-in stack adapter "${builtIn}" when "project" is an object: give "project" as a path for it, or name the stack otherwise`,
      );
    }
  } else if (!('stack' in record)) {
    errors.push(`${CONFIGURATION_FILE_NAME}: "stack" is required, unless "project" is an object holding the project information`);
  }
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
