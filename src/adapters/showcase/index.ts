/**
 * Showcase adapters: the interface every showcase adapter implements, built-in or custom (experimental: it may change in any release until it is
 * declared stable), including recorded showcases: their recording, and running a command in the host copy. The registry of built-in showcase
 * adapters and the loading of custom ones are internal (`./registry/`), never re-exported.
 */

import type { Showcase, ShowcaseView, VirtualFile } from '../../host/index.js';

// #region Validation

/**
 * Represents the outcome of validating a showcase: either its options, as the showcase adapter will use them, or the errors found in it
 */
export type ShowcaseValidation = { options?: unknown; errors: [] } | { options?: undefined; errors: string[] };

// #endregion

// #region Recording

/**
 * Represents a line of a recording: standard output's lines are `log` lines, standard error's `error` lines; the levels are the console's, as a
 * showcase frame's console lines have them
 */
export interface ShowcaseConsoleLine {
  /**
   * Level of the line
   */
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  /**
   * Text of the line, without its line break, cut at 10000 characters (ending in how many more there were)
   */
  text: string;
}

/**
 * Represents a recorded showcase's recording: its console output and how its run ended. Only the newest 128 lines are kept, those before them counted
 */
export interface ShowcaseRecording {
  /**
   * The newest lines, oldest first, 128 at most
   */
  lines: ShowcaseConsoleLine[];
  /**
   * Number of earlier lines left out
   */
  dropped: number;
  /**
   * Number of the lines left out that were warnings (`warn`), when any were
   */
  droppedWarnings?: number;
  /**
   * Number of the lines left out that were errors (`error`), when any were
   */
  droppedErrors?: number;
  /**
   * True if the output went past its cap (1 MB in all), the rest of it left out
   */
  cut?: boolean;
  /**
   * Exit code of the run; none when a signal or the time limit ended it
   */
  exitCode?: number;
  /**
   * Name of the signal that ended the run (e.g. `SIGABRT`), if one did
   */
  signal?: string;
  /**
   * True if the time limit ended the run
   */
  timedOut?: boolean;
  /**
   * The run's time limit, in milliseconds
   */
  timeLimit?: number;
}

/**
 * Represents the options of running a command in the host copy
 */
export interface ShowcaseRunOptions {
  /**
   * What the command does: `build` for a build step (restoring, compiling), whose time limit is 300 s, and which gets the environment variables
   * `--pass-env` names; `run` for the showcase's own run, recorded, whose time limit is 30 s
   */
  phase: 'build' | 'run';
  /**
   * Folder to run the command in, POSIX-style, relative to the host copy's root (never outside it); the documentation file's folder by default
   */
  cwd?: string;
  /**
   * Time limit, in milliseconds, after which the command's whole process tree is killed; never longer than its phase's
   */
  timeLimit?: number;
  /**
   * Environment variables of the showcase adapter's own, added to the cleaned environment (whose own variables win)
   */
  env?: Record<string, string>;
}

/**
 * Represents the outcome of running a command in the host copy: its recording, and its output as text, for a build's diagnostics; paths into the
 * host copy are made relative to the host repository's root in both
 */
export interface ShowcaseRun {
  /**
   * The recording: its lines, and how the run ended
   */
  recording: ShowcaseRecording;
  /**
   * Standard output, as text, within the output's cap
   */
  stdout: string;
  /**
   * Standard error, as text, within the output's cap
   */
  stderr: string;
}

/**
 * Represents the host copy, as a showcase adapter that declares `hostCopy` gets it: `showroom`'s copy of the host repository, with the virtual files
 * written where they belong, and a way to run a command in it under `showroom`'s limits
 */
export interface ShowcaseHostCopy {
  /**
   * Absolute path of the host copy's root
   */
  root: string;
  /**
   * Runs a command in the host copy: in a session of its own, with a cleaned environment, its standard input closed, a time limit, and its output
   * capped; never through a shell
   * @param command Name of the command, resolved from the `PATH` (outside the host repository and the host copy), never a path; `node` is the
   * Node.js running `showroom`
   * @param args Its arguments
   * @param options What it does, and where it runs
   * @returns Its recording and output; rejects when the command isn't found
   */
  run(command: string, args: readonly string[], options: ShowcaseRunOptions): Promise<ShowcaseRun>;
}

