/**
 * Stack resolution: the host repository's stack from its configuration, with its stack adapter when `stack` names one (D877), and the project
 * merged from `showroom.json`'s `project` and the stack's defaults, read from no file (D885, D892); never re-exported
 */

import { posix } from 'node:path';
import type { ShowcaseProject } from '../../showcase/index.js';
import { BUILT_IN_DOCUMENTATION, type Configuration } from '../../../configuration/index.js';
import type { ProjectInformation } from '../../../host/index.js';
import { getStackAdapter, type StackAdapter } from '../index.js';

// #region Stack

/**
 * Represents the defaults a stack gives the project: its project file, source root and patterns, which `showroom.json`'s `project` overrides
 */
export type StackDefaults = Pick<StackAdapter, 'defaultProject' | 'sourceRoot' | 'ignore' | 'code' | 'documentation'>;

/**
 * Represents a host repository's resolved stack
 */
export interface ResolvedStack {
  /**
   * Name of the stack, which showcase adapters get: the configuration's `stack`, `custom` if left out
   */
  name: string;
  /**
   * The stack's defaults: the stack adapter's, or none (`NO_STACK_ADAPTER_DEFAULTS`) without one
   */
  defaults: StackDefaults;
  /**
   * The stack adapter, which reads the project information; none when `stack` names none
   */
  adapter?: StackAdapter;
}

/**
 * Name of the stack when `stack` is left out
 */
export const CUSTOM_STACK_NAME = 'custom';

/**
 * Defaults with no stack adapter: no project file, the host repository's root as the source root, and no patterns, so nothing is ignored, and
 * nothing counts as code, unless the configuration says so (D866, D875, D881)
 */
export const NO_STACK_ADAPTER_DEFAULTS: StackDefaults = { sourceRoot: '.', ignore: [], code: [], documentation: [] };

/**
 * Resolves a host repository's stack from its validated configuration: the stack adapter `stack` names exactly, or none (D877)
 * @param configuration The configuration, as `validateConfiguration()` accepted it
 * @returns The stack
 */
export function resolveStack(configuration: Configuration): ResolvedStack {
  const name = configuration.stack ?? CUSTOM_STACK_NAME;
  const adapter = configuration.stack === undefined ? undefined : getStackAdapter(configuration.stack);
  return adapter ? { name, defaults: adapter, adapter } : { name, defaults: NO_STACK_ADAPTER_DEFAULTS };
}

// #endregion

// #region Project

/**
 * Keys of the project information, which `showroom.json`'s `project` may override
 */
const _INFORMATION_KEYS: readonly (keyof ProjectInformation)[] = ['name', 'version', 'description', 'license', 'author', 'homepage', 'repository'];

/**
 * Represents the project's settings: what `ShowcaseProject` holds besides the project information
 */
export type ProjectSettings = Omit<ShowcaseProject, keyof ProjectInformation>;

/**
 * Merges the project information the stack adapter read with `showroom.json`'s `project`: each field given replaces the stack adapter's, and
 * `null` drops it (D881); the result holds only the project information's keys, so it can reach the browser (D892)
 * @param configuration The configuration, as `validateConfiguration()` accepted it
 * @param read The project information the stack adapter read; none without one
 * @returns The merged project information, `name` possibly missing, which the caller requires (D883)
 */
export function mergeProjectInformation(configuration: Configuration, read: Partial<ProjectInformation> = {}): Partial<ProjectInformation> {
  const merged: Partial<ProjectInformation> = {};
  for (const key of _INFORMATION_KEYS) {
    const value = configuration.project?.[key] === undefined ? read[key] : configuration.project[key];
    if (typeof value === 'string') merged[key] = value;
  }
  return merged;
}

/**
 * Gets the project's settings: `showroom.json`'s `project` over the stack's defaults (D886, D889, D892), the one place they meet. `path` is
 * `project.path` or the stack adapter's default, only with a stack adapter; `sourceRoot` is `project.sourceRoot`, else the stack's (`.` when
 * `null`); each list is the stack's patterns (none when `project` gives `null`), then `project`'s, after the built-in ones for documentation
 * @param configuration The configuration, as `validateConfiguration()` accepted it
 * @param stack The resolved stack
 * @returns The settings, paths POSIX-style and relative to the root (`.` for the root), each list a new array
 */
export function getProjectSettings(configuration: Configuration, stack: ResolvedStack): ProjectSettings {
  const project = configuration.project ?? {};
  const path = stack.adapter ? (project.path ?? stack.defaults.defaultProject) : undefined;
  const sourceRoot = project.sourceRoot === undefined ? stack.defaults.sourceRoot : (project.sourceRoot ?? '.');
  const list = (key: 'ignore' | 'code' | 'documentation'): string[] => [...(project[key] === null ? [] : stack.defaults[key]), ...(project[key] ?? [])];
  return {
    ...(path === undefined ? {} : { path: _normalizePath(path) }),
    sourceRoot: _normalizePath(sourceRoot),
    ignore: list('ignore'),
    code: list('code'),
    documentation: [...BUILT_IN_DOCUMENTATION, ...list('documentation')],
  };
}

/**
 * Gets the project as showcase adapters are given it: the merged project information and the project's settings, a new object on each call, so a
 * showcase adapter changing it changes nothing else (D882, D884)
 * @param configuration The configuration, as `validateConfiguration()` accepted it
 * @param stack The resolved stack
 * @param information The merged project information (see mergeProjectInformation()), its `name` required
 * @returns The project
 */
export function getShowcaseProject(configuration: Configuration, stack: ResolvedStack, information: ProjectInformation): ShowcaseProject {
  return { ...information, ...getProjectSettings(configuration, stack) };
}

/**
 * Normalises a path relative to the host repository's root: POSIX-style, without `./` or a trailing `/`, `.` for the root
 * @param path Path as written
 * @returns The normalised path; one leading out of the root keeps its `..`, for the caller to refuse
 */
function _normalizePath(path: string): string {
  const normalized = posix.normalize(path.replaceAll('\\', '/'));
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

// #endregion
