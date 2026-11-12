/**
 * Tests of the showroom's navigation
 */

import { describe, it, expect } from 'vitest';
import type { DocumentationFile } from '../../host/index.js';
import { getNavigationItems } from './index.js';

/**
 * Creates a documentation file with empty content
 * @param path Path of the file
 * @param kind Kind of the file
 * @returns The documentation file
 */
function _file(path: string, kind: DocumentationFile['kind'] = 'other'): DocumentationFile {
  return { path, kind, extension: '.md', content: '' };
}

describe('app/navigation', () => {
  // Tests getNavigationItems() on hand-made lists of documentation files, sorted by path as check() sorts them.

  it('Lists README, CONTRIBUTING and LICENSE first, then every other documentation file by its full path, in order', () => {
    const documentation = [
      _file('CONTRIBUTE.md', 'contribute'),
      _file('README.md', 'readme'),
      _file('api.md'),
      _file('docs/README.md', 'readme'),
      _file('docs/guide.md'),
      _file('licence.txt', 'license'),
    ];
    expect(getNavigationItems(documentation)).toEqual([
      { label: 'README', href: '#/' },
      { label: 'CONTRIBUTING', href: '#/CONTRIBUTE.md', path: 'CONTRIBUTE.md' },
      { label: 'LICENSE', href: '#/licence.txt', path: 'licence.txt' },
      { label: 'api.md', href: '#/api.md', path: 'api.md' },
      { label: 'docs/README.md', href: '#/docs/README.md', path: 'docs/README.md' },
      { label: 'docs/guide.md', href: '#/docs/guide.md', path: 'docs/guide.md' },
    ]);
  });

  it('Labels only the root contribute and license files, by kind', () => {
    // The documentation patterns can add a file of a built-in kind elsewhere (e.g. `docs/LICENSE.md` in test/fixtures/minimal); it keeps its path
    const documentation = [_file('LICENSE', 'license'), _file('docs/CONTRIBUTING.md', 'contribute'), _file('docs/LICENSE.md', 'license')];
    expect(getNavigationItems(documentation).map((item) => item.label)).toEqual(['README', 'LICENSE', 'docs/CONTRIBUTING.md', 'docs/LICENSE.md']);
  });

  it('Labels the home page README even without a root README', () => {
    expect(getNavigationItems([])).toEqual([{ label: 'README', href: '#/' }]);
  });
});
