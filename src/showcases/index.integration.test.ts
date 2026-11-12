/**
 * Integration tests of the showcase builds: buildShowcases() on fixture host repositories, with real showcase adapters
 */

import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check } from '../cli/check/index.js';
import { readConfiguration } from '../configuration/index.js';
import { getFrameScript } from '../frame/index.js';
import { FIXTURES, SCRATCH_ROOT } from '../testing/index.js';
import { buildShowcases } from './index.js';

/**
 * Checks a fixture, then builds its showcases
 * @param name Name of the fixture
 * @returns The outcome of buildShowcases()
 */
async function _build(name: string) {
  const root = join(FIXTURES, name);
  const { host } = await check(root);
  const { configuration } = await readConfiguration(root);
  if (!host || !configuration) throw new Error(`The fixture "${name}" doesn't pass the check`);
  return buildShowcases({ root, host, configuration });
}

describe('showcases (integration)', () => {
  // Builds the showcases of the `showcase-frames` fixture (html pages, a fragment, a linked page, and a custom showcase adapter's page with assets)
  // and of the `showcase-build-errors` fixture (a custom showcase adapter failing with errors, one throwing, one returning an invalid result). The
  // fixtures are only read; the build's temporary folder is in the project's own OS temp folder.

  it('Builds every showcase frame, with the frame script in its page', async () => {
    const { frames, issues } = await _build('showcase-frames');
    expect(issues).toBeUndefined();
    expect([...frames!.keys()]).toEqual(['README.md#1', 'README.md#2', 'README.md#3', 'docs/my notes #1.md#1']);
    const script = `<script>${getFrameScript()}</script>`;

    // An inline page, the script after its head
    const page = frames!.get('README.md#1')!;
    expect(page).toMatchObject({ folder: 'showcases/README.md/1', page: 'index.html', reads: ['README.md'] });
    expect(page.files).toEqual([
      {
        path: 'index.html',
        content: `<!doctype html>\n<html><head><meta charset="utf-8">${script}<title>Page</title></head><body><p>A page</p></body></html>`,
      },
    ]);

    // A fragment, wrapped
    expect(frames!.get('README.md#2')!.files[0].content).toContain(`<head><meta charset="utf-8">${script}<meta name="viewport"`);
    expect(frames!.get('README.md#2')!.files[0].content).toContain('<body><p class="fragment">A fragment</p></body>');

    // A linked page, after its own charset
    const linked = frames!.get('README.md#3')!;
    expect(linked.reads).toEqual(['demos/page.html']);
    expect(linked.files[0].content).toContain(`<meta charset="utf-8" />${script}`);

    // A custom showcase adapter's page given as bytes, with its assets
    const custom = frames!.get('docs/my notes #1.md#1')!;
    expect(custom.folder).toBe('showcases/docs/my notes #1.md/1');
    expect(custom.reads).toEqual(['demos/widget.txt']);
    expect(custom.files.map((file) => file.path)).toEqual(['index.html', 'assets/style.css', 'assets/pixel.gif']);
    expect(custom.files[0].content).toContain(`<head><meta charset="utf-8">${script}<link`);
    expect(custom.files[0].content).toContain('Widget ✓');
    expect(custom.files[2].content).toBeInstanceOf(Uint8Array);
  });

  it('Reports every build error where it is in the documentation', async () => {
    const { frames, issues } = await _build('showcase-build-errors');
    expect(frames).toBeUndefined();
    expect(issues).toEqual([
      { severity: 'error', message: 'Showcase README.md#1 (README.md:5): Unexpected token', path: 'README.md', line: 7 },
      { severity: 'error', message: 'Showcase README.md#1 (README.md:5): Something went wrong', path: 'README.md', line: 5 },
      { severity: 'error', message: 'Showcase README.md#1 (README.md:5): Not here', path: 'README.md', line: 5 },
      { severity: 'error', message: 'Showcase README.md#1 (README.md:5): Widget broke', path: 'src/widget.js', line: 2 },
      {
        severity: 'error',
        message: 'Showcase README.md#2 (README.md:12): Showcase adapter "throwing" failed to build the showcase: build broke',
        path: 'README.md',
        line: 12,
      },
      {
        severity: 'error',
        message:
          'Showcase README.md#3 (README.md:18): Showcase adapter "invalid" returned an invalid build result: the page "missing.html" is not among the files',
        path: 'README.md',
        line: 18,
      },
    ]);
  });

  it("Removes its temporary folder, in the project's own OS temp folder", async () => {
    expect(tmpdir()).toBe(join(SCRATCH_ROOT, 'tmp-integration'));
    await _build('showcase-frames');
    expect((await readdir(tmpdir())).filter((name) => name.startsWith('showroom-showcases-'))).toEqual([]);
  });
});
