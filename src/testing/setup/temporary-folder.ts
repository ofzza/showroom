/**
 * Global setup of the `integration`, `e2e` and `serve` test projects: creates the temporary folder their `TMPDIR`, `TMP` and `TEMP` point at
 * (set in `vite.config.ts`), and removes it once their tests are done
 */

import { mkdir, rm } from 'node:fs/promises';
import type { TestProject } from 'vitest/node';

/**
 * Creates the project's temporary folder
 * @param project The test project
 * @returns The teardown, removing the folder
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const folder = project.config.env.TMPDIR;
  if (!folder) throw new Error(`The test project "${project.name}" sets no TMPDIR`);
  await mkdir(folder, { recursive: true });
  return () => rm(folder, { recursive: true, force: true });
}
