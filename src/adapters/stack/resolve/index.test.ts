/**
 * Tests of resolving a host repository's stack
 */

import { describe, it, expect } from 'vitest';
import { DotNetStackAdapter, TypeScriptStackAdapter } from '../index.js';
import { CUSTOM_STACK_NAME, getShowcaseProject, NO_STACK_ADAPTER_DEFAULTS, resolveStack } from './index.js';

describe('adapters/stack/resolve', () => {
  // Tests resolveStack() and getShowcaseProject() on hand-written configurations: a built-in stack adapter by its name, an unknown name, and an
  // object project with and without a stack name (D865, D867, D876).

  it('Resolves a built-in stack adapter, whose defaults it gives', () => {
    const { stack } = resolveStack({ stack: 'typescript' });
    expect(stack?.name).toBe('typescript');
    expect(stack?.adapter).toBeInstanceOf(TypeScriptStackAdapter);
    expect(stack?.defaults).toBe(stack?.adapter);
    expect(resolveStack({ stack: 'dotnet', project: 'App/App.csproj' }).stack?.adapter).toBeInstanceOf(DotNetStackAdapter);
  });

  it('Reports an unknown stack, pointing at the object project', () => {
    expect(resolveStack({ stack: 'java' })).toEqual({
      error:
        'Unknown stack "java"; the stack adapters are: dotnet, typescript. A host repository whose stack has none gives "project" as an object holding its project information',
    });
    // Selecting a stack adapter stays case-sensitive (D874)
    expect(resolveStack({ stack: 'TypeScript' }).error).toMatch(/^Unknown stack "TypeScript"/);
  });

  it('Resolves no stack adapter for an object project, named by the stack', () => {
    expect(resolveStack({ stack: 'java', project: { name: 'library' } })).toEqual({ stack: { name: 'java', defaults: NO_STACK_ADAPTER_DEFAULTS } });
    expect(NO_STACK_ADAPTER_DEFAULTS).toEqual({ sourceRoot: '.', ignore: [], code: [], documentation: [] });
  });

  it('Names the stack custom when an object project has no stack', () => {
    expect(resolveStack({ project: { name: 'library' } }).stack?.name).toBe(CUSTOM_STACK_NAME);
    expect(CUSTOM_STACK_NAME).toBe('custom');
  });

  it('Gives showcase adapters the project as written, an object as a copy', () => {
    // A showcase adapter changing the object it's given changes nothing else (D876)
    const configuration = { project: { name: 'library' } };
    const project = getShowcaseProject(configuration);
    expect(project).toEqual({ name: 'library' });
    expect(project).not.toBe(configuration.project);
    expect(getShowcaseProject({ stack: 'dotnet', project: 'App/App.csproj' })).toBe('App/App.csproj');
    expect(getShowcaseProject({ stack: 'typescript' })).toBeUndefined();
  });
});
