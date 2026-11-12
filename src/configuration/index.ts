/**
 * Configuration: reading and validating a host repository's mandatory `showroom.json` file
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// #region Configuration

/**
 * Name of the configuration file, expected in the host repository's root
 */
export const CONFIGURATION_FILE_NAME = 'showroom.json';

/**
 * Represents a host repository's configuration, as written in its `showroom.json` file
 */
export interface Configuration {
  /**
   * Name of the stack adapter to use (e.g. `typescript`)
   */
  stack: string;
  /**
   * Source root directory, relative to the host repository's root; defaults to the stack adapter's
   */
  sourceRoot?: string;
  /**
   * Output directory of the showroom, relative to the host repository's root; defaults to `./showroom`
   */
  outDir?: string;
  /**
   * `.gitignore`-style patterns of files to ignore, appended to the stack adapter's
   */
  ignore?: string[];
  /**
   * `.gitignore`-style patterns of code files, relative to the source root, appended to the stack adapter's
   */
  code?: string[];
  /**
   * `.gitignore`-style patterns of documentation files, appended to the built-in ones and the stack adapter's
   */
  documentation?: string[];
}

/**
 * Default output directory of the showroom
 */
export const DEFAULT_OUT_DIR = './showroom';

/**
 * Represents the outcome of reading a configuration: either the configuration, or the errors that prevented reading it
 */
export type ConfigurationResult = { configuration: Configuration; errors: [] } | { configuration?: undefined; errors: string[] };

// #endregion

// #region Validation

/**
 * Keys a configuration may hold, each with a check of its value
 */
const _KEYS: Record<keyof Configuration, (value: unknown) => boolean> = {
  stack: (value) => typeof value === 'string' && value.length > 0,
  sourceRoot: (value) => typeof value === 'string' && value.length > 0,
  outDir: (value) => typeof value === 'string' && value.length > 0,
  ignore: _isStringArray,
  code: _isStringArray,
  documentation: _isStringArray,
};

/**
 * Describes the value each configuration key expects, for error messages
 */
const _EXPECTED: Record<keyof Configuration, string> = {
  stack: 'a non-empty string',
  sourceRoot: 'a non-empty string',
  outDir: 'a non-empty string',
  ignore: 'an array of strings',
  code: 'an array of strings',
  documentation: 'an array of strings',
};

/**
 * Checks if a value is an array of strings
 * @param value Value to check
 * @returns True if the value is an array of strings
 */
function _isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Validates a parsed configuration value
 * @param value Parsed content of a configuration file
 * @returns The configuration, or the errors found in it
 */
export function validateConfiguration(value: unknown): ConfigurationResult {
  // Check the value is an object
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { errors: [`${CONFIGURATION_FILE_NAME} must contain a JSON object`] };
  }
  // Check every key
  const errors: string[] = [];
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(key in _KEYS)) {
      errors.push(`${CONFIGURATION_FILE_NAME}: unknown key "${key}"`);
    } else if (!_KEYS[key as keyof Configuration](record[key])) {
      errors.push(`${CONFIGURATION_FILE_NAME}: "${key}" must be ${_EXPECTED[key as keyof Configuration]}`);
    }
  }
  if (!('stack' in record)) {
    errors.push(`${CONFIGURATION_FILE_NAME}: "stack" is required`);
  }
  return errors.length ? { errors } : { configuration: record as unknown as Configuration, errors: [] };
}

/**
 * Reads and validates the configuration file in a host repository's root
 * @param root Path of the host repository's root
 * @returns The configuration, or the errors that prevented reading it
 */
export async function readConfiguration(root: string): Promise<ConfigurationResult> {
  // Read the file
  let text: string;
  try {
    text = await readFile(join(root, CONFIGURATION_FILE_NAME), 'utf8');
  } catch (_err) {
    return { errors: [`${CONFIGURATION_FILE_NAME} not found in ${root}`] };
  }
  // Parse and validate it
  try {
    return validateConfiguration(JSON.parse(text));
  } catch (err) {
    return { errors: [`${CONFIGURATION_FILE_NAME} is not valid JSON: ${(err as Error).message}`] };
  }
}

// #endregion
