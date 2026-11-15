/**
 * Showcase adapters: the interface every showcase adapter implements, built-in or custom (experimental: it may change in any release until it is
 * declared stable). The registry of built-in showcase adapters and the loading of custom ones are internal (`./registry/`), never re-exported.
 */

import type { Showcase, ShowcaseView, VirtualFile } from '../../host/index.js';

// #region Validation

/**
 * Represents the outcome of validating a showcase: either its options, as the showcase adapter will use them, or the errors found in it
 */
export type ShowcaseValidation = { options?: unknown; errors: [] } | { options?: undefined; errors: string[] };

// #endregion

// #region Build

/**
 * Represents a request to build one showcase's showcase frame
 */
export interface ShowcaseBuildRequest {
  /**
   * Absolute path of the host repository's root
   */
  root: string;
  /**
   * The showcase to build
   */
  showcase: Showcase;
  /**
   * The showcase's options, as the showcase adapter's `validate()` returned them
   */
  options: unknown;
  /**
   * Virtual files of the folder holding the showcase's documentation file, which resolve like real files there
   */
  virtualFiles: VirtualFile[];
  /**
   * Every virtual file of the host repository, in any folder, which resolve like real files where they are (e.g. by a relative path to another
   * folder)
   */
  hostVirtualFiles: VirtualFile[];
  /**
   * Mode to build in: `development` in `serve` (e.g. unminified, with source maps), `production` in `build` and `check --showcases`
   */
  mode: 'development' | 'production';
  /**
   * Absolute path of an empty scratch folder `showroom` created for this build, and removes after it, for tools that must write to disk
   */
  scratchFolder: string;
}

/**
 * Represents a file of a built showcase frame, held in memory
 */
export interface ShowcaseBuildFile {
  /**
   * POSIX-style path of the file, relative to the showcase frame's folder
   */
  path: string;
  /**
   * Content of the file
   */
  content: string | Uint8Array;
}

/**
 * Represents an issue of building a showcase: an error, or a warning
 */
export interface ShowcaseBuildIssue {
  /**
   * Severity of the issue: an error fails `showroom build` and `showroom check --showcases`, a warning fails nothing
   */
  severity: 'error' | 'warning';
  /**
   * Description of the issue
   */
  message: string;
  /**
   * POSIX-style path of the file the issue is in, relative to the host repository's root (a virtual file's path for an issue in a code block)
   */
  path?: string;
  /**
   * Line of the issue in that file, from 1
   */
  line?: number;
  /**
   * Name of the check the issue belongs to (one of the result's `checks`, e.g. `type check`), or undefined for an issue of the build itself
   */
  check?: string;
}

/**
 * Represents the outcome of building a showcase: the showcase frame's page and files, unless an error of the build itself (one naming no check)
 * prevented building it; the checks that ran to completion; the issues, errors and warnings, of the build and of its checks (errors that all name a
 * check leave the files usable); and the files the build read, so that they can be watched for changes
 */
export interface ShowcaseBuildResult {
  /**
   * POSIX-style path of the showcase frame's page among its files; present exactly when `files` is
   */
  page?: string;
  /**
   * Files of the showcase frame, its page and its assets; present unless an error names no check
   */
  files?: ShowcaseBuildFile[];
  /**
   * POSIX-style paths, relative to the host repository's root, of the files the build read
   */
  reads: string[];
  /**
   * Names of the checks that ran to completion (e.g. `type check`), distinct; every issue's check is among them
   */
  checks?: string[];
  /**
   * Issues of the build and of its checks
   */
  issues?: ShowcaseBuildIssue[];
}

// #endregion

// #region Host check

/**
 * Represents the outcome of checking the host repository for what a showcase adapter needs: the host requirements that are missing, which fail the
 * check, and warnings, which don't; either may be empty
 */
export interface ShowcaseHostCheck {
  /**
   * Descriptions of the host requirements that are missing
   */
  errors: string[];
  /**
   * Warnings about the host repository, which `showroom` reports without failing anything
   */
  warnings: string[];
}

// #endregion

// #region Interface

/**
 * Represents a showcase adapter: what builds the showcases whose marker names it (`showcase=<name>`) into showcase frames. One showcase adapter
 * object lives for one run of `check` or `build`, or for one rerun of `serve` after a change, so it can share work between its showcases, cleaning
 * it up in `close()`.
 *
 * Experimental: this interface may change in any release until it is declared stable.
 */
export interface ShowcaseAdapter {
  /**
   * Its default showcase views, for its showcases shown as blocks whose marker has no `view=` and whose showcase adapter `showroom.json`'s
   * `showcaseViews` doesn't list: at least one view, none repeated, `none` alone; `['demo']` if not given
   */
  readonly defaultViews?: readonly ShowcaseView[];
  /**
   * Validates one showcase, statically: its options and its entry point (e.g. the entry point's extension)
   * @param showcase The showcase, with its options as its marker gives them
   * @returns The validated options, or the errors found
   */
  validate(showcase: Showcase): ShowcaseValidation | Promise<ShowcaseValidation>;
  /**
   * Checks the host repository for what the showcase adapter needs (e.g. a package installed), statically; called once per run, only when some
   * showcase uses the showcase adapter
   * @param root Absolute path of the host repository's root
   * @param showcases The showcases using the showcase adapter whose validation passed, each with its options as `validate()` returned them
   * @returns The host requirements that are missing, and warnings
   */
  check?(root: string, showcases: Showcase[]): ShowcaseHostCheck | Promise<ShowcaseHostCheck>;
  /**
   * Builds one showcase's showcase frame, in memory
   * @param request What to build, and where it may write scratch files
   * @returns The showcase frame's files, its checks and its issues
   */
  build(request: ShowcaseBuildRequest): Promise<ShowcaseBuildResult>;
  /**
   * Cleans up whatever the showcase adapter kept between builds; called once at the end of a run
   * @returns Nothing, or a promise resolved once cleaned up
   */
  close?(): void | Promise<void>;
}

// #endregion
