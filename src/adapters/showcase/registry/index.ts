/**
 * Showcase adapter registry: the built-in showcase adapters, and loading the custom showcase adapters a host repository lists in its
 * `showroom.json`. Internal, never re-exported.
 */

import { stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SHOWCASE_ADAPTER_NAME } from '../../../markdown/index.js';
import { HtmlShowcaseAdapter } from '../html/index.js';
import type { ShowcaseAdapter } from '../index.js';

// #region Built-in showcase adapters

/**
 * Built-in showcase adapters, by name
 */
const _SHOWCASE_ADAPTERS: Record<string, () => ShowcaseAdapter> = {
  html: () => new HtmlShowcaseAdapter(),
};

/**
 * Names of the showcase adapters planned as built-in ones, which custom showcase adapters can't take either
 */
export const PLANNED_SHOWCASE_ADAPTER_NAMES: readonly string[] = ['ts', 'react', 'angular'];

/**
 * Gets the names of the built-in showcase adapters
 * @returns Names of the built-in showcase adapters, sorted
 */
export function getShowcaseAdapterNames(): string[] {
  return Object.keys(_SHOWCASE_ADAPTERS).sort();
}

/**
 * Creates a built-in showcase adapter by name
 * @param name Name of the showcase adapter
 * @returns A new showcase adapter object, or undefined if there is no built-in one by that name
 */
export function createShowcaseAdapter(name: string): ShowcaseAdapter | undefined {
  return Object.hasOwn(_SHOWCASE_ADAPTERS, name) ? _SHOWCASE_ADAPTERS[name]() : undefined;
}

// #endregion

// #region Custom showcase adapters

/**
 * Represents the outcome of loading a host repository's custom showcase adapters: those that loaded, and the errors of those that didn't
 */
export interface CustomShowcaseAdapters {
  /**
   * Custom showcase adapters that loaded, by name
   */
  adapters: Map<string, ShowcaseAdapter>;
  /**
   * Errors of the custom showcase adapters that didn't load
   */
  errors: string[];
}

/**
 * Loads and validates the custom showcase adapters a host repository lists, running the host repository's code
 * @param root Path of the host repository's root
 * @param listed Custom showcase adapters' paths (relative to the root), by name, as `showroom.json`'s `customShowcaseAdapters` lists them
 * @returns The custom showcase adapters that loaded, and the errors of those that didn't
 */
export async function loadCustomShowcaseAdapters(root: string, listed: Record<string, string>): Promise<CustomShowcaseAdapters> {
  const result: CustomShowcaseAdapters = { adapters: new Map(), errors: [] };
  for (const [name, path] of Object.entries(listed)) {
    const loaded = await _load(root, name, path);
    if ('error' in loaded) {
      result.errors.push(`Custom showcase adapter "${name}": ${loaded.error}`);
    } else {
      result.adapters.set(name, loaded.adapter);
    }
  }
  return result;
}

/**
 * Loads and validates one custom showcase adapter
 * @param root Path of the host repository's root
 * @param name Name of the custom showcase adapter
 * @param path Path of its module, relative to the root
 * @returns The custom showcase adapter, or the error that prevents using it
 */
async function _load(root: string, name: string, path: string): Promise<{ adapter: ShowcaseAdapter } | { error: string }> {
  // Check the name
  if (!SHOWCASE_ADAPTER_NAME.test(name)) {
    return { error: 'invalid name: use lower-case letters, digits and "-", starting with a letter' };
  }
  if (Object.hasOwn(_SHOWCASE_ADAPTERS, name) || PLANNED_SHOWCASE_ADAPTER_NAMES.includes(name)) {
    return { error: 'the name is taken by a built-in showcase adapter' };
  }

  // Check the path
  const absolute = resolve(root, path);
  const fromRoot = relative(resolve(root), absolute);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    return { error: `"${path}" is outside the host repository` };
  }
  if (!/\.m?js$/.test(absolute)) {
    return { error: `"${path}" must be a .js or .mjs file` };
  }
  try {
    if (!(await stat(absolute)).isFile()) {
      return { error: `"${path}" is not a file` };
    }
  } catch (_err) {
    return { error: `"${path}" not found` };
  }

  // Load the module, and check its default export
  let module: Record<string, unknown>;
  try {
    module = await import(pathToFileURL(absolute).href);
  } catch (err) {
    return { error: `"${path}" failed to load: ${(err as Error).message}` };
  }
  const adapter = module.default as Record<string, unknown> | undefined;
  if (typeof adapter !== 'object' || adapter === null) {
    return { error: `"${path}" must have a default export: an object implementing the showcase adapter interface` };
  }
  const missing = ['validate', 'build'].filter((method) => typeof adapter[method] !== 'function');
  const invalid = ['check', 'close'].filter((method) => adapter[method] !== undefined && typeof adapter[method] !== 'function');
  if (missing.length || invalid.length) {
    const methods = [...missing, ...invalid].map((method) => `"${method}"`).join(', ');
    return { error: `"${path}"'s default export must implement the showcase adapter interface; check ${methods}` };
  }
  return { adapter: adapter as unknown as ShowcaseAdapter };
}

// #endregion
