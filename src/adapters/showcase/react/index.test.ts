/**
 * Tests of the react showcase adapter
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Showcase } from '../../../host/index.js';
import { createScratchFolder, FIXTURES, REPOSITORY_ROOT } from '../../../testing/index.js';
import { checkReact, getMountModule, getMountModulePath, ReactShowcaseAdapter, validateReactShowcase } from './index.js';

/**
 * Path of the fixture host repository with react showcases
 */
const _ROOT = join(FIXTURES, 'showcase-react');

/**
 * Creates a react showcase
 * @param kind Kind of the showcase
 * @param entry Path of its entry point
 * @param extra Other fields to set (e.g. options, documentation)
 * @returns The showcase
 */
function _showcase(kind: Showcase['kind'], entry: string, extra: Partial<Showcase> = {}): Showcase {
  return { id: 'README.md#1', documentation: 'README.md', line: 1, offset: 0, kind, adapter: 'react', entry, ...extra };
}

describe('adapters/showcase/react', () => {
  // Tests the react showcase adapter's parts on hand-made showcases: its validation, the mount module's path and source, and its host check, with
  // injected resolvers answering from `package.json` files in scratch folders. Building with Vite is in the integration tests.

  describe('Validation', () => {
    // Tests validate() on every language of an entry point, and on its options, which are the ts showcase adapter's.

    const adapter = new ReactShowcaseAdapter();

    it('Accepts TSX and JSX entry points, with typeCheck on and allowJs off by default', () => {
      for (const showcase of [
        _showcase('code-block', 'README.showcase-1.tsx'),
        _showcase('code-block', 'README.showcase-1.jsx'),
        _showcase('link', 'demos/Demo.TSX'),
      ]) {
        expect(adapter.validate(showcase)).toEqual({ options: { typeCheck: true, allowJs: false }, errors: [] });
      }
      expect(validateReactShowcase(_showcase('link', 'Demo.jsx', { options: { typeCheck: false, allowJs: true } }))).toEqual({
        options: { typeCheck: false, allowJs: true },
        errors: [],
      });
    });

    it('Rejects other entry points, pointing ts and js at the ts showcase adapter, and invalid options', () => {
      expect(adapter.validate(_showcase('code-block', 'README.showcase-1.html')).errors).toEqual([
        'The react showcase adapter needs a "tsx" or "jsx" code block',
      ]);
      expect(adapter.validate(_showcase('code-block', 'README.showcase-1.ts')).errors).toEqual([
        'The react showcase adapter needs a "tsx" or "jsx" code block; for ts and js, use the ts showcase adapter',
      ]);
      expect(adapter.validate(_showcase('link', 'demo.mjs')).errors).toEqual([
        'The react showcase adapter needs a link to a .tsx or .jsx file, not "demo.mjs"; for ts and js, use the ts showcase adapter',
      ]);
      expect(adapter.validate(_showcase('code-block', 'a.tsx', { options: { strict: true } })).errors).toEqual([
        'Unknown option "strict" of the react showcase adapter; its options are "typeCheck" and "allowJs"',
      ]);
    });
  });

  describe('Mount module', () => {
    // Tests where the mount module sits, and what it does.

    it('Sits beside the entry point', () => {
      expect(getMountModulePath(_ROOT, 'docs/README.showcase-1.tsx')).toBe(join(_ROOT, 'docs', 'README.showcase-1.tsx.showroom-mount.js'));
    });

    it("Renders the entry point's default export into the showcase frame root, with createRoot, without StrictMode", () => {
      expect(getMountModule('docs/README.showcase-1.tsx')).toBe(
        [
          "import { createElement } from 'react';",
          "import { createRoot } from 'react-dom/client';",
          'import Showcase from "./README.showcase-1.tsx";',
          '',
          'createRoot(document.getElementById("root")).render(createElement(Showcase));',
          '',
        ].join('\n'),
      );
    });
  });

  describe('Host check', () => {
    // Tests checking React, React's types and TypeScript once per documentation folder, with resolvers answering from scratch folders named after
    // each documentation folder, holding a folder per package.

    /**
     * Writes packages into a scratch folder: `<folder>/<package>/package.json`
     * @param path Absolute path of the scratch folder
     * @param packages The packages' manifests, by `<folder>/<package>`
     */
    async function _packages(path: string, packages: Record<string, object>): Promise<void> {
      for (const [name, manifest] of Object.entries(packages)) {
        await mkdir(join(path, name), { recursive: true });
        await writeFile(join(path, name, 'package.json'), JSON.stringify(manifest));
      }
    }

    it('Needs react and react-dom 18 or later, and where showcases type check, React types and TypeScript, naming the folder', async () => {
      const scratch = await createScratchFolder('react-');
      try {
        await _packages(scratch.path, {
          'ok/react': { name: 'react', version: '19.3.1' },
          'ok/react-dom': { name: 'react-dom', version: '19.3.1' },
          'ok/@types/react': { name: '@types/react', version: '19.3.0' },
          'old/react': { name: 'react', version: '17.0.2' },
          'old/react-dom': { name: 'react-dom', version: '18.3.1' },
          'untyped/react': { name: 'react', version: '18.3.1' },
          'untyped/react-dom': { name: 'react-dom', version: '18.3.1' },
          'typed/react': { name: 'react', version: '20.0.0', types: './index.d.ts' },
          'typed/react-dom': { name: 'react-dom', version: '20.0.0' },
          'off/react': { name: 'react', version: '18.0.0' },
          'off/react-dom': { name: 'react-dom', version: '18.0.0' },
        });
        const asked: string[] = [];
        const resolver = (folder: string, name: string) => {
          asked.push(`${folder.slice(_ROOT.length + 1)}:${name}`);
          return join(scratch.path, folder.slice(_ROOT.length + 1), name);
        };
        const missing = (folder: string, name: string) => (folder.endsWith('none') || name === '@types/react' ? undefined : resolver(folder, name));
        const typeScript = (folder: string) => (folder.endsWith('off') ? undefined : join(REPOSITORY_ROOT, 'node_modules', 'typescript'));
        const showcases = ['ok', 'old', 'untyped', 'typed', 'none'].map((folder) =>
          _showcase('code-block', `${folder}/a.showcase-1.tsx`, { documentation: `${folder}/a.md` }),
        );
        showcases.push(_showcase('code-block', 'off/a.showcase-1.tsx', { documentation: 'off/a.md', options: { typeCheck: false, allowJs: false } }));
        expect(checkReact(_ROOT, showcases, (folder, name) => (folder.endsWith('ok') ? resolver(folder, name) : missing(folder, name)), typeScript)).toEqual({
          errors: [
            'the react showcases of "none" need "react" 18 or later, but it isn\'t installed where it can be found: install "react" and "react-dom"',
            'the react showcases of "none" need "react-dom" 18 or later, but it isn\'t installed where it can be found: install "react" and "react-dom"',
            'the react showcases of "old" need "react" 18 or later, but the one found is 17.0.2: upgrade it',
            'the react showcases of "old" type check, but React\'s types aren\'t installed where they can be found: install "@types/react", or set "typeCheck: false"',
            'the react showcases of "untyped" type check, but React\'s types aren\'t installed where they can be found: install "@types/react", or set "typeCheck: false"',
          ],
          warnings: [],
        });
        // React's types are only looked for where react ships none, and showcases type check
        expect(asked.filter((entry) => entry.endsWith('@types/react'))).toEqual(['ok:@types/react']);
      } finally {
        await scratch.remove();
      }
    });

    it("Includes the ts showcase adapter's TypeScript requirement, in its own name", () => {
      const showcase = _showcase('code-block', 'a.showcase-1.tsx', { documentation: 'a.md' });
      const adapter = new ReactShowcaseAdapter(
        () => undefined,
        () => undefined,
      );
      expect(adapter.check(_ROOT, [showcase]).errors).toContain(
        'the react showcases of "." type check, but no TypeScript is installed where it can be found: install "typescript" (5.x or 6.x), or set "typeCheck: false"',
      );
    });

    it("Passes on this repository's React 19 and its types", () => {
      expect(new ReactShowcaseAdapter().check(_ROOT, [_showcase('code-block', 'README.showcase-1.tsx')])).toEqual({ errors: [], warnings: [] });
    });
  });
});
