/**
 * Tests of compiling angular showcases
 */

import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as TypeScript from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Showcase, VirtualFile } from '../../../../host/index.js';
import { scanMarkdown } from '../../../../markdown/index.js';
import { createScratchFolder, FIXTURES, type ScratchFolder } from '../../../../testing/index.js';
import {
  ANGULAR_PACKAGES,
  checkDefaultExport,
  compileAngularShowcase,
  findAngular,
  getAngularConfiguration,
  getAngularProblems,
  getMajorVersion,
  loadAngular,
  mapAngularDiagnostic,
  MINIMUM_ANGULAR_VERSION,
  NOT_A_STANDALONE_COMPONENT,
  type FoundAngular,
  type LoadedAngular,
} from './index.js';

/**
 * Scans documentation files of a host repository on disk, or given as text, for their showcases and virtual files
 * @param root Absolute path of the host repository's root
 * @param documents The documentation files' paths, relative to the root, each with its Markdown, or undefined to read it from disk
 * @returns The showcases, and every virtual file
 */
function _scan(root: string, documents: Record<string, string | undefined>): { showcases: Showcase[]; virtualFiles: VirtualFile[] } {
  const scans = Object.entries(documents).map(([path, markdown]) => scanMarkdown(path, markdown ?? readFileSync(join(root, path), 'utf8')));
  return { showcases: scans.flatMap((scan) => scan.showcases), virtualFiles: scans.flatMap((scan) => scan.virtualFiles) };
}

