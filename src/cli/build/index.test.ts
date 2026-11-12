/**
 * Tests of `showroom build`
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CliOutput } from '../index.js';
import {
  CHUNK_SIZE_WARNING_LIMIT,
  OUTPUT_FOLDER_MARKER,
  OUTPUT_FOLDER_MARKER_CONTENT,
  build,
  getBuildConfiguration,
  getOutputFolderState,
  readOutputFolderState,
} from './index.js';

/**
 * Gets the path of a fixture host repository
 * @param name Name of the fixture
 * @returns Path of the fixture's root
 */
function _fixture(name: string): string {
  return fileURLToPath(new URL(`../../../test/fixtures/${name}`, import.meta.url));
}

/**
 * Creates an output capturing what is written to it
 * @returns The output, and what was written to stdout and stderr
 */
function _capture(): { output: CliOutput; written: { stdout: string; stderr: string } } {
  const written = { stdout: '', stderr: '' };
  return { output: { stdout: (text) => (written.stdout += text), stderr: (text) => (written.stderr += text) }, written };
}

describe('cli/build', () => {
  // Tests the build without running Vite (see AGENTS.md › Testing): the output folder marker's decision, read from the output folder fixture's folders,
  // the build's Vite configuration, and build() where it stops before building, so nothing is ever written.

  describe('Output folder marker', () => {
    // Whether an output folder may be emptied: only when it's missing, empty, or marked by an earlier build.

    it('Tells missing, empty, marked and unmarked output folders apart from their entries', () => {
      expect(getOutputFolderState(undefined)).toBe('missing');
      expect(getOutputFolderState([])).toBe('empty');
      expect(getOutputFolderState(['index.html', OUTPUT_FOLDER_MARKER])).toBe('marked');
      expect(getOutputFolderState(['index.html', 'assets'])).toBe('unmarked');
    });

    it('Reads the state of output folders', async () => {
      const root = _fixture('output-folder');
      expect(await readOutputFolderState(join(root, 'missing'))).toBe('missing');
      expect(await readOutputFolderState(join(root, 'showroom'))).toBe('marked');
      expect(await readOutputFolderState(join(root, 'unmarked'))).toBe('unmarked');
    });

    it('Reads a file in place of the output folder as unmarked', async () => {
      // A file can't be emptied as a folder, so it must never be deleted either
      expect(await readOutputFolderState(join(_fixture('output-folder'), 'README.md'))).toBe('unmarked');
    });

    it("Says in the marker's content that the folder is rebuilt", () => {
      expect(OUTPUT_FOLDER_MARKER_CONTENT).toMatch(/deleted and rebuilt on every build/);
    });
  });

  describe('getBuildConfiguration', () => {
    // The Vite configuration the build adds to the showroom's.

    const configuration = getBuildConfiguration({
      appDir: '/app',
      cacheDir: '/cache',
      getHost: () => ({ project: { name: 'host' }, documentation: [], showcases: [] }),
      outDir: '/host/showroom',
    });

    it("Builds the showroom's configuration into the output folder, emptying it", () => {
      expect(configuration).toMatchObject({ configFile: false, root: '/app', base: './', cacheDir: '/cache', logLevel: 'warn' });
      expect(configuration.build).toMatchObject({ outDir: '/host/showroom', emptyOutDir: true, chunkSizeWarningLimit: CHUNK_SIZE_WARNING_LIMIT });
    });

    it("Leaves out the 'use client' directive warnings, passing on every other warning", () => {
      const onwarn = configuration.build?.rolldownOptions?.onwarn as (warning: { code?: string; message: string }, warn: (warning: unknown) => void) => void;
      const passed: unknown[] = [];
      onwarn({ code: 'MODULE_LEVEL_DIRECTIVE', message: 'use client' }, (warning) => passed.push(warning));
      onwarn({ code: 'CIRCULAR_DEPENDENCY', message: 'circular' }, (warning) => passed.push(warning));
      onwarn({ message: 'no code' }, (warning) => passed.push(warning));
      expect(passed).toEqual([{ code: 'CIRCULAR_DEPENDENCY', message: 'circular' }, { message: 'no code' }]);
    });
  });

  describe('build', () => {
    // Only where build() stops before building: on a failed check, and on an output folder it may not empty.

    it('Exits with 1, writing the issues, without building, when the check fails', async () => {
      const { output, written } = _capture();
      expect(await build({ root: _fixture('unknown-stack'), output })).toBe(1);
      expect(written).toEqual({ stdout: '', stderr: 'error: showroom.json: Unknown stack "cobol"; the stack adapters are: typescript\n' });
    });

    it('Exits with 1, without building, when the output folder holds anything but an earlier build', async () => {
      const root = _fixture('output-folder');
      const { output, written } = _capture();
      expect(await build({ root, outDir: join(root, 'unmarked'), output })).toBe(1);
      expect(written.stdout).toBe('');
      expect(written.stderr).toBe(
        'error: Output folder "unmarked" is not empty, and holds no .showroom file from an earlier build; empty or delete it, or choose another output folder\n',
      );
    });
  });
});
