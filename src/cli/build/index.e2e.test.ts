/**
 * End-to-end tests of `showroom build`: build() on copies of the fixture host repositories, with Vite's build of the showroom compiled once per run
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { getFrameScript } from '../../frame/index.js';
import { getShowcaseFrameHash } from '../../showcases/index.js';
import { copyFixture, createScratchFolder, type ScratchFolder } from '../../testing/index.js';
import { OUTPUT_FOLDER_MARKER, OUTPUT_FOLDER_MARKER_CONTENT, build } from './index.js';

describe('cli/build (end to end)', () => {
  // Calls build() in-process on fixture copies, each in a scratch folder of its own removed after the test, with the showroom the `e2e` project's
  // global setup compiled (`appDir`), so the tests never depend on, or write to, `dist/`; and on a copy of an installed fixture (`installedFixtures`),
  // with its own React. Only the passing builds run Vite; the others stop before.

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
    // The showroom's inline favicon survives Vite's build of its page
    expect(await readFile(join(out, 'index.html'), 'utf8')).toMatch(/<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="data:image\/svg\+xml,/);

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

  it('Copies exactly the linked files into the output folder, at files/<path>', async () => {
    const root = await copy('linked-files');
    const { code, stderr } = await run(root);
    expect(code).toBe(0);
    expect(stderr).toBe(
      [
        'warning: README.md:9: Broken link "missing.txt": nothing at "missing.txt"',
        'warning: README.md:9: Linked file "out/stale.txt" is in the output folder, which `showroom build` empties; it isn\'t copied into the showroom',
        '',
      ].join('\n'),
    );
    const files = join(root, 'out', 'files');
    const copied = (await readdir(files, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
    const paths = copied
      .map((entry) =>
        join(entry.parentPath, entry.name)
          .slice(files.length + 1)
          .split(sep)
          .join('/'),
      )
      .sort();
    expect(paths).toEqual(['Makefile', 'assets/logo.png', 'demo/demo.html', 'notes.txt', 'src/index.ts', 'vendor/data.json']);
    for (const path of paths) {
      expect(await readFile(join(files, path))).toEqual(await readFile(join(root, path)));
    }
    // The earlier build's files are gone, and the bundle's shown host information lists the linked files
    expect(existsSync(join(root, 'out', 'stale.txt'))).toBe(false);
    const bundle = (await Promise.all((await readdir(join(root, 'out', 'assets'))).map((name) => readFile(join(root, 'out', 'assets', name), 'utf8')))).join(
      '\n',
    );
    expect(bundle).toContain('{path:`assets/logo.png`,size:70,text:!1}');
  });

  it('Builds ts showcases into their showcase frames, and writes build warnings without failing', async () => {
    const root = await copy('showcase-ts');
    // A showcase whose build warns, added to the copy
    await writeFile(join(root, 'demos', 'warning.ts'), "console.log(eval('1 + 1'));\n");
    await writeFile(join(root, 'README.md'), `${await readFile(join(root, 'README.md'), 'utf8')}\nA [warning](./demos/warning.ts 'showcase=ts').\n`);
    const { code, stderr } = await run(root);
    expect(stderr).toMatch(/^warning: demos\/warning\.ts:1: Showcase README\.md#4 \(README\.md:\d+\): Use of direct `eval` function/);
    expect(code).toBe(0);

    // The page, and the bundle's chunks and assets next to it, with relative URLs
    const frame = join(root, 'showroom', 'showcases', 'README.md', '1');
    const page = await readFile(join(frame, 'index.html'), 'utf8');
    expect(page).toContain('<div id="root"></div><div id="showroom-console" hidden></div>');
    const assets = await readdir(join(frame, 'assets'));
    expect(assets.map((name) => name.replace(/-[\w-]{8}\./, '.')).sort()).toEqual(['README.css', 'README.showcase-1.js', 'lazy.css', 'lazy.js', 'logo.svg']);
    const entry = assets.find((name) => name.startsWith('README.showcase-1'))!;
    expect(page).toContain(`<script type="module" crossorigin src="./assets/${entry}"></script>`);
    expect(await readFile(join(frame, 'assets', entry), 'utf8')).toContain('`production`');
    expect(await readFile(join(root, 'showroom', 'showcases', 'README.md', '3', 'index.html'), 'utf8')).toContain('src="./assets/linked-');
  });

  it("Builds react showcases with the host's own React, on an installed fixture's copy", async () => {
    // The installed fixture (with its own React 18 in its node_modules) is copied, as build() writes into it
    const scratch = await createScratchFolder('showcase-react-18-');
    copies.push(scratch);
    await cp(inject('installedFixtures')['showcase-react-18'], scratch.path, { recursive: true });
    const { code, stderr } = await run(scratch.path);
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
    const frame = join(scratch.path, 'showroom', 'showcases', 'README.md', '1');
    expect(await readFile(join(frame, 'index.html'), 'utf8')).toContain('<div id="root"></div><div id="showroom-console" hidden></div>');
    const [entry] = await readdir(join(frame, 'assets'));
    expect(entry).toMatch(/^README\.showcase-1\.tsx\.showroom-mount-[\w-]+\.js$/);
    expect(await readFile(join(frame, 'assets', entry), 'utf8')).toMatch(/[`"]18\.3\.1[`"]/);
  });

  it('Fails on a type error, placed in the documentation file', async () => {
    // On a copy under node_modules/.cache/, whose own files are judged on their paths relative to its root, never as dependencies (D292)
    const root = await copy('showcase-ts-defaults');
    const { code, stdout, stderr } = await run(root);
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain("error: README.md:6: Showcase README.md#1 (README.md:5): TS7006: Parameter 'value' implicitly has an 'any' type.\n");
    expect(await readdir(root)).not.toContain('showroom');
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
