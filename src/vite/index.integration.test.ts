/**
 * Integration tests of the shared Mermaid bundle the showroom's Vite configuration hands out: the bundle the global setup built (see
 * buildTestMermaid()), and its build's own output
 */

import { describe, expect, inject, it } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Rolldown } from 'vite';
import {
  ELKJS_STUB_PATH,
  getMermaidBuildConfiguration,
  getMermaidBuildHash,
  isMermaidBuilt,
  MERMAID_NOTICES_FILE,
  MERMAID_STAMP_FILE,
} from '../../build/mermaid/index.js';
import { ELKJS_STUB_MARKER } from '../../build/mermaid/elkjs-stub.js';
import { MERMAID_ENTRY_FILE } from '../showcases/index.js';
import { buildTestMermaid, createScratchFolder } from '../testing/index.js';
import { listMermaidFiles } from './index.js';

/**
 * Most bytes the bundle may take on disk: about 3.8 MB when built (D853 in .workflow/PLAN-P21-jsonschema.md)
 */
const _MAX_BUNDLE_SIZE = 5 * 1024 * 1024;

/**
 * Reads every file of the bundle
 * @param mermaidDir Folder of the bundle
 * @returns The files' contents, by path relative to the folder
 */
async function _readBundle(mermaidDir: string): Promise<Map<string, string>> {
  const files = (await listMermaidFiles(mermaidDir)) ?? [];
  return new Map(await Promise.all(files.map(async (file) => [file, await readFile(join(mermaidDir, file), 'utf8')] as const)));
}

describe('vite', () => {
  // Tests the bundle the global setup built, as the showroom hands it out: what it exports, what it leaves out, its size and its notices.

  const mermaidDir = inject('mermaidDir');

  it("Exports Mermaid's API as its entry point's default export", async () => {
    const mermaid = (await import(pathToFileURL(join(mermaidDir, MERMAID_ENTRY_FILE)).href)).default;
    expect(typeof mermaid.initialize).toBe('function');
    expect(typeof mermaid.render).toBe('function');
  });

  it("Holds none of elkjs's code, only its stub", async () => {
    // elkjs is EPL-licensed, and never shipped (D832 in .workflow/PLAN-P21-jsonschema.md)
    const contents = [...(await _readBundle(mermaidDir)).values()];
    expect(contents.some((content) => content.includes(ELKJS_STUB_MARKER))).toBe(true);
    expect(contents.some((content) => content.includes('org.eclipse.elk'))).toBe(false);
  });

  it('Stays within its size', async () => {
    const files = (await listMermaidFiles(mermaidDir)) ?? [];
    expect(files).toContain(MERMAID_ENTRY_FILE);
    const sizes = await Promise.all(files.map(async (file) => (await stat(join(mermaidDir, file))).size));
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(_MAX_BUNDLE_SIZE);
  });

  it('Imports its chunks by relative paths only, so it works under any base path', async () => {
    for (const [file, content] of await _readBundle(mermaidDir)) {
      if (!file.endsWith('.js')) continue;
      const specifiers = [...content.matchAll(/(?:\bfrom|\bimport\(?)\s*"([^"\n]*\.js)"/g)].map((match) => match[1]);
      if (file === MERMAID_ENTRY_FILE) expect(specifiers.length).toBeGreaterThan(0);
      for (const specifier of specifiers) expect(specifier, `${file}: ${specifier}`).toMatch(/^\.\.?\//);
    }
  });

  it('Is stamped with the hash of what builds it, and built again only when that changes', async () => {
    const hash = await getMermaidBuildHash();
    expect(await readFile(join(mermaidDir, MERMAID_STAMP_FILE), 'utf8')).toBe(hash);
    expect(await isMermaidBuilt(mermaidDir, hash)).toBe(true);
    expect(await isMermaidBuilt(mermaidDir, 'other')).toBe(false);
    // The global setup built it already, so this finds it
    const modified = (await stat(join(mermaidDir, MERMAID_ENTRY_FILE))).mtimeMs;
    expect(await buildTestMermaid()).toBe(mermaidDir);
    expect((await stat(join(mermaidDir, MERMAID_ENTRY_FILE))).mtimeMs).toBe(modified);
  });

  it('Lists every package with a module in it, with its licence, in its notices', async () => {
    // The build again, in memory, for the modules each chunk holds (D846, D852 in .workflow/PLAN-P21-jsonschema.md)
    const { build } = await import('vite');
    const scratch = await createScratchFolder('mermaid-notices-');
    try {
      const configuration = getMermaidBuildConfiguration(scratch.path);
      const output = (await build({ ...configuration, build: { ...configuration.build, write: false } })) as Rolldown.RolldownOutput[];
      const ids = output.flatMap(({ output }) => output.flatMap((chunk) => (chunk.type === 'chunk' ? chunk.moduleIds : [])));
      expect(ids).toContain(ELKJS_STUB_PATH);
      const packages = new Set(ids.flatMap((id) => /.*[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/.exec(id)?.[1].replace('\\', '/') ?? []));
      expect(packages.size).toBeGreaterThan(10);
      const notices = await readFile(join(mermaidDir, MERMAID_NOTICES_FILE), 'utf8');
      // Each package's heading names its version, and its licence's name where its package.json gives one (khroma's doesn't), followed by its text
      const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      for (const name of packages) expect(notices, name).toMatch(new RegExp(`^## ${escape(name)} - \\S+.*\\n\\n\\S`, 'm'));
    } finally {
      await scratch.remove();
    }
  });
});
