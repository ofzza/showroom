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
  LinkedFile,
  Showcase,
  ShowcaseAdapter,
  ShowcaseBuildRequest,
  ShowcaseBuildResult,
  ShowcaseCheckContext,
  ShowcaseConsoleLine,
  ShowcaseHostCopy,
  ShowcaseHostCopyContent,
  ShowcaseRecording,
  ShowcaseRun,
  ShowcaseRunOptions,
  ShowcaseValidation,
  TrustRequest,
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
      'DotNetStackAdapter',
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
    expectTypeOf<api.DotNetStackAdapter>().toExtend<StackAdapter>();
    expectTypeOf<Configuration['project']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Parameters<StackAdapter['readProject']>[1]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<CheckIssue['line']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Configuration['customShowcaseAdapters']>().toEqualTypeOf<Record<string, string> | undefined>();
    expectTypeOf<HostInformation['showcases']>().toEqualTypeOf<Showcase[]>();
    expectTypeOf<HostInformation['virtualFiles']>().toEqualTypeOf<VirtualFile[]>();
    expectTypeOf<HostInformation['linkedFiles']>().toEqualTypeOf<LinkedFile[]>();
    expectTypeOf<ReturnType<ShowcaseAdapter['validate']>>().toEqualTypeOf<ShowcaseValidation | Promise<ShowcaseValidation>>();
    expectTypeOf<Parameters<ShowcaseAdapter['build']>[0]>().toEqualTypeOf<ShowcaseBuildRequest>();
    expectTypeOf<Awaited<ReturnType<ShowcaseAdapter['build']>>>().toEqualTypeOf<ShowcaseBuildResult>();
    // Recorded showcases (PLAN-P20 D768)
    expectTypeOf<ShowcaseBuildResult['recording']>().toEqualTypeOf<ShowcaseRecording | undefined>();
    expectTypeOf<ShowcaseRecording['lines']>().toEqualTypeOf<ShowcaseConsoleLine[]>();
    expectTypeOf<ShowcaseBuildRequest['hostCopy']>().toEqualTypeOf<ShowcaseHostCopy | undefined>();
    expectTypeOf<Awaited<ReturnType<ShowcaseHostCopy['run']>>>().toEqualTypeOf<ShowcaseRun>();
    expectTypeOf<Parameters<ShowcaseHostCopy['run']>[2]>().toEqualTypeOf<ShowcaseRunOptions>();
    expectTypeOf<ShowcaseAdapter['hostCopy']>().toEqualTypeOf<ShowcaseHostCopyContent | undefined>();
    expectTypeOf<Parameters<NonNullable<ShowcaseAdapter['check']>>[2]>().toEqualTypeOf<ShowcaseCheckContext>();
    expectTypeOf<CheckOptions['passEnv']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<TrustRequest['recorded']>().toEqualTypeOf<number>();
  });
});
