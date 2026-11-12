/**
 * Tests of the shown host information's helpers
 */

import { describe, it, expect } from 'vitest';
import type { DocumentationFile } from '../../host/index.js';
import { applyShowcaseUrls, findDocumentationFile, findFolderReadme, getFolder, getRootReadme, isMarkdown, isRootReadme } from './index.js';

/**
 * Creates a documentation file with empty content
 * @param path Path of the file
 * @param kind Kind of the file
 * @returns The documentation file
 */
function _file(path: string, kind: DocumentationFile['kind'] = 'other'): DocumentationFile {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return { path, kind, extension: dot > 0 ? name.slice(dot) : '', content: '' };
}

describe('app/host', () => {
  // Tests the helpers finding documentation files, on hand-made lists of documentation files, and applying showcase frames' new URLs.

  const documentation = [_file('LICENSE', 'license'), _file('README.md', 'readme'), _file('docs/Guide.md'), _file('docs/ReadMe.txt', 'readme')];

  it('Recognises the root README only', () => {
    expect(isRootReadme(_file('README.md', 'readme'))).toBe(true);
    expect(isRootReadme(_file('docs/README.md', 'readme'))).toBe(false);
    expect(isRootReadme(_file('README.md', 'other'))).toBe(false);
    expect(getRootReadme(documentation)?.path).toBe('README.md');
    expect(getRootReadme([_file('docs/README.md', 'readme')])).toBeUndefined();
  });

  it('Renders only .md files as Markdown, in any case', () => {
    expect(isMarkdown(_file('README.md'))).toBe(true);
    expect(isMarkdown(_file('readme.MD'))).toBe(true);
    expect(isMarkdown(_file('notes.txt'))).toBe(false);
    expect(isMarkdown(_file('LICENSE'))).toBe(false);
  });

  it('Gets the folder of a path', () => {
    expect(getFolder('README.md')).toBe('');
    expect(getFolder('docs/guide.md')).toBe('docs');
    expect(getFolder('a/b/c.md')).toBe('a/b');
  });

  it('Finds documentation files by path, exactly first, then case-insensitively', () => {
    expect(findDocumentationFile(documentation, 'docs/Guide.md')?.path).toBe('docs/Guide.md');
    expect(findDocumentationFile(documentation, 'DOCS/guide.md')?.path).toBe('docs/Guide.md');
    expect(findDocumentationFile(documentation, 'docs/missing.md')).toBeUndefined();
    const both = [_file('a/x.md'), _file('A/x.md')];
    expect(findDocumentationFile(both, 'A/x.md')).toBe(both[1]);
  });

  it("Finds a folder's README case-insensitively", () => {
    expect(findFolderReadme(documentation, 'DOCS')?.path).toBe('docs/ReadMe.txt');
    expect(findFolderReadme(documentation, '')?.path).toBe('README.md');
    expect(findFolderReadme(documentation, 'src')).toBeUndefined();
  });

  it("Applies showcase frames' new URLs by id, keeping the list when none changed", () => {
    const showcases = [
      { id: 'README.md#1', documentation: 'README.md', offset: 0, url: 'a?hash=1' },
      { id: 'README.md#2', documentation: 'README.md', offset: 9, url: 'b?hash=1' },
    ];
    const applied = applyShowcaseUrls(showcases, [
      { id: 'README.md#1', url: 'a?hash=1' },
      { id: 'README.md#2', url: 'b?hash=2' },
      { id: 'README.md#3', url: 'c?hash=1' },
    ]);
    expect(applied).toEqual([showcases[0], { ...showcases[1], url: 'b?hash=2' }]);
    // The unchanged showcase stays the same object, so its showcase frame isn't touched
    expect(applied[0]).toBe(showcases[0]);
    expect(applyShowcaseUrls(showcases, [{ id: 'README.md#1', url: 'a?hash=1' }])).toBe(showcases);
  });
});
