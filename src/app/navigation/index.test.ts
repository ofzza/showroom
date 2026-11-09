/**
 * Tests of the showcase application's navigation
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
  // Tests getNavigationItems() on hand-made lists of documentation files.

  it('Lists Home, then every other documentation file by its full path, in order', () => {
    const documentation = [_file('CONTRIBUTE.md', 'contribute'), _file('README.md', 'readme'), _file('docs/README.md', 'readme'), _file('docs/guide.md')];
    expect(getNavigationItems(documentation)).toEqual([
      { label: 'Home', href: '#/' },
      { label: 'CONTRIBUTE.md', href: '#/CONTRIBUTE.md', path: 'CONTRIBUTE.md' },
      { label: 'docs/README.md', href: '#/docs/README.md', path: 'docs/README.md' },
      { label: 'docs/guide.md', href: '#/docs/guide.md', path: 'docs/guide.md' },
    ]);
  });

  it('Lists only Home without documentation files', () => {
    expect(getNavigationItems([])).toEqual([{ label: 'Home', href: '#/' }]);
  });
});
