/**
 * Tests of the showroom's hash router
 */

import { describe, it, expect } from 'vitest';
import type { DocumentationFile } from '../../host/index.js';
import { formatRoute, getDocumentationRoute, parseRoute, resolveRoute, scrollToAnchor } from './index.js';

/**
 * Creates a documentation file with empty content
 * @param path Path of the file
 * @param kind Kind of the file
 * @returns The documentation file
 */
function _file(path: string, kind: DocumentationFile['kind'] = 'other'): DocumentationFile {
  return { path, kind, extension: '.md', content: '' };
}

describe('app/routing', () => {
  // Tests the route functions on hand-made hashes and documentation files; the hash subscription itself is only exercised in a browser.

  describe('formatRoute', () => {
    // How routes are written as URL hashes.

    it('Formats the home page, documentation files and anchors', () => {
      expect(formatRoute()).toBe('#/');
      expect(formatRoute(undefined, 'install')).toBe('#/#install');
      expect(formatRoute('docs/guide.md')).toBe('#/docs/guide.md');
      expect(formatRoute('docs/guide.md', 'install')).toBe('#/docs/guide.md#install');
    });

    it('URI-encodes path segments and anchors, keeping the slashes', () => {
      expect(formatRoute('my docs/a#b?.md', 'café')).toBe('#/my%20docs/a%23b%3F.md#caf%C3%A9');
    });
  });

  describe('parseRoute', () => {
    // How URL hashes are read as routes, including the ones that aren't routes.

    it('Parses the home page, with or without a leading hash', () => {
      expect(parseRoute('')).toEqual({ page: 'home' });
      expect(parseRoute('#')).toEqual({ page: 'home' });
      expect(parseRoute('#/')).toEqual({ page: 'home' });
      expect(parseRoute('/')).toEqual({ page: 'home' });
      expect(parseRoute('#/#install')).toEqual({ page: 'home', anchor: 'install' });
    });

    it('Parses documentation files and their anchors', () => {
      expect(parseRoute('#/docs/guide.md')).toEqual({ page: 'documentation', path: 'docs/guide.md' });
      expect(parseRoute('#/docs/guide.md#install')).toEqual({ page: 'documentation', path: 'docs/guide.md', anchor: 'install' });
      expect(parseRoute('#/docs/guide.md#')).toEqual({ page: 'documentation', path: 'docs/guide.md' });
    });

    it('Reads back what formatRoute() writes', () => {
      expect(parseRoute(formatRoute('my docs/a#b?.md', 'café'))).toEqual({ page: 'documentation', path: 'my docs/a#b?.md', anchor: 'café' });
    });

    it('Parses anything else as not found', () => {
      expect(parseRoute('#install')).toEqual({ page: 'not-found' });
      expect(parseRoute('#/%E0%A4%A')).toEqual({ page: 'not-found' });
    });
  });

  describe('resolveRoute', () => {
    // How routes are matched against the documentation files.

    const documentation = [_file('README.md', 'readme'), _file('docs/Guide.md')];

    it('Shows the home page and the not-found page as they are', () => {
      expect(resolveRoute({ page: 'home', anchor: 'a' }, documentation)).toEqual({ page: 'home', anchor: 'a' });
      expect(resolveRoute({ page: 'not-found' }, documentation)).toEqual({ page: 'not-found' });
    });

    it("Shows a documentation file's page", () => {
      expect(resolveRoute({ page: 'documentation', path: 'docs/Guide.md', anchor: 'a' }, documentation)).toEqual({
        page: 'documentation',
        file: documentation[1],
        anchor: 'a',
      });
    });

    it('Shows the not-found page for a path that is no documentation file', () => {
      expect(resolveRoute({ page: 'documentation', path: 'docs/missing.md' }, documentation)).toEqual({ page: 'not-found' });
    });

    it("Redirects the root README's own route to the home page", () => {
      expect(resolveRoute({ page: 'documentation', path: 'README.md' }, documentation)).toEqual({ page: 'home', redirect: '#/' });
      expect(resolveRoute({ page: 'documentation', path: 'readme.md', anchor: 'a' }, documentation)).toEqual({ page: 'home', anchor: 'a', redirect: '#/#a' });
    });

    it("Redirects a path matching only case-insensitively to the file's own route", () => {
      expect(resolveRoute({ page: 'documentation', path: 'DOCS/guide.md' }, documentation)).toEqual({
        page: 'documentation',
        file: documentation[1],
        redirect: '#/docs/Guide.md',
      });
    });
  });

  it("Gets a documentation file's route, the home page's for the root README", () => {
    expect(getDocumentationRoute(_file('README.md', 'readme'), 'a')).toBe('#/#a');
    expect(getDocumentationRoute(_file('docs/README.md', 'readme'))).toBe('#/docs/README.md');
  });

  it('Does nothing when scrolling outside a browser', () => {
    // Guards the server-side rendering the tests rely on: `window` is undefined here
    expect(() => scrollToAnchor('a')).not.toThrow();
  });
});
