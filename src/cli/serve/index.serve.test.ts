/**
 * Tests of `showroom serve` with its dev server: serve() on fixture copies, on a free port, stopped through its internal options
 */

import { afterEach, describe, expect, inject, it } from 'vitest';
import { copyFixture, type ScratchFolder } from '../../testing/index.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShownShowcase } from '../../app/host/index.js';
import { serve } from './index.js';

/**
 * Time to wait for the dev server to listen, in milliseconds
 */
const _LISTEN_TIMEOUT = 30000;

/**
 * Represents a running serve(), and what it wrote
 */
interface _Served {
  /**
   * URL of the dev server
   */
  url: string;
  /**
   * What serve() wrote to stderr so far
   */
  stderr: () => string;
  /**
   * Stops serve()
   * @returns Its exit code
   */
  stop: () => Promise<number>;
}

describe('cli/serve (serve)', () => {
  // Runs serve() in-process on fixture copies, each in a scratch folder of its own removed after the test, with the showroom the `serve` project's
  // global setup compiled (`appDir`), on port 0 (any free port), and stops it through its AbortSignal. No test edits files: Vite's watcher ignores
  // everything under `node_modules/`, where the copies are (see AGENTS.md › Gotchas and known issues), so updates are left to the host watcher's
  // unit tests, and to the user's browser check.

  const copies: ScratchFolder[] = [];
  const running: _Served[] = [];

  afterEach(async () => {
    await Promise.all(running.splice(0).map((served) => served.stop()));
    await Promise.all(copies.splice(0).map((copy) => copy.remove()));
  });

  /**
   * Serves a copy of a fixture, until stopped (or the test ends)
   * @param name Name of the fixture
   * @returns The running serve()
   */
  async function start(name: string): Promise<_Served> {
    const copy = await copyFixture(name);
    copies.push(copy);
    const controller = new AbortController();
    let stderr = '';
    let listening: (url: string) => void = () => undefined;
    const url = new Promise<string>((done) => (listening = done));
    const code = serve({
      root: copy.path,
      port: 0,
      output: { stdout: () => undefined, stderr: (text) => (stderr += text) },
      appDir: inject('appDir'),
      signal: controller.signal,
      onListening: listening,
    });
    let stopped: Promise<number> | undefined;
    const served: _Served = {
      url: await Promise.race([
        url,
        code.then((exit) => Promise.reject(new Error(`serve() exited with ${exit} before listening: ${stderr}`))),
        new Promise<never>((_, fail) => setTimeout(() => fail(new Error('serve() did not listen in time')), _LISTEN_TIMEOUT)),
      ]),
      stderr: () => stderr,
      stop: () => (stopped ??= (controller.abort(), code)),
    };
    running.push(served);
    return served;
  }

  /**
   * Fetches the virtual module of a dev server, as the showroom loads it
   * @param url URL of the dev server
   * @returns The module's source
   */
  async function fetchHostModule(url: string): Promise<string> {
    const response = await fetch(new URL('@id/__x00__virtual:showroom-host', url));
    expect(response.status).toBe(200);
    return response.text();
  }

  /**
   * Gets the shown showcases' URLs from the virtual module's source, as written, or as Vite prints it again when the documentation's text holds
   * `import.meta.env` or `process.env` (still JSON, spread over lines)
   * @param source The module's source
   * @returns The URLs, by showcase id
   */
  function getShowcaseUrls(source: string): Record<string, string> {
    const host = JSON.parse(/export default ([\s\S]*?);\s*export const issues/.exec(source)![1]) as { showcases: { id: string; url: string }[] };
    return Object.fromEntries(host.showcases.map(({ id, url }) => [id, url]));
  }

  it('Serves the showroom, and every showcase frame with its files, from memory, never cached', async () => {
    const { url } = await start('showcase-frames');
    const page = await fetch(url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>showcase-frames-host</title>');

    // The virtual module places every showcase frame, by its URL with its hash, and has no issues
    const source = await fetchHostModule(url);
    expect(source).toContain('\nexport const issues = [];');
    const urls = getShowcaseUrls(source);
    expect(Object.keys(urls)).toEqual(['README.md#1', 'README.md#2', 'README.md#3', 'docs/my notes #1.md#1']);
    expect(urls['docs/my notes #1.md#1']).toMatch(/^showcases\/docs\/my%20notes%20%231\.md\/1\/index\.html\?hash=[0-9a-f]{8}$/);

    // Each showcase frame, with the frame script
    for (const frameUrl of Object.values(urls)) {
      const response = await fetch(new URL(`${frameUrl}&theme=dark`, url));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toContain('<script>');
    }
    expect(await (await fetch(new URL('showcases/README.md/2/index.html', url))).text()).toContain('A fragment');

    // Their files: an html showcase frame's resource, a custom showcase adapter's assets
    const resource = await fetch(new URL('showcases/README.md/2/fragment.js', url));
    expect(resource.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(await resource.text()).toContain("textContent += ', with a resource'");
    const gif = await fetch(new URL('showcases/docs/my%20notes%20%231.md/1/assets/pixel.gif', url));
    expect(gif.headers.get('content-type')).toBe('image/gif');
    expect(
      Buffer.from(await gif.arrayBuffer())
        .subarray(0, 6)
        .toString(),
    ).toBe('GIF89a');

    // A missing file in a showcase frame's folder, and the showroom's own module under `showcases/`
    expect((await fetch(new URL('showcases/README.md/1/missing.js', url))).status).toBe(404);
    const own = await fetch(new URL('showcases/index.js', url));
    expect(own.status).toBe(200);
    expect(await own.text()).toContain('remarkShowcaseFrames');

    // The linked page's tabs: its page, and its included stylesheet, each by its linked file's URL with its hash, which serves the file
    const host = JSON.parse(/export default ([\s\S]*?);\s*export const issues/.exec(source)![1]) as { showcases: ShownShowcase[] };
    const tabs = host.showcases.find(({ id }) => id === 'README.md#3')!.tabs;
    expect(tabs.map(({ label }) => label)).toEqual(['demos/page.html', 'demos/page.css']);
    const css = tabs[1].source;
    expect(css).toMatchObject({ kind: 'file', text: true, url: expect.stringMatching(/^files\/demos\/page\.css\?hash=[0-9a-f]{8}$/) });
    const served = await fetch(new URL((css as { url: string }).url, url));
    expect(served.status).toBe(200);
    expect(await served.text()).toBe(
      await readFile(join(fileURLToPath(new URL('../../../test/fixtures/showcase-frames', import.meta.url)), 'demos', 'page.css'), 'utf8'),
    );
  });

  it('Serves error frames for the showcases that do not build, and shows their build errors as issues', async () => {
    const served = await start('showcase-build-errors');
    const source = await fetchHostModule(served.url);
    const urls = getShowcaseUrls(source);
    expect(Object.keys(urls)).toEqual(['README.md#1', 'README.md#2', 'README.md#3', 'README.md#4']);

    // Each showcase that doesn't build shows its build errors in its showcase frame
    const errorFrame = await (await fetch(new URL(urls['README.md#1'], served.url))).text();
    expect(errorFrame).toContain("Showcase README.md#1 doesn't build");
    expect(errorFrame).toContain('<div class="location">src/widget.js:2</div>');
    expect(await (await fetch(new URL(urls['README.md#2'], served.url))).text()).toContain('build broke');
    expect(await (await fetch(new URL(urls['README.md#4'], served.url))).text()).toContain('Builds fine');

    // The issues, in the virtual module and on stderr
    expect(source).toContain('"message":"Showcase README.md#2 (README.md:12): Showcase adapter \\"throwing\\" failed to build the showcase: build broke"');
    expect(served.stderr()).toContain('error: src/widget.js:2: Showcase README.md#1 (README.md:5): Widget broke\n');
    expect(await served.stop()).toBe(0);
  });

  it('Serves ts showcase frames, built in development mode, with their files', async () => {
    const { url, stderr } = await start('showcase-ts');
    expect(stderr()).toBe('');
    const urls = getShowcaseUrls(await fetchHostModule(url));
    expect(Object.keys(urls)).toEqual(['README.md#1', 'README.md#2', 'README.md#3']);
    const page = await (await fetch(new URL(urls['README.md#1'], url))).text();
    expect(page).toContain('<div id="root"></div><div id="showroom-console" hidden></div>');

    // The module and its CSS, relative to the page; the module's asset and dynamic import, relative to the module
    const module = /<script type="module" crossorigin src="\.\/(assets\/[^"]+)"/.exec(page)![1];
    const response = await fetch(new URL(`showcases/README.md/1/${module}`, url));
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    const code = await response.text();
    expect(code).toContain('"development"');
    expect(code).toContain('//# sourceMappingURL=data:application/json;');
    const css = /<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+)"/.exec(page)![1];
    expect(await (await fetch(new URL(`showcases/README.md/1/${css}`, url))).text()).toContain('color: teal');
    const logo = /new URL\("(logo-[\w-]+\.svg)", import\.meta\.url\)/.exec(code)![1];
    const svg = await fetch(new URL(`showcases/README.md/1/assets/${logo}`, url));
    expect(svg.headers.get('content-type')).toBe('image/svg+xml');
    const lazy = /"\.\/(lazy-[\w-]+\.js)"/.exec(code)![1];
    expect(await (await fetch(new URL(`showcases/README.md/1/assets/${lazy}`, url))).text()).toContain('"later"');
  });

  it("Serves react showcase frames, built in development mode with React's development build", async () => {
    const { url, stderr } = await start('showcase-react');
    expect(stderr()).toBe('');
    const urls = getShowcaseUrls(await fetchHostModule(url));
    expect(Object.keys(urls)).toEqual(['README.md#1', 'README.md#2', 'README.md#3', 'classic/README.md#1']);
    const page = await (await fetch(new URL(urls['README.md#1'], url))).text();
    expect(page).toContain('<div id="root"></div><div id="showroom-console" hidden></div>');
    const module = /<script type="module" crossorigin src="\.\/(assets\/[^"]+)"/.exec(page)![1];
    const code = await (await fetch(new URL(`showcases/README.md/1/${module}`, url))).text();
    expect(code).toContain('react-dom-client.development.js');
    expect(code).toContain('createRoot)(document.getElementById("root"))');
  });

  it('Serves the linked files from the host repository, and nothing else in their folder', async () => {
    const { url } = await start('linked-files');
    const source = await fetchHostModule(url);
    expect(source).toContain('"linkedFiles":[{"path":"Makefile","size":19,"text":true}');
    const code = await fetch(new URL('files/src/index.ts', url));
    expect(code.status).toBe(200);
    expect(code.headers.get('cache-control')).toBe('no-store');
    expect(await code.text()).toContain('export function greet');
    // An ignored linked file, and a binary one
    expect(await (await fetch(new URL('files/vendor/data.json', url))).text()).toBe('{ "data": [1, 2, 3] }\n');
    expect((await fetch(new URL('files/assets/logo.png', url))).headers.get('content-type')).toBe('image/png');
    // Files in the host repository that aren't linked files
    expect((await fetch(new URL('files/README.md', url))).status).toBe(404);
    expect((await fetch(new URL('files/out/stale.txt', url))).status).toBe(404);
    // The showroom's own modules, served unbundled, are never in the linked files' folder: the modal's module loads
    expect((await fetch(new URL('file-modal/index.js', url))).status).toBe(200);
  });

  it('Stops at once with a signal aborted before it listens', async () => {
    const copy = await copyFixture('minimal');
    copies.push(copy);
    let listened = false;
    const code = await serve({
      root: copy.path,
      port: 0,
      output: { stdout: () => undefined, stderr: () => undefined },
      appDir: inject('appDir'),
      signal: AbortSignal.abort(),
      onListening: () => (listened = true),
    });
    expect(code).toBe(0);
    expect(listened).toBe(true);
  });
});
