/**
 * Showcase adapters: the interface every showcase adapter implements, built-in or custom (experimental: it may change in any release until it is
 * declared stable). The registry of built-in showcase adapters and the loading of custom ones are internal (`./registry/`), never re-exported.
 */

import type { Showcase, VirtualFile } from '../../host/index.js';

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
 * Represents an error building a showcase
 */
export interface ShowcaseBuildError {
  /**
   * Description of the error
   */
  message: string;
  /**
   * POSIX-style path of the file the error is in, relative to the host repository's root (a virtual file's path for an error in a code block)
   */
  path?: string;
  /**
   * Line of the error in that file, from 1
   */
  line?: number;
}

/**
 * Represents the outcome of building a showcase: either the showcase frame's files, or the errors that prevented building it; with the files the
 * build read either way, so that they can be watched for changes
 */
export type ShowcaseBuildResult =
  | {
      /**
       * POSIX-style path of the showcase frame's page among its files
       */
      page: string;
      /**
       * Files of the showcase frame: its page and its assets
       */
      files: ShowcaseBuildFile[];
      /**
       * POSIX-style paths, relative to the host repository's root, of the files the build read
       */
      reads: string[];
      errors?: undefined;
    }
  | {
      page?: undefined;
      files?: undefined;
      /**
       * POSIX-style paths, relative to the host repository's root, of the files the build read
       */
      reads: string[];
      /**
       * Errors that prevented building the showcase
       */
      errors: ShowcaseBuildError[];
    };

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
   * Validates one showcase, statically: its options and its entry point (e.g. the entry point's extension)
   * @param showcase The showcase, with its options as its marker gives them
   * @returns The validated options, or the errors found
   */
  validate(showcase: Showcase): ShowcaseValidation | Promise<ShowcaseValidation>;
  /**
   * Checks the host repository for what the showcase adapter needs (e.g. a package installed), statically; called once per run, only when some
   * showcase uses the showcase adapter
   * @param root Absolute path of the host repository's root
   * @returns Descriptions of the host requirements that are missing, or none
   */
  check?(root: string): string[] | Promise<string[]>;
  /**
   * Builds one showcase's showcase frame, in memory
   * @param request What to build, and where it may write scratch files
   * @returns The showcase frame's files, or the build errors
   */
  build(request: ShowcaseBuildRequest): Promise<ShowcaseBuildResult>;
  /**
   * Cleans up whatever the showcase adapter kept between builds; called once at the end of a run
   * @returns Nothing, or a promise resolved once cleaned up
   */
  close?(): void | Promise<void>;
}

// #endregion
