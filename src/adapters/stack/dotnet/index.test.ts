/**
 * Tests of the .NET stack adapter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScratchFolder, type ScratchFolder } from '../../../testing/index.js';
import { DotNetStackAdapter } from './index.js';

/**
 * Path of the dotnet fixture host repository
 */
const _FIXTURE = fileURLToPath(new URL('../../../../test/fixtures/dotnet', import.meta.url));

describe('adapters/stack/dotnet', () => {
  // Tests the .NET stack adapter's defaults, and reading project information from MSBuild files: on the dotnet fixture in `test/fixtures/`, and
  // on small MSBuild files written into scratch folders, one case each.

  describe('Defaults', () => {
    // The defaults README.md documents.

    it('Is named dotnet, with src as its source root', () => {
      const adapter = new DotNetStackAdapter();
      expect(adapter.name).toBe('dotnet');
      expect(adapter.sourceRoot).toBe('src');
    });

    it('Ignores build output, test results and IDE folders', () => {
      expect(new DotNetStackAdapter().ignore).toEqual(['.git', '.vs', 'bin', 'obj', 'artifacts', 'TestResults']);
    });

    it('Treats C#, F#, VB and Razor files as code', () => {
      expect(new DotNetStackAdapter().code).toEqual(['*.cs', '*.csx', '*.fs', '*.fsi', '*.fsx', '*.vb', '*.razor', '*.cshtml']);
    });

    it('Adds no documentation patterns', () => {
      expect(new DotNetStackAdapter().documentation).toEqual([]);
    });
  });

  describe('readProject() on the fixture', () => {
    // The fixture's Directory.Build.props sets shared properties, some conditioned, and its Numbers.csproj (with a byte order mark) overrides
    // some, references others, and has a conditioned group and a property function.

    it('Reads every project information field', async () => {
      expect(await new DotNetStackAdapter().readProject(_FIXTURE, 'src/Numbers/Numbers.csproj')).toEqual({
        name: 'Numbers.Core',
        version: '2.1.0-beta.1',
        description: 'Numbers & figures, formatted',
        license: 'MIT',
        author: 'Jane Doe',
        homepage: 'https://example.com/numbers/wiki',
        repository: 'https://example.com/numbers',
      });
    });

    it("Reads another project of the solution, sharing the Directory.Build.props's properties", async () => {
      expect(await new DotNetStackAdapter().readProject(_FIXTURE, 'src/Numbers.FSharp/Numbers.FSharp.fsproj')).toEqual({
        name: 'Numbers.FSharp',
        version: '2.1.0-beta.1',
        description: 'Overridden by the project',
        author: 'Jane Doe',
        repository: 'https://example.com/numbers',
      });
    });
  });

  describe('readProject() on scratch folders', () => {
    // Each case writes its MSBuild files into a scratch folder of its own, removed afterwards.

    let scratch: ScratchFolder;
    beforeEach(async () => {
      scratch = await createScratchFolder('dotnet-');
    });
    afterEach(async () => {
      await scratch.remove();
    });

    /**
     * Writes files into the scratch folder
     * @param files Contents by path, relative to the scratch folder
     */
    async function write(files: Record<string, string>): Promise<void> {
      for (const [path, content] of Object.entries(files)) {
        await mkdir(dirname(join(scratch.path, path)), { recursive: true });
        await writeFile(join(scratch.path, path), content);
      }
    }

    /**
     * Wraps properties into a project file's unconditional property group
     * @param properties Properties' XML
     * @returns The project file's XML
     */
    function project(properties: string): string {
      return `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>${properties}</PropertyGroup></Project>`;
    }

    it('Fails without a project', async () => {
      await expect(new DotNetStackAdapter().readProject(scratch.path)).rejects.toThrow(
        'The dotnet stack adapter needs "project" in showroom.json: the path of a .csproj, .fsproj or .vbproj',
      );
    });

    it('Fails on a file that is not a project file', async () => {
      await expect(new DotNetStackAdapter().readProject(scratch.path, 'Numbers.slnx')).rejects.toThrow(
        '"project" must be the path of a .csproj, .fsproj or .vbproj, not Numbers.slnx',
      );
    });

    it('Accepts a project file extension in any case', async () => {
      await write({ 'App.VBPROJ': project('') });
      expect(await new DotNetStackAdapter().readProject(scratch.path, 'App.VBPROJ')).toEqual({ name: 'App' });
    });

    it('Fails when the project file is missing', async () => {
      await expect(new DotNetStackAdapter().readProject(scratch.path, 'src/App.csproj')).rejects.toThrow(/^src\/App\.csproj not found in /);
    });

    it('Fails when the project file is not well-formed XML, with its position', async () => {
      await write({ 'App.csproj': '<Project>\n  <PropertyGroup>\n</Project>' });
      await expect(new DotNetStackAdapter().readProject(scratch.path, 'App.csproj')).rejects.toThrow(
        /^App\.csproj is not a valid MSBuild file: .*Line: 2, Column: \d+/,
      );
    });

    it('Fails when the Directory.Build.props is not well-formed XML', async () => {
      await write({ 'Directory.Build.props': '<Project>', 'src/App/App.csproj': project('') });
      await expect(new DotNetStackAdapter().readProject(scratch.path, 'src/App/App.csproj')).rejects.toThrow(
        'Directory.Build.props is not a valid MSBuild file: unclosed element <Project>',
      );
    });

    it('Fails when the project file is empty', async () => {
      await write({ 'App.csproj': '' });
      await expect(new DotNetStackAdapter().readProject(scratch.path, 'App.csproj')).rejects.toThrow(
        'App.csproj is not a valid MSBuild file: no <Project> root element',
      );
    });

    it('Fails when the root element is not <Project>', async () => {
      await write({ 'App.csproj': '<Solution />' });
      await expect(new DotNetStackAdapter().readProject(scratch.path, 'App.csproj')).rejects.toThrow(
        /^App\.csproj is not a valid MSBuild file: its root element is <Solution>, not <Project>/,
      );
    });

    it('Reads the nearest Directory.Build.props only', async () => {
      // MSBuild imports the first one it finds walking up; that one imports its parents only explicitly, which isn't followed
      await write({
        'Directory.Build.props': project('<Authors>Root</Authors><Description>Root</Description>'),
        'src/Directory.Build.props': project('<Authors>Nearest</Authors>'),
        'src/App/App.csproj': project(''),
      });
      expect(await new DotNetStackAdapter().readProject(scratch.path, 'src/App/App.csproj')).toEqual({ name: 'App', author: 'Nearest' });
    });

    it('Never reads a Directory.Build.props above the root', async () => {
      await write({ 'Directory.Build.props': project('<Authors>Above</Authors>'), 'host/App.csproj': project('') });
      expect(await new DotNetStackAdapter().readProject(join(scratch.path, 'host'), 'App.csproj')).toEqual({ name: 'App' });
    });

    it('Takes the name from PackageId, else AssemblyName, else the file name', async () => {
      await write({
        'A.csproj': project('<AssemblyName>Assembly</AssemblyName><PackageId>Package</PackageId>'),
        'B.csproj': project('<AssemblyName>Assembly</AssemblyName>'),
      });
      const adapter = new DotNetStackAdapter();
      expect((await adapter.readProject(scratch.path, 'A.csproj')).name).toBe('Package');
      expect((await adapter.readProject(scratch.path, 'B.csproj')).name).toBe('Assembly');
    });

    it('Takes the version from Version over VersionPrefix, and VersionPrefix alone without a suffix', async () => {
      await write({
        'A.csproj': project('<VersionPrefix>1.0.0</VersionPrefix><VersionSuffix>rc.1</VersionSuffix><Version>2.0.0</Version>'),
        'B.csproj': project('<VersionPrefix>1.0.0</VersionPrefix>'),
      });
      const adapter = new DotNetStackAdapter();
      expect((await adapter.readProject(scratch.path, 'A.csproj')).version).toBe('2.0.0');
      expect((await adapter.readProject(scratch.path, 'B.csproj')).version).toBe('1.0.0');
    });

    it('Drops a value with an unresolved reference or a property function', async () => {
      await write({ 'App.csproj': project('<Description>$(Unknown) text</Description><Authors>$([System.Environment]::UserName)</Authors>') });
      expect(await new DotNetStackAdapter().readProject(scratch.path, 'App.csproj')).toEqual({ name: 'App' });
    });

    it('Unsets a property set to an empty value', async () => {
      await write({ 'Directory.Build.props': project('<Authors>Shared</Authors>'), 'App.csproj': project('<Authors></Authors>') });
      expect(await new DotNetStackAdapter().readProject(scratch.path, 'App.csproj')).toEqual({ name: 'App' });
    });

    it('Resolves references in the order the properties are set', async () => {
      // MSBuild expands a reference when its property is set: a later change to the referenced property doesn't reach it
      await write({ 'App.csproj': project('<Base>one</Base><Description>$(Base)</Description><Base>two</Base><Authors>$(Base)</Authors>') });
      expect(await new DotNetStackAdapter().readProject(scratch.path, 'App.csproj')).toEqual({ name: 'App', description: 'one', author: 'two' });
    });

    it('Never overwrites the reserved MSBuildProjectName', async () => {
      await write({ 'App.csproj': project('<MSBuildProjectName>Other</MSBuildProjectName><PackageId>$(MSBuildProjectName)</PackageId>') });
      expect((await new DotNetStackAdapter().readProject(scratch.path, 'App.csproj')).name).toBe('App');
    });

    it('Skips properties nested deeper than a property group, and outside one', async () => {
      await write({
        'App.csproj':
          '<Project><Authors>Outside</Authors><Target Name="T"><PropertyGroup><Description>In a target</Description></PropertyGroup></Target></Project>',
      });
      expect(await new DotNetStackAdapter().readProject(scratch.path, 'App.csproj')).toEqual({ name: 'App' });
    });

    it('Reads a project file with the MSBuild 2003 namespace', async () => {
      await write({
        'App.csproj':
          '<?xml version="1.0" encoding="utf-8"?>\n<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><PropertyGroup><Authors>Old</Authors></PropertyGroup></Project>',
      });
      expect(await new DotNetStackAdapter().readProject(scratch.path, 'App.csproj')).toEqual({ name: 'App', author: 'Old' });
    });
  });
});
