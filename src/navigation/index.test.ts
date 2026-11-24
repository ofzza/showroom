/**
 * Tests of resolving showroom.json's navigation
 */

import { describe, it, expect } from 'vitest';
import type { DocumentationFile } from '../host/index.js';
import { isNavigationGlob, isNavigationUrl, NAVIGATION_HOME_PATH, resolveNavigation, type NavigationHost } from './index.js';

/**
 * Makes a documentation file
 * @param path Its path
 * @param heading Its first heading, if it has one
 * @returns The documentation file
 */
function _file(path: string, heading?: string): DocumentationFile {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const kind = /^readme/i.test(name) ? 'readme' : /^license/i.test(name) ? 'license' : 'other';
  return { path, kind, extension: name.includes('.') ? name.slice(name.lastIndexOf('.')) : '', content: '', ...(heading ? { heading } : {}) };
}

/**
 * A host's documentation files, sorted by path, with their headings' ids
 */
const _HOST: NavigationHost = {
  documentation: [
    _file('LICENSE'),
    _file('README.md', 'Host'),
    _file('docs/api.md', 'API'),
    _file('docs/guide.md', 'Guide'),
    _file('docs/plain.md'),
    _file('examples/a/README.md', 'A'),
    _file('examples/b/README.md', 'B'),
  ],
  headingIds: new Map([
    ['README.md', ['host', 'usage']],
    ['docs/guide.md', ['guide', 'install']],
  ]),
  projectName: 'host-project',
};

