/**
 * Tests of link resolution in documentation files' Markdown
 */

import { describe, it, expect } from 'vitest';
import type { DocumentationFile } from '../../host/index.js';
import { resolveLink } from './index.js';

/**
 * Creates a documentation file with empty content
 * @param path Path of the file
 * @param kind Kind of the file
 * @returns The documentation file
 */
function _file(path: string, kind: DocumentationFile['kind'] = 'other'): DocumentationFile {
  return { path, kind, extension: '.md', content: '' };
}

describe('app/links', () => {
  // Tests resolveLink() on links written in hand-made documentation files, as they would appear in the Markdown.

  const readme = _file('README.md', 'readme');
  const license = _file('LICENSE', 'license');
  const guide = _file('docs/guide.md');
  const docsReadme = _file('docs/README.md', 'readme');
  const spaced = _file('docs/my notes.md');
  const documentation = [license, readme, docsReadme, guide, spaced];

  it('Leaves absolute URLs unchanged', () => {
    expect(resolveLink('https://example.com/a#b', readme, documentation)).toEqual({ kind: 'external', href: 'https://example.com/a#b' });
    expect(resolveLink('mailto:someone@example.com', guide, documentation)).toEqual({ kind: 'external', href: 'mailto:someone@example.com' });
  });

  it('Keeps anchor-only links on the file holding them', () => {
    expect(resolveLink('#install', guide, documentation)).toEqual({ kind: 'route', href: '#/docs/guide.md#install', anchor: 'install' });
    expect(resolveLink('#install', readme, documentation)).toEqual({ kind: 'route', href: '#/#install', anchor: 'install' });
  });

  it("Resolves relative links against the file's folder, and links starting with / against the root", () => {
    expect(resolveLink('docs/guide.md', readme, documentation)).toEqual({ kind: 'route', href: '#/docs/guide.md' });
    expect(resolveLink('./guide.md#setup', docsReadme, documentation)).toEqual({ kind: 'route', href: '#/docs/guide.md#setup', anchor: 'setup' });
    expect(resolveLink('../LICENSE', guide, documentation)).toEqual({ kind: 'route', href: '#/LICENSE' });
    expect(resolveLink('/LICENSE', guide, documentation)).toEqual({ kind: 'route', href: '#/LICENSE' });
    expect(resolveLink('../README.md', guide, documentation)).toEqual({ kind: 'route', href: '#/' });
  });

  it('Matches paths case-insensitively, and URL-decodes them', () => {
    expect(resolveLink('Docs/Guide.MD', readme, documentation)).toEqual({ kind: 'route', href: '#/docs/guide.md' });
    expect(resolveLink('my%20notes.md', guide, documentation)).toEqual({ kind: 'route', href: '#/docs/my%20notes.md' });
  });

  it("Resolves links to folders to their README's page", () => {
    expect(resolveLink('docs', readme, documentation)).toEqual({ kind: 'route', href: '#/docs/README.md' });
    expect(resolveLink('docs/', readme, documentation)).toEqual({ kind: 'route', href: '#/docs/README.md' });
    expect(resolveLink('.', guide, documentation)).toEqual({ kind: 'route', href: '#/docs/README.md' });
    expect(resolveLink('..', guide, documentation)).toEqual({ kind: 'route', href: '#/' });
    expect(resolveLink('./', readme, documentation)).toEqual({ kind: 'route', href: '#/' });
  });

  it('Drops the query of a relative link', () => {
    expect(resolveLink('guide.md?plain=1#a', docsReadme, documentation)).toEqual({ kind: 'route', href: '#/docs/guide.md#a', anchor: 'a' });
  });

  it('Leaves links to anything else unresolved', () => {
    expect(resolveLink('src/index.ts', readme, documentation)).toEqual({ kind: 'unresolved' });
    expect(resolveLink('src/', readme, documentation)).toEqual({ kind: 'unresolved' });
    expect(resolveLink('../../outside.md', guide, documentation)).toEqual({ kind: 'unresolved' });
    expect(resolveLink('%E0%A4%A.md', readme, documentation)).toEqual({ kind: 'unresolved' });
  });
});
