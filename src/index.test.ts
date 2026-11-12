/**
 * Tests of the entry point's public API
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import * as api from './index.js';
import * as frame from './frame/index.js';
import * as showcases from './showcases/index.js';
import type {
  CheckIssue,
  CheckOptions,
  CheckResult,
  Configuration,
  HostInformation,
  Showcase,
  ShowcaseAdapter,
  ShowcaseBuildRequest,
  ShowcaseBuildResult,
  ShowcaseValidation,
  StackAdapter,
  VirtualFile,
} from './index.js';

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

  it('Never re-exports the showcase builds or the frame script', () => {
    // Both are internal (see AGENTS.md › Exports); the exact list above already leaves them out, this names them
    const names = [...Object.keys(showcases), ...Object.keys(frame)];
    expect(names.filter((name) => name in api)).toEqual([]);
  });

  it('Exports the types', () => {
    expectTypeOf<Awaited<ReturnType<typeof api.check>>>().toEqualTypeOf<CheckResult>();
    expectTypeOf<Parameters<typeof api.check>[1]>().toEqualTypeOf<CheckOptions | undefined>();
    expectTypeOf<CheckOptions['outDir']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<CheckOptions['showcases']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<CheckResult['host']>().toEqualTypeOf<HostInformation | undefined>();
    expectTypeOf<Configuration['stack']>().toEqualTypeOf<string>();
    expectTypeOf<api.TypeScriptStackAdapter>().toExtend<StackAdapter>();
    expectTypeOf<CheckIssue['line']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Configuration['customShowcaseAdapters']>().toEqualTypeOf<Record<string, string> | undefined>();
    expectTypeOf<HostInformation['showcases']>().toEqualTypeOf<Showcase[]>();
    expectTypeOf<HostInformation['virtualFiles']>().toEqualTypeOf<VirtualFile[]>();
    expectTypeOf<ReturnType<ShowcaseAdapter['validate']>>().toEqualTypeOf<ShowcaseValidation | Promise<ShowcaseValidation>>();
    expectTypeOf<Parameters<ShowcaseAdapter['build']>[0]>().toEqualTypeOf<ShowcaseBuildRequest>();
    expectTypeOf<Awaited<ReturnType<ShowcaseAdapter['build']>>>().toEqualTypeOf<ShowcaseBuildResult>();
  });
});