describe('navigation', () => {
  // Resolving showroom.json's navigation with resolveNavigation(), on hand-written documentation files and headings; check() runs it on the
  // navigation fixtures (src/cli/check/).

  describe('Paths', () => {
    // Telling a page's path, a URL and a pattern apart.

    it('Tells absolute URLs apart', () => {
      expect(['https://example.com', 'mailto:a@b.c', '//example.com'].map(isNavigationUrl)).toEqual([true, true, true]);
      expect(['README.md', '/', 'docs/a.md#b'].map(isNavigationUrl)).toEqual([false, false, false]);
    });

    it('Tells patterns apart', () => {
      expect(['docs/*.md', 'docs/?.md', 'docs/[ab].md'].map(isNavigationGlob)).toEqual([true, true, true]);
      expect(['docs/a.md', NAVIGATION_HOME_PATH].map(isNavigationGlob)).toEqual([false, false]);
    });
  });

  describe('resolveNavigation()', () => {
    // The resolved items and the issues, one rule at a time.

    it('Labels pages by their title, else their first heading, else their path', () => {
      const { items } = resolveNavigation(
        [{ path: 'docs/api.md', title: 'Reference' }, { path: 'docs/guide.md' }, { path: 'docs/plain.md' }, { title: 'npm', path: 'https://npmjs.com' }],
        _HOST,
      );
      expect(items).toEqual([
        { kind: 'page', label: 'Reference', path: 'docs/api.md' },
        { kind: 'page', label: 'Guide', path: 'docs/guide.md' },
        { kind: 'page', label: 'docs/plain.md', path: 'docs/plain.md' },
        { kind: 'url', label: 'npm', url: 'https://npmjs.com' },
      ]);
    });

    it('Matches paths as routes are matched', () => {
      const { items, issues } = resolveNavigation([{ path: './DOCS/Guide.md' }, { path: 'docs/missing.md' }], _HOST);
      expect(items).toEqual([{ kind: 'page', label: 'Guide', path: 'docs/guide.md' }]);
      expect(issues[0]).toEqual({ severity: 'error', message: '"navigation" item 2: "docs/missing.md" is not a documentation file' });
    });

    it('Names the home page by "/" or the root README, labelled by its heading', () => {
      expect(resolveNavigation([{ path: '/' }], _HOST).items).toEqual([{ kind: 'page', label: 'Host', path: '' }]);
      expect(resolveNavigation([{ path: 'readme.md', title: 'Home' }], _HOST).items).toEqual([{ kind: 'page', label: 'Home', path: '' }]);
    });

    it("Labels the home page by the project's name without a root README", () => {
      const host = { ..._HOST, documentation: _HOST.documentation.filter(({ path }) => path !== 'README.md') };
      expect(resolveNavigation([{ path: '/' }], host).items).toEqual([{ kind: 'page', label: 'host-project', path: '' }]);
    });

    it('Keeps anchors, and warns about those leading to no heading', () => {
      const { items, issues } = resolveNavigation([{ path: 'docs/guide.md#install' }, { path: '/#usage' }, { path: 'docs/api.md#nowhere' }], _HOST);
      expect(items).toEqual([
        { kind: 'page', label: 'Guide', path: 'docs/guide.md', anchor: 'install' },
        { kind: 'page', label: 'Host', path: '', anchor: 'usage' },
        { kind: 'page', label: 'API', path: 'docs/api.md', anchor: 'nowhere' },
      ]);
      expect(issues.filter(({ path }) => !path)).toEqual([{ severity: 'warning', message: '"navigation" item 3: "docs/api.md" has no heading "#nowhere"' }]);
    });

    it('Expands patterns in path order, skipping what is listed explicitly or taken', () => {
      const { items, issues } = resolveNavigation(
        [{ path: 'docs/*.md' }, { title: 'Examples', items: [{ path: '*' }, { path: 'docs/api.md' }] }, { path: 'docs/g*.md' }],
        _HOST,
      );
      // docs/api.md is listed explicitly after the first pattern, and the second pattern takes everything else, the root README as the home page
      expect(items).toEqual([
        { kind: 'page', label: 'Guide', path: 'docs/guide.md' },
        { kind: 'page', label: 'docs/plain.md', path: 'docs/plain.md' },
        {
          kind: 'group',
          label: 'Examples',
          items: [
            { kind: 'page', label: 'LICENSE', path: 'LICENSE' },
            { kind: 'page', label: 'Host', path: '' },
            { kind: 'page', label: 'A', path: 'examples/a/README.md' },
            { kind: 'page', label: 'B', path: 'examples/b/README.md' },
            { kind: 'page', label: 'API', path: 'docs/api.md' },
          ],
        },
      ]);
      expect(issues).toEqual([
        { severity: 'warning', message: '"navigation" item 3: "docs/g*.md" matches no documentation file the navigation doesn\'t already list' },
      ]);
    });

    it('Leaves out groups whose patterns matched nothing', () => {
      expect(resolveNavigation([{ title: 'Empty', items: [{ path: 'nothing/*' }] }], _HOST).items).toEqual([]);
    });

    it("Carries a group's collapsed only when true, at any depth", () => {
      const { items } = resolveNavigation(
        [{ title: 'Outer', collapsed: true, items: [{ title: 'Inner', collapsed: false, items: [{ path: 'LICENSE' }] }] }],
        _HOST,
      );
      expect(items).toEqual([
        {
          kind: 'group',
          label: 'Outer',
          collapsed: true,
          items: [{ kind: 'group', label: 'Inner', items: [{ kind: 'page', label: 'LICENSE', path: 'LICENSE' }] }],
        },
      ]);
      expect(items[0].kind === 'group' && items[0].items[0]).not.toHaveProperty('collapsed');
    });

    it('Nests groups', () => {
      const { items } = resolveNavigation([{ title: 'Outer', items: [{ title: 'Inner', items: [{ path: 'LICENSE' }] }] }], _HOST);
      expect(items).toEqual([
        { kind: 'group', label: 'Outer', items: [{ kind: 'group', label: 'Inner', items: [{ kind: 'page', label: 'LICENSE', path: 'LICENSE' }] }] },
      ]);
    });

    it('Lists a documentation file again under another anchor without a warning', () => {
      // See D668 (SPEC-S13-navigation.md): a page may be listed once per anchor, and once without one
      const entries = [{ path: '/' }, { title: 'Usage', path: '/#usage' }, { title: 'Host', path: 'README.md#host' }];
      const { items, issues } = resolveNavigation([...entries, { path: 'docs/guide.md' }, { title: 'Install', path: 'docs/guide.md#install' }], _HOST);
      expect(items).toHaveLength(5);
      expect(issues.filter((issue) => issue.message.includes('more than once'))).toEqual([]);
    });

    it('Warns about a documentation file listed twice under the same anchor', () => {
      const { issues } = resolveNavigation(
        [
          { title: 'Usage', path: '/#usage' },
          { title: 'Again', path: 'README.md#usage' },
        ],
        _HOST,
      );
      expect(issues).toContainEqual({ severity: 'warning', message: '"navigation" item 2: "/#usage" is listed more than once' });
    });

    it('Warns about a documentation file listed more than once, keeping both', () => {
      const { items, issues } = resolveNavigation([{ path: '/' }, { title: 'Again', path: 'README.md' }], _HOST);
      expect(items).toHaveLength(2);
      expect(issues[0]).toEqual({ severity: 'warning', message: '"navigation" item 2: "/" is listed more than once' });
    });

    it('Warns about each documentation file left out, at the file', () => {
      const { issues } = resolveNavigation([{ path: '/' }, { path: 'docs/*' }, { path: 'examples/a/README.md' }], _HOST);
      const message = 'Not listed in showroom.json\'s "navigation", so the navigation leaves it out';
      expect(issues).toEqual([
        { severity: 'warning', message, path: 'LICENSE' },
        { severity: 'warning', message, path: 'examples/b/README.md' },
      ]);
    });
  });
});
