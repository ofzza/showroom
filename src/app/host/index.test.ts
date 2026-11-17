/**
 * Tests of the shown host information's helpers
 */

import { describe, it, expect } from 'vitest';
import type { DocumentationFile } from '../../host/index.js';
import {
  applyShowcaseUpdates,
  type ShownShowcase,
  type ShownTab,
  findDocumentationFile,
  findFolderReadme,
  getFolder,
  getRootReadme,
  isBuiltShowcase,
  isMarkdown,
  isRootReadme,
} from './index.js';

/**
 * Creates a tab of a text linked file
 * @param path Path of the file
 * @param url Its URL
 * @returns The tab
 */
function _tab(path: string, url: string): ShownTab {
  return { label: path, path, language: 'html', source: { kind: 'file', url, text: true } };
}

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

/**
 * The parts of a showcase's update that the tests don't change: no checks, no issues, a build status mark
 */
const _update = { checks: [], issues: [], buildMark: true };

describe('app/host', () => {
  // Tests the helpers finding documentation files, on hand-made lists of documentation files, and applying the new URLs of showcase frames and tabs.

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
    const showcases: ShownShowcase[] = [
      {
        id: 'README.md#1',
        documentation: 'README.md',
        offset: 0,
        display: 'block',
        views: ['demo'],
        markdown: '',
        entryTab: 0,
        checks: [],
        issues: [],
        buildMark: true,
        tabs: [_tab('a.html', 'files/a.html?hash=1')],
        url: 'a?hash=1',
      },
      {
        id: 'README.md#2',
        documentation: 'README.md',
        offset: 9,
        display: 'block',
        views: ['demo'],
        markdown: '',
        entryTab: 0,
        tabs: [],
        url: 'b?hash=1',
        checks: [],
        issues: [],
        buildMark: true,
      },
    ];
    const applied = applyShowcaseUpdates(showcases, [
      { ..._update, id: 'README.md#1', url: 'a?hash=1', tabs: showcases[0].tabs },
      { ..._update, id: 'README.md#2', url: 'b?hash=2', tabs: [] },
      { ..._update, id: 'README.md#3', url: 'c?hash=1', tabs: [] },
    ]);
    expect(applied).toEqual([showcases[0], { ...showcases[1], url: 'b?hash=2' }]);
    // The unchanged showcase stays the same object, so its showcase frame isn't touched
    expect(applied[0]).toBe(showcases[0]);
    expect(applyShowcaseUpdates(showcases, [{ ..._update, id: 'README.md#1', url: 'a?hash=1', tabs: [_tab('a.html', 'files/a.html?hash=1')] }])).toBe(
      showcases,
    );
  });

  it('Applies a new recording, and tells a recorded showcase from one that built nothing', () => {
    const showcase: ShownShowcase = {
      ..._update,
      id: 'README.md#1',
      documentation: 'README.md',
      offset: 0,
      display: 'block',
      views: ['console'],
      markdown: '',
      entryTab: 0,
      tabs: [],
    };
    const recording = { lines: [{ level: 'log' as const, text: 'hi' }], dropped: 0, exitCode: 0 };
    const applied = applyShowcaseUpdates([showcase], [{ ..._update, id: 'README.md#1', tabs: [], recording }]);
    expect(applied[0].recording).toEqual(recording);
    expect(applyShowcaseUpdates(applied, [{ ..._update, id: 'README.md#1', tabs: [], recording }])).toBe(applied);
    expect(isBuiltShowcase(showcase)).toBe(false);
    expect(isBuiltShowcase(applied[0])).toBe(true);
    expect(isBuiltShowcase({ ...showcase, url: 'a?hash=1' })).toBe(true);
  });

  it("Applies a tab's new URL alone, keeping its showcase frame's", () => {
    const showcases: ShownShowcase[] = [
      {
        id: 'README.md#1',
        documentation: 'README.md',
        offset: 0,
        display: 'block',
        views: ['demo'],
        markdown: '',
        entryTab: 0,
        checks: [],
        issues: [],
        buildMark: true,
        tabs: [_tab('a.html', 'files/a.html?hash=1')],
        url: 'a?hash=1',
      },
    ];
    const tabs = [_tab('a.html', 'files/a.html?hash=2')];
    expect(applyShowcaseUpdates(showcases, [{ ..._update, id: 'README.md#1', url: 'a?hash=1', tabs }])).toEqual([{ ...showcases[0], tabs }]);
  });

  it("Applies a showcase's checks, issues and build status mark, and its URL gone when it stops building", () => {
    const showcase: ShownShowcase = {
      id: 'README.md#1',
      documentation: 'README.md',
      offset: 0,
      display: 'block',
      views: ['demo'],
      markdown: '',
      entryTab: 0,
      checks: [],
      issues: [],
      buildMark: true,
      tabs: [],
      url: 'a?hash=1',
    };
    const issues = [{ severity: 'error' as const, message: 'Broke', path: 'a.html', line: 2 }];
    const [checked] = applyShowcaseUpdates([showcase], [{ ..._update, id: 'README.md#1', url: 'a?hash=1', tabs: [], checks: ['type check'], issues }]);
    expect(checked).toEqual({ ...showcase, checks: ['type check'], issues });
    const [unbuilt] = applyShowcaseUpdates([showcase], [{ ..._update, id: 'README.md#1', url: undefined, tabs: [], issues }]);
    expect(unbuilt).toEqual({ ...showcase, url: undefined, issues });
  });
});
