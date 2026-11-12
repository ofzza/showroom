/**
 * Tests of the TypeScript stack adapter
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { TypeScriptStackAdapter } from './index.js';

/**
 * Gets the path of a fixture host repository
 * @param name Name of the fixture
 * @returns Path of the fixture's root
 */
function _fixture(name: string): string {
  return fileURLToPath(new URL(`../../../../test/fixtures/${name}`, import.meta.url));
}

describe('adapters/stack/typescript', () => {
  // Tests the TypeScript stack adapter's defaults, and reading project information from the `package.json` of the fixture host repositories in
  // `test/fixtures/`.

  describe('Defaults', () => {
    // The defaults README.md documents.

    it('Is named typescript, with src as its source root', () => {
      const adapter = new TypeScriptStackAdapter();
      expect(adapter.name).toBe('typescript');
      expect(adapter.sourceRoot).toBe('src');
    });

    it('Ignores dependencies, build output and coverage', () => {
      // The fixtures have no node_modules (it can't be committed), so this list is what guards it. See PLAN.md › P1 › D32.
      expect(new TypeScriptStackAdapter().ignore).toEqual(['.git', 'node_modules', 'dist', 'coverage']);
    });

    it('Treats TypeScript and JavaScript files as code', () => {
      expect(new TypeScriptStackAdapter().code).toEqual(['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.mjs', '*.cjs']);
    });

    it('Adds no documentation patterns', () => {
      expect(new TypeScriptStackAdapter().documentation).toEqual([]);
    });
  });

  describe('readProject()', () => {
    // Reading package.json, in its accepted forms and its failures.

    it('Reads every project information field', async () => {
      expect(await new TypeScriptStackAdapter().readProject(_fixture('minimal'))).toEqual({
        name: 'minimal-host',
        version: '1.2.3',
        description: 'A minimal host',
        license: 'MIT',
        author: 'Jane Doe',
        homepage: 'https://example.com/minimal-host',
        repository: 'https://example.com/minimal-host.git',
      });
    });

    it('Reads a project with only a name', async () => {
      expect(await new TypeScriptStackAdapter().readProject(_fixture('names'))).toEqual({ name: 'names-host' });
    });

    it('Fails when package.json is missing', async () => {
      await expect(new TypeScriptStackAdapter().readProject(_fixture('no-project'))).rejects.toThrow(/^package\.json not found in /);
    });

    it('Fails when package.json is not valid JSON', async () => {
      await expect(new TypeScriptStackAdapter().readProject(_fixture('project-errors/invalid-json'))).rejects.toThrow(/^package\.json is not valid JSON: /);
    });

    it('Fails when package.json is not an object', async () => {
      await expect(new TypeScriptStackAdapter().readProject(_fixture('project-errors/not-object'))).rejects.toThrow('package.json must contain a JSON object');
    });

    it('Fails when package.json has no name', async () => {
      await expect(new TypeScriptStackAdapter().readProject(_fixture('project-errors/no-name'))).rejects.toThrow('package.json has no "name"');
    });
  });
});
