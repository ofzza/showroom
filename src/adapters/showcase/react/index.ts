/**
 * The `react` showcase adapter: its entry point is a TSX or JSX module whose default export is a component, rendered with the host's own React by a
 * generated mount module, and built through the `ts` showcase adapter's build, on its page (the showcase frame root above the console panel).
 * Internal, never re-exported.
 */

import { basename, resolve } from 'node:path';
import type { Showcase } from '../../../host/index.js';
import type { ShowcaseAdapter, ShowcaseBuildRequest, ShowcaseBuildResult, ShowcaseHostCheck, ShowcaseValidation } from '../index.js';
import { SHOWCASE_FRAME_ROOT_ID } from '../ts/console/index.js';
import { buildTsShowcase, REACT_ENTRY, TS_ENTRY, validateTsShowcaseOptions, type GeneratedModule } from '../ts/index.js';
import {
  checkTypeScript,
  getDocumentationFolder,
  readPackageJson,
  resolvePackage,
  resolveTypeScript,
  type SourceFileCache,
  type TypeScriptResolver,
} from '../ts/typecheck/index.js';

// #region Validation

/**
 * Validates a `react` showcase: its options are the `ts` showcase adapter's, `typeCheck` and `allowJs` (see validateTsShowcaseOptions()), and its
 * entry point must be a ` ```tsx ` or ` ```jsx ` code block, or a linked `.tsx` or `.jsx` file
 * @param showcase The showcase
 * @returns The validated options, or the errors found
 */
export function validateReactShowcase(showcase: Showcase): ShowcaseValidation {
  const errors: string[] = [];
  const validated = validateTsShowcaseOptions('react', showcase.options, errors);
  if (!REACT_ENTRY.test(showcase.entry)) {
    const ts = TS_ENTRY.test(showcase.entry) ? '; for ts and js, use the ts showcase adapter' : '';
    errors.push(
      showcase.kind === 'inline'
        ? `The react showcase adapter needs a "tsx" or "jsx" code block${ts}`
        : `The react showcase adapter needs a link to a .tsx or .jsx file, not "${showcase.entry}"${ts}`,
    );
  }
  return errors.length ? { errors } : { options: validated, errors: [] };
}

// #endregion

// #region Host check

/**
 * The oldest React major version supported
 */
export const MINIMUM_REACT_VERSION = 18;

/**
 * Represents a function resolving a package from a folder
 * @param folder Absolute path of the folder
 * @param name The package's name
 * @returns Absolute path of the package's folder, or undefined if it isn't found
 */
export type PackageResolver = (folder: string, name: string) => string | undefined;

/**
 * Gets the major version of a package's version
 * @param version The version
 * @returns Its major version, or undefined if it can't be read
 */
function _major(version: unknown): number | undefined {
  const major = typeof version === 'string' ? /^\s*v?(\d+)\./.exec(version)?.[1] : undefined;
  return major === undefined ? undefined : Number(major);
}

/**
 * Checks what `react` showcases need from the host repository, once per documentation file's folder, resolving packages from it as Node and Vite
 * do: `react` and `react-dom` 18 or later; and where some showcase type checks, the `ts` showcase adapter's TypeScript requirement, and React's
 * types (`@types/react`, unless `react` ships its own)
 * @param root Absolute path of the host repository's root
 * @param showcases The `react` showcases whose validation passed, with their validated options
 * @param resolver Resolves a package from a folder (see resolvePackage())
 * @param typeScriptResolver Resolves the `typescript` package from a folder (see resolveTypeScript())
 * @returns The host requirements missing, and the warnings
 */
export function checkReact(
  root: string,
  showcases: readonly Showcase[],
  resolver: PackageResolver = resolvePackage,
  typeScriptResolver: TypeScriptResolver = resolveTypeScript,
): ShowcaseHostCheck {
  const result: ShowcaseHostCheck = { errors: [], warnings: [] };
  const typeChecking = showcases.filter((showcase) => (showcase.options as { typeCheck?: unknown } | undefined)?.typeCheck !== false);
  const typeCheckingFolders = new Set(typeChecking.map((showcase) => getDocumentationFolder(showcase.documentation)));
  const folders = [...new Set(showcases.map((showcase) => getDocumentationFolder(showcase.documentation)))].sort();
  for (const folder of folders) {
    const path = resolve(root, folder);
    let react: Record<string, unknown> | undefined;
    for (const name of ['react', 'react-dom']) {
      const found = resolver(path, name);
      const manifest = found === undefined ? undefined : readPackageJson(found);
      if (name === 'react') react = manifest;
      const major = _major(manifest?.version);
      if (found === undefined) {
        result.errors.push(
          `the react showcases of "${folder}" need "${name}" ${MINIMUM_REACT_VERSION} or later, but it isn't installed where it can be found: install "react" and "react-dom"`,
        );
      } else if (major !== undefined && major < MINIMUM_REACT_VERSION) {
        result.errors.push(
          `the react showcases of "${folder}" need "${name}" ${MINIMUM_REACT_VERSION} or later, but the one found is ${String(manifest?.version)}: upgrade it`,
        );
      }
    }
    if (typeCheckingFolders.has(folder) && react !== undefined && react.types === undefined && react.typings === undefined) {
      if (resolver(path, '@types/react') === undefined) {
        result.errors.push(
          `the react showcases of "${folder}" type check, but React's types aren't installed where they can be found: install "@types/react", or set "typeCheck: false"`,
        );
      }
    }
  }
  const typeScript = checkTypeScript(root, typeChecking, typeScriptResolver, 'react');
  return { errors: [...result.errors, ...typeScript.errors], warnings: [...result.warnings, ...typeScript.warnings] };
}

