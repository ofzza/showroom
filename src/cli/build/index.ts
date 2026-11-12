/**
 * Build: `showroom build`, building the showroom of a host repository with Vite into its output folder, as static files. Internal: loaded
 * by main() with a dynamic `import()`, so library users and `showroom check` never load Vite, and not re-exported.
 */

import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build as viteBuild, type InlineConfig } from 'vite';
import { check } from '../check/index.js';
import { formatIssues, resolveOutputFolder } from '../check/internal/index.js';
import type { CliOutput } from '../index.js';
import { readConfiguration } from '../../configuration/index.js';
import { buildShowcases, getBuildShowcasesIssues } from '../../showcases/index.js';
import { getAppDir, getShownHostInformation, getViteConfiguration, type ViteConfigurationOptions } from '../../vite/index.js';

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
 * Represents the state of an output folder, before building: missing, empty, holding a previous build (marked), or holding anything else (unmarked)
 */
export type OutputFolderState = 'missing' | 'empty' | 'marked' | 'unmarked';

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
 * @returns The state of the output folder; anything that isn't a readable folder (e.g. a file) counts as unmarked
 */
export async function readOutputFolderState(path: string): Promise<OutputFolderState> {
  try {
    return getOutputFolderState(await readdir(path));
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unmarked';
  }
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
 * Codes of the bundler warnings left out of the build's output: FluentUI's and Griffel's `'use client'` directives, which only matter to server-side
 * React frameworks, and are warned about once per file
 */
export const SILENCED_WARNINGS: readonly string[] = ['MODULE_LEVEL_DIRECTIVE'];

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
}

/**
 * Builds the showroom of a host repository into its output folder: checks it, makes sure the output folder may be emptied, builds every showcase,
 * then builds the showroom with the showcase frames, and marks the output folder
 * @param options Options of the command
 * @returns Exit code: 0 once built, 1 if the check fails, the output folder can't be emptied, a showcase doesn't build, or the build fails
 */
export async function build({ root, outDir, output, appDir = getAppDir() }: BuildOptions): Promise<number> {
  // Check the host repository first
  const result = await check(root, { outDir });
  output.stderr(formatIssues(result.issues));
  if (!result.passed || !result.host) {
    return 1;
  }

  // Only empty an output folder that is empty, or holds a previous build
  const { configuration } = await readConfiguration(root);
  const outputFolder = configuration && resolveOutputFolder(root, configuration, outDir);
  if (!outputFolder || 'error' in outputFolder) {
    output.stderr(`error: ${outputFolder?.error ?? 'The configuration changed while building'}\n`);
    return 1;
  }
  if ((await readOutputFolderState(outputFolder.path)) === 'unmarked') {
    output.stderr(
      `error: Output folder "${outputFolder.relativePath}" is not empty, and holds no ${OUTPUT_FOLDER_MARKER} file from an earlier build; ` +
        'empty or delete it, or choose another output folder\n',
    );
    return 1;
  }

  // Build every showcase, leaving the output folder untouched if any fails
  const showcases = await buildShowcases({ root, host: result.host, configuration });
  const issues = getBuildShowcasesIssues(showcases);
  if (issues.length) {
    output.stderr(formatIssues(issues));
    return 1;
  }
  const frames = showcases.frames;
  const host = getShownHostInformation(result.host, frames);

  // Build, with Vite's cache in a fresh folder of its own, removed afterwards
  const cacheDir = await mkdtemp(join(tmpdir(), 'showroom-'));
  try {
    await viteBuild(getBuildConfiguration({ appDir, cacheDir, getHost: () => host, getFrames: () => frames, outDir: outputFolder.path }));
    await writeFile(join(outputFolder.path, OUTPUT_FOLDER_MARKER), OUTPUT_FOLDER_MARKER_CONTENT);
    output.stdout(`Built the showroom of ${host.project.name} into ${outputFolder.path}\n`);
    return 0;
  } catch (err) {
    output.stderr(`error: ${(err as Error).message}\n`);
    return 1;
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
}

// #endregion
