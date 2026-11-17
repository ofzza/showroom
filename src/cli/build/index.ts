/**
 * Build: `showroom build`, building the showroom of a host repository with Vite into its output folder, as static files. Internal: loaded
 * by main() with a dynamic `import()`, so library users and `showroom check` never load Vite, and not re-exported.
 */

import { lstat, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { build as viteBuild, type InlineConfig } from 'vite';
import { checkHost, type CheckOptions } from '../check/index.js';
import { escapeControlCharacters, formatIssues, resolveOutputFolder, SILENCED_WARNINGS } from '../check/internal/index.js';
import type { CliOutput } from '../index.js';
import { readConfiguration } from '../../configuration/index.js';
import { createRunSession } from '../../host-copy/index.js';
import { buildShowcases, getBuildShowcasesIssues } from '../../showcases/index.js';
import {
  getAppDir,
  getShownHostInformation,
  getTabFileHashes,
  getViteConfiguration,
  loadsShowcaseFrame,
  type ViteConfigurationOptions,
} from '../../vite/index.js';

// #region Output folder marker

/**
 * Name of the marker file every build writes into the output folder; a non-empty output folder is only emptied when it holds one
 */
export const OUTPUT_FOLDER_MARKER = '.showroom';

/**
 * Content of the marker file
 */
export const OUTPUT_FOLDER_MARKER_CONTENT = 'This folder is the output folder of `showroom build`: its whole content is deleted and rebuilt on every build.\n';

/**
 * Represents the state of an output folder, before building: missing, empty, holding a previous build (marked), holding anything else (unmarked),
 * or a symbolic link, or a folder whose real path leads outside the host repository's real root through one (linked), which is never emptied
 */
export type OutputFolderState = 'missing' | 'empty' | 'marked' | 'unmarked' | 'linked';

/**
 * Gets the state of an output folder from its entries
 * @param entries Names of the entries in the output folder, or undefined if it doesn't exist
 * @returns The state of the output folder
 */
export function getOutputFolderState(entries: string[] | undefined): OutputFolderState {
  if (entries === undefined) return 'missing';
  if (!entries.length) return 'empty';
  return entries.includes(OUTPUT_FOLDER_MARKER) ? 'marked' : 'unmarked';
}

/**
 * Reads the state of an output folder
 * @param path Path of the output folder
 * @param root Path of the host repository's root, whose real path the output folder's must lead inside; not checked if not given
 * @returns The state of the output folder; anything that isn't a readable folder (e.g. a file) counts as unmarked
 */
export async function readOutputFolderState(path: string, root?: string): Promise<OutputFolderState> {
  if (root !== undefined && !(await _isInsideRealRoot(path, root))) return 'linked';
  try {
    return getOutputFolderState(await readdir(path));
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unmarked';
  }
}

/**
 * Checks that a folder is no symbolic link, and that its real path (or, while it doesn't exist, its nearest existing parent's, with the rest of its
 * path) is inside the real path of a root, and isn't the root itself
 * @param path Path of the folder
 * @param root Path of the root
 * @returns True if it is
 */
async function _isInsideRealRoot(path: string, root: string): Promise<boolean> {
  if ((await lstat(path).catch(() => undefined))?.isSymbolicLink()) return false;
  const rest: string[] = [];
  let existing = path;
  let real: string | undefined;
  while ((real = await realpath(existing).catch(() => undefined)) === undefined) {
    if (dirname(existing) === existing) return false;
    rest.unshift(basename(existing));
    existing = dirname(existing);
  }
  const relativePath = relative(await realpath(root), join(real, ...rest));
  return !!relativePath && relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

// #endregion

// #region Build

/**
 * Represents the options of the build's Vite configuration
 */
export interface BuildConfigurationOptions extends ViteConfigurationOptions {
  /**
   * Absolute path of the output folder
   */
  outDir: string;
}

/**
 * Size of the showroom's single chunk above which Vite warns, in kB: above the application's own size (about 760 kB), which isn't the host
 * repository's to change
 */
export const CHUNK_SIZE_WARNING_LIMIT = 2048;

/**
 * Gets the Vite configuration of the build: the showroom's, building into the output folder and emptying it first (it is outside Vite's
 * root, so Vite wouldn't empty it otherwise), without the warnings about the application's own dependencies
 * @param options Options of the configuration
 * @returns Vite's inline configuration
 */
export function getBuildConfiguration({ outDir, ...options }: BuildConfigurationOptions): InlineConfig {
  return {
    ...getViteConfiguration(options),
    build: {
      outDir,
      emptyOutDir: true,
      chunkSizeWarningLimit: CHUNK_SIZE_WARNING_LIMIT,
      rolldownOptions: {
        onwarn: (warning, warn) => {
          if (!SILENCED_WARNINGS.includes(warning.code ?? '')) warn(warning);
        },
      },
    },
  };
}

/**
 * Represents the options of `showroom build`
 */
export interface BuildOptions {
  /**
   * Path of the host repository's root
   */
  root: string;
  /**
   * Output folder given on the command line, overriding the configuration's
   */
  outDir?: string;
  /**
   * Output to write to: the outcome to stdout, issues to stderr
   */
  output: CliOutput;
  /**
   * Folder of the showroom (see getAppDir())
   */
  appDir?: string;
  /**
   * Whether the host repository's code may run, or the function deciding it, called by the check (see CheckOptions' `trust`); not trusted if not
   * given: the showroom is built with every showcase shown as its source
   */
  trust?: CheckOptions['trust'];
  /**
   * Names of the environment variables passed on to recorded showcases' build steps (see CheckOptions' `passEnv`)
   */
  passEnv?: string[];
}

/**
 * Builds the showroom of a host repository into its output folder: checks it, makes sure the output folder may be emptied, builds every showcase,
 * then builds the showroom with the showcase frames, and marks the output folder. Trust is decided once, by the check; without it, no showcase is
 * built, and the showroom shows every showcase as its source.
 * @param options Options of the command
 * @returns Exit code: 0 once built, 1 if the check fails, the output folder can't be emptied, a showcase doesn't build, or the build fails
 */
export async function build({ root, outDir, output, appDir = getAppDir(), trust = false, passEnv = [] }: BuildOptions): Promise<number> {
  // Check the host repository first, deciding trust
  const result = await checkHost(root, { outDir, trust }, 'build');
  output.stderr(formatIssues(result.issues));
  if (!result.passed || !result.host) {
    return 1;
  }

  // Only empty an output folder that is empty, or holds a previous build
  const { configuration } = await readConfiguration(root);
  const outputFolder = configuration && resolveOutputFolder(root, configuration, outDir);
  if (!outputFolder || 'error' in outputFolder) {
    output.stderr(`error: ${escapeControlCharacters(outputFolder?.error ?? 'The configuration changed while building', true)}\n`);
    return 1;
  }
  const state = await readOutputFolderState(outputFolder.path, root);
  if (state === 'linked') {
    output.stderr(
      `error: Output folder "${escapeControlCharacters(outputFolder.relativePath, false)}" is a symbolic link, or leads outside the host repository through one; ` +
        'choose another output folder\n',
    );
    return 1;
  }
  if (state === 'unmarked') {
    output.stderr(
      `error: Output folder "${escapeControlCharacters(outputFolder.relativePath, false)}" is not empty, and holds no ${OUTPUT_FOLDER_MARKER} file from an earlier build; ` +
        'empty or delete it, or choose another output folder\n',
    );
    return 1;
  }

  // Build every showcase, leaving the output folder untouched if any fails; build warnings are written, and fail nothing
  const session = createRunSession({ passEnv });
  let showcases: Awaited<ReturnType<typeof buildShowcases>>;
  try {
    showcases = await buildShowcases({ root, host: result.host, configuration, trust: result.trusted, session, outDir });
  } finally {
    await session.dispose();
  }
  const issues = getBuildShowcasesIssues(showcases);
  output.stderr(formatIssues(issues));
  if (issues.some((issue) => issue.severity === 'error')) {
    return 1;
  }
  const host = getShownHostInformation(result.host, { ...showcases, trusted: result.trusted }, await getTabFileHashes(root, result.host));
  // Only the showcase frames a view loads are emitted: a showcase shown by its markdown or source alone was built and checked, and that's all
  const loaded = new Set(result.host.showcases.filter(({ views }) => loadsShowcaseFrame(views)).map(({ id }) => id));
  const frames = new Map([...showcases.frames].filter(([id]) => loaded.has(id)));

  // Build, with Vite's cache in a fresh folder of its own, removed afterwards
  const cacheDir = await mkdtemp(join(tmpdir(), 'showroom-'));
  try {
    await viteBuild(getBuildConfiguration({ appDir, cacheDir, hostRoot: root, getHost: () => host, getFrames: () => frames, outDir: outputFolder.path }));
    await writeFile(join(outputFolder.path, OUTPUT_FOLDER_MARKER), OUTPUT_FOLDER_MARKER_CONTENT);
    output.stdout(`Built the showroom of ${escapeControlCharacters(host.project.name, false)} into ${escapeControlCharacters(outputFolder.path, false)}\n`);
    return 0;
  } catch (err) {
    output.stderr(`error: ${escapeControlCharacters((err as Error).message, true)}\n`);
    return 1;
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
}

// #endregion
