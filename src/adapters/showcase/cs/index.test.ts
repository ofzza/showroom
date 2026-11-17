/**
 * Tests of the cs showcase adapter, without running dotnet
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Showcase, VirtualFile } from '../../../host/index.js';
import { createScratchFolder, type ScratchFolder } from '../../../testing/index.js';
import { checkRecordedDeclarations } from '../registry/index.js';
import type { ShowcaseRun } from '../index.js';
import {
  CS_DOTNET_ENVIRONMENT,
  CsShowcaseAdapter,
  escapeMsBuild,
  getCsBuildIssues,
  getDefaultItemExcludes,
  getHostSdkPaths,
  getProjectDirectives,
  judgeSdks,
  parseDiagnostics,
  parseSdkList,
  readGlobalJson,
  resolveProjectDirective,
} from './index.js';

/**
 * Path of the fixture host repository with cs showcases that pass
 */
const _ROOT = fileURLToPath(new URL('../../../../test/fixtures/showcase-cs', import.meta.url));

/**
 * Creates a showcase for the cs showcase adapter
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
    adapter: 'cs',
    entry,
    include: [],
    tabs: [{ kind: 'source' }],
    views: ['source', 'console'],
    ...extra,
  };
}

/**
 * Creates a run of `dotnet` as the host check's runner returns it
 * @param stdout Its standard output
 * @param exitCode Its exit code
 * @returns The run
 */
function _run(stdout: string, exitCode = 0): ShowcaseRun {
  return { recording: { lines: [], dropped: 0, exitCode }, stdout, stderr: '' };
}