// #endregion

// #region Mount module

/**
 * Gets the absolute path of a showcase's mount module: beside its entry point, so that its imports (`react`, `react-dom/client`) resolve from the
 * host repository, as the entry point's do
 * @param root Absolute path of the host repository's root
 * @param entry POSIX-style path of the showcase's entry point, relative to the root
 * @returns The mount module's absolute path
 */
export function getMountModulePath(root: string, entry: string): string {
  return `${resolve(root, entry)}.showroom-mount.js`;
}

/**
 * Gets the source of a showcase's mount module: it imports the entry point's default export, and renders it into the showcase frame root with
 * `react-dom/client`'s `createRoot`, without StrictMode; a missing default export fails the build, on this import
 * @param entry POSIX-style path of the showcase's entry point (only its file name is used, as the mount module sits beside it)
 * @returns The mount module's source
 */
export function getMountModule(entry: string): string {
  return [
    "import { createElement } from 'react';",
    "import { createRoot } from 'react-dom/client';",
    `import Showcase from ${JSON.stringify(`./${basename(entry)}`)};`,
    '',
    `createRoot(document.getElementById(${JSON.stringify(SHOWCASE_FRAME_ROOT_ID)})).render(createElement(Showcase));`,
    '',
  ].join('\n');
}

// #endregion

// #region Showcase adapter

/**
 * Represents the `react` showcase adapter
 */
export class ReactShowcaseAdapter implements ShowcaseAdapter {
  /**
   * Parsed source files shared between this run's type checks, released in close()
   */
  private _sourceFiles: SourceFileCache = new Map();

  /**
   * Creates the `react` showcase adapter
   * @param _resolvePackage Resolves a package from a folder (see resolvePackage()); the tests replace it
   * @param _resolveTypeScript Resolves the `typescript` package from a folder (see resolveTypeScript()); the tests replace it
   */
  constructor(
    private readonly _resolvePackage: PackageResolver = resolvePackage,
    private readonly _resolveTypeScript: TypeScriptResolver = resolveTypeScript,
  ) {}

  /**
   * Validates a showcase (see validateReactShowcase())
   * @param showcase The showcase
   * @returns The validated options, or the errors found
   */
  public validate(showcase: Showcase): ShowcaseValidation {
    return validateReactShowcase(showcase);
  }

  /**
   * Checks what the showcases need from the host repository (see checkReact())
   * @param root Absolute path of the host repository's root
   * @param showcases The `react` showcases whose validation passed
   * @returns The host requirements missing, and the warnings
   */
  public check(root: string, showcases: Showcase[]): ShowcaseHostCheck {
    return checkReact(root, showcases, this._resolvePackage, this._resolveTypeScript);
  }

  /**
   * Releases the parsed source files shared between this run's type checks
   */
  public close(): void {
    this._sourceFiles = new Map();
  }

  /**
   * Builds a showcase's showcase frame, in memory: its mount module, with the entry point and everything it imports, through the `ts` showcase
   * adapter's build (see buildTsShowcase()), with JSX's automatic runtime pinned, and `jsx: react-jsx` as the type check's default
   * @param request What to build, and where it may write scratch files
   * @returns The showcase frame's files, or the build errors
   */
  public build(request: ShowcaseBuildRequest): Promise<ShowcaseBuildResult> {
    const input = getMountModulePath(request.root, request.showcase.entry);
    const generated = new Map<string, GeneratedModule>([[input, { source: getMountModule(request.showcase.entry), errorsAt: request.showcase.entry }]]);
    return buildTsShowcase({
      request,
      input,
      generated,
      oxc: { jsx: { runtime: 'automatic' } },
      jsx: true,
      sourceFiles: this._sourceFiles,
      resolveTypeScript: this._resolveTypeScript,
    });
  }
}

// #endregion
