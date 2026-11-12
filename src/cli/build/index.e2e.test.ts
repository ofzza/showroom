/**
 * End-to-end tests of `showroom build`: build() on copies of the fixture host repositories, with Vite's build of the showroom compiled once per run
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { getFrameScript } from '../../frame/index.js';
import { getShowcaseFrameHash } from '../../showcases/index.js';
import { copyFixture, type ScratchFolder } from '../../testing/index.js';
import { OUTPUT_FOLDER_MARKER, OUTPUT_FOLDER_MARKER_CONTENT, build } from './index.js';

describe('cli/build (end to end)', () => {
  // Calls build() in-process on fixture copies, each in a scratch folder of its own removed after the test, with the showroom the `e2e` project's
  // global setup compiled (`appDir`), so the tests never depend on, or write to, `dist/`. Only the passing build runs Vite; the others stop before.

  const copies: ScratchFolder[] = [];

  /**
   * Copies a fixture into a scratch folder, removed after the test
   * @param name Name of the fixture
   * @returns Path of the copy's root
   */
  async function copy(name: string): Promise<string> {
    const scratch = await copyFixture(name);
    copies.push(scratch);
    return scratch.path;
  }

  /**
   * Runs build() on a host repository, capturing its output
   * @param root Path of the host repository's root
   * @returns Exit code, and everything written to stdout and stderr
   */
  async function run(root: string): Promise<{ code: number; stdout: string; stderr: string }> {
    let stdout = '';
    let stderr = '';
    const output = { stdout: (text: string) => void (stdout += text), stderr: (text: string) => void (stderr += text) };
    const code = await build({ root, output, appDir: inject('appDir') });
    return { code, stdout, stderr };
  }

  afterEach(async () => {
    await Promise.all(copies.splice(0).map((scratch) => scratch.remove()));
  });

  it('Builds the showroom with every showcase frame, placed by the shown host information', async () => {
    const root = await copy('showcase-frames');
    const { code, stdout, stderr } = await run(root);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    const out = join(root, 'showroom');
    expect(stdout).toBe(`Built the showroom of showcase-frames-host into ${out}\n`);
    expect(await readFile(join(out, OUTPUT_FOLDER_MARKER), 'utf8')).toBe(OUTPUT_FOLDER_MARKER_CONTENT);
    expect(existsSync(join(out, 'index.html'))).toBe(true);

    // The showcase frames, with the frame script, under their documentation files' paths as they are
    const script = `<script>${getFrameScript()}</script>`;
    for (const n of [1, 2, 3]) {
      expect(await readFile(join(out, 'showcases', 'README.md', String(n), 'index.html'), 'utf8')).toContain(script);
    }
    // The html showcase frames, each with the README's resource next to its page
    for (const n of [1, 2, 3]) {
      expect(await readFile(join(out, 'showcases', 'README.md', String(n), 'fragment.js'), 'utf8')).toContain("textContent += ', with a resource'");
    }
    const custom = join(out, 'showcases', 'docs', 'my notes #1.md', '1');
    expect(await readFile(join(custom, 'index.html'), 'utf8')).toContain('Widget ✓');
    expect(await readFile(join(custom, 'assets', 'style.css'), 'utf8')).toBe('body { font-family: sans-serif; }');
    expect([...(await readFile(join(custom, 'assets', 'pixel.gif')))]).toEqual([
      ...Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
    ]);

    // The bundle's shown host information places them, by URL-encoded relative URLs with their content's hash
    const bundle = (await Promise.all((await readdir(join(out, 'assets'))).map((name) => readFile(join(out, 'assets', name), 'utf8')))).join('\n');
    const first = await Promise.all(
      ['index.html', 'fragment.js'].map(async (path) => ({ path, content: await readFile(join(out, 'showcases', 'README.md', '1', path)) })),
    );
    expect(bundle).toContain(`showcases/README.md/1/index.html?hash=${getShowcaseFrameHash(first)}`);
    expect(bundle).toMatch(/showcases\/docs\/my%20notes%20%231\.md\/1\/index\.html\?hash=[0-9a-f]{8}/);
  });

  it('Leaves the output folder untouched when a showcase does not build', async () => {
    const root = await copy('showcase-build-errors');
    await mkdir(join(root, 'showroom'));
    await writeFile(join(root, 'showroom', OUTPUT_FOLDER_MARKER), OUTPUT_FOLDER_MARKER_CONTENT);
    await writeFile(join(root, 'showroom', 'old.txt'), 'an earlier build');
    const { code, stdout, stderr } = await run(root);
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('error: README.md:7: Showcase README.md#1 (README.md:5): Unexpected token\n');
    expect(stderr).toContain(
      'error: README.md:12: Showcase README.md#2 (README.md:12): Showcase adapter "throwing" failed to build the showcase: build broke\n',
    );
    expect((await readdir(join(root, 'showroom'))).sort()).toEqual([OUTPUT_FOLDER_MARKER, 'old.txt']);
  });

  it("Stops at an unmarked output folder before any showcase adapter's build", async () => {
    const root = await copy('showcase-frames');
    // The copy's custom showcase adapter leaves a file behind when it builds
    const adapter = join(root, 'adapters', 'assets.js');
    const source = await readFile(adapter, 'utf8');
    await writeFile(
      adapter,
      `import { writeFileSync } from 'node:fs';\n${source.replace('build: async ({ showcase, options }) => ({', "build: async ({ root, showcase, options }) => (writeFileSync(root + '/built.txt', ''), {")}`,
    );
    await mkdir(join(root, 'showroom'));
    await writeFile(join(root, 'showroom', 'keep.txt'), 'not a build');
    const { code, stderr } = await run(root);
    expect(code).toBe(1);
    expect(stderr).toMatch(/^error: Output folder "showroom" is not empty/);
    expect(existsSync(join(root, 'built.txt'))).toBe(false);
    expect(await readdir(join(root, 'showroom'))).toEqual(['keep.txt']);
  });
});
