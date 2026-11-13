/**
 * Integration tests of the check with `showcases`: building every showcase with real showcase adapters, and throwing the showcase frames away
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import { Markdown } from '../../app/markdown/index.js';
import type { DocumentationFile } from '../../host/index.js';
import { FIXTURES } from '../../testing/index.js';
import { check } from './index.js';

/**
 * Root of this repository
 */
const _ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * Gets the heading ids of a documentation file, as the showroom renders them
 * @param file The documentation file
 * @param documentation Every documentation file, to resolve links against
 * @returns The ids of its headings
 */
function _getHeadingIds(file: DocumentationFile, documentation: DocumentationFile[]): string[] {
  const html = renderToString(
    createElement(SSRProvider, null, createElement(FluentProvider, { theme: webLightTheme }, createElement(Markdown, { file, documentation }))),
  );
  return [...html.matchAll(/<h[1-6][^>]*\sid="([^"]+)"/g)].map(([, id]) => id!);
}

describe('cli/check (integration)', () => {
  // Runs check() with `showcases: true` on the `showcase-frames` fixture, whose showcases all build, on the `showcase-build-errors` fixture,
  // whose custom showcase adapters fail, and on this repository itself, whose README.md and showcase adapter examples (examples/) hold live
  // showcases; nothing is written to any of them. On this repository, it also renders the examples as the showroom does, for their heading ids.

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

  it("Passes on this repository, with README.md's and the showcase adapter examples' live showcases", async () => {
    // Guards this repository's own showroom (dogfooding): an edit that breaks one of README.md's live examples, or a showcase adapter example,
    // fails here. See AGENTS.md › Markers in this repository's own documentation files are live.
    const result = await check(_ROOT, { showcases: true });
    expect(result.issues).toEqual([]);
    const showcases = result.host!.showcases.filter((showcase) => showcase.documentation === 'README.md');
    expect(showcases[0]).toMatchObject({ kind: 'inline', adapter: 'html', entry: 'README.showcase-1.html' });
    expect(showcases.map((showcase) => showcase.kind)).toEqual(expect.arrayContaining(['inline', 'linked']));
    expect(result.host!.virtualFiles.filter((file) => file.documentation === 'README.md').map((file) => file.kind)).toContain('resource');
    const examples = result.host!.showcases.filter((showcase) => showcase.documentation.startsWith('examples/'));
    expect(new Set(examples.map((showcase) => `${showcase.documentation} ${showcase.adapter}`))).toEqual(
      new Set(['examples/html/README.md html', 'examples/ts/README.md ts', 'examples/number-table/README.md number-table']),
    );
  });

  it('Links README.md only to headings the showcase adapter examples have, both relatively and in the published showroom', async () => {
    // Guards README.md's links into particular showcases of the examples (D317 in .workflow/PLAN-P8-examples.md): check warns about a link to a
    // missing file, but not about a missing heading, so a renamed heading would break them silently. The showroom's heading ids are GitHub's.
    const { host } = await check(_ROOT);
    const documentation = host!.documentation;
    const readme = documentation.find((file) => file.path === 'README.md')!.content;
    const relative = [...readme.matchAll(/\]\(\.\/(examples\/[^)#\s]+)#([^)\s]+)\)/g)].map(([, path, id]) => `${path}#${id}`);
    const live = [...readme.matchAll(/\(https:\/\/ofzza\.github\.io\/showroom\/#\/(examples\/[^)#\s]+)#([^)\s]+)\)/g)].map(([, path, id]) => `${path}#${id}`);
    expect(relative.length).toBeGreaterThan(0);
    expect(live).toEqual(relative);
    const missing = relative.filter((link) => {
      const [path, id] = link.split('#') as [string, string];
      const file = documentation.find((file) => file.path === path);
      return !file || !_getHeadingIds(file, documentation).includes(id);
    });
    expect(missing).toEqual([]);
  });
});
