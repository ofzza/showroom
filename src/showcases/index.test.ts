/**
 * Tests of the showcase builds' pure parts: showcase frame paths and URLs, the frame script's insertion, build result checks and build error positions
 */

import { describe, expect, it } from 'vitest';
import type { Showcase, VirtualFile } from '../host/index.js';
import { checkBuildResult, getBuildErrorIssue, getShowcaseFrameFolder, getShowcaseFrameUrl, insertFrameScript, isValidBuildPath } from './index.js';

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
    // Tests the showcase frame's folder in the output folder, and the URL the showroom loads it by.

    it("Puts a showcase frame in its documentation file's folder, by its position", () => {
      expect(getShowcaseFrameFolder({ id: 'README.md#2', documentation: 'README.md' })).toBe('showcases/README.md/2');
      expect(getShowcaseFrameFolder({ id: 'docs/my notes #1.md#3', documentation: 'docs/my notes #1.md' })).toBe('showcases/docs/my notes #1.md/3');
    });

    it('Encodes each path segment of the URL', () => {
      expect(getShowcaseFrameUrl({ folder: 'showcases/docs/my notes #1.md/3', page: 'pages/index.html' })).toBe(
        'showcases/docs/my%20notes%20%231.md/3/pages/index.html',
      );
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
    const virtualFiles: VirtualFile[] = [{ path: 'docs/style.css', content: '', documentation: 'docs/other.md', line: 20 }];
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
