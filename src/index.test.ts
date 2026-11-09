/**
 * Tests of the entry point's public API
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import * as api from './index.js';
import type { CheckResult, Configuration, HostInformation, StackAdapter } from './index.js';

describe('index', () => {
  // Tests that the entry point re-exports every module's public API: its runtime values through `expect`, and its types through `expectTypeOf`,
  // which the `unit` project's typecheck pass verifies at compile time.

  it('Exports the runtime API', () => {
    expect(Object.keys(api).sort()).toEqual([
      'BUILT_IN_DOCUMENTATION',
      'CONFIGURATION_FILE_NAME',
      'DEFAULT_OUT_DIR',
      'TypeScriptStackAdapter',
      'USAGE',
      'check',
      'getStackAdapter',
      'getStackAdapterNames',
      'main',
      'readConfiguration',
      'validateConfiguration',
    ]);
  });

  it('Exports the types', () => {
    expectTypeOf<Awaited<ReturnType<typeof api.check>>>().toEqualTypeOf<CheckResult>();
    expectTypeOf<CheckResult['host']>().toEqualTypeOf<HostInformation | undefined>();
    expectTypeOf<Configuration['stack']>().toEqualTypeOf<string>();
    expectTypeOf<api.TypeScriptStackAdapter>().toExtend<StackAdapter>();
  });
});
