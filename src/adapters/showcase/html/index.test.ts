/**
 * Tests of the html showcase adapter
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Showcase, VirtualFile } from '../../../host/index.js';
import type { ShowcaseAdapter, ShowcaseBuildRequest } from '../index.js';
import { HtmlShowcaseAdapter, isHtmlPage, skipHtmlSpaceAndComments, wrapHtmlFragment } from './index.js';

/**
 * Path of the fixture host repository with html showcases built into showcase frames
 */
const _ROOT = fileURLToPath(new URL('../../../../test/fixtures/showcase-frames', import.meta.url));

/**
 * Creates a showcase for the html showcase adapter
 * @param kind Kind of the showcase
 * @param entry Path of its entry point
 * @param extra Other fields to set (e.g. options)
 * @returns The showcase
 */
function _showcase(kind: Showcase['kind'], entry: string, extra: Partial<Showcase> = {}): Showcase {
  return {
    id: 'README.md#1',
    documentation: 'README.md',
    line: 1,
    offset: 0,
    kind,
    display: kind === 'code-block' ? 'block' : 'inline',
    adapter: 'html',
    entry,
    include: [],
    views: ['demo'],
    ...extra,
  };
}

describe('adapters/showcase/html', () => {
  // Tests the html showcase adapter on hand-made showcases: its static half, and its build, on virtual files in memory and on the
  // `showcase-frames` fixture's linked page.

  const adapter = new HtmlShowcaseAdapter();

  it('Accepts HTML entry points without options', () => {
    expect(adapter.validate(_showcase('code-block', 'README.showcase-1.html'))).toEqual({ errors: [] });
    expect(adapter.validate(_showcase('link', 'docs/demo.HTM'))).toEqual({ errors: [] });
  });

  it('Rejects other entry points', () => {
    expect(adapter.validate(_showcase('code-block', 'README.showcase-1.js')).errors).toEqual(['The html showcase adapter needs an "html" or "htm" code block']);
    expect(adapter.validate(_showcase('link', 'demo.js')).errors).toEqual(['The html showcase adapter needs a link to an .html or .htm file, not "demo.js"']);
  });

  it('Rejects any options', () => {
    // A marker with options always has them, even `null`, which JSON5 can parse
    expect(adapter.validate(_showcase('code-block', 'a.html', { options: null })).errors).toEqual(['The html showcase adapter takes no options']);
  });

  it("Accepts included files inside the entry point's folder, and rejects any other, or one replacing the page", () => {
    expect(adapter.validate(_showcase('code-block', 'README.showcase-1.html', { include: ['a.css', 'docs/b.css'] }))).toEqual({ errors: [] });
    expect(adapter.validate(_showcase('link', 'demos/page.html', { include: ['demos/page.css', 'demos/img/a.png'] }))).toEqual({ errors: [] });
    expect(adapter.validate(_showcase('link', 'demos/page.html', { include: ['theme.css', 'demos-2/a.css', 'demos/INDEX.HTML'] })).errors).toEqual([
      `The html showcase adapter can't include "theme.css": it must be inside the entry point's folder ("demos")`,
      `The html showcase adapter can't include "demos-2/a.css": it must be inside the entry point's folder ("demos")`,
      `The html showcase adapter can't include "demos/INDEX.HTML": it would replace the showcase frame's page`,
    ]);
  });

  it('Has no host requirements', () => {
    expect((adapter as ShowcaseAdapter).check).toBeUndefined();
  });

  describe('Build', () => {
    // Tests building showcase frames: the entry point as the page, or a fragment wrapped into one, with the named virtual files of its folder and its
    // included files next to it.

    /**
     * Creates a build request
     * @param showcase The showcase
     * @param virtualFiles Virtual files of its folder
     * @returns The build request
     */
    const request = (showcase: Showcase, virtualFiles: VirtualFile[] = []): ShowcaseBuildRequest => ({
      root: _ROOT,
      showcase,
      options: undefined,
      virtualFiles,
      hostVirtualFiles: virtualFiles,
      mode: 'production',
      scratchFolder: _ROOT,
    });
    const virtual = (path: string, content: string, named = false): VirtualFile => ({
      path,
      named,
      content,
      documentation: 'README.md',
      offset: 0,
      line: 3,
    });

    it("Builds a code block showcase's page as it is", async () => {
      const page = '<!doctype html><html><body><p>Hi</p></body></html>';
      const result = await adapter.build(request(_showcase('code-block', 'README.showcase-1.html'), [virtual('README.showcase-1.html', page)]));
      expect(result).toEqual({ page: 'index.html', files: [{ path: 'index.html', content: page }], reads: ['README.md'] });
    });

    it("Wraps a code block showcase's fragment into a page", async () => {
      const result = await adapter.build(request(_showcase('code-block', 'README.showcase-1.html'), [virtual('README.showcase-1.html', '<p>Hi</p>')]));
      expect(result.files).toEqual([{ path: 'index.html', content: wrapHtmlFragment('<p>Hi</p>') }]);
      expect(wrapHtmlFragment('<p>Hi</p>')).toMatch(/^<!doctype html><html><head><meta charset="utf-8">.*<body><p>Hi<\/p><\/body><\/html>$/);
    });

    it('Reads a linked page from disk, leaving its references alone', async () => {
      const result = await adapter.build(request(_showcase('link', 'demos/page.html')));
      expect(result.issues).toBeUndefined();
      expect(result.reads).toEqual(['demos/page.html']);
      expect(result.files).toHaveLength(1);
      expect(result.files![0].content).toContain('<link rel="stylesheet" href="./page.css" />');
    });

    it('Puts every named virtual file of its folder next to the page, named showcases too, and no generated entry point', async () => {
      // See SPEC-S12 D521: a named showcase (lib.ts, a ts showcase's entry point) is copied like a virtual file with no showcase adapter
      const files = [
        virtual('README.showcase-1.html', '<script src="./demo.js"></script>'),
        virtual('README.showcase-2.html', '<p>Other</p>'),
        virtual('demo.js', 'run();', true),
        { path: 'lib.ts', named: true, showcase: 'README.md#3', content: 'export {};', documentation: 'README.md', line: 12, offset: 0 },
        { path: 'unused.css', named: true, content: 'p {}', documentation: 'CONTRIBUTE.md', line: 9, offset: 0 },
      ];
      const result = await adapter.build(request(_showcase('code-block', 'README.showcase-1.html'), files));
      expect(result).toEqual({
        page: 'index.html',
        files: [
          { path: 'index.html', content: wrapHtmlFragment('<script src="./demo.js"></script>') },
          { path: 'demo.js', content: 'run();' },
          { path: 'lib.ts', content: 'export {};' },
          { path: 'unused.css', content: 'p {}' },
        ],
        reads: ['README.md', 'CONTRIBUTE.md'],
      });
    });

    it('Puts the named virtual files next to a linked page too, under their names', async () => {
      const result = await adapter.build(request(_showcase('link', 'demos/page.html'), [virtual('demos/page.css', 'p {}', true)]));
      expect(result.files?.map((file) => file.path)).toEqual(['index.html', 'page.css']);
      expect(result.reads).toEqual(['demos/page.html', 'README.md']);
    });

    it('Fails on a named virtual file that would replace the page, ignoring case', async () => {
      const files = [virtual('README.showcase-1.html', '<p>Hi</p>'), virtual('INDEX.html', '<p>Mine</p>', true)];
      expect(await adapter.build(request(_showcase('code-block', 'README.showcase-1.html'), files))).toEqual({
        reads: ['README.md'],
        issues: [{ severity: 'error', message: 'The virtual file "INDEX.html" would replace the showcase frame\'s page', path: 'INDEX.html' }],
      });
    });

    it('Fails on a named html showcase called index.html, its own build too', async () => {
      // See PLAN-P15.1 D551: no exception for the showcase's own entry point
      const page = { path: 'index.html', named: true, showcase: 'README.md#1', content: '<p>Hi</p>', documentation: 'README.md', line: 3, offset: 0 };
      expect(await adapter.build(request(_showcase('code-block', 'index.html'), [page]))).toEqual({
        reads: ['README.md'],
        issues: [{ severity: 'error', message: 'The virtual file "index.html" would replace the showcase frame\'s page', path: 'index.html' }],
      });
    });

    it('Puts the included files next to the page, as they sit next to the entry point', async () => {
      // A real file, read as bytes; another documentation file's virtual file; a named virtual file of the folder, copied once
      const theme = { path: 'demos/theme.css', named: true, content: 'b {}', documentation: 'demos/README.md', line: 4, offset: 0 };
      const showcase = _showcase('link', 'demos/page.html', { include: ['demos/page.css', 'demos/theme.css', 'demos/widget.txt'] });
      const result = await adapter.build({ ...request(showcase, [virtual('demos/widget.txt', 'w', true)]), hostVirtualFiles: [theme] });
      expect(result.issues).toBeUndefined();
      expect(result.files?.map(({ path, content }) => ({ path, content: typeof content === 'string' ? content : Buffer.from(content).toString() }))).toEqual([
        { path: 'index.html', content: expect.stringContaining('<link rel="stylesheet" href="./page.css" />') },
        { path: 'widget.txt', content: 'w' },
        { path: 'page.css', content: expect.stringContaining('{') },
        { path: 'theme.css', content: 'b {}' },
      ]);
      expect(result.files![2].content).toBeInstanceOf(Uint8Array);
      expect(result.reads).toEqual(['demos/page.html', 'README.md', 'demos/page.css', 'demos/README.md']);
    });

    it('Fails on an included file landing where a named virtual file does, and on one it cannot read', async () => {
      // A linked page in another folder: README.md's named virtual file page.css lands by its name, where the included demos/page.css would
      const showcase = _showcase('link', 'demos/page.html', { include: ['demos/page.css', 'demos/missing.css'] });
      const result = await adapter.build(request(showcase, [virtual('page.css', 'p {}', true)]));
      expect(result.files).toBeUndefined();
      expect(result.issues).toEqual([
        {
          severity: 'error',
          message: 'The included file "demos/page.css" would land where the virtual file "page.css" does ("page.css")',
          path: 'demos/page.css',
        },
        { severity: 'error', message: expect.stringMatching(/^The included file can't be read: ENOENT/), path: 'demos/missing.css' },
      ]);
      expect(result.reads).toEqual(['demos/page.html', 'README.md', 'demos/missing.css']);
    });

    it('Reports an entry point it cannot find', async () => {
      expect(await adapter.build(request(_showcase('code-block', 'README.showcase-1.html')))).toEqual({
        reads: ['README.md'],
        issues: [{ severity: 'error', message: `The entry point's virtual file "README.showcase-1.html" is missing` }],
      });
      const linked = await adapter.build(request(_showcase('link', 'demos/missing.html')));
      expect(linked.issues).toEqual([{ severity: 'error', message: expect.stringContaining("The entry point can't be read: "), path: 'demos/missing.html' }]);
    });

    it('Tells pages from fragments', () => {
      expect(isHtmlPage('<!doctype html><p>Hi</p>')).toBe(true);
      expect(isHtmlPage('<!DOCTYPE html>')).toBe(true);
      expect(isHtmlPage('\ufeff<html lang="en">')).toBe(true);
      expect(isHtmlPage('  <!-- a page -->\n<HTML>')).toBe(true);
      expect(isHtmlPage('<head><title>x</title></head>')).toBe(true);
      expect(isHtmlPage('<?xml version="1.0"?><html>')).toBe(true);
      expect(isHtmlPage('<html>')).toBe(true);
      expect(isHtmlPage('<header>Hi</header>')).toBe(false);
      expect(isHtmlPage('<htmlx>')).toBe(false);
      expect(isHtmlPage('<p>Hi</p><!doctype html>')).toBe(false);
      expect(isHtmlPage('<!-- never closed <html>')).toBe(false);
      expect(isHtmlPage('')).toBe(false);
    });

    it('Skips whitespace and comments', () => {
      expect(skipHtmlSpaceAndComments(' <!-- a --> \n<p>', 0)).toBe(13);
      expect(skipHtmlSpaceAndComments('<p>', 0)).toBe(0);
      expect(skipHtmlSpaceAndComments('  ', 0)).toBe(2);
      expect(skipHtmlSpaceAndComments('<!-- open', 0)).toBe(-1);
    });

    it('Wraps a fragment without its byte order mark', () => {
      expect(wrapHtmlFragment('\ufeff<p>Hi</p>')).toContain('<body><p>Hi</p></body>');
    });
  });
});
