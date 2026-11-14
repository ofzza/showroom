/**
 * Global setup of the `integration` and `e2e` test projects: installs the fixtures that carry a lockfile (see installFixture()), once per lockfile,
 * provided to the tests as `installedFixtures`; the installs are kept for later runs
 */

import type { TestProject } from 'vitest/node';
import { INSTALLED_FIXTURES, installFixture } from '../index.js';

/**
 * Installs the fixtures that carry a lockfile
 * @param project The test project
 */
export default async function setup(project: TestProject): Promise<void> {
  const installed: Record<string, string> = {};
  for (const name of INSTALLED_FIXTURES) installed[name] = await installFixture(name);
  project.provide('installedFixtures', installed);
}
