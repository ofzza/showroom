/**
 * Tests of the stack adapter registry
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import { DotNetStackAdapter, getStackAdapter, getStackAdapterNames, TypeScriptStackAdapter, type StackAdapter } from './index.js';

describe('adapters/stack', () => {
  // Tests looking up the built-in stack adapters by name, and that they implement the stack adapter interface.

  it('Lists the built-in stack adapters', () => {
    expect(getStackAdapterNames()).toEqual(['dotnet', 'typescript']);
  });

  it('Gets a stack adapter by name', () => {
    expect(getStackAdapter('typescript')).toBeInstanceOf(TypeScriptStackAdapter);
    expect(getStackAdapter('dotnet')).toBeInstanceOf(DotNetStackAdapter);
  });

  it('Gets a new instance on every call', () => {
    expect(getStackAdapter('typescript')).not.toBe(getStackAdapter('typescript'));
  });

  it('Gets nothing for an unknown name', () => {
    // Includes names inherited from Object.prototype, which a plain property lookup would find
    expect(getStackAdapter('cobol')).toBeUndefined();
    expect(getStackAdapter('toString')).toBeUndefined();
  });

  it('Implements the stack adapter interface', () => {
    expectTypeOf<TypeScriptStackAdapter>().toExtend<StackAdapter>();
    expectTypeOf<DotNetStackAdapter>().toExtend<StackAdapter>();
  });
});
