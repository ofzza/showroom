/**
 * The `angular` showcase adapter: its entry point is a TypeScript module whose default export is a standalone component, compiled ahead of time by
 * the host's own Angular compiler, in memory (`compile/`), then built through the `ts` showcase adapter's build with plugins of its own
 * (`plugins/`: the emitted modules, the Angular Linker, the production defines), from a generated mount module creating the component in the
 * showcase frame root, on the `ts` page. Internal, never re-exported.
 */

import { basename, resolve } from 'node:path';
import type { Showcase } from '../../../host/index.js';
import type { ShowcaseAdapter, ShowcaseBuildRequest, ShowcaseBuildResult, ShowcaseHostCheck, ShowcaseValidation } from '../index.js';
import { getMountModulePath } from '../react/index.js';
import { buildTsShowcase, SHOWCASE_FRAME_ROOT_ID, toBuildIssues, TYPE_CHECK, validateTsShowcaseOptions, type GeneratedModule } from '../ts/index.js';
import { getDocumentationFolder, resolvePackage, resolveTypeScript } from '../ts/typecheck/index.js';
import {
  compileAngularShowcase,
  findAngular,
  getAngularProblems,
  loadAngular,
  NOT_A_STANDALONE_COMPONENT,
  type FoundAngular,
  type PackageResolver,
} from './compile/index.js';
import { createDefinesPlugin, createEmittedModulesPlugin, createLinkerPlugin, loadLinker } from './plugins/index.js';

export { MINIMUM_ANGULAR_VERSION } from './compile/index.js';

// #region Validation

/**
 * Represents the `angular` showcase adapter's options, as validated
 */
export interface AngularShowcaseOptions {
  /**
   * True to report the showcase's type errors and Angular's warnings (the default); its compile runs either way
   */
  typeCheck: boolean;
  /**
   * True to load `zone.js` before Angular, and run with zone-based change detection (false by default: zoneless)
   */
  zone: boolean;
}

/**
 * The `angular` showcase adapter's options' defaults
 */
const _DEFAULTS: AngularShowcaseOptions = { typeCheck: true, zone: false };

/**
 * Pattern of the entry points of the `angular` showcase adapter: TypeScript modules
 */
export const ANGULAR_ENTRY = /\.ts$/i;

/**
 * Validates an `angular` showcase: its options, `typeCheck` (`true` by default) and `zone` (`false` by default), both booleans (see
 * validateTsShowcaseOptions()), and its entry point, which must be a ` ```ts ` (or ` ```typescript `) code block, or a linked `.ts` file
 * @param showcase The showcase
 * @returns The validated options, or the errors found
 */
export function validateAngularShowcase(showcase: Showcase): ShowcaseValidation {
  const errors: string[] = [];
  const validated = validateTsShowcaseOptions('angular', showcase.options, errors, _DEFAULTS);
  if (!ANGULAR_ENTRY.test(showcase.entry)) {
    errors.push(
      showcase.kind === 'code-block'
        ? 'The angular showcase adapter needs a "ts" code block'
        : `The angular showcase adapter needs a link to a .ts file, not "${showcase.entry}"`,
    );
  }
  return errors.length ? { errors } : { options: validated, errors: [] };
}

// #endregion

// #region Host check

/**
 * Gets what keeps a documentation file's folder from building its `angular` showcases: its Angular and the TypeScript of its compiler (see
 * getAngularProblems()), and `zone.js` where a showcase sets `zone: true`
 * @param found The Angular the folder finds (see findAngular())
 * @param folder POSIX-style path of the folder, relative to the root, in the messages
 * @param zone True if a showcase of the folder sets `zone: true`
 * @param zoneFound True if `zone.js` is found from the folder
 * @returns A message per problem
 */
function _getFolderProblems(found: FoundAngular, folder: string, zone: boolean, zoneFound: boolean): string[] {
  const problems = getAngularProblems(found).map((problem) => `the angular showcases of "${folder}" can't be built: ${problem}`);
  if (zone && !zoneFound) {
    problems.push(`the angular showcases of "${folder}" with "zone: true" need "zone.js", but it isn't installed where it can be found: install it`);
  }
  return problems;
}

