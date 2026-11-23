/**
 * Stack adapters: the common interface every stack adapter implements, and the registry of built-in stack adapters
 */

import type { ProjectInformation } from '../../host/index.js';
import { DotNetStackAdapter } from './dotnet/index.js';
import { TypeScriptStackAdapter } from './typescript/index.js';

export * from './dotnet/index.js';
export * from './typescript/index.js';

// #region Interface

/**
 * Represents a stack adapter: the implementation of `showroom`'s common interface for one kind of host repository (language or framework). New
 * capabilities are added as optional members, so existing stack adapters keep working.
 */
export interface StackAdapter {
  /**
   * Name the configuration selects the stack adapter by
   */
  readonly name: string;
  /**
   * Default source root directory, relative to the host repository's root
   */
  readonly sourceRoot: string;
  /**
   * `.gitignore`-style patterns of files to ignore
   */
  readonly ignore: readonly string[];
  /**
   * `.gitignore`-style patterns of code files, relative to the source root
   */
  readonly code: readonly string[];
  /**
   * `.gitignore`-style patterns of documentation files, appended to the built-in ones
   */
  readonly documentation: readonly string[];
  /**
   * Default path of the file the project information is read from, relative to the host repository's root (e.g. `package.json`); none if the
   * stack adapter needs `showroom.json`'s `project.path`
   */
  readonly defaultProject?: string;
  /**
   * Reads the host repository's project information, as far as the project file gives it: `name` too may be missing, as `showroom.json`'s
   * `project` can give it, and `showroom` requires it once both are merged
   * @param root Path of the host repository's root
   * @param project Path of the file to read it from, relative to the root, as `showroom.json`'s `project.path` sets it; the stack adapter's
   * default if undefined
   * @returns Project information; throws an error explaining why it can't be read
   */
  readProject(root: string, project?: string): Promise<Partial<ProjectInformation>>;
}

// #endregion

// #region Registry

/**
 * Built-in stack adapters, by name
 */
const _STACK_ADAPTERS: Record<string, () => StackAdapter> = {
  dotnet: () => new DotNetStackAdapter(),
  typescript: () => new TypeScriptStackAdapter(),
};

/**
 * Gets the names of the built-in stack adapters
 * @returns Names of the built-in stack adapters, sorted
 */
export function getStackAdapterNames(): string[] {
  return Object.keys(_STACK_ADAPTERS).sort();
}

/**
 * Gets a built-in stack adapter by name
 * @param name Name of the stack adapter
 * @returns The stack adapter, or undefined if there is none by that name
 */
export function getStackAdapter(name: string): StackAdapter | undefined {
  return Object.hasOwn(_STACK_ADAPTERS, name) ? _STACK_ADAPTERS[name]() : undefined;
}

// #endregion