describe('adapters/showcase/cs', () => {
  // Tests the cs showcase adapter's declarations, validation, host check (with an injected runner, and global.json files in scratch folders) and the
  // helpers of its build: the MSBuild settings, the #:project directives (on the showcase-cs fixture), and the diagnostics' reading; its builds are
  // integration tests

  it('Declares recorded showcases, built in the host copy, shown as source and console', () => {
    const adapter = new CsShowcaseAdapter();
    expect(adapter.recorded).toBe(true);
    expect(adapter.defaultViews).toEqual(['source', 'console']);
    expect(adapter.hostCopy).toEqual({ exclude: ['bin/', 'obj/', 'node_modules/', '.vs/'], git: false });
    expect(checkRecordedDeclarations(adapter as unknown as Record<string, unknown>)).toBeUndefined();
  });

  it('Keeps every build server, node and compiler server off, through the environment', () => {
    // See PLAN-P20 D778: any MSBuild switch on the command line makes dotnet read the .cs file as a project
    expect(CS_DOTNET_ENVIRONMENT).toEqual({
      MSBUILDDISABLENODEREUSE: '1',
      DOTNET_CLI_USE_MSBUILD_SERVER: '0',
      UseSharedCompilation: 'false',
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      DOTNET_NOLOGO: '1',
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    });
  });

  describe('Validation', () => {
    // Validates showcases built by hand: a .cs entry point, and no options

    it('Accepts a cs code block and a linked .cs file', () => {
      const adapter = new CsShowcaseAdapter();
      expect(adapter.validate(_showcase('code-block', 'README.showcase-1.cs'))).toEqual({ errors: [] });
      expect(adapter.validate(_showcase('link', 'docs/linked.cs'))).toEqual({ errors: [] });
    });

    it('Rejects other entry points, and options', () => {
      const adapter = new CsShowcaseAdapter();
      expect(adapter.validate(_showcase('code-block', 'README.showcase-1.ts')).errors).toEqual([
        'The cs showcase adapter needs a "cs", "csharp" or "c#" code block',
      ]);
      expect(adapter.validate(_showcase('link', 'docs/linked.fs')).errors).toEqual([
        'The cs showcase adapter needs a link to a .cs file, not "docs/linked.fs"',
      ]);
      expect(adapter.validate(_showcase('link', 'docs/linked.cs', { options: {} })).errors).toEqual(['The cs showcase adapter takes no options']);
    });
  });

  describe('Build helpers', () => {
    // Tests the helpers on hand-written values, and the #:project directives on the showcase-cs fixture

    it('Escapes paths for MSBuild, and excludes every .cs virtual file by its path in the host copy', () => {
      // See PLAN-P20 D790 C8: MSBuild resolves excludes from each project's folder, so they are absolute; the spike's glob missed named files
      expect(escapeMsBuild("a%b;c*d?e$f@g'h")).toBe('a%25b%3Bc%2Ad%3Fe%24f%40g%27h');
      const virtualFiles = [
        { path: 'README.showcase-1.cs' },
        { path: 'docs/hello.cs' },
        { path: 'README.showcase-2.html' },
        { path: 'src/A;B/README.showcase-1.CS' },
      ] as VirtualFile[];
      expect(getDefaultItemExcludes('/copy', virtualFiles)).toBe(
        [join('/copy', 'README.showcase-1.cs'), join('/copy', 'docs/hello.cs'), join('/copy', 'src/A%3BB/README.showcase-1.CS')].join(';'),
      );
      expect(getDefaultItemExcludes('/copy', [])).toBe('');
    });

    it('Reads the #:project directives, and resolves each to its project file', async () => {
      expect(getProjectDirectives('#:project src/Numbers\n#:package Foo@1.0\n  #:project "../Other Folder/Other.csproj"\nConsole.WriteLine();')).toEqual([
        'src/Numbers',
        '../Other Folder/Other.csproj',
      ]);
      expect(await resolveProjectDirective(_ROOT, '', 'src/Numbers/Numbers.csproj')).toBe('src/Numbers/Numbers.csproj');
      expect(await resolveProjectDirective(_ROOT, 'docs', '../src/Numbers')).toBe('src/Numbers/Numbers.csproj');
      expect(await resolveProjectDirective(_ROOT, 'src/Numbers', '.')).toBe('src/Numbers/Numbers.csproj');
      expect(await resolveProjectDirective(_ROOT, 'docs', '..\\src\\Numbers')).toBe('src/Numbers/Numbers.csproj');
      expect(await resolveProjectDirective(_ROOT, '', '../elsewhere')).toBeUndefined();
      expect(await resolveProjectDirective(_ROOT, '', 'src/Missing')).toBeUndefined();
      expect(await resolveProjectDirective(_ROOT, '', 'docs')).toBeUndefined();
    });

    it("Reads dotnet build's diagnostics, without duplicates, with paths only inside the host copy", () => {
      // Each diagnostic is printed twice; paths into the host copy are already root-relative (run() replaces them), others aren't the host's
      const output = [
        "README.showcase-1.cs(2,9): error CS0029: Cannot implicitly convert type 'string' to 'int' [README.showcase-1.csproj]",
        '  Determining projects to restore...',
        "README.showcase-1.cs(2,9): error CS0029: Cannot implicitly convert type 'string' to 'int' [README.showcase-1.csproj]",
        "src/Broken/Broken.cs(9,13): warning CS0219: The variable 'unused' is assigned but its value is never used [src/Broken/Broken.csproj]",
        '<run>/showcases/x/obj/A.cs(1,1): error CS1000: Somewhere else',
        'src/App.csproj : error NU1101: Unable to find package Nope',
        'MSBUILD : error MSB1009: Project file does not exist.',
        'Build FAILED.',
      ].join('\n');
      expect(parseDiagnostics(output)).toEqual([
        { severity: 'error', code: 'CS0029', message: "Cannot implicitly convert type 'string' to 'int'", path: 'README.showcase-1.cs', line: 2 },
        {
          severity: 'warning',
          code: 'CS0219',
          message: "The variable 'unused' is assigned but its value is never used",
          path: 'src/Broken/Broken.cs',
          line: 9,
        },
        { severity: 'error', code: 'CS1000', message: 'Somewhere else' },
        { severity: 'error', code: 'NU1101', message: 'Unable to find package Nope', path: 'src/App.csproj' },
        { severity: 'error', code: 'MSB1009', message: 'Project file does not exist.' },
      ]);
    });

    it("Gives every error as an issue, and only the showcase's own warnings", () => {
      // See PLAN-P20 D801: a host project's warnings would repeat on every showcase referencing it
      const issues = getCsBuildIssues(
        [
          { severity: 'error', code: 'CS0029', message: 'host error', path: 'src/Broken/Broken.cs', line: 10 },
          { severity: 'warning', code: 'CS0219', message: 'host warning', path: 'src/Broken/Broken.cs', line: 9 },
          { severity: 'warning', code: 'CS0219', message: 'own warning', path: 'hello.cs', line: 1 },
          { severity: 'error', code: 'NU1101', message: 'no path' },
        ],
        'hello.cs',
      );
      expect(issues).toEqual([
        { severity: 'error', message: 'CS0029: host error', path: 'src/Broken/Broken.cs', line: 10 },
        { severity: 'warning', message: 'CS0219: own warning', path: 'hello.cs', line: 1 },
        { severity: 'error', message: 'NU1101: no path' },
      ]);
    });
  });

  describe('Host check', () => {
    // Runs the host check with an injected runner standing for dotnet, and global.json files written into a scratch folder standing for the root

    let scratch: ScratchFolder;
    beforeEach(async () => {
      scratch = await createScratchFolder('cs-check-');
    });
    afterEach(async () => {
      await scratch.remove();
    });

    it("Reads dotnet --list-sdks' versions", () => {
      expect(parseSdkList('8.0.132 [/usr/lib/dotnet/sdk]\n10.0.100-rc.1.25451.107 [C:\\Program Files\\dotnet\\sdk]\n\nnoise\n')).toEqual([
        '8.0.132',
        '10.0.100-rc.1.25451.107',
      ]);
    });

    it('Judges the SDKs: none of 10 or later, or global.json pinning one below 10 that latestMajor alone rolls past', () => {
      // See PLAN-P20 D800
      expect(judgeSdks(['8.0.132', '10.0.115'], undefined)).toEqual([]);
      expect(judgeSdks(['8.0.132', '9.0.122'], undefined)).toEqual(['The cs showcase adapter needs the .NET SDK 10 or later (found 8.0.132, 9.0.122)']);
      expect(judgeSdks([], undefined)).toEqual(['The cs showcase adapter needs the .NET SDK 10 or later (found none)']);
      expect(judgeSdks(['8.0.132', '10.0.115'], { version: '8.0.100' })).toEqual([
        'The cs showcase adapter needs the .NET SDK 10 or later, but global.json pins 8.0.100 (rollForward latestPatch)',
      ]);
      expect(judgeSdks(['10.0.115'], { version: '8.0.100', rollForward: 'latestMinor' })[0]).toContain('(rollForward latestMinor)');
      expect(judgeSdks(['10.0.115'], { version: '8.0.100', rollForward: 'latestMajor' })).toEqual([]);
      expect(judgeSdks(['10.0.115'], { version: '10.0.100' })).toEqual([]);
    });

    it('Reads global.json statically: none, its sdk settings with comments, or an error', async () => {
      expect(readGlobalJson(scratch.path)).toBeUndefined();
      await writeFile(
        join(scratch.path, 'global.json'),
        '\uFEFF{ // pinned\n "sdk": { "version": "10.0.100", /* "x" */ "rollForward": "latestFeature", "paths": [".dotnet", 3] }, "url": "http://x" }',
      );
      expect(readGlobalJson(scratch.path)).toEqual({ version: '10.0.100', rollForward: 'latestFeature', paths: ['.dotnet'] });
      await writeFile(join(scratch.path, 'global.json'), '{ "msbuild-sdks": {} }');
      expect(readGlobalJson(scratch.path)).toEqual({});
      await writeFile(join(scratch.path, 'global.json'), '{ "sdk": ');
      expect(readGlobalJson(scratch.path)).toEqual({ error: expect.stringMatching(/^global\.json can't be read: /) });
      await writeFile(join(scratch.path, 'global.json'), `{ "x": "${'a'.repeat(70 * 1024)}" }`);
      expect(readGlobalJson(scratch.path)).toEqual({ error: 'global.json is larger than 64 kB' });
    });

    it('Finds the SDK folders global.json names inside the host repository', () => {
      expect(getHostSdkPaths('/repo', ['.dotnet', '$host$', '/opt/dotnet', '../sdk', '/repo/tools/sdk'])).toEqual([
        join('/repo', '.dotnet'),
        join('/repo', 'tools/sdk'),
      ]);
    });

    it('Lists the SDKs with dotnet, never in the host repository, and judges them', async () => {
      const calls: (readonly string[])[] = [];
      const adapter = new CsShowcaseAdapter(async (args) => {
        calls.push(args);
        return _run('9.0.122 [/usr/lib/dotnet/sdk]\n10.0.115 [/usr/lib/dotnet/sdk]\n');
      });
      expect(await adapter.check(scratch.path)).toEqual({ errors: [], warnings: [] });
      expect(calls).toEqual([['--list-sdks']]);
    });

    it('Reports a missing dotnet, a failing one, an old SDK, a pin, and SDK folders inside the host repository', async () => {
      const missing = new CsShowcaseAdapter(async () => {
        throw new Error('Command "dotnet" not found on the PATH (outside the host repository and the host copy)');
      });
      expect((await missing.check(scratch.path)).errors).toEqual([
        'The cs showcase adapter needs the .NET SDK 10 or later: Command "dotnet" not found on the PATH (outside the host repository and the host copy)',
      ]);
      expect((await new CsShowcaseAdapter(async () => _run('', 1)).check(scratch.path)).errors).toEqual([
        'The cs showcase adapter couldn\'t list the .NET SDKs ("dotnet --list-sdks": it exited with 1)',
      ]);
      const old = new CsShowcaseAdapter(async () => _run('9.0.122 [/usr/lib/dotnet/sdk]\n'));
      expect((await old.check(scratch.path)).errors).toEqual(['The cs showcase adapter needs the .NET SDK 10 or later (found 9.0.122)']);
      await writeFile(join(scratch.path, 'global.json'), '{ "sdk": { "version": "9.0.100", "paths": [".dotnet", "$host$"] } }');
      const pinned = await new CsShowcaseAdapter(async () => _run('10.0.115 [/usr/lib/dotnet/sdk]\n')).check(scratch.path);
      expect(pinned).toEqual({
        errors: ['The cs showcase adapter needs the .NET SDK 10 or later, but global.json pins 9.0.100 (rollForward latestPatch)'],
        warnings: [`global.json's "sdk.paths" names SDK folders inside the host repository, which its builds may use: ${join(scratch.path, '.dotnet')}`],
      });
    });
  });
});
