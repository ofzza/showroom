/**
 * Tests of the host information types
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type { DocumentationKind, HostInformation, ProjectInformation, Showcase, ShowcaseDisplay, ShowcaseKind, ShowcaseView, VirtualFile } from './index.js';

describe('host', () => {
  // The module only declares types: checks at compile time that they accept what the showroom relies on and reject what they
  // shouldn't, and at runtime that a value survives being serialised to JSON unchanged (it's printed by `showroom check`).

  it('Requires only a name in the project information', () => {
    expectTypeOf<{ name: string }>().toExtend<ProjectInformation>();
    // @ts-expect-error The name is required
    const _project: ProjectInformation = { version: '1.0.0' };
  });

  it('Limits documentation kinds to the built-in ones and other', () => {
    expectTypeOf<DocumentationKind>().toEqualTypeOf<'readme' | 'contribute' | 'license' | 'other'>();
  });

  it('Limits showcase kinds to code-block and link', () => {
    expectTypeOf<ShowcaseKind>().toEqualTypeOf<'code-block' | 'link'>();
  });

  it('Limits how showcases are shown to inline and block, and requires it with the included files', () => {
    expectTypeOf<ShowcaseDisplay>().toEqualTypeOf<'inline' | 'block'>();
    expectTypeOf<Showcase['include']>().toEqualTypeOf<string[]>();
    // @ts-expect-error Every showcase says how it is shown, and lists its included files (none here)
    const _showcase: Showcase = { id: 'a#1', documentation: 'a', line: 1, offset: 0, kind: 'link', adapter: 'html', entry: 'a.html' };
  });

  it('Limits showcase views to the five views, required on a showcase and optional on a virtual file', () => {
    expectTypeOf<ShowcaseView>().toEqualTypeOf<'markdown' | 'source' | 'demo' | 'console' | 'none'>();
    expectTypeOf<Showcase['views']>().toEqualTypeOf<ShowcaseView[]>();
    expectTypeOf<VirtualFile['views']>().toEqualTypeOf<ShowcaseView[] | undefined>();
    const _showcase: Showcase = {
      id: 'a#1',
      documentation: 'a',
      line: 1,
      offset: 0,
      kind: 'link',
      display: 'block',
      adapter: 'html',
      entry: 'a.html',
      include: [],
      // @ts-expect-error Views are named, and case-sensitive
      views: ['Demo'],
    };
  });

  it('Survives a JSON round trip unchanged', () => {
    const host: HostInformation = {
      project: { name: 'host', version: '1.0.0' },
      documentation: [{ path: 'README.md', kind: 'readme', extension: '.md', content: '# Host\n' }],
      code: ['src/index.ts'],
      showcases: [
        {
          id: 'README.md#1',
          documentation: 'README.md',
          line: 3,
          offset: 9,
          kind: 'code-block',
          display: 'block',
          adapter: 'html',
          entry: 'README.showcase-1.html',
          include: [],
          views: ['demo'],
        },
        {
          id: 'README.md#2',
          documentation: 'README.md',
          line: 7,
          offset: 40,
          kind: 'link',
          display: 'inline',
          adapter: 'x',
          options: { a: [1] },
          entry: 'demo.js',
          include: [],
          views: ['demo'],
        },
      ],
      virtualFiles: [
        { path: 'README.showcase-1.html', named: false, showcase: 'README.md#1', content: '<p>Hi</p>', documentation: 'README.md', line: 3, offset: 0 },
      ],
      linkedFiles: [{ path: 'src/index.ts', size: 12, text: true }],
    };
    expect(JSON.parse(JSON.stringify(host))).toEqual(host);
  });
});
