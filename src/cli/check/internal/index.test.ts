/**
 * Tests of the check's internals shared with `showroom serve`
 */

import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TypeScriptStackAdapter } from '../../../adapters/stack/typescript/index.js';
import { createIgnoreMatcher, formatIssues, readIgnoreMatcher, resolveOutputFolder } from './index.js';

/**
 * Gets the path of a fixture host repository
 * @param name Name of the fixture
 * @returns Path of the fixture's root
 */
function _fixture(name: string): string {
  return fileURLToPath(new URL(`../../../../test/fixtures/${name}`, import.meta.url));
}

describe('cli/check/internal', () => {
  // Tests the output folder's resolution (on paths alone: nothing is read), the ignore matcher, built from the TypeScript stack adapter and
  // configurations (hand-made, or read from the fixture host repositories), and the formatting of issues.

  it("Ignores the stack adapter's patterns, then the configuration's", () => {
    const matcher = createIgnoreMatcher(new TypeScriptStackAdapter(), { stack: 'typescript', ignore: ['vendor/', '!node_modules/keep/'] });
    expect(matcher.ignores('dist/')).toBe(true);
    expect(matcher.ignores('vendor/')).toBe(true);
    expect(matcher.ignores('docs/')).toBe(false);
    expect(createIgnoreMatcher(new TypeScriptStackAdapter(), { stack: 'typescript' }).ignores('vendor/')).toBe(false);
  });

  it('Resolves the output folder from the override, else the configuration, else ./showroom', () => {
    const root = resolve('host');
    expect(resolveOutputFolder(root, { stack: 'typescript' })).toEqual({ path: join(root, 'showroom'), relativePath: 'showroom' });
    expect(resolveOutputFolder(root, { stack: 'typescript', outDir: 'docs/site/' })).toEqual({ path: join(root, 'docs', 'site'), relativePath: 'docs/site' });
    // The override is relative to the current directory, not the host repository's root
    expect(resolveOutputFolder(root, { stack: 'typescript', outDir: 'site' }, 'host/out')).toEqual({ path: join(root, 'out'), relativePath: 'out' });
  });

  it("Refuses an output folder that is the host repository's root, or outside it", () => {
    const root = resolve('host');
    expect(resolveOutputFolder(root, { stack: 'typescript', outDir: '.' })).toEqual({ error: `Output folder "." is the host repository's root` });
    expect(resolveOutputFolder(root, { stack: 'typescript', outDir: '../site' })).toEqual({ error: 'Output folder "../site" is outside the host repository' });
    expect(resolveOutputFolder(root, { stack: 'typescript' }, 'host')).toEqual({ error: `Output folder "host" is the host repository's root` });
    expect(resolveOutputFolder(root, { stack: 'typescript' }, 'elsewhere')).toEqual({ error: 'Output folder "elsewhere" is outside the host repository' });
  });

  it('Ignores the output folder, and nothing else, matching its name literally', () => {
    for (const outputFolder of ['showcase', 'docs/site', 'out[1]', 'a*b', '#x', '!y', 'trailing ']) {
      const matcher = createIgnoreMatcher(new TypeScriptStackAdapter(), { stack: 'typescript' }, outputFolder);
      expect(matcher.ignores(`${outputFolder}/`)).toBe(true);
      expect(matcher.ignores(`${outputFolder}/index.html`)).toBe(true);
      expect(matcher.ignores(`nested/${outputFolder}/`)).toBe(false);
    }
    const matcher = createIgnoreMatcher(new TypeScriptStackAdapter(), { stack: 'typescript' }, 'out[1]');
    expect(matcher.ignores('out1/')).toBe(false);
    expect(createIgnoreMatcher(new TypeScriptStackAdapter(), { stack: 'typescript' }, 'a*b').ignores('aXb/')).toBe(false);
  });

  it("Reads a host repository's ignore matcher", async () => {
    const matcher = await readIgnoreMatcher(_fixture('patterns'));
    expect(matcher?.ignores('vendor/drop/')).toBe(true);
    expect(matcher?.ignores('vendor/keep/')).toBe(false);
  });

  it("Reads the ignore matcher with the output folder, the override's if given, and without one that isn't allowed", async () => {
    const root = _fixture('output-folder');
    expect((await readIgnoreMatcher(root))?.ignores('showroom/')).toBe(true);
    const overridden = await readIgnoreMatcher(root, join(root, 'unmarked'));
    expect(overridden?.ignores('unmarked/')).toBe(true);
    expect(overridden?.ignores('showroom/')).toBe(false);
    expect((await readIgnoreMatcher(_fixture('out-dir-root')))?.ignores('src/')).toBe(false);
  });

  it('Reads no ignore matcher for an invalid configuration or an unknown stack', async () => {
    expect(await readIgnoreMatcher(_fixture('invalid-configuration'))).toBeUndefined();
    expect(await readIgnoreMatcher(_fixture('unknown-stack'))).toBeUndefined();
  });

  it('Formats issues one per line, with their path and line when they have them', () => {
    expect(formatIssues([])).toBe('');
    expect(
      formatIssues([
        { severity: 'error', message: 'Broken', path: 'showroom.json' },
        { severity: 'warning', message: 'Odd' },
        { severity: 'error', message: 'Unknown', path: 'docs/guide.md', line: 12 },
      ]),
    ).toBe('error: showroom.json: Broken\nwarning: Odd\nerror: docs/guide.md:12: Unknown\n');
  });
});
