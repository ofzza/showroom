/**
 * Tests of the showroom's navigation
 */

import { describe, it, expect } from 'vitest';
import type { DocumentationFile, NavigationItem } from '../../host/index.js';
import { getCurrentItemHref, getNavigationItems, holdsCurrentItem, isNavigationGroupExpanded, type ShownNavigationItem } from './index.js';

/**
 * Creates a documentation file with empty content
 * @param path Path of the file
 * @param kind Kind of the file
 * @param heading Its first heading, if it has one
 * @returns The documentation file
 */
function _file(path: string, kind: DocumentationFile['kind'] = 'other', heading?: string): DocumentationFile {
  return { path, kind, extension: '.md', content: '', ...(heading ? { heading } : {}) };
}

/**
 * Gets the labels of navigation items, a group's as its label and its items' labels
 * @param items Navigation items
 * @returns Their labels
 */
function _labels(items: ShownNavigationItem[]): unknown[] {
  return items.map((item) => (item.kind === 'group' ? [item.label, _labels(item.items)] : item.label));
}

describe('app/navigation', () => {
  // Tests getNavigationItems() on hand-made lists of documentation files, sorted by path as check() sorts them, and on hand-made resolved
  // navigations; and the current item and the groups' expansion on hand-made items.

  describe('The default navigation', () => {
    // Without showroom.json's navigation: README, CONTRIBUTING and LICENSE, then every other documentation file, by its first heading.

    it('Lists README, CONTRIBUTING and LICENSE first, then every other documentation file by its first heading, else its path, in order', () => {
      const documentation = [
        _file('CONTRIBUTE.md', 'contribute', 'How to contribute'),
        _file('README.md', 'readme', 'My library'),
        _file('api.md', 'other', 'API'),
        _file('docs/README.md', 'readme'),
        _file('docs/guide.md', 'other', 'The guide'),
        _file('licence.txt', 'license'),
      ];
      expect(getNavigationItems(documentation)).toEqual([
        { kind: 'page', label: 'README', href: '#/', route: '#/', path: 'README.md' },
        { kind: 'page', label: 'CONTRIBUTING', href: '#/CONTRIBUTE.md', route: '#/CONTRIBUTE.md', path: 'CONTRIBUTE.md' },
        { kind: 'page', label: 'LICENSE', href: '#/licence.txt', route: '#/licence.txt', path: 'licence.txt' },
        { kind: 'page', label: 'API', href: '#/api.md', route: '#/api.md', path: 'api.md' },
        { kind: 'page', label: 'docs/README.md', href: '#/docs/README.md', route: '#/docs/README.md', path: 'docs/README.md' },
        { kind: 'page', label: 'The guide', href: '#/docs/guide.md', route: '#/docs/guide.md', path: 'docs/guide.md' },
      ]);
    });

    it('Labels only the root contribute and license files, by kind', () => {
      // The documentation patterns can add a file of a built-in kind elsewhere (e.g. `docs/LICENSE.md` in test/fixtures/minimal); it keeps its path
      const documentation = [_file('LICENSE', 'license'), _file('docs/CONTRIBUTING.md', 'contribute'), _file('docs/LICENSE.md', 'license')];
      expect(_labels(getNavigationItems(documentation))).toEqual(['README', 'LICENSE', 'docs/CONTRIBUTING.md', 'docs/LICENSE.md']);
    });

    it('Labels by path the files whose heading another item has too', () => {
      const documentation = [_file('a.md', 'other', 'Usage'), _file('b.md', 'other', 'Usage'), _file('c.md', 'other', 'README'), _file('d.md', 'other', 'D')];
      expect(_labels(getNavigationItems(documentation))).toEqual(['README', 'a.md', 'b.md', 'c.md', 'D']);
    });

    it('Labels the home page README even without a root README', () => {
      expect(getNavigationItems([])).toEqual([{ kind: 'page', label: 'README', href: '#/', route: '#/' }]);
    });
  });

  describe('A configured navigation', () => {
    // showroom.json's navigation, as check resolved it.

    it('Shows pages, anchors, URLs and nested groups', () => {
      const navigation: NavigationItem[] = [
        { kind: 'page', label: 'Home', path: '', anchor: 'usage' },
        {
          kind: 'group',
          label: 'Docs',
          collapsed: true,
          items: [{ kind: 'group', label: 'Deeper', items: [{ kind: 'page', label: 'Guide', path: 'docs/guide.md' }] }],
        },
        { kind: 'url', label: 'npm', url: 'https://npmjs.com' },
      ];
      expect(getNavigationItems([_file('README.md', 'readme')], navigation)).toEqual([
        { kind: 'page', label: 'Home', href: '#/#usage', route: '#/', anchor: 'usage', path: 'README.md' },
        {
          kind: 'group',
          label: 'Docs',
          collapsed: true,
          items: [
            {
              kind: 'group',
              label: 'Deeper',
              items: [{ kind: 'page', label: 'Guide', href: '#/docs/guide.md', route: '#/docs/guide.md', path: 'docs/guide.md' }],
            },
          ],
        },
        { kind: 'url', label: 'npm', href: 'https://npmjs.com' },
      ]);
    });
  });

  describe('Groups', () => {
    // The current item, and whether a group is expanded.

    const group: ShownNavigationItem = {
      kind: 'group',
      label: 'Docs',
      items: [{ kind: 'group', label: 'Deeper', items: [{ kind: 'page', label: 'Guide', href: '#/a.md#x', route: '#/a.md', path: 'a.md' }] }],
    };

    it('Finds the current item in nested groups, by the URL hash it leads to', () => {
      expect(holdsCurrentItem(group, '#/a.md#x')).toBe(true);
      expect(holdsCurrentItem(group, '#/a.md')).toBe(false);
      expect(holdsCurrentItem(group, '#/b.md')).toBe(false);
      expect(holdsCurrentItem(group, undefined)).toBe(false);
    });

    it("Picks the current item among a page's items by the route's anchor", () => {
      // See D668 (SPEC-S13-navigation.md): the item with the route's anchor, else the page's first without an anchor, else its first
      const items: ShownNavigationItem[] = [
        { kind: 'page', label: 'Install', href: '#/a.md#install', route: '#/a.md', anchor: 'install' },
        { kind: 'group', label: 'Docs', items: [{ kind: 'page', label: 'A', href: '#/a.md', route: '#/a.md' }] },
        { kind: 'page', label: 'Usage', href: '#/a.md#usage', route: '#/a.md', anchor: 'usage' },
        { kind: 'page', label: 'B', href: '#/b.md#x', route: '#/b.md', anchor: 'x' },
      ];
      expect(getCurrentItemHref(items, '#/a.md', 'usage')).toBe('#/a.md#usage');
      expect(getCurrentItemHref(items, '#/a.md')).toBe('#/a.md');
      expect(getCurrentItemHref(items, '#/a.md', 'elsewhere')).toBe('#/a.md');
      expect(getCurrentItemHref(items, '#/b.md')).toBe('#/b.md#x');
      expect(getCurrentItemHref(items, '#/c.md')).toBeUndefined();
      expect(getCurrentItemHref(items, undefined, 'usage')).toBeUndefined();
    });

    it('Expands a group until it is collapsed, and again once the current item changes to one of its items', () => {
      expect(isNavigationGroupExpanded(group, null, '#/b.md')).toBe(true);
      // Collapsed on another item: stays collapsed there, and on an item outside it
      expect(isNavigationGroupExpanded(group, { page: '#/b.md' }, '#/b.md')).toBe(false);
      expect(isNavigationGroupExpanded(group, { page: '#/b.md' }, '#/c.md')).toBe(false);
      // Its item becoming current expands it again; collapsing it there keeps it collapsed until the current item changes
      expect(isNavigationGroupExpanded(group, { page: '#/b.md' }, '#/a.md#x')).toBe(true);
      expect(isNavigationGroupExpanded(group, { page: '#/a.md#x' }, '#/a.md#x')).toBe(false);
    });
  });
});