/**
 * Checks what `angular` showcases need from the host repository, once per documentation file's folder, resolving packages from it as Node does:
 * `@angular/core`, `@angular/common`, `@angular/compiler`, `@angular/compiler-cli` and `@angular/platform-browser`, 20 or later, of one major; the
 * TypeScript `@angular/compiler-cli` resolves, 5.x or 6.x, whether or not a showcase type checks (compiling needs it); and `zone.js` where a
 * showcase sets `zone: true`
 * @param root Absolute path of the host repository's root
 * @param showcases The `angular` showcases whose validation passed, with their validated options
 * @param resolver Resolves a package from a folder (see resolvePackage())
 * @returns The host requirements missing; there are no warnings
 */
export function checkAngular(root: string, showcases: readonly Showcase[], resolver: PackageResolver = resolvePackage): ShowcaseHostCheck {
  const errors: string[] = [];
  const folders = [...new Set(showcases.map((showcase) => getDocumentationFolder(showcase.documentation)))].sort();
  for (const folder of folders) {
    const path = resolve(root, folder);
    const zone = showcases.some(
      (showcase) => getDocumentationFolder(showcase.documentation) === folder && (showcase.options as Partial<AngularShowcaseOptions> | undefined)?.zone,
    );
    errors.push(..._getFolderProblems(findAngular(path, resolver), folder, zone, zone && resolver(path, 'zone.js') !== undefined));
  }
  return { errors, warnings: [] };
}

// #endregion

// #region Mount module

/**
 * Gets the source of a showcase's mount module: with `zone`, it imports `zone.js` first; it imports the entry point's default export, checks at run
 * time that it is a standalone component (else logs an error in the console panel), creates an application with the zoneless (or zone) change
 * detection, then inside the application's zone (as bootstrapping does, so what the component starts, e.g. a timer, triggers change detection
 * with zone.js) creates the component in the showcase frame root with the application's injector, and attaches its view, without which it never
 * refreshes; a missing default export fails the build, on this import
 * @param entry POSIX-style path of the showcase's entry point (only its file name is used, as the mount module sits beside it)
 * @param zone True to run with zone.js
 * @returns The mount module's source
 */
export function getAngularMountModule(entry: string, zone: boolean): string {
  const detection = zone ? 'provideZoneChangeDetection' : 'provideZonelessChangeDetection';
  return [
    ...(zone ? ["import 'zone.js';"] : []),
    `import { createComponent, NgZone, ${detection}, reflectComponentType } from '@angular/core';`,
    "import { createApplication } from '@angular/platform-browser';",
    `import Showcase from ${JSON.stringify(`./${basename(entry)}`)};`,
    '',
    'if (!reflectComponentType(Showcase)?.isStandalone) {',
    `  console.error(${JSON.stringify(NOT_A_STANDALONE_COMPONENT)});`,
    '} else {',
    `  createApplication({ providers: [${detection}()] })`,
    '    .then((application) => {',
    `      const hostElement = document.getElementById(${JSON.stringify(SHOWCASE_FRAME_ROOT_ID)});`,
    '      application.injector.get(NgZone).run(() => {',
    '        const component = createComponent(Showcase, { environmentInjector: application.injector, hostElement });',
    '        application.attachView(component.hostView);',
    '      });',
    '    })',
    '    .catch((error) => console.error(error));',
    '}',
    '',
  ].join('\n');
}

// #endregion

// #region Showcase adapter

/**
 * Represents the `angular` showcase adapter
 */
export class AngularShowcaseAdapter implements ShowcaseAdapter {
  /**
   * Creates the `angular` showcase adapter
   * @param _resolvePackage Resolves a package from a folder (see resolvePackage()); the tests replace it
   */
  constructor(private readonly _resolvePackage: PackageResolver = resolvePackage) {}

