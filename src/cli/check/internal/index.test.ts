/**
 * Tests of the check's internals shared with `tsshowcase serve`
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { TypeScriptStackAdapter } from '../../../adapters/stack/typescript/index.js';
import { createIgnoreMatcher, formatIssues, readIgnoreMatcher } from './index.js';

/**
 * Gets the path of a fixture host repository
 * @param name Name of the fixture
 * @returns Path of the fixture's root
 */
function _fixture(name: string): string {
  return fileURLToPath(new URL(`../../../../test/fixtures/${name}`, import.meta.url));
}

describe('cli/check/internal', () => {
  // Tests the ignore matcher, built from the TypeScript stack adapter and configurations (hand-made, or read from the fixture host repositories), and
  // the formatting of issues.

  it("Ignores the stack adapter's patterns, then the configuration's", () => {
    const matcher = createIgnoreMatcher(new TypeScriptStackAdapter(), { stack: 'typescript', ignore: ['vendor/', '!node_modules/keep/'] });
    expect(matcher.ignores('dist/')).toBe(true);
    expect(matcher.ignores('vendor/')).toBe(true);
    expect(matcher.ignores('docs/')).toBe(false);
    expect(createIgnoreMatcher(new TypeScriptStackAdapter(), { stack: 'typescript' }).ignores('vendor/')).toBe(false);
  });

  it("Reads a host repository's ignore matcher", async () => {
    const matcher = await readIgnoreMatcher(_fixture('patterns'));
    expect(matcher?.ignores('vendor/drop/')).toBe(true);
    expect(matcher?.ignores('vendor/keep/')).toBe(false);
  });

  it('Reads no ignore matcher for an invalid configuration or an unknown stack', async () => {
    expect(await readIgnoreMatcher(_fixture('invalid-configuration'))).toBeUndefined();
    expect(await readIgnoreMatcher(_fixture('unknown-stack'))).toBeUndefined();
  });

  it('Formats issues one per line, with their path when they have one', () => {
    expect(formatIssues([])).toBe('');
    expect(
      formatIssues([
        { severity: 'error', message: 'Broken', path: 'tsshowcase.json' },
        { severity: 'warning', message: 'Odd' },
      ]),
    ).toBe('error: tsshowcase.json: Broken\nwarning: Odd\n');
  });
});
