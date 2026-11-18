/**
 * Stack resolution: the host repository's stack from its configuration, with its stack adapter or, when `project` is an object, none (D865, D871,
 * D873); never re-exported
 */

import type { Configuration } from '../../../configuration/index.js';
import type { ProjectInformation } from '../../../host/index.js';
import { getStackAdapter, getStackAdapterNames, type StackAdapter } from '../index.js';

// #region Stack

/**
 * Represents the defaults a stack gives the configuration's source root and patterns, which the configuration's own are appended to
 */
export type StackDefaults = Pick<StackAdapter, 'sourceRoot' | 'ignore' | 'code' | 'documentation'>;

/**
 * Represents a host repository's resolved stack
 */
export interface ResolvedStack {
  /**
   * Name of the stack, which showcase adapters get: the stack adapter's, or the configuration's `stack` (`custom` if left out) without one
   */
  name: string;
  /**
   * The stack's defaults: the stack adapter's, or none (`NO_STACK_ADAPTER_DEFAULTS`) without one
   */
  defaults: StackDefaults;
  /**
   * The stack adapter, which reads the project information; none when `project` is an object, which holds it
   */
  adapter?: StackAdapter;
}

/**
 * Name of the stack when `project` is an object and `stack` is left out
 */
export const CUSTOM_STACK_NAME = 'custom';

/**
 * Defaults with no stack adapter: the host repository's root as the source root, and no patterns, so nothing is ignored, and nothing counts as
 * code, unless the configuration says so (D866, D875)
 */
export const NO_STACK_ADAPTER_DEFAULTS: StackDefaults = { sourceRoot: '.', ignore: [], code: [], documentation: [] };

/**
 * Resolves a host repository's stack from its validated configuration
 * @param configuration The configuration, as `validateConfiguration()` accepted it
 * @returns The stack, or the error when `stack` names no stack adapter
 */
export function resolveStack(configuration: Configuration): { stack: ResolvedStack; error?: undefined } | { stack?: undefined; error: string } {
  // An object project: no stack adapter, the configuration's name or the default one
  if (typeof configuration.project === 'object') {
    return { stack: { name: configuration.stack ?? CUSTOM_STACK_NAME, defaults: NO_STACK_ADAPTER_DEFAULTS } };
  }
  // Otherwise, the stack adapter the configuration names
  const name = configuration.stack ?? '';
  const adapter = getStackAdapter(name);
  if (!adapter) {
    return {
      error:
        `Unknown stack "${name}"; the stack adapters are: ${getStackAdapterNames().join(', ')}. ` +
        'A host repository whose stack has none gives "project" as an object holding its project information',
    };
  }
  return { stack: { name, defaults: adapter, adapter } };
}

/**
 * Gets the configuration's `project` as showcase adapters are given it: as written, a path, or a copy of the object, so a showcase adapter changing
 * it changes nothing else (D869, D876)
 * @param configuration The configuration, as `validateConfiguration()` accepted it
 * @returns The project, or undefined if the configuration has none
 */
export function getShowcaseProject(configuration: Configuration): string | ProjectInformation | undefined {
  return typeof configuration.project === 'object' ? { ...configuration.project } : configuration.project;
}

// #endregion
