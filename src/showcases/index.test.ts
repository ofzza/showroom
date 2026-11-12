/**
 * Tests of the showcase builds' pure parts: showcase frame paths and URLs, the frame script's insertion, build result checks and build error positions
 */

import { describe, expect, it } from 'vitest';
import { getFrameScript } from '../frame/index.js';
import type { Showcase, VirtualFile } from '../host/index.js';
import {
  checkBuildResult,
  getBuildErrorIssue,
  getBuildShowcasesIssues,
  getErrorFrame,
  getShowcaseFrameFolder,
  getShowcaseFrameHash,
  getShowcaseFrameUrl,
  insertFrameScript,
  isValidBuildPath,
} from './index.js';

/**
 * Script inserted in the insertion tests, short so that the expected pages stay readable
 */
const _SCRIPT = 'run()';

/**
 * The inserted script element
 */
const _TAG = `<script>${_SCRIPT}</script>`;

/**
 * The charset element inserted before the script when the page has none in its prolog
 */
const _CHARSET = '<meta charset="utf-8">';

describe('showcases', () => {
  // Tests the functions `buildShowcases()` is made of on hand-written pages, results and errors; `buildShowcases()` itself is tested on fixtures by
  // the integration tests, as it creates a temporary folder.

  describe('Showcase frame paths', () => {
    // Tests the showcase frame's folder in the output folder, and the URL the showroom loads it by, with its content's hash.

    it("Puts a showcase frame in its documentation file's folder, by its position", () => {
      expect(getShowcaseFrameFolder({ id: 'README.md#2', documentation: 'README.md' })).toBe('showcases/README.md/2');
      expect(getShowcaseFrameFolder({ id: 'docs/my notes #1.md#3', documentation: 'docs/my notes #1.md' })).toBe('showcases/docs/my notes #1.md/3');
    });

    it('Encodes each path segment of the URL, and adds the hash as its query', () => {
      const files = [{ path: 'pages/index.html', content: '<p>x</p>' }];
      expect(getShowcaseFrameUrl({ folder: 'showcases/docs/my notes #1.md/3', page: 'pages/index.html', files })).toBe(
        `showcases/docs/my%20notes%20%231.md/3/pages/index.html?hash=${getShowcaseFrameHash(files)}`,
      );
    });

    it("Hashes a showcase frame's files, whatever their order", () => {
      const files = [
        { path: 'index.html', content: '<p>x</p>' },
        { path: 'a.png', content: new Uint8Array([1, 2]) },
      ];
      const hash = getShowcaseFrameHash(files);
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
      expect(getShowcaseFrameHash([...files].reverse())).toBe(hash);
      // The same bytes, as a string or as bytes, hash the same
      expect(getShowcaseFrameHash([files[0], { path: 'a.png', content: '\x01\x02' }])).toBe(hash);
    });

    it('Changes the hash with any path or content', () => {
      const hash = getShowcaseFrameHash([{ path: 'index.html', content: '<p>x</p>' }]);
      expect(getShowcaseFrameHash([{ path: 'index.html', content: '<p>y</p>' }])).not.toBe(hash);
      expect(getShowcaseFrameHash([{ path: 'page.html', content: '<p>x</p>' }])).not.toBe(hash);
      expect(
        getShowcaseFrameHash([
          { path: 'index.html', content: '<p>x</p>' },
          { path: 'a.js', content: '' },
        ]),
      ).not.toBe(hash);
      // Each length is hashed, so moving text between a path and its content changes the hash
      expect(getShowcaseFrameHash([{ path: 'a', content: 'bc' }])).not.toBe(getShowcaseFrameHash([{ path: 'ab', content: 'c' }]));
    });
  });

  describe('Error frames', () => {
    // Tests the page `serve` shows in place of a showcase that doesn't build, on hand-written build errors.

    const showcase = { id: 'docs/a.md#2', documentation: 'docs/a.md' };

    it("Puts the error frame in the showcase's showcase frame folder, with the frame script", () => {
      const frame = getErrorFrame(showcase, [{ severity: 'error', message: 'Broke', path: 'docs/a.md', line: 3 }]);
      expect(frame).toMatchObject({ folder: 'showcases/docs/a.md/2', page: 'index.html', reads: [] });
      expect(frame.files.map((file) => file.path)).toEqual(['index.html']);
      expect(frame.files[0].content).toContain(`<head><meta charset="utf-8"><script>${getFrameScript()}</script>`);
    });

    it('Lists every build error, with its file and line', () => {
      const content = getErrorFrame(showcase, [
        { severity: 'error', message: 'First', path: 'docs/a.md', line: 3 },
        { severity: 'error', message: 'Second', path: 'src/b.js' },
        { severity: 'error', message: 'Third' },
      ]).files[0].content as string;
      expect(content).toContain('<li><div class="message">First</div><div class="location">docs/a.md:3</div></li>');
      expect(content).toContain('<li><div class="message">Second</div><div class="location">src/b.js</div></li>');
      expect(content).toContain('<li><div class="message">Third</div></li>');
    });

    it('Escapes the messages, paths and showcase id', () => {
      const content = getErrorFrame({ id: '<b>.md#1', documentation: '<b>.md' }, [
        { severity: 'error', message: `Expected "<" & '>'`, path: '<b>.md', line: 1 },
      ]).files[0].content as string;
      expect(content).toContain('Showcase &lt;b&gt;.md#1');
      expect(content).toContain('Expected &quot;&lt;&quot; &amp; &#39;&gt;&#39;');
      expect(content).toContain('&lt;b&gt;.md:1');
      expect(content).not.toContain('<b>');
    });

    it("Gets every issue of a run, the run's own first", () => {
      const issue = (message: string) => ({ severity: 'error' as const, message });
      const errors = new Map([
        ['README.md#1', [issue('a'), issue('b')]],
        ['README.md#2', [issue('c')]],
      ]);
      expect(getBuildShowcasesIssues({ errors, issues: [issue('run')] }).map(({ message }) => message)).toEqual(['run', 'a', 'b', 'c']);
      expect(getBuildShowcasesIssues({ errors: new Map(), issues: [] })).toEqual([]);
    });
  });

  describe('Frame script insertion', () => {
    // Tests where the script goes in pages with and without each part of a prolog.

    it('Inserts after <head>, with a charset', () => {
      expect(insertFrameScript('<!doctype html><html lang="en"><head><title>x</title>', _SCRIPT)).toBe(
        `<!doctype html><html lang="en"><head>${_CHARSET}${_TAG}<title>x</title>`,
      );
    });

    it("Inserts after the head's <meta charset>", () => {
      expect(insertFrameScript('<!DOCTYPE html>\n<HTML>\n<HEAD>\n  <meta charset="utf-8" />\n<title>', _SCRIPT)).toBe(
        `<!DOCTYPE html>\n<HTML>\n<HEAD>\n  <meta charset="utf-8" />${_TAG}\n<title>`,
      );
      expect(insertFrameScript('<head><meta name="viewport" content="x">', _SCRIPT)).toBe(`<head>${_CHARSET}${_TAG}<meta name="viewport" content="x">`);
    });

    it('Inserts after <html> or the doctype when there is no <head>', () => {
      expect(insertFrameScript('<html><body>x</body></html>', _SCRIPT)).toBe(`<html>${_CHARSET}${_TAG}<body>x</body></html>`);
      expect(insertFrameScript('<!doctype html>', _SCRIPT)).toBe(`<!doctype html>${_CHARSET}${_TAG}`);
      expect(insertFrameScript('<!doctype html><p>x</p>', _SCRIPT)).toBe(`<!doctype html>${_CHARSET}${_TAG}<p>x</p>`);
    });

    it('Inserts at the start of a page with no prolog, after its byte order mark', () => {
      expect(insertFrameScript('<p>x</p>', _SCRIPT)).toBe(`${_CHARSET}${_TAG}<p>x</p>`);
      expect(insertFrameScript('\ufeff<p>x</p>', _SCRIPT)).toBe(`\ufeff${_CHARSET}${_TAG}<p>x</p>`);
      expect(insertFrameScript('', _SCRIPT)).toBe(`${_CHARSET}${_TAG}`);
    });

    it('Tells <head> from <header>, and skips tags in comments', () => {
      expect(insertFrameScript('<html><header>x</header>', _SCRIPT)).toBe(`<html>${_CHARSET}${_TAG}<header>x</header>`);
      expect(insertFrameScript('<!-- <head> --><!doctype html><!-- x --><head>', _SCRIPT)).toBe(
        `<!-- <head> --><!doctype html><!-- x --><head>${_CHARSET}${_TAG}`,
      );
    });

    it('Skips a ">" in a quoted attribute', () => {
      expect(insertFrameScript('<html data-x="a>b"><head>', _SCRIPT)).toBe(`<html data-x="a>b"><head>${_CHARSET}${_TAG}`);
    });
  });

  describe('Build results', () => {
    // Tests checking what a showcase adapter's build returns.

    const page = { path: 'index.html', content: '<p>x</p>' };

    it('Accepts files with a page among them, decoding a page given as bytes', () => {
      expect(checkBuildResult({ page: 'index.html', files: [page, { path: 'a/b.png', content: new Uint8Array([1]) }], reads: ['x'] })).toEqual({
        page: 'index.html',
        files: [page, { path: 'a/b.png', content: new Uint8Array([1]) }],
        reads: ['x'],
      });
      expect(checkBuildResult({ page: 'p.htm', files: [{ path: 'p.htm', content: new TextEncoder().encode('✓') }] })).toEqual({
        page: 'p.htm',
        files: [{ path: 'p.htm', content: '✓' }],
        reads: [],
      });
    });

    it('Accepts build errors', () => {
      expect(checkBuildResult({ errors: [{ message: 'x', path: 'a.js', line: 2 }], reads: [] })).toEqual({
        errors: [{ message: 'x', path: 'a.js', line: 2 }],
        reads: [],
      });
    });

    it('Rejects invalid results', () => {
      const problem = (result: unknown) => (checkBuildResult(result) as { problem?: string }).problem;
      expect(problem(undefined)).toBe('it is not an object');
      expect(problem({ errors: [] })).toBe('"errors" must be a list of build errors, not empty');
      expect(problem({ errors: [{}] })).toBe('every build error must have a message');
      expect(problem({ page: 'index.html', files: [page], reads: 'x' })).toBe('"reads" must be a list of paths');
      expect(problem({ page: 'index.html' })).toBe('"files" must be a list of files');
      expect(problem({ page: 'index.html', files: [page, { path: '../x.css', content: '' }] })).toBe(
        'invalid file path "../x.css": use a relative, POSIX-style path',
      );
      expect(problem({ page: 'index.html', files: [page, { path: 'INDEX.html', content: '' }] })).toBe('the file path "INDEX.html" is not unique');
      expect(problem({ page: 'index.html', files: [page, { path: 'x.css' }] })).toBe('the file "x.css" has no content');
      expect(problem({ page: 'other.html', files: [page] })).toBe('the page "other.html" is not among the files');
      expect(problem({ page: 'INDEX.HTML', files: [page] })).toBe('the page "INDEX.HTML" is not among the files');
      expect(problem({ page: 'x.js', files: [page, { path: 'x.js', content: '' }] })).toBe('the page "x.js" must be an .html or .htm file');
    });

    it('Accepts only relative, POSIX-style paths', () => {
      for (const path of ['index.html', 'a/b/c.js', '.hidden', 'a..b']) expect(isValidBuildPath(path)).toBe(true);
      for (const path of ['', '/a', 'a//b', 'a/', './a', 'a/../b', '..', 'a\\b', 'C:/a', 'c:a', 3, undefined]) expect(isValidBuildPath(path)).toBe(false);
    });
  });

  describe('Build errors', () => {
    // Tests where a build error is reported: a showcase in a documentation file at line 10, with a virtual file fenced at line 20 of another one.

    const showcase: Showcase = {
      id: 'docs/guide.md#2',
      documentation: 'docs/guide.md',
      line: 10,
      offset: 0,
      kind: 'inline',
      adapter: 'x',
      entry: 'docs/guide.showcase-2.js',
    };
    const virtualFiles: VirtualFile[] = [{ path: 'docs/style.css', kind: 'resource', content: '', documentation: 'docs/other.md', line: 20 }];
    const message = 'Showcase docs/guide.md#2 (docs/guide.md:10): Broke';

    it('Places an error in a virtual file in its documentation file, below the fence', () => {
      expect(getBuildErrorIssue(showcase, virtualFiles, { message: 'Broke', path: 'docs/style.css', line: 3 })).toEqual({
        severity: 'error',
        message,
        path: 'docs/other.md',
        line: 23,
      });
      expect(getBuildErrorIssue(showcase, virtualFiles, { message: 'Broke', path: 'docs/style.css' })).toMatchObject({ path: 'docs/other.md', line: 20 });
    });

    it('Places an error in a real file there', () => {
      expect(getBuildErrorIssue(showcase, virtualFiles, { message: 'Broke', path: 'src/a.ts', line: 4 })).toEqual({
        severity: 'error',
        message,
        path: 'src/a.ts',
        line: 4,
      });
      expect(getBuildErrorIssue(showcase, virtualFiles, { message: 'Broke', path: 'src/a.ts', line: 0 })).toEqual({
        severity: 'error',
        message,
        path: 'src/a.ts',
      });
    });

    it('Places an error without a valid path at the entry point', () => {
      const atEntry = { severity: 'error', message, path: 'docs/guide.md', line: 10 };
      expect(getBuildErrorIssue(showcase, virtualFiles, { message: 'Broke' })).toEqual(atEntry);
      expect(getBuildErrorIssue(showcase, virtualFiles, { message: 'Broke', path: '../outside.js', line: 2 })).toEqual(atEntry);
    });
  });
});
