import { describe, expect, expectTypeOf, it } from 'vitest';
import { hello } from './index.js';

describe('index', () => {
  // Tests the `hello` function: its runtime result through `expect`s, and its inferred return type through `expectTypeOf`, which the `unit`
  // project's typecheck pass verifies at compile time

  it('Greets the world by default', () => {
    expect(hello()).toBe('Hello World!');
  });

  it('Greets a given name', () => {
    expect(hello('TypeScript')).toBe('Hello TypeScript!');
  });

  it('Returns a string', () => {
    expectTypeOf(hello()).toEqualTypeOf<string>();
    expect(typeof hello()).toBe('string');
  });
});
