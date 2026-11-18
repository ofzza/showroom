/**
 * The shared Mermaid bundle's build: `mermaid`'s `mermaid.core.mjs` bundled by Vite, in library mode, into one folder of `mermaid.js`, its hashed
 * chunks and its third-party notices, with `elkjs` replaced by a stub (see elkjs-stub.ts). `npm run build-mermaid` runs it into `dist/mermaid/`, and
 * the tests' global setup into a cache folder of their own. Run by Node with its type stripping, so it imports no relative TypeScript module, and uses
 * no TypeScript syntax that only TypeScript can erase. Never part of `showroom`'s compiled code.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InlineConfig } from 'vite';

// #region Constants

/**
 * File name of the bundle's entry point, which a showcase frame's page imports
 */
export const MERMAID_ENTRY_FILE = 'mermaid.js';

/**
 * File name of the bundle's third-party notices: the licence of every package with a module in it
 */
export const MERMAID_NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt';

/**
 * File name of the bundle's stamp: the hash of what built it (see getMermaidBuildHash()); a dotfile, which neither `serve` nor `build` hands out
 */
export const MERMAID_STAMP_FILE = '.stamp';

/**
 * Folder of the bundle's chunks, inside the bundle's folder
 */
export const MERMAID_CHUNKS_FOLDER = 'chunks';

/**
 * Path of this repository's root
 */
const _ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Path of the stub module standing in for `elkjs`
 */
export const ELKJS_STUB_PATH = fileURLToPath(new URL('./elkjs-stub.ts', import.meta.url));

/**
 * Path of the folder `npm run build-mermaid` builds the bundle into
 */
export const DIST_MERMAID_DIR = join(_ROOT, 'dist', 'mermaid');

// #endregion

// #region Build

/**
 * Gets the path of the bundle's entry module: `mermaid`'s `mermaid.core.mjs`, whose dependencies are bare imports, reached by its file path from
 * `mermaid`'s `package.json` folder
 * @returns Its absolute path
 */
export function getMermaidEntryModule(): string {
  return join(dirname(createRequire(import.meta.url).resolve('mermaid/package.json')), 'dist', 'mermaid.core.mjs');
}

/**
 * Gets the hash of what builds the bundle: this repository's `package-lock.json` (Mermaid's and its dependencies' versions), this module and the stub
 * @returns The first 16 hexadecimal digits of their SHA-256
 */
export async function getMermaidBuildHash(): Promise<string> {
  const hash = createHash('sha256');
  for (const path of [join(_ROOT, 'package-lock.json'), fileURLToPath(import.meta.url), ELKJS_STUB_PATH]) {
    const content = await readFile(path);
    hash.update(`${content.byteLength}:`);
    hash.update(content);
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Gets the bundle's Vite configuration: library mode (an application build may drop the entry's exports), ES modules only, `elkjs` and its subpaths
 * aliased to the stub, relative paths (`base: './'`), minified, without source maps. Like the showroom's own, it reads no Vite configuration file, no
 * `.env` files, no public folder and no PostCSS configuration.
 * @param outDir Folder to build into, emptied first
 * @returns Vite's inline configuration
 */
export function getMermaidBuildConfiguration(outDir: string): InlineConfig {
  return {
    configFile: false,
    root: _ROOT,
    base: './',
    logLevel: 'warn',
    clearScreen: false,
    envDir: false,
    publicDir: false,
    css: { postcss: {} },
    resolve: { alias: [{ find: /^elkjs(\/.*)?$/, replacement: ELKJS_STUB_PATH }] },
    build: {
      outDir,
      emptyOutDir: true,
      minify: true,
      sourcemap: false,
      copyPublicDir: false,
      // Mermaid's chunks are large by nature, and only ever loaded by a showcase frame that draws a diagram
      chunkSizeWarningLimit: Number.MAX_SAFE_INTEGER,
      license: { fileName: MERMAID_NOTICES_FILE },
      lib: { entry: getMermaidEntryModule(), formats: ['es'], fileName: () => MERMAID_ENTRY_FILE },
      // Vite never minifies an ES library's whitespace (to keep its pure annotations for a later bundler), but nothing bundles this one again
      rolldownOptions: { output: { chunkFileNames: `${MERMAID_CHUNKS_FOLDER}/[name]-[hash].js`, minify: true } },
    },
  };
}

/**
 * Checks if a folder holds a bundle built from what builds it now
 * @param outDir The bundle's folder
 * @param hash The hash of what builds it now (see getMermaidBuildHash())
 * @returns True if its stamp is that hash, and its entry point exists
 */
export async function isMermaidBuilt(outDir: string, hash: string): Promise<boolean> {
  if (!existsSync(join(outDir, MERMAID_ENTRY_FILE))) return false;
  return (await readFile(join(outDir, MERMAID_STAMP_FILE), 'utf8').catch(() => '')) === hash;
}

/**
 * Builds the bundle into a folder: into a temporary sibling first, renamed into place once built, so a folder holding the bundle always holds a whole
 * one; its stamp written last
 * @param outDir The bundle's folder, replaced
 * @returns The hash it was built from
 */
export async function buildMermaid(outDir: string): Promise<string> {
  const { build } = await import('vite');
  const hash = await getMermaidBuildHash();
  const temporary = `${outDir}.building-${process.pid}`;
  try {
    await build(getMermaidBuildConfiguration(temporary));
    await writeFile(join(temporary, MERMAID_STAMP_FILE), hash);
    await rm(outDir, { recursive: true, force: true });
    await rename(temporary, outDir);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return hash;
}

// #endregion

// #region Command line

/**
 * Runs `npm run build-mermaid`: builds the bundle into `dist/mermaid/`, or with `--if-stale` (`npm run dev`) only when its stamp doesn't match
 * @param args The command line's arguments
 */
export async function main(args: readonly string[]): Promise<void> {
  if (args.includes('--if-stale') && (await isMermaidBuilt(DIST_MERMAID_DIR, await getMermaidBuildHash()))) {
    console.log('The Mermaid bundle is up to date.');
    return;
  }
  const start = Date.now();
  await buildMermaid(DIST_MERMAID_DIR);
  console.log(`Built the Mermaid bundle in ${((Date.now() - start) / 1000).toFixed(1)} s.`);
}

// #endregion
