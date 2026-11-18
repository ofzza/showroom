/**
 * Global setup of the `integration`, `e2e` and `serve` test projects: builds the shared Mermaid bundle (see buildTestMermaid()), once per hash of
 * what builds it, provided to the tests as `mermaidDir`; the bundle is kept for later runs
 */

import type { TestProject } from 'vitest/node';
import { buildTestMermaid } from '../index.js';

/**
 * Builds the shared Mermaid bundle
 * @param project The test project
 */
export default async function setup(project: TestProject): Promise<void> {
  project.provide('mermaidDir', await buildTestMermaid());
}
