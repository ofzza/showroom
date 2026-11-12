/**
 * Global setup of the `e2e` and `serve` test projects: compiles the showroom once per run into a scratch folder, provided to the tests as `appDir`,
 * and removes it once they are done
 */

import type { TestProject } from 'vitest/node';
import { compileApp, createScratchFolder } from '../index.js';

/**
 * Compiles the showroom
 * @param project The test project
 * @returns The teardown, removing the compiled showroom
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const scratch = await createScratchFolder('app-');
  project.provide('appDir', await compileApp(scratch.path));
  return () => scratch.remove();
}