describe('adapters/showcase/angular/compile', () => {
  // Tests compiling angular showcases with this repository's own Angular 22 and TypeScript, standing in for the host's: finding Angular (with
  // resolvers answering from `package.json` files in scratch folders) and judging it, loading it, the configuration (on the `showcase-angular`
  // fixture's tsconfigs, and scratch tsconfigs), the diagnostics' mapping (hand-made diagnostics), the default export check, and whole compiles of
  // the `showcase-angular` and `showcase-angular-errors` fixtures' showcases, and hand-written ones. Angular 20 and 21 are compiled by the
  // integration tests, on their installed fixtures.

  let loaded: LoadedAngular;
  beforeAll(async () => {
    const found = findAngular(join(FIXTURES, 'showcase-angular'));
    loaded = await loadAngular(found.packages['@angular/compiler-cli']!.folder, found.typeScript!.folder);
  });

  describe('Finding Angular', () => {
    // Tests finding the Angular packages, and the TypeScript of `@angular/compiler-cli`, with an injected resolver; then judging what was found.

    let scratch: ScratchFolder;
    beforeAll(async () => {
      scratch = await createScratchFolder('angular-find-');
    });
    afterAll(() => scratch.remove());

    /**
     * Writes a package's `package.json` into the scratch folder
     * @param name The package's name
     * @param version Its version
     * @returns Absolute path of its folder
     */
    async function _package(name: string, version: string): Promise<string> {
      const folder = join(scratch.path, `${name}@${version}`);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'package.json'), JSON.stringify({ name, version }));
      return folder;
    }

    it('Finds every Angular package, and the TypeScript resolved from the compiler', async () => {
      const folders: Record<string, string> = {};
      for (const name of ANGULAR_PACKAGES) folders[name] = await _package(name, '21.2.0');
      const typescript = await _package('typescript', '5.9.3');
      const asked: string[] = [];
      const found = findAngular('/docs', (from, name) => {
        asked.push(`${from} ${name}`);
        return name === 'typescript' ? (from === folders['@angular/compiler-cli'] ? typescript : undefined) : folders[name];
      });
      expect(found.packages['@angular/core']).toEqual({ folder: folders['@angular/core'], version: '21.2.0' });
      expect(Object.keys(found.packages)).toEqual(ANGULAR_PACKAGES);
      expect(found.typeScript).toEqual({ folder: typescript, version: '5.9.3', support: 'supported' });
      expect(asked).toEqual([...ANGULAR_PACKAGES.map((name) => `/docs ${name}`), `${folders['@angular/compiler-cli']} typescript`]);
      expect(getAngularProblems(found)).toEqual([]);
    });

    it('Finds nothing where nothing is installed', () => {
      expect(findAngular('/docs', () => undefined)).toEqual({ packages: {} });
    });

    it("Finds this repository's own Angular 22 and TypeScript 6", () => {
      const found = findAngular(join(FIXTURES, 'showcase-angular'));
      expect(getMajorVersion(found.packages['@angular/core']!.version)).toBe(22);
      expect(found.typeScript?.version).toMatch(/^6\./);
      expect(getAngularProblems(found)).toEqual([]);
    });

    it('Reports missing packages, old or unknown versions, mixed majors, and an unsupported or missing TypeScript', () => {
      const at = (version: string) => ({ folder: '/x', version });
      const all = (version: string): FoundAngular['packages'] => Object.fromEntries(ANGULAR_PACKAGES.map((name) => [name, at(version)]));
      const typeScript = { folder: '/ts', version: '6.0.3', support: 'supported' as const };
      expect(getAngularProblems({ packages: { '@angular/core': at('22.0.0') } })).toEqual([
        '"@angular/common", "@angular/compiler", "@angular/compiler-cli", "@angular/platform-browser" isn\'t installed where it can be found: install it',
      ]);
      expect(getAngularProblems({ packages: { ...all('22.0.0'), '@angular/core': at('19.2.0'), '@angular/common': at('') }, typeScript })).toEqual([
        `"@angular/core" ${MINIMUM_ANGULAR_VERSION} or later is needed, but the one found is 19.2.0: upgrade it`,
        `"@angular/common" ${MINIMUM_ANGULAR_VERSION} or later is needed, but the one found is of an unknown version: upgrade it`,
      ]);
      expect(getAngularProblems({ packages: { ...all('21.2.0'), '@angular/core': at('22.0.0') }, typeScript })).toEqual([
        'the Angular packages found are of different majors (21, 22): install one Angular version',
      ]);
      expect(getAngularProblems({ packages: all('22.0.0') })).toEqual(['"typescript" isn\'t installed where "@angular/compiler-cli" can find it: install it']);
      // TypeScript 7 has no classic compiler API for Angular's compiler (K16)
      expect(getAngularProblems({ packages: all('22.0.0'), typeScript: { folder: '/ts', version: '7.0.0', support: 'unsupported' } })).toEqual([
        '"typescript" 5.x or 6.x is needed by Angular\'s compiler, but the one found is 7.0.0',
      ]);
    });

    it('Reads majors', () => {
      expect(getMajorVersion('22.2.6')).toBe(22);
      expect(getMajorVersion('20.0.0-rc.1')).toBe(20);
      expect(getMajorVersion('')).toBeUndefined();
    });
  });

  describe('Loading', () => {
    // Tests loading this repository's own compiler, whose TypeScript must be the instance it imports itself.

    it('Loads the compiler from its exports, with the TypeScript it imports itself', () => {
      expect(loaded.ng.VERSION.major).toBe('22');
      expect(typeof loaded.ng.NgtscProgram).toBe('function');
      const compilerCli = findAngular(join(FIXTURES, 'showcase-angular')).packages['@angular/compiler-cli']!.folder;
      expect(createRequire(join(compilerCli, 'package.json'))('typescript')).toBe(loaded.ts);
    });
  });

  describe('Configuration', () => {
    // Tests the options a showcase is compiled with: the fixture's tsconfig, with its angularCompilerOptions, and scratch tsconfigs setting what is
    // overridden, or nothing at all.

    let scratch: ScratchFolder;
    beforeAll(async () => {
      scratch = await createScratchFolder('angular-configuration-');
    });
    afterAll(() => scratch.remove());

    it('Takes the nearest tsconfig whole, its angularCompilerOptions included, with its files and the entry point as roots', () => {
      const root = join(FIXTURES, 'showcase-angular');
      const configuration = getAngularConfiguration(loaded, root, root, join(root, 'README.showcase-1.ts'));
      expect(configuration.options).toMatchObject({ strict: true, strictTemplates: true, strictInjectionParameters: true, noImplicitOverride: true });
      expect(configuration.options).toMatchObject({ noEmit: false, sourceMap: true, inlineSources: true, compilationMode: 'full' });
      expect(configuration.rootNames.map((name) => name.slice(root.length + 1)).sort()).toEqual([
        'README.showcase-1.ts',
        'demos/badge-demo.ts',
        'src/badge.component.ts',
        'src/counter.component.ts',
        'src/counter.service.ts',
        'src/unreached.component.ts',
      ]);
      expect(configuration.diagnostics).toEqual([]);
      expect(configuration.configFiles).toEqual([join(root, 'tsconfig.json')]);
    });

    it('Has only the entry point as a root under a solution-style tsconfig', () => {
      const root = join(FIXTURES, 'showcase-angular');
      const entry = join(root, 'solution', 'README.showcase-1.ts');
      const configuration = getAngularConfiguration(loaded, root, join(root, 'solution'), entry);
      expect(configuration.rootNames).toEqual([entry]);
      expect(configuration.diagnostics).toEqual([]);
    });

    it('Overrides only what emitting in memory needs', async () => {
      const folder = join(scratch.path, 'overrides');
      await mkdir(folder);
      const compilerOptions = {
        noEmit: true,
        noEmitOnError: true,
        declaration: true,
        emitDeclarationOnly: true,
        outDir: 'dist',
        rootDir: 'src',
        composite: true,
        sourceMap: false,
        target: 'ES2020',
        module: 'commonjs',
      };
      const angularCompilerOptions = {
        compilationMode: 'partial',
        flatModuleOutFile: 'index.js',
        flatModuleId: 'lib',
        tracePerformance: 'trace.json',
        strictTemplates: true,
      };
      await writeFile(join(folder, 'tsconfig.json'), JSON.stringify({ compilerOptions, angularCompilerOptions, files: [] }));
      const { options } = getAngularConfiguration(loaded, folder, folder, join(folder, 'entry.ts'));
      const { ts } = loaded;
      expect(options).toMatchObject({ noEmit: false, noEmitOnError: false, sourceMap: true, inlineSources: true, suppressOutputPathCheck: true });
      expect(options).toMatchObject({ compilationMode: 'full', strictTemplates: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
      for (const name of ['declaration', 'emitDeclarationOnly', 'outDir', 'rootDir', 'composite', 'flatModuleOutFile', 'flatModuleId', 'tracePerformance']) {
        expect(options).not.toHaveProperty(name);
      }
    });

    it("Uses TypeScript's and Angular's defaults without a tsconfig", async () => {
      const folder = join(scratch.path, 'none');
      await mkdir(folder);
      const entry = join(folder, 'entry.ts');
      const configuration = getAngularConfiguration(loaded, folder, folder, entry);
      expect(configuration.rootNames).toEqual([entry]);
      expect(configuration.configFiles).toEqual([]);
      expect(configuration.options).toMatchObject({ noEmit: false, sourceMap: true, compilationMode: 'full' });
      expect(configuration.options).not.toHaveProperty('strictTemplates');
    });
  });

  describe('Diagnostics', () => {
    // Tests mapping hand-made diagnostics: TypeScript's as the ts showcase adapter maps them, Angular's own (codes -99<code>) as NG<code>.

    const root = '/host';
    const _diagnostic = (code: number, messageText: string, file?: TypeScript.SourceFile, start?: number): TypeScript.Diagnostic => ({
      category: 1,
      code,
      messageText,
      file,
      start,
      length: 1,
    });

    it("Maps TypeScript's diagnostics as TS<code>, and Angular's as NG<code>, at their file and line", () => {
      const file = loaded.ts.createSourceFile('/host/src/a.component.html', '<p>\n{{ nope }}\n</p>', loaded.ts.ScriptTarget.Latest);
      const map = (diagnostic: TypeScript.Diagnostic) => mapAngularDiagnostic(loaded.ts, root, [], () => undefined, diagnostic);
      expect(map(_diagnostic(2322, 'Not assignable.', file, 5))).toEqual({ message: 'TS2322: Not assignable.', path: 'src/a.component.html', line: 2 });
      expect(map(_diagnostic(-992009, 'Not standalone.'))).toEqual({ message: 'NG2009: Not standalone.' });
      expect(map(_diagnostic(-998107, 'NG8107: Optional chain.', file, 0))).toEqual({
        message: 'NG8107: Optional chain.',
        path: 'src/a.component.html',
        line: 1,
      });
    });
  });

  describe('Compile', () => {
    // Compiles the fixtures' showcases, and hand-written ones in the `showcase-angular-errors` fixture's folder, in memory; the fixtures are only
    // read.

    /**
     * Compiles one of a fixture's showcases
     * @param fixture Name of the fixture
     * @param id The showcase's identifier
     * @param documents The documentation files to scan (from disk by default: the fixture's README.md)
     * @param typeCheck False to leave out the type errors and warnings
     * @returns The compile's result
     */
    async function _compile(fixture: string, id: string, documents: Record<string, string | undefined> = { 'README.md': undefined }, typeCheck = true) {
      const root = join(FIXTURES, fixture);
      const { showcases, virtualFiles } = _scan(root, documents);
      const showcase = showcases.find((item) => item.id === id);
      if (!showcase) throw new Error(`No showcase ${id}`);
      return compileAngularShowcase({ loaded, root, showcase, virtualFiles, typeCheck });
    }

    it('Compiles a showcase, emitting every module with its source map, and ignoring errors no showcase reaches', async () => {
      // src/unreached.component.ts has a type error, but no showcase reaches it (D457)
      const result = await _compile('showcase-angular', 'README.md#1');
      expect({ errors: result.errors, typeErrors: result.typeErrors, warnings: result.warnings }).toEqual({ errors: [], typeErrors: [], warnings: [] });
      const root = join(FIXTURES, 'showcase-angular').split('\\').join('/');
      expect([...result.emitted.keys()].map((path) => path.slice(root.length + 1)).sort()).toEqual([
        'README.showcase-1.ts',
        'demos/badge-demo.ts',
        'src/badge.component.ts',
        'src/counter.component.ts',
        'src/counter.service.ts',
        'src/unreached.component.ts',
      ]);
      const entry = result.emitted.get(`${root}/README.showcase-1.ts`)!;
      expect(entry.code).toContain('static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent(');
      expect(entry.code).not.toContain('sourceMappingURL');
      const map = JSON.parse(entry.map!) as { sources: string[]; sourcesContent: string[] };
      expect(map.sources).toEqual(['README.showcase-1.ts', 'demo.html']);
      expect(map.sourcesContent[0]).toContain('export default class Demo');
      // The program's files, the template and style files read, and the tsconfig; virtual files as their documentation file
      expect(result.reads.sort()).toEqual([
        'README.md',
        'demos/badge-demo.ts',
        'src/badge.component.css',
        'src/badge.component.html',
        'src/badge.component.ts',
        'src/counter.component.ts',
        'src/counter.service.ts',
        'src/unreached.component.ts',
        'tsconfig.json',
      ]);
    });

    it("Compiles a linked showcase, the host's partially compiled library, and a showcase under a solution-style tsconfig", async () => {
      for (const id of ['README.md#2', 'README.md#3', 'README.md#4']) expect((await _compile('showcase-angular', id)).errors).toEqual([]);
      const solution = await _compile('showcase-angular', 'solution/README.md#1', { 'solution/README.md': undefined });
      expect({ errors: solution.errors, typeErrors: solution.typeErrors, reads: solution.reads.sort() }).toEqual({
        errors: [],
        typeErrors: [],
        reads: ['solution/README.md', 'solution/tsconfig.json'],
      });
    });

    it('Reports type errors in TypeScript, an inline template and a template file at their lines, and a warning', async () => {
      expect((await _compile('showcase-angular-errors', 'README.md#4')).typeErrors).toEqual([
        { message: "TS2322: Type 'string' is not assignable to type 'number'.", path: 'README.showcase-4.ts', line: 5 },
      ]);
      expect((await _compile('showcase-angular-errors', 'README.md#5')).typeErrors).toEqual([
        { message: "TS2339: Property 'missing' does not exist on type 'Inline'.", path: 'README.showcase-5.ts', line: 6 },
      ]);
      const file = await _compile('showcase-angular-errors', 'README.md#6');
      expect(file.typeErrors).toEqual([
        { message: "TS2339: Property 'nope' does not exist on type 'BrokenComponent'.", path: 'src/broken.component.html', line: 2 },
      ]);
      // Type errors don't stop the emit
      expect(file.errors).toEqual([]);
      expect(file.emitted.size).toBeGreaterThan(0);
      const warned = await _compile('showcase-angular-errors', 'README.md#7');
      expect({ errors: warned.errors, typeErrors: warned.typeErrors }).toEqual({ errors: [], typeErrors: [] });
      expect(warned.warnings).toEqual([
        { message: expect.stringMatching(/^NG8107: The left side of this optional chain/) as string, path: 'README.showcase-7.ts', line: 3 },
      ]);
    });

    it('Leaves out type errors and warnings without type checking', async () => {
      const result = await _compile('showcase-angular-errors', 'README.md#4', undefined, false);
      expect({ errors: result.errors, typeErrors: result.typeErrors, warnings: result.warnings }).toEqual({ errors: [], typeErrors: [], warnings: [] });
      expect(result.emitted.size).toBeGreaterThan(0);
      expect((await _compile('showcase-angular-errors', 'README.md#7', undefined, false)).warnings).toEqual([]);
    });

    it('Fails a default export that is not a standalone component at its line, whatever typeCheck says, and leaves a missing one to the bundle', async () => {
      for (const typeCheck of [true, false]) {
        const declared = await _compile('showcase-angular-errors', 'README.md#2', undefined, typeCheck);
        expect(declared.errors).toEqual([{ message: NOT_A_STANDALONE_COMPONENT, path: 'README.showcase-2.ts', line: 4 }]);
        expect(declared.emitted.size).toBe(0);
        expect((await _compile('showcase-angular-errors', 'README.md#3', undefined, typeCheck)).errors).toEqual([
          { message: NOT_A_STANDALONE_COMPONENT, path: 'README.showcase-3.ts', line: 1 },
        ]);
      }
      const missing = await _compile('showcase-angular-errors', 'README.md#1');
      expect(missing.errors).toEqual([]);
      expect(missing.emitted.size).toBeGreaterThan(0);
    });

    it('Finds the default export through aliases and re-exports, and reports a syntax error whatever typeCheck says', async () => {
      const markdown = [
        '```ts showcase=angular',
        "export { default } from './aliased';",
        '```',
        '',
        '```ts showcase file=aliased.ts',
        "import { Component as Decorate } from '@angular/core';",
        '',
        "@Decorate({ template: '<p>aliased</p>' })",
        'class Aliased {}',
        '',
        'export default Aliased;',
        '```',
        '',
        '```ts showcase=angular',
        "import { Component } from '@angular/core';",
        '',
        "@Component({ template: '<p>broken</p>' })",
        'export default class Broken {',
        '```',
      ].join('\n');
      expect((await _compile('showcase-angular-errors', 'README.md#1', { 'README.md': markdown })).errors).toEqual([]);
      for (const typeCheck of [true, false]) {
        const broken = await _compile('showcase-angular-errors', 'README.md#2', { 'README.md': markdown }, typeCheck);
        expect(broken.errors).toEqual([{ message: "TS1005: '}' expected.", path: 'README.showcase-2.ts', line: 4 }]);
        expect(broken.emitted.size).toBe(0);
      }
    });

    it('Checks the default export on a program directly', () => {
      const { ts } = loaded;
      const entry = '/host/entry.ts';
      const host = ts.createCompilerHost({});
      const getSourceFile = host.getSourceFile;
      host.getSourceFile = (fileName, version) =>
        fileName === entry ? ts.createSourceFile(fileName, 'export default function f() {}', version) : getSourceFile.call(host, fileName, version);
      const program = ts.createProgram({ rootNames: [entry], options: { types: [] }, host });
      expect(checkDefaultExport(ts, program, entry)).toBe(1);
      expect(checkDefaultExport(ts, program, '/host/missing.ts')).toBeUndefined();
    });
  });
});
