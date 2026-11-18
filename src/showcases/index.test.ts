/**
 * Tests of the showcase builds' pure parts: showcase frame paths and URLs, the frame script's insertion, build result checks, build error positions and
 * the shown issues
 */

import { afterEach, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MERMAID_ENTRY_FILE as BUILT_MERMAID_ENTRY_FILE } from '../../build/mermaid/index.js';
import { check } from '../cli/check/index.js';
import { readConfiguration } from '../configuration/index.js';
import type { Showcase, VirtualFile } from '../host/index.js';
import { createCanaryHost, createScratchFolder, type ScratchFolder } from '../testing/index.js';
import {
  buildShowcases,
  checkBuildResult,
  checkRecording,
  getBuildIssue,
  getBuildShowcasesIssues,
  getMermaidHash,
  getMermaidImportMap,
  getMermaidUrl,
  MERMAID_SPECIFIER,
  MERMAID_ENTRY_FILE,
  getRecordingFailure,
  getShowcaseFrameFolder,
  getShowcaseFrameHash,
  getShowcaseFrameUrl,
  getShownIssue,
  insertFrameScript,
  RECORDING_FAILURE_QUOTE_LENGTH,
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
  // the integration tests, as it creates a temporary folder, except without trust, when it creates nothing.

  it('Builds and loads nothing without trust, and reports nothing', async () => {
    // D740 (.workflow/SPEC-S14-trust.md): on a canary host repository, whose custom showcase adapter, sass and PostCSS configuration record running
    const host = await createCanaryHost();
    try {
      const { host: information } = await check(host.path);
      const { configuration } = await readConfiguration(host.path);
      const result = await buildShowcases({ root: host.path, host: information!, configuration: configuration! });
      expect([host.ran('adapter'), host.ran('sass'), host.ran('postcss')]).toEqual([false, false, false]);
      expect(result.frames.size).toBe(0);
      expect([result.errors.size, result.warnings, result.issues]).toEqual([0, [], []]);
      expect([...result.checks.values()]).toEqual([[], [], []]);
      expect([...result.shownIssues.values()]).toEqual([[], [], []]);
      // Still watched: the custom showcase adapter module, and the included files
      expect(result.watched).toEqual(['canary.js', 'style.scss']);
    } finally {
      await host.remove();
    }
  });

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

  describe('The shared Mermaid bundle', () => {
    // Tests the URL a showcase frame's page loads the bundle's entry point by, on hand-written showcases and pages, and the entry point's hash, on a
    // fake entry point written into a scratch folder.

    let scratch: ScratchFolder | undefined;

    afterEach(async () => {
      await scratch?.remove();
      scratch = undefined;
    });

    it("Reaches the bundle up from the page's own folder, with its hash", () => {
      expect(getMermaidUrl({ id: 'README.md#1', documentation: 'README.md' }, 'index.html', '0123abcd')).toBe('../../../mermaid/mermaid.js?hash=0123abcd');
      // A nested documentation file, and a nested page, each add a level
      expect(getMermaidUrl({ id: 'docs/a b/c.md#2', documentation: 'docs/a b/c.md' }, 'index.html', 'h')).toBe('../../../../../mermaid/mermaid.js?hash=h');
      expect(getMermaidUrl({ id: 'README.md#1', documentation: 'README.md' }, 'pages/x/index.html', 'h')).toBe('../../../../../mermaid/mermaid.js?hash=h');
      // A missing bundle has no hash, so its URL has no query
      expect(getMermaidUrl({ id: 'README.md#1', documentation: 'README.md' }, 'index.html', undefined)).toBe('../../../mermaid/mermaid.js');
    });

    it('Maps its specifier to its URL in an import map that never closes its element early', () => {
      // See PLAN-P21 D858
      expect(getMermaidImportMap('../mermaid/mermaid.js?hash=h')).toBe(
        `<script type="importmap">{"imports":{"${MERMAID_SPECIFIER}":"../mermaid/mermaid.js?hash=h"}}</script>`,
      );
      expect(getMermaidImportMap('</script>')).toContain('"\\u003c/script>"');
    });

    it("Hashes the bundle's entry point, and gives none without one", async () => {
      scratch = await createScratchFolder('mermaid-hash-');
      expect(await getMermaidHash(scratch.path)).toBeUndefined();
      await writeFile(join(scratch.path, MERMAID_ENTRY_FILE), 'export default 1;');
      expect(await getMermaidHash(scratch.path)).toBe(getShowcaseFrameHash([{ path: MERMAID_ENTRY_FILE, content: 'export default 1;' }]));
    });

    it('Names the entry point as its build writes it', () => {
      expect(MERMAID_ENTRY_FILE).toBe(BUILT_MERMAID_ENTRY_FILE);
    });
  });

  describe('Run issues', () => {
    // Tests the one list of a run's issues the command line writes, on hand-written issues.

    it("Gets every issue of a run, the run's own first, the warnings last", () => {
      const issue = (message: string) => ({ severity: 'error' as const, message });
      const errors = new Map([
        ['README.md#1', [issue('a'), issue('b')]],
        ['README.md#2', [issue('c')]],
      ]);
      const warnings = [{ severity: 'warning' as const, message: 'w' }];
      expect(getBuildShowcasesIssues({ errors, warnings, issues: [issue('run')] }).map(({ message }) => message)).toEqual(['run', 'a', 'b', 'c', 'w']);
      expect(getBuildShowcasesIssues({ errors: new Map(), warnings: [], issues: [] })).toEqual([]);
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

    it('Inserts what goes after the script right after it', () => {
      // See PLAN-P21 D858: a showcase frame using the shared Mermaid bundle gets its import map there, before any of the page's module scripts
      expect(insertFrameScript('<head><title>x</title>', _SCRIPT, '<i></i>')).toBe(`<head>${_CHARSET}${_TAG}<i></i><title>x</title>`);
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
        checks: [],
        issues: [],
        warnings: [],
      });
      expect(checkBuildResult({ page: 'p.htm', files: [{ path: 'p.htm', content: new TextEncoder().encode('✓') }] })).toEqual({
        page: 'p.htm',
        files: [{ path: 'p.htm', content: '✓' }],
        reads: [],
        checks: [],
        issues: [],
        warnings: [],
      });
    });

    it('Accepts errors of the build itself, with no files', () => {
      const issues = [
        { severity: 'error', message: 'x', path: 'a.js', line: 2 },
        { severity: 'warning', message: 'w' },
      ];
      expect(checkBuildResult({ issues, reads: [] })).toEqual({ reads: [], checks: [], issues, warnings: [] });
      expect(checkBuildResult({ issues, reads: [] }, true)).toEqual({ reads: [], checks: [], issues, warnings: [] });
    });

    it("Accepts files beside a check's errors and warnings, and the build's warnings", () => {
      // See SPEC-S12 D508: errors that all name a check leave the files usable
      const issues = [
        { severity: 'error', message: 'x', check: 'type check' },
        { severity: 'warning', message: 'y', check: 'type check' },
        { severity: 'warning', message: 'w' },
      ];
      expect(checkBuildResult({ page: 'index.html', files: [page], checks: ['type check', 'lint'], issues })).toEqual({
        page: 'index.html',
        files: [page],
        reads: [],
        checks: ['type check', 'lint'],
        issues,
        warnings: [],
      });
    });

    it("Accepts a recorded showcase adapter's recording without files, leaving out its files with a warning", () => {
      // See PLAN-P20 D790 C12, C24
      const recording = { lines: [{ level: 'log', text: 'hi' }], dropped: 0, exitCode: 0 };
      expect(checkBuildResult({ recording, checks: ['compile'] }, true)).toEqual({ recording, reads: [], checks: ['compile'], issues: [], warnings: [] });
      expect(checkBuildResult({ recording, page: 'index.html', files: [page] }, true)).toEqual({
        recording,
        reads: [],
        checks: [],
        issues: [],
        warnings: ['a recorded showcase adapter\'s "page" and "files" are left out'],
      });
      expect(checkBuildResult({ page: 'index.html', files: [page], recording })).toMatchObject({
        page: 'index.html',
        warnings: ['the "recording" of a showcase adapter that isn\'t recorded is left out'],
      });
      expect((checkBuildResult({ page: 'index.html', files: [page], recording }) as { recording?: unknown }).recording).toBeUndefined();
    });

    it('Rejects invalid recordings, a missing one, and a "runtime" check', () => {
      const problem = (result: unknown, recorded = true) => (checkBuildResult(result, recorded) as { problem?: string }).problem;
      expect(problem({})).toBe('a recorded showcase adapter must return a "recording", unless an error names no check');
      expect(problem({ recording: { lines: [], dropped: 0, exitCode: 0 }, issues: [{ severity: 'error', message: 'x' }] })).toBe(
        'an error naming no check means there is no recording: leave out "recording"',
      );
      expect(problem({ recording: { lines: [], dropped: 0, exitCode: 0 }, checks: ['runtime'] })).toBe(
        '"checks" can\'t list "runtime", which showroom adds for a recording',
      );
      expect(problem({ page: 'index.html', files: [page], checks: ['runtime'] }, false)).toBe(
        '"checks" can\'t list "runtime", which showroom adds for a recording',
      );
      expect(checkRecording('x')).toBe('"recording" must be an object');
      expect(checkRecording({ lines: [{ level: 'trace', text: 'x' }], dropped: 0, exitCode: 0 })).toBe(
        '"recording.lines" must be a list of lines, each with a level and a text',
      );
      expect(checkRecording({ lines: [], dropped: -1, exitCode: 0 })).toBe('"recording.dropped" must be a whole number from 0');
      expect(checkRecording({ lines: [], dropped: 0, droppedErrors: 1.5, exitCode: 0 })).toBe('"recording.droppedErrors" must be a whole number from 0');
      expect(checkRecording({ lines: [], dropped: 0, exitCode: 1.5 })).toBe('"recording.exitCode" must be a whole number');
      expect(checkRecording({ lines: [], dropped: 0 })).toBe('a recording must end in exactly one of "exitCode", "signal" and "timedOut"');
      expect(checkRecording({ lines: [], dropped: 0, exitCode: 0, signal: 'SIGKILL' })).toBe(
        'a recording must end in exactly one of "exitCode", "signal" and "timedOut"',
      );
      expect(checkRecording({ lines: [], dropped: 0, timedOut: true, timeLimit: 30000 })).toBeUndefined();
    });

    it('Says why a recording failed: its exit, and anything written to standard error', () => {
      // See SPEC-S15 D728: any line on standard error fails a recording, as a console.error fails a showcase frame's runtime
      const recording = (end: object, lines: { level: 'log' | 'error'; text: string }[] = [], droppedErrors?: number) => ({
        lines,
        dropped: 0,
        ...(droppedErrors ? { droppedErrors } : {}),
        ...end,
      });
      expect(getRecordingFailure(recording({ exitCode: 0 }, [{ level: 'log', text: 'x' }]))).toBeUndefined();
      expect(getRecordingFailure(recording({ exitCode: 134 }))).toBe('exited with code 134');
      expect(getRecordingFailure(recording({ signal: 'SIGABRT' }))).toBe('ended by signal SIGABRT');
      expect(getRecordingFailure(recording({ timedOut: true, timeLimit: 2000 }))).toBe('stopped after the 2 s time limit');
      expect(getRecordingFailure(recording({ exitCode: 0 }, [{ level: 'error', text: 'x' }], 2))).toBe('wrote 3 lines to standard error, the first kept: "x"');
      expect(getRecordingFailure(recording({ exitCode: 1 }, [{ level: 'error', text: 'x' }]))).toBe(
        'exited with code 1, and wrote 1 line to standard error: "x"',
      );
      expect(
        getRecordingFailure(
          recording({ exitCode: 0 }, [
            { level: 'log', text: 'out' },
            { level: 'error', text: ' a ' },
            { level: 'error', text: 'b' },
          ]),
        ),
      ).toBe('wrote 2 lines to standard error, the first: "a"');
      // Every error line dropped: nothing to quote
      expect(getRecordingFailure(recording({ exitCode: 0 }, [], 1))).toBe('wrote 1 line to standard error');
      const long = 'y'.repeat(RECORDING_FAILURE_QUOTE_LENGTH + 1);
      expect(getRecordingFailure(recording({ exitCode: 0 }, [{ level: 'error', text: long }]))).toBe(
        `wrote 1 line to standard error: "${long.slice(0, RECORDING_FAILURE_QUOTE_LENGTH)}…"`,
      );
    });

    it('Rejects invalid results', () => {
      const problem = (result: unknown) => (checkBuildResult(result) as { problem?: string }).problem;
      const error = { severity: 'error', message: 'x' };
      expect(problem(undefined)).toBe('it is not an object');
      expect(problem({ page: 'index.html', files: [page], reads: 'x' })).toBe('"reads" must be a list of paths');
      for (const checks of ['type check', [''], ['a', 'a'], [1]]) {
        expect(problem({ page: 'index.html', files: [page], checks })).toBe('"checks" must be a list of distinct, non-empty names');
      }
      for (const issues of [error, [{ message: 'x' }], [{ severity: 'fatal', message: 'x' }], [{ severity: 'error' }], [{ ...error, check: 1 }]]) {
        expect(problem({ issues })).toBe('"issues" must be a list of build issues, each with a severity ("error" or "warning") and a message');
      }
      // See PLAN-P15.2 D555: checks are validated strictly
      expect(problem({ page: 'index.html', files: [page], issues: [{ ...error, check: 'type check' }] })).toBe(
        'an issue names the check "type check", which "checks" doesn\'t list',
      );
      expect(problem({ page: 'index.html', files: [page], issues: [error] })).toBe(
        'an error naming no check means there are no files: leave out "page" and "files"',
      );
      expect(problem({ page: 'index.html', issues: [error] })).toBe('an error naming no check means there are no files: leave out "page" and "files"');
      expect(problem({ checks: ['type check'], issues: [{ ...error, check: 'type check' }] })).toBe(
        '"files" must be a list of files, unless an error names no check',
      );
      expect(problem({ page: 'index.html' })).toBe('"files" must be a list of files, unless an error names no check');
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

  describe('Build issues', () => {
    // Tests where a build issue is reported, and how: a showcase in a documentation file at line 10, with a virtual file fenced at line 20 of
    // another one.

    const showcase: Showcase = {
      id: 'docs/guide.md#2',
      documentation: 'docs/guide.md',
      line: 10,
      offset: 0,
      kind: 'code-block',
      display: 'block',
      adapter: 'x',
      entry: 'docs/guide.showcase-2.js',
      include: [],
      tabs: [{ kind: 'source' }],
      views: ['demo'],
    };
    const virtualFiles: VirtualFile[] = [{ path: 'docs/style.css', named: true, content: '', documentation: 'docs/other.md', line: 20, offset: 0 }];
    const message = 'Showcase docs/guide.md#2 (docs/guide.md:10): Broke';

    it('Places an error in a virtual file in its documentation file, below the fence', () => {
      expect(getBuildIssue(showcase, virtualFiles, { severity: 'error', message: 'Broke', path: 'docs/style.css', line: 3 })).toEqual({
        severity: 'error',
        message,
        path: 'docs/other.md',
        line: 23,
      });
      expect(getBuildIssue(showcase, virtualFiles, { severity: 'error', message: 'Broke', path: 'docs/style.css' })).toMatchObject({
        path: 'docs/other.md',
        line: 20,
      });
    });

    it('Places a warning as an error, keeping its severity', () => {
      expect(getBuildIssue(showcase, virtualFiles, { severity: 'warning', message: 'Broke', path: 'docs/style.css', line: 3 })).toEqual({
        severity: 'warning',
        message,
        path: 'docs/other.md',
        line: 23,
      });
      expect(getBuildIssue(showcase, virtualFiles, { severity: 'warning', message: 'Broke' })).toMatchObject({
        severity: 'warning',
        path: 'docs/guide.md',
        line: 10,
      });
    });

    it('Places an error in a real file there', () => {
      expect(getBuildIssue(showcase, virtualFiles, { severity: 'error', message: 'Broke', path: 'src/a.ts', line: 4 })).toEqual({
        severity: 'error',
        message,
        path: 'src/a.ts',
        line: 4,
      });
      expect(getBuildIssue(showcase, virtualFiles, { severity: 'error', message: 'Broke', path: 'src/a.ts', line: 0 })).toEqual({
        severity: 'error',
        message,
        path: 'src/a.ts',
      });
    });

    it("Names an issue's check in its message, and keeps it", () => {
      expect(getBuildIssue(showcase, virtualFiles, { severity: 'error', message: 'Broke', path: 'src/a.ts', line: 4, check: 'type check' })).toEqual({
        severity: 'error',
        message: 'Showcase docs/guide.md#2 (docs/guide.md:10): type check: Broke',
        path: 'src/a.ts',
        line: 4,
        check: 'type check',
      });
    });

    it('Places an error without a valid path at the entry point', () => {
      const atEntry = { severity: 'error', message, path: 'docs/guide.md', line: 10 };
      expect(getBuildIssue(showcase, virtualFiles, { severity: 'error', message: 'Broke' })).toEqual(atEntry);
      expect(getBuildIssue(showcase, virtualFiles, { severity: 'error', message: 'Broke', path: '../outside.js', line: 2 })).toEqual(atEntry);
    });
  });

  describe('Shown issues', () => {
    // Tests the issues the showroom shows, as the showcase adapter reported them, on the showcase of the build issues' tests.

    const showcase = { entry: 'docs/guide.showcase-2.js' };

    it("Keeps the showcase adapter's own message, check, path and line", () => {
      expect(getShownIssue(showcase, { severity: 'error', message: 'Broke', path: 'docs/style.css', line: 3, check: 'type check' })).toEqual({
        severity: 'error',
        message: 'Broke',
        check: 'type check',
        path: 'docs/style.css',
        line: 3,
      });
      expect(getShownIssue(showcase, { severity: 'warning', message: 'Slow', path: 'src/a.ts' })).toEqual({
        severity: 'warning',
        message: 'Slow',
        path: 'src/a.ts',
      });
    });

    it('Drops an invalid line, and places an issue without a valid path at the entry point, with no line', () => {
      const atEntry = { severity: 'error', message: 'Broke', path: 'docs/guide.showcase-2.js' };
      expect(getShownIssue(showcase, { severity: 'error', message: 'Broke', path: 'src/a.ts', line: 0 })).toEqual({ ...atEntry, path: 'src/a.ts' });
      expect(getShownIssue(showcase, { severity: 'error', message: 'Broke' })).toEqual(atEntry);
      expect(getShownIssue(showcase, { severity: 'error', message: 'Broke', path: '../outside.js', line: 2 })).toEqual(atEntry);
    });
  });
});