  /**
   * Validates a showcase (see validateAngularShowcase())
   * @param showcase The showcase
   * @returns The validated options, or the errors found
   */
  public validate(showcase: Showcase): ShowcaseValidation {
    return validateAngularShowcase(showcase);
  }

  /**
   * Checks what the showcases need from the host repository (see checkAngular())
   * @param root Absolute path of the host repository's root
   * @param showcases The `angular` showcases whose validation passed
   * @returns The host requirements missing
   */
  public check(root: string, showcases: Showcase[]): ShowcaseHostCheck {
    return checkAngular(root, showcases, this._resolvePackage);
  }

  /**
   * Releases nothing: each showcase's compile has its own parsed source files
   */
  public close(): void {}

  /**
   * Builds a showcase's showcase frame, in memory: finds the host's Angular again (failing the showcase when it is gone), compiles the showcase
   * (see compileAngularShowcase()), and when nothing in the compile always fails, bundles its mount module through the `ts` showcase adapter's build
   * (see buildTsShowcase()) with the emitted modules, the Linker and the mode's defines, its own type check off. A failed compile or bundle returns
   * its errors alone, with no checks; otherwise, with `typeCheck` on, the compile's type errors and warnings name the `type check`, beside the files;
   * the compile's reads join the bundle's
   * @param request What to build, and where it may write scratch files
   * @returns The showcase frame's files, its checks and its issues
   */
  public async build(request: ShowcaseBuildRequest): Promise<ShowcaseBuildResult> {
    const { root, showcase, mode } = request;
    const options = { ..._DEFAULTS, ...(request.options as Partial<AngularShowcaseOptions> | undefined) };
    const read = showcase.kind === 'code-block' ? showcase.documentation : showcase.entry;

    // The host's Angular, found again
    const folder = getDocumentationFolder(showcase.documentation);
    const found = findAngular(resolve(root, folder), this._resolvePackage);
    const zoneFound = options.zone && this._resolvePackage(resolve(root, folder), 'zone.js') !== undefined;
    const problems = _getFolderProblems(found, folder, options.zone, zoneFound);
    if (problems.length || !found.typeScript) return { reads: [read], issues: problems.map((message) => ({ severity: 'error', message })) };
    const compilerCli = found.packages['@angular/compiler-cli']!.folder;
    const loaded = await loadAngular(compilerCli, found.typeScript.folder);

    // The compile, before Vite
    const compiled = await compileAngularShowcase({ loaded, root, showcase, virtualFiles: request.hostVirtualFiles, typeCheck: options.typeCheck });
    const entry = resolve(root, showcase.entry).split('\\').join('/');
    const reads = new Set([read, ...compiled.reads]);
    if (compiled.errors.length || !compiled.emitted.has(entry)) {
      const errors = compiled.errors.length ? compiled.errors : [{ message: "Angular's compiler emitted nothing for the entry point" }];
      return { reads: [...reads], issues: toBuildIssues('error', errors) };
    }

    // The bundle, from the mount module
    const input = getMountModulePath(root, showcase.entry);
    const generated = new Map<string, GeneratedModule>([[input, { source: getAngularMountModule(showcase.entry, options.zone), errorsAt: showcase.entry }]]);
    const result = await buildTsShowcase({
      request,
      input,
      generated,
      plugins: [createEmittedModulesPlugin(compiled.emitted), createLinkerPlugin(await loadLinker(compilerCli)), createDefinesPlugin(mode)],
      compiled: new Set(compiled.emitted.keys()),
      typeCheck: false,
      sourceFiles: new Map(),
      resolveTypeScript,
    });
    result.reads.forEach((path) => reads.add(path));
    if (!result.files || !options.typeCheck) return { ...result, reads: [...reads] };
    const issues = [
      ...toBuildIssues('error', compiled.typeErrors, TYPE_CHECK),
      ...toBuildIssues('warning', compiled.warnings, TYPE_CHECK),
      ...(result.issues ?? []),
    ];
    return { ...result, reads: [...reads], checks: [TYPE_CHECK], ...(issues.length ? { issues } : {}) };
  }
}

// #endregion
