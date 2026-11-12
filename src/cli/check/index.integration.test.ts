/**
 * Integration tests of the check with `showcases`: building every showcase with real showcase adapters, and throwing the showcase frames away
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../../testing/index.js';
import { check } from './index.js';

describe('cli/check (integration)', () => {
  // Runs check() with `showcases: true` on the `showcase-frames` fixture, whose showcases all build, on the `showcase-build-errors` fixture,
  // whose custom showcase adapters fail, and on this repository itself, whose README.md holds live showcases; nothing is written to any of them.

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

  it("Passes on this repository, with README.md's live showcases", async () => {
    // Guards this repository's own showroom (dogfooding): an edit that breaks one of README.md's live examples fails here. See AGENTS.md › Markers in
    // this repository's own documentation files are live.
    const result = await check(fileURLToPath(new URL('../../..', import.meta.url)), { showcases: true });
    expect(result.issues).toEqual([]);
    const showcases = result.host!.showcases.filter((showcase) => showcase.documentation === 'README.md');
    expect(showcases[0]).toMatchObject({ kind: 'inline', adapter: 'html', entry: 'README.showcase-1.html' });
    expect(showcases.map((showcase) => showcase.kind)).toEqual(expect.arrayContaining(['inline', 'linked']));
    expect(result.host!.virtualFiles.filter((file) => file.documentation === 'README.md').map((file) => file.kind)).toContain('resource');
  });
});
