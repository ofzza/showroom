/**
 * Tests of the host information types
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type { DocumentationKind, HostInformation, ProjectInformation, ShowcaseKind } from './index.js';

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

  it('Limits showcase kinds to inline and linked', () => {
    expectTypeOf<ShowcaseKind>().toEqualTypeOf<'inline' | 'linked'>();
  });

  it('Survives a JSON round trip unchanged', () => {
    const host: HostInformation = {
      project: { name: 'host', version: '1.0.0' },
      documentation: [{ path: 'README.md', kind: 'readme', extension: '.md', content: '# Host\n' }],
      code: ['src/index.ts'],
      showcases: [
        { id: 'README.md#1', documentation: 'README.md', line: 3, offset: 9, kind: 'inline', adapter: 'html', entry: 'README.showcase-1.html' },
        { id: 'README.md#2', documentation: 'README.md', line: 7, offset: 40, kind: 'linked', adapter: 'x', options: { a: [1] }, entry: 'demo.js' },
      ],
      virtualFiles: [{ path: 'README.showcase-1.html', kind: 'entry', content: '<p>Hi</p>', documentation: 'README.md', line: 3 }],
      linkedFiles: [{ path: 'src/index.ts', size: 12, text: true }],
    };
    expect(JSON.parse(JSON.stringify(host))).toEqual(host);
  });
});