// #endregion

// #region Build

/**
 * Represents a request to build one showcase's showcase frame, or its recording
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
  /**
   * Path of the project file `showroom.json` configures (`project`), as written there; none if it configures none
   */
  project?: string;
  /**
   * Name of the stack adapter `showroom.json` configures (`stack`)
   */
  stack: string;
  /**
   * The host copy, when the showcase adapter declares `hostCopy`
   */
  hostCopy?: ShowcaseHostCopy;
  /**
   * Absolute path of a folder of the showcase's own, kept across `serve`'s runs (e.g. for its build's output), when the showcase adapter declares
   * `hostCopy` or `recorded`
   */
  showcaseFolder?: string;
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
 * Represents the outcome of building a showcase: the showcase frame's page and files, or a recorded showcase's recording, unless an error of the
 * build itself (one naming no check) prevented building it; the checks that ran to completion; the issues, errors and warnings, of the build and of
 * its checks (errors that all name a check leave the files usable); and the files the build read, so that they can be watched for changes
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
   * Names of the checks that ran to completion (e.g. `type check`), distinct; every issue's check is among them; never `runtime`, which `showroom`
   * adds for a recording
   */
  checks?: string[];
  /**
   * Issues of the build and of its checks
   */
  issues?: ShowcaseBuildIssue[];
  /**
   * The recording of a recorded showcase (from a showcase adapter that declares `recorded`), in place of `page` and `files`; present unless an error
   * names no check
   */
  recording?: ShowcaseRecording;
}

// #endregion

// #region Host check

/**
 * Represents what a host check is given about the host repository's configuration
 */
export interface ShowcaseCheckContext {
  /**
   * Path of the project file `showroom.json` configures (`project`), as written there; none if it configures none
   */
  project?: string;
  /**
   * Name of the stack adapter `showroom.json` configures (`stack`)
   */
  stack: string;
}

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
 * Represents what a showcase adapter copies into the host copy: everything in the host repository but what it leaves out
 */
export interface ShowcaseHostCopyContent {
  /**
   * Paths left out, in `.gitignore` syntax, matched against root-relative paths (e.g. `bin/`, `obj/`); the output folder is always left out
   */
  readonly exclude: readonly string[];
  /**
   * True to copy the `.git` folder too
   */
  readonly git: boolean;
}

/**
 * Represents a showcase adapter: what builds the showcases whose marker names it (`showcase=<name>`) into showcase frames, or records them. One
 * showcase adapter object lives for one run of `check` or `build`, or for one rerun of `serve` after a change, so it can share work between its
 * showcases, cleaning it up in `close()`.
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
   * True if its showcases are recorded: they have no showcase frame, so `view=demo` is an error on them, and its `defaultViews` must be given,
   * without `demo`; its build results carry a recording in place of `page` and `files`
   */
  readonly recorded?: boolean;
  /**
   * What it copies into the host copy, if it uses one: its build requests then carry the host copy, to build or record in
   */
  readonly hostCopy?: ShowcaseHostCopyContent;
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
   * @param context The host repository's configured project and stack
   * @returns The host requirements that are missing, and warnings
   */
  check?(root: string, showcases: Showcase[], context: ShowcaseCheckContext): ShowcaseHostCheck | Promise<ShowcaseHostCheck>;
  /**
   * Builds one showcase's showcase frame, in memory, or records it
   * @param request What to build, and where it may write scratch files
   * @returns The showcase frame's files or the recording, its checks and its issues
   */
  build(request: ShowcaseBuildRequest): Promise<ShowcaseBuildResult>;
  /**
   * Cleans up whatever the showcase adapter kept between builds; called once at the end of a run
   * @returns Nothing, or a promise resolved once cleaned up
   */
  close?(): void | Promise<void>;
}

// #endregion
