/**
 * Tests of the host information types
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type { DocumentationKind, HostInformation, ProjectInformation } from './index.js';

describe('host', () => {
  // The module only declares types: checks at compile time that they accept what the showcase application relies on and reject what they
  // shouldn't, and at runtime that a value survives being serialised to JSON unchanged (it's printed by `tsshowcase check`).

  it('Requires only a name in the project information', () => {
    expectTypeOf<{ name: string }>().toExtend<ProjectInformation>();
    // @ts-expect-error The name is required
    const _project: ProjectInformation = { version: '1.0.0' };
  });

  it('Limits documentation kinds to the built-in ones and other', () => {
    expectTypeOf<DocumentationKind>().toEqualTypeOf<'readme' | 'contribute' | 'license' | 'other'>();
  });

  it('Survives a JSON round trip unchanged', () => {
    const host: HostInformation = {
      project: { name: 'host', version: '1.0.0' },
      documentation: [{ path: 'README.md', kind: 'readme', extension: '.md', content: '# Host\n' }],
      code: ['src/index.ts'],
    };
    expect(JSON.parse(JSON.stringify(host))).toEqual(host);
  });
});
