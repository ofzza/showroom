/**
 * TypeScript stack adapter: covers plain TypeScript and JavaScript host repositories, React libraries included, reading their `package.json`
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectInformation } from '../../../host/index.js';
import type { StackAdapter } from '../index.js';

/**
 * Represents the TypeScript stack adapter
 */
export class TypeScriptStackAdapter implements StackAdapter {
  public readonly name = 'typescript';
  public readonly sourceRoot = 'src';
  public readonly ignore: readonly string[] = ['.git', 'node_modules', 'dist', 'coverage'];
  public readonly code: readonly string[] = ['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.mjs', '*.cjs'];
  public readonly documentation: readonly string[] = [];

  /**
   * Reads the project information from the host repository's `package.json`
   * @param root Path of the host repository's root
   * @returns Project information; throws an error explaining why it can't be read
   */
  public async readProject(root: string): Promise<ProjectInformation> {
    // Read and parse package.json
    let text: string;
    try {
      text = await readFile(join(root, 'package.json'), 'utf8');
    } catch (err) {
      throw new Error(`package.json not found in ${root}`, { cause: err });
    }
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new Error(`package.json is not valid JSON: ${(err as Error).message}`, { cause: err });
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      throw new Error('package.json must contain a JSON object');
    }
    if (typeof json.name !== 'string' || !json.name) {
      throw new Error('package.json has no "name"');
    }
    // Collect the project information
    const project: ProjectInformation = { name: json.name };
    for (const key of ['version', 'description', 'license', 'homepage'] as const) {
      if (typeof json[key] === 'string') project[key] = json[key];
    }
    const author = _nameOrField(json.author, 'name');
    if (author) project.author = author;
    const repository = _nameOrField(json.repository, 'url');
    if (repository) project.repository = repository;
    return project;
  }
}

/**
 * Gets a `package.json` value that is either a string, or an object holding the string in a field (e.g. `author`, `repository`)
 * @param value Value from `package.json`
 * @param field Field of the object form holding the string
 * @returns The string, or undefined if there is none
 */
function _nameOrField(value: unknown, field: string): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (typeof value === 'object' && value !== null) {
    const inner = (value as Record<string, unknown>)[field];
    if (typeof inner === 'string') return inner || undefined;
  }
  return undefined;
}
