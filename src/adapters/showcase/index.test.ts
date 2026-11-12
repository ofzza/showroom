/**
 * Tests of the showcase adapter interface
 */

import { describe, expectTypeOf, it } from 'vitest';
import type { ShowcaseAdapter, ShowcaseBuildResult, ShowcaseValidation } from './index.js';

describe('adapters/showcase', () => {
  // The module only declares types: checks at compile time that the interface accepts a minimal showcase adapter, and that its result types tell
  // success from failure.

  it('Needs only validate() and build()', () => {
    const _adapter: ShowcaseAdapter = {
      validate: () => ({ errors: [] }),
      build: async () => ({ errors: [{ message: 'not built' }], reads: [] }),
    };
    // @ts-expect-error build() is required
    const _incomplete: ShowcaseAdapter = { validate: () => ({ errors: [] }) };
  });

  it('Tells a validation with errors from one without', () => {
    expectTypeOf<{ options: { a: 1 }; errors: [] }>().toExtend<ShowcaseValidation>();
    expectTypeOf<{ errors: ['x'] }>().toExtend<ShowcaseValidation>();
    // @ts-expect-error Options come only without errors
    const _invalid: ShowcaseValidation = { options: 1, errors: ['x'] };
  });

  it('Tells a build with files from one with errors', () => {
    expectTypeOf<{ page: 'index.html'; files: []; reads: [] }>().toExtend<ShowcaseBuildResult>();
    expectTypeOf<{ errors: []; reads: [] }>().toExtend<ShowcaseBuildResult>();
    // @ts-expect-error Files come only without errors
    const _invalid: ShowcaseBuildResult = { page: 'index.html', files: [], reads: [], errors: [] };
  });
});
