/**
 * Integration tests of the showcase builds: buildShowcases() on fixture host repositories, with real showcase adapters
 */

import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ShowcaseRecording } from '../adapters/showcase/index.js';
import { check } from '../cli/check/index.js';
import { readConfiguration } from '../configuration/index.js';
import { getFrameScript } from '../frame/index.js';
import { createScratchFolder, FIXTURES, SCRATCH_ROOT } from '../testing/index.js';
import { createRunSession } from '../host-copy/index.js';
import { getCacheFolder } from '../processes/index.js';
import { buildShowcases, type BuildShowcasesResult } from './index.js';

/**
 * Checks a fixture, then builds its showcases
 * @param name Name of the fixture
 * @returns The outcome of buildShowcases()
 */
async function _build(name: string) {
  const root = join(FIXTURES, name);
  const { host } = await check(root, { trust: true });
  const { configuration } = await readConfiguration(root);
  if (!host || !configuration) throw new Error(`The fixture "${name}" doesn't pass the check`);
  return buildShowcases({ root, host, configuration, trust: true });
}

describe('showcases (integration)', () => {
  // Builds the showcases of the `showcase-frames` fixture (html pages, a fragment including its folder's virtual file, a linked page including its
  // stylesheet, a named virtual file and a named showcase next to each, and a custom showcase adapter's page with assets) and of the `showcase-build-errors` fixture (a custom
  // showcase adapter failing with errors, one throwing, one returning an invalid result, a showcase that builds, one whose check fails beside its
  // files, and one naming a check it doesn't list). The fixtures are only read;
  // the build's temporary folder is in the project's own OS temp folder.

  it('Builds every showcase frame, with the frame script in its page', async () => {
    const { frames, errors, issues, watched } = await _build('showcase-frames');
    expect(issues).toEqual([]);
    expect(errors.size).toBe(0);
    expect([...frames.keys()]).toEqual(['README.md#1', 'README.md#2', 'README.md#3', 'README.md#4', 'docs/my notes #1.md#1']);
    const script = `<script>${getFrameScript()}</script>`;

    // A code block showcase's page, the script after its head
    const page = frames.get('README.md#1')!;
    expect(page).toMatchObject({ folder: 'showcases/README.md/1', page: 'index.html', reads: ['README.md'] });
    expect(page.files).toEqual([
      {
        path: 'index.html',
        content: `<!doctype html>\n<html><head><meta charset="utf-8">${script}<title>Page</title></head><body><p>A page</p></body></html>`,
      },
      { path: 'fragment.js', content: "document.querySelector('.fragment').textContent += ', with a virtual file';" },
      { path: 'extra.html', content: '<p>A named showcase</p>' },
    ]);

    // A fragment, wrapped
    expect(frames.get('README.md#2')!.files[0].content).toContain(`<head><meta charset="utf-8">${script}<meta name="viewport"`);
    expect(frames.get('README.md#2')!.files[0].content).toContain('<body><p class="fragment">A fragment</p><script src="./fragment.js"></script></body>');
    // Including the named virtual file of its own folder copies it once
    expect(frames.get('README.md#2')!.files.map((file) => file.path)).toEqual(['index.html', 'fragment.js', 'extra.html']);
    // A named showcase's own frame holds it under its name too (D521, .workflow/SPEC-S12-showcase-views.md)
    expect(frames.get('README.md#4')!.files.map((file) => file.path)).toEqual(['index.html', 'fragment.js', 'extra.html']);

    // A linked page, after its own charset, with its included stylesheet next to it, as it sits next to the page on disk
    const linked = frames.get('README.md#3')!;
    expect(linked.reads).toEqual(['demos/page.html', 'README.md', 'demos/page.css']);
    expect(linked.files.map((file) => file.path)).toEqual(['index.html', 'fragment.js', 'extra.html', 'page.css']);
    expect(linked.files[0].content).toContain(`<meta charset="utf-8" />${script}`);

    // A custom showcase adapter's page given as bytes, with its assets
    const custom = frames.get('docs/my notes #1.md#1')!;
    expect(custom.folder).toBe('showcases/docs/my notes #1.md/1');
    expect(custom.reads).toEqual(['demos/widget.txt']);
    expect(custom.files.map((file) => file.path)).toEqual(['index.html', 'assets/style.css', 'assets/pixel.gif']);
    expect(custom.files[0].content).toContain(`<head><meta charset="utf-8">${script}<link`);
    expect(custom.files[0].content).toContain('Widget ✓');
    expect(custom.files[2].content).toBeInstanceOf(Uint8Array);

    // The files to watch, sorted: the custom showcase adapter module, the included files and the reads
    expect(watched).toEqual(['README.md', 'adapters/assets.js', 'demos/page.css', 'demos/page.html', 'demos/widget.txt']);
  });

  it("Reports every build issue by showcase, where it is in the documentation, with its check, and keeps the files beside a check's errors", async () => {
    const { frames, errors, warnings, shownIssues, checks, issues } = await _build('showcase-build-errors');
    expect(issues).toEqual([]);
    // A check's errors leave its files usable (D508, .workflow/SPEC-S12-showcase-views.md)
    expect([...frames.keys()]).toEqual(['README.md#4', 'README.md#5']);
    expect(Object.fromEntries(checks)).toEqual({
      'README.md#1': [],
      'README.md#2': [],
      'README.md#3': [],
      'README.md#4': [],
      'README.md#5': ['lint'],
      'README.md#6': [],
    });
    expect(warnings).toEqual([
      { severity: 'warning', message: 'Showcase README.md#5 (README.md:30): lint: Long line', path: 'README.md', line: 30, check: 'lint' },
    ]);
    expect(Object.fromEntries(errors)).toEqual({
      'README.md#1': [
        { severity: 'error', message: 'Showcase README.md#1 (README.md:5): Unexpected token', path: 'README.md', line: 7 },
        { severity: 'error', message: 'Showcase README.md#1 (README.md:5): Something went wrong', path: 'README.md', line: 5 },
        { severity: 'error', message: 'Showcase README.md#1 (README.md:5): Not here', path: 'README.md', line: 5 },
        { severity: 'error', message: 'Showcase README.md#1 (README.md:5): Widget broke', path: 'src/widget.js', line: 2 },
      ],
      'README.md#2': [
        {
          severity: 'error',
          message: 'Showcase README.md#2 (README.md:12): Showcase adapter "throwing" failed to build the showcase: build broke',
          path: 'README.md',
          line: 12,
        },
      ],
      'README.md#3': [
        {
          severity: 'error',
          message:
            'Showcase README.md#3 (README.md:18): Showcase adapter "invalid" returned an invalid build result: the page "missing.html" is not among the files',
          path: 'README.md',
          line: 18,
        },
      ],
      'README.md#5': [{ severity: 'error', message: 'Showcase README.md#5 (README.md:30): lint: Unused variable', path: 'README.md', line: 31, check: 'lint' }],
      'README.md#6': [
        {
          severity: 'error',
          message:
            'Showcase README.md#6 (README.md:36): Showcase adapter "checked" returned an invalid build result: an issue names the check "lint", which "checks" doesn\'t list',
          path: 'README.md',
          line: 36,
        },
      ],
    });
    // The issues the showroom shows: the showcase adapter's own messages, each in its own file, and an issue placed in no valid file at the entry
    // point, with no line (D584, .workflow/PLAN-P15.5-status-marks.md)
    expect(Object.fromEntries(shownIssues)).toEqual({
      'README.md#1': [
        { severity: 'error', message: 'Unexpected token', path: 'README.showcase-1.js', line: 2 },
        { severity: 'error', message: 'Something went wrong', path: 'README.showcase-1.js' },
        { severity: 'error', message: 'Not here', path: 'README.showcase-1.js' },
        { severity: 'error', message: 'Widget broke', path: 'src/widget.js', line: 2 },
      ],
      'README.md#2': [{ severity: 'error', message: 'Showcase adapter "throwing" failed to build the showcase: build broke', path: 'README.showcase-2.js' }],
      'README.md#3': [
        {
          severity: 'error',
          message: 'Showcase adapter "invalid" returned an invalid build result: the page "missing.html" is not among the files',
          path: 'README.showcase-3.js',
        },
      ],
      'README.md#4': [],
      'README.md#5': [
        { severity: 'error', message: 'Unused variable', path: 'README.showcase-5.js', line: 1, check: 'lint' },
        { severity: 'warning', message: 'Long line', path: 'README.showcase-5.js', check: 'lint' },
      ],
      'README.md#6': [
        {
          severity: 'error',
          message: 'Showcase adapter "checked" returned an invalid build result: an issue names the check "lint", which "checks" doesn\'t list',
          path: 'README.showcase-6.js',
        },
      ],
    });
  });

  it("Removes its temporary folder, in the project's own OS temp folder", async () => {
    // The build runs in an OS temp folder of its own: the project's is shared with the other test files, which may be building at the same moment.
    expect(tmpdir()).toBe(join(SCRATCH_ROOT, 'tmp-integration'));
    const scratch = await createScratchFolder('tmp-');
    const saved = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP };
    Object.assign(process.env, { TMPDIR: scratch.path, TMP: scratch.path, TEMP: scratch.path });
    try {
      expect(tmpdir()).toBe(scratch.path);
      await _build('showcase-frames');
      expect(await readdir(scratch.path)).toEqual([]);
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      await scratch.remove();
    }
  });

  describe('Recorded showcases', () => {
    // Builds the `showcase-recorded` fixture, whose custom showcase adapter `node-run` records .mjs showcases with Node.js in the host copy (PLAN-P20
    // D770): passing ones in README.md (the environment and the host copy, closed standard input, a linked showcase, a child outliving its parent, the
    // output caps), failing ones in errors/failing.md (standard error, an exit code, an uncaught exception, the time limit). Built once, with
    // a secret in showroom's own environment that never reaches a recording.

    let built: BuildShowcasesResult;
    const recording = (id: string): ShowcaseRecording => built.recordings.get(id)!;
    const texts = (id: string) => recording(id).lines.map((line) => line.text);

    beforeAll(async () => {
      process.env.SHOWROOM_TEST_SECRET = 'secret';
      try {
        built = await _build('showcase-recorded');
      } finally {
        delete process.env.SHOWROOM_TEST_SECRET;
      }
    });

    it('Records each showcase in the host copy, with its cleaned environment, its paths made relative', () => {
      expect(built.issues).toEqual([]);
      expect(built.frames.size).toBe(0);
      expect(texts('README.md#1')).toEqual([
        'hello',
        'cwd .',
        'tmp <run>/tmp',
        'data <run>/data',
        'own own',
        'secret none',
        'home set',
        'ignored false',
        'virtual true',
      ]);
      expect(recording('README.md#1')).toMatchObject({ dropped: 0, exitCode: 0 });
      expect(built.checks.get('README.md#1')).toEqual(['syntax', 'runtime']);
      expect(built.shownIssues.get('README.md#1')).toEqual([]);
      expect(texts('README.md#2')).toEqual(['stdin closed']);
      expect(texts('README.md#3')).toEqual(['linked scripts/linked.mjs']);
      expect(built.watched).toEqual(expect.arrayContaining(['README.md', 'adapters/node-run.js', 'errors/failing.md', 'scripts/linked.mjs']));
    });

    it('Kills a child outliving its showcase', async () => {
      const pid = Number(texts('README.md#4')[0].replace('child ', ''));
      expect(pid).toBeGreaterThan(0);
      expect(() => process.kill(pid, 0)).toThrow();
    });

    it('Keeps the newest lines, cutting a long one, and leaves out what passes the output cap', () => {
      expect(recording('README.md#5')).toMatchObject({ dropped: 173, exitCode: 0 });
      expect(texts('README.md#5')[0]).toBe('line 174');
      expect(texts('README.md#5').at(-1)).toBe(`${'x'.repeat(10000)}… (10000 more characters)`);
      expect(texts('README.md#5')).toHaveLength(128);
      expect(recording('README.md#6')).toMatchObject({
        cut: true,
        exitCode: 0,
        lines: [{ level: 'log', text: expect.stringMatching(/^y{10000}… \(\d+ more characters\)$/) }],
      });
    });

    it('Fails a recording with a runtime error: standard error, an exit code, an uncaught exception, the time limit', () => {
      const runtime = (id: string) =>
        built.shownIssues
          .get(id)!
          .filter((issue) => issue.check === 'runtime')
          .map((issue) => issue.message);
      expect(recording('errors/failing.md#1').lines).toEqual([
        { level: 'log', text: 'before' },
        { level: 'error', text: 'oops' },
      ]);
      expect(runtime('errors/failing.md#1')).toEqual(['The recording failed: it wrote 1 line to standard error: "oops"']);
      expect(runtime('errors/failing.md#2')).toEqual(['The recording failed: it exited with code 3']);
      expect(recording('errors/failing.md#3').exitCode).toBe(1);
      // The stack trace names the showcase by its root-relative path, never the host copy's
      expect(texts('errors/failing.md#3').some((text) => text.includes('errors/failing.showcase-3.mjs:1'))).toBe(true);
      expect(texts('errors/failing.md#3').some((text) => text.includes('/copy/') || text.includes(SCRATCH_ROOT))).toBe(false);
      expect(recording('errors/failing.md#4')).toMatchObject({ timedOut: true, timeLimit: 2000, lines: [{ level: 'log', text: 'waiting' }] });
      expect(runtime('errors/failing.md#4')).toEqual(['The recording failed: it stopped after the 2 s time limit']);
      expect(built.errors.get('errors/failing.md#4')).toEqual([expect.objectContaining({ severity: 'error', path: 'errors/failing.md', check: 'runtime' })]);
      for (const id of ['errors/failing.md#1', 'errors/failing.md#4']) expect(built.checks.get(id)).toEqual(['syntax', 'runtime']);
      // A build step's failure: an error of the build itself, with no recording
      expect(built.recordings.has('errors/failing.md#5')).toBe(false);
      expect(built.checks.get('errors/failing.md#5')).toEqual([]);
      expect(built.shownIssues.get('errors/failing.md#5')).toEqual([
        { severity: 'error', message: expect.stringContaining('SyntaxError'), path: 'errors/failing.showcase-5.mjs' },
      ]);
    });

    it('Removes its own run session, and keeps a given one across runs', async () => {
      // A build without a session made one of its own, in the user's cache folder (here the project's), and removed it
      expect(await readdir(getCacheFolder()).catch(() => [])).toEqual([]);
      const root = join(FIXTURES, 'showcase-recorded');
      const { host } = await check(root, { trust: true });
      const { configuration } = await readConfiguration(root);
      const session = createRunSession();
      try {
        const first = await buildShowcases({
          root,
          host: { ...host!, showcases: host!.showcases.slice(0, 1) },
          configuration: configuration!,
          trust: true,
          session,
        });
        expect(first.recordings.size).toBe(1);
        const folder = await session.getFolder();
        expect(await readdir(join(folder, 'copy'))).toEqual(expect.arrayContaining(['README.md', 'README.showcase-1.mjs', 'adapters', 'scripts']));
        expect(await readdir(join(folder, 'copy'))).not.toContain('ignored');
        const second = await buildShowcases({
          root,
          host: { ...host!, showcases: host!.showcases.slice(0, 1) },
          configuration: configuration!,
          trust: true,
          session,
        });
        expect(second.recordings.size).toBe(1);
        expect(await session.getFolder()).toBe(folder);
        expect(await readdir(join(folder, 'showcases'))).toHaveLength(1);
      } finally {
        await session.dispose();
      }
      expect(await readdir(getCacheFolder())).toEqual([]);
    });
  });
});
