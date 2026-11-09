/**
 * Tests of reading and validating the configuration
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readConfiguration, validateConfiguration } from './index.js';

/**
 * Gets the path of a fixture host repository
 * @param name Name of the fixture
 * @returns Path of the fixture's root
 */
function _fixture(name: string): string {
  return fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url));
}

describe('configuration', () => {
  // Tests reading and validating `tsshowcase.json`: validation directly on parsed values, and reading on the fixture host repositories in
  // `test/fixtures/`.

  describe('validateConfiguration()', () => {
    // Every rule the validation enforces, one at a time.

    it('Accepts a configuration with every key', () => {
      const value = { stack: 'typescript', sourceRoot: 'lib', outDir: 'out', ignore: ['a'], code: ['*.ts'], documentation: ['docs/*.md'] };
      expect(validateConfiguration(value)).toEqual({ configuration: value, errors: [] });
    });

    it('Accepts a configuration with only a stack', () => {
      expect(validateConfiguration({ stack: 'typescript' })).toEqual({ configuration: { stack: 'typescript' }, errors: [] });
    });

    it('Requires a stack', () => {
      expect(validateConfiguration({}).errors).toEqual(['tsshowcase.json: "stack" is required']);
    });

    it('Rejects a value that is not an object', () => {
      for (const value of [null, [], 'typescript', 1]) {
        expect(validateConfiguration(value).errors).toEqual(['tsshowcase.json must contain a JSON object']);
      }
    });

    it('Rejects unknown keys', () => {
      // Catches typos, such as `ignores` for `ignore`
      expect(validateConfiguration({ stack: 'typescript', ignores: [] }).errors).toEqual(['tsshowcase.json: unknown key "ignores"']);
    });

    it('Rejects values of the wrong type', () => {
      expect(validateConfiguration({ stack: '', sourceRoot: 1, outDir: [], ignore: 'x', code: [1], documentation: {} }).errors).toEqual([
        'tsshowcase.json: "stack" must be a non-empty string',
        'tsshowcase.json: "sourceRoot" must be a non-empty string',
        'tsshowcase.json: "outDir" must be a non-empty string',
        'tsshowcase.json: "ignore" must be an array of strings',
        'tsshowcase.json: "code" must be an array of strings',
        'tsshowcase.json: "documentation" must be an array of strings',
      ]);
    });
  });

  describe('readConfiguration()', () => {
    // Reading the file from a fixture host repository's root.

    it('Reads a valid configuration', async () => {
      expect(await readConfiguration(_fixture('minimal'))).toEqual({ configuration: { stack: 'typescript' }, errors: [] });
    });

    it('Fails when the file is missing', async () => {
      const { configuration, errors } = await readConfiguration(_fixture('no-configuration'));
      expect(configuration).toBeUndefined();
      expect(errors).toEqual([expect.stringMatching(/^tsshowcase\.json not found in /)]);
    });

    it('Fails when the file is not valid JSON', async () => {
      const { configuration, errors } = await readConfiguration(_fixture('invalid-configuration'));
      expect(configuration).toBeUndefined();
      expect(errors).toEqual([expect.stringMatching(/^tsshowcase\.json is not valid JSON: /)]);
    });

    it('Fails when the file is not a valid configuration', async () => {
      const { configuration, errors } = await readConfiguration(_fixture('wrong-configuration'));
      expect(configuration).toBeUndefined();
      expect(errors).toHaveLength(4);
    });
  });
});
