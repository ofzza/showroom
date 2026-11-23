/**
 * Tests of resolving a host repository's stack, and its project
 */

import { describe, it, expect } from 'vitest';
import { BUILT_IN_DOCUMENTATION } from '../../../configuration/index.js';
import { DotNetStackAdapter, TypeScriptStackAdapter } from '../index.js';
import { CUSTOM_STACK_NAME, getProjectSettings, getShowcaseProject, mergeProjectInformation, NO_STACK_ADAPTER_DEFAULTS, resolveStack } from './index.js';

describe('adapters/stack/resolve', () => {
  // Tests resolveStack(), mergeProjectInformation(), getProjectSettings() and getShowcaseProject() on hand-written configurations: a built-in
  // stack adapter by its name, another name, `stack` left out, and `project`'s overrides, `null` among them (D877, D881, D885, D886, D892).

  describe('resolveStack()', () => {
    // The stack adapter `stack` names exactly, or none.

    it('Resolves a built-in stack adapter, whose defaults it gives', () => {
      const stack = resolveStack({ stack: 'typescript' });
      expect(stack.name).toBe('typescript');
      expect(stack.adapter).toBeInstanceOf(TypeScriptStackAdapter);
      expect(stack.defaults).toBe(stack.adapter);
      expect(resolveStack({ stack: 'dotnet', project: { path: 'App/App.csproj' } }).adapter).toBeInstanceOf(DotNetStackAdapter);
    });

    it('Resolves no stack adapter for another name, whatever project holds', () => {
      // No error: a stack naming no stack adapter only names the stack (D877)
      expect(resolveStack({ stack: 'java' })).toEqual({ name: 'java', defaults: NO_STACK_ADAPTER_DEFAULTS });
      expect(resolveStack({ stack: 'java', project: { name: 'library' } })).toEqual({ name: 'java', defaults: NO_STACK_ADAPTER_DEFAULTS });
      expect(NO_STACK_ADAPTER_DEFAULTS).toEqual({ sourceRoot: '.', ignore: [], code: [], documentation: [] });
    });

    it('Names the stack custom when stack is left out', () => {
      expect(resolveStack({ project: { name: 'library' } })).toEqual({ name: CUSTOM_STACK_NAME, defaults: NO_STACK_ADAPTER_DEFAULTS });
      expect(CUSTOM_STACK_NAME).toBe('custom');
    });
  });

  describe('mergeProjectInformation()', () => {
    // The project information the stack adapter read, with project's fields over it.

    const read = { name: 'host', version: '1.0.0', license: 'MIT' };

    it('Keeps what the stack adapter read without overrides', () => {
      expect(mergeProjectInformation({ stack: 'typescript' }, read)).toEqual(read);
    });

    it("Replaces the stack adapter's fields, adds new ones, and drops those set to null", () => {
      const merged = mergeProjectInformation({ stack: 'typescript', project: { name: 'renamed', version: null, homepage: 'https://example.com' } }, read);
      expect(merged).toEqual({ name: 'renamed', license: 'MIT', homepage: 'https://example.com' });
    });

    it("Holds only the project information's keys", () => {
      // The host information's project reaches the browser (D892)
      const configuration = { stack: 'typescript', project: { path: 'package.json', sourceRoot: 'lib', ignore: ['x'], author: 'Jane' } };
      expect(mergeProjectInformation(configuration, read)).toEqual({ ...read, author: 'Jane' });
    });

    it('Takes the fields given without a stack adapter, null as left out', () => {
      expect(mergeProjectInformation({ project: { name: 'library', version: null } })).toEqual({ name: 'library' });
    });

    it('Leaves the name out when neither gives one', () => {
      expect(mergeProjectInformation({ stack: 'typescript' }, { version: '1.0.0' })).toEqual({ version: '1.0.0' });
      expect(mergeProjectInformation({ stack: 'typescript', project: { name: null } }, read)).toEqual({ version: '1.0.0', license: 'MIT' });
    });
  });

  describe('getProjectSettings()', () => {
    // The project file, the source root and the pattern lists: project's over the stack's defaults.

    it("Gives the stack adapter's defaults, after the built-in documentation patterns", () => {
      const adapter = new TypeScriptStackAdapter();
      expect(getProjectSettings({ stack: 'typescript' }, resolveStack({ stack: 'typescript' }))).toEqual({
        path: 'package.json',
        sourceRoot: 'src',
        ignore: [...adapter.ignore],
        code: [...adapter.code],
        documentation: [...BUILT_IN_DOCUMENTATION],
      });
    });

    it("Appends project's patterns to the stack adapter's, and drops the stack adapter's for null", () => {
      const configuration = { stack: 'dotnet', project: { path: 'App/App.csproj', ignore: ['vendor/'], code: null, documentation: ['docs/**/*.md'] } };
      const settings = getProjectSettings(configuration, resolveStack(configuration));
      expect(settings.ignore).toEqual([...new DotNetStackAdapter().ignore, 'vendor/']);
      expect(settings.code).toEqual([]);
      expect(settings.documentation).toEqual([...BUILT_IN_DOCUMENTATION, 'docs/**/*.md']);
      // An empty list keeps the stack adapter's patterns (D893)
      expect(getProjectSettings({ stack: 'typescript', project: { code: [] } }, resolveStack({ stack: 'typescript' })).code).toEqual([
        ...new TypeScriptStackAdapter().code,
      ]);
    });

    it('Replaces the source root, the root when null, and normalises the paths', () => {
      const settings = (project: object) => getProjectSettings({ stack: 'typescript', project }, resolveStack({ stack: 'typescript' }));
      expect(settings({ sourceRoot: './lib/' }).sourceRoot).toBe('lib');
      expect(settings({ sourceRoot: null }).sourceRoot).toBe('.');
      expect(settings({ sourceRoot: 'a\\b' }).sourceRoot).toBe('a/b');
      expect(settings({ path: './packages/core/package.json' }).path).toBe('packages/core/package.json');
      // One leading out of the root keeps its .., for check() to refuse
      expect(settings({ sourceRoot: '../elsewhere' }).sourceRoot).toBe('../elsewhere');
    });

    it("Gives the path project gives, or the stack adapter's default, only with a stack adapter", () => {
      // path: null is the same as leaving it out (D893)
      expect(getProjectSettings({ stack: 'typescript', project: { path: null } }, resolveStack({ stack: 'typescript' })).path).toBe('package.json');
      expect(getProjectSettings({ stack: 'dotnet' }, resolveStack({ stack: 'dotnet' })).path).toBeUndefined();
      expect(getProjectSettings({ project: { name: 'library' } }, resolveStack({ project: { name: 'library' } }))).not.toHaveProperty('path');
    });

    it('Gives the root and only the configured patterns without a stack adapter', () => {
      const configuration = { stack: 'java', project: { name: 'library', ignore: ['target/'], code: ['*.java'], sourceRoot: null } };
      expect(getProjectSettings(configuration, resolveStack(configuration))).toEqual({
        sourceRoot: '.',
        ignore: ['target/'],
        code: ['*.java'],
        documentation: [...BUILT_IN_DOCUMENTATION],
      });
    });
  });

  describe('getShowcaseProject()', () => {
    // The merged project information and the settings, as showcase adapters are given them.

    it('Gives the project information and the settings, a new object on each call', () => {
      // A showcase adapter changing what it's given changes nothing else (D876, D882)
      const configuration = { stack: 'java', project: { name: 'library', code: ['*.java'] } };
      const stack = resolveStack(configuration);
      const project = getShowcaseProject(configuration, stack, { name: 'library' });
      expect(project).toEqual({ name: 'library', sourceRoot: '.', ignore: [], code: ['*.java'], documentation: [...BUILT_IN_DOCUMENTATION] });
      project.code.push('*.kt');
      expect(getShowcaseProject(configuration, stack, { name: 'library' }).code).toEqual(['*.java']);
      expect(configuration.project.code).toEqual(['*.java']);
    });
  });
});
