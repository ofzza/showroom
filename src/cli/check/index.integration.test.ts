/**
 * Integration tests of the check with `showcases`: building every showcase with real showcase adapters, and throwing the showcase frames away
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../../testing/index.js';
import { check } from './index.js';

describe('cli/check (integration)', () => {
  // Runs check() with `showcases: true` on the `showcase-frames` fixture, whose showcases all build, and on the `showcase-build-errors` fixture,
  // whose custom showcase adapters fail; the fixtures are only read.

  it('Passes with the host information when every showcase builds', async () => {
    const plain = await check(join(FIXTURES, 'showcase-frames'));
    const result = await check(join(FIXTURES, 'showcase-frames'), { showcases: true });
    expect(result).toEqual(plain);
    expect(result.passed).toBe(true);
  });

  it('Fails without the host information when a showcase does not build, with each build error as an issue', async () => {
    expect((await check(join(FIXTURES, 'showcase-build-errors'))).passed).toBe(true);
    const result = await check(join(FIXTURES, 'showcase-build-errors'), { showcases: true });
    expect(result.passed).toBe(false);
    expect(result.host).toBeUndefined();
    expect(result.issues.map(({ path, line, message }) => `${path}:${line}: ${message}`)).toEqual([
      'README.md:7: Showcase README.md#1 (README.md:5): Unexpected token',
      'README.md:5: Showcase README.md#1 (README.md:5): Something went wrong',
      'README.md:5: Showcase README.md#1 (README.md:5): Not here',
      'src/widget.js:2: Showcase README.md#1 (README.md:5): Widget broke',
      'README.md:12: Showcase README.md#2 (README.md:12): Showcase adapter "throwing" failed to build the showcase: build broke',
      'README.md:18: Showcase README.md#3 (README.md:18): Showcase adapter "invalid" returned an invalid build result: the page "missing.html" is not among the files',
    ]);
  });
});
