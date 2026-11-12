/**
 * Tests of the html showcase adapter
 */

import { describe, expect, it } from 'vitest';
import type { Showcase } from '../../../host/index.js';
import type { ShowcaseAdapter } from '../index.js';
import { HtmlShowcaseAdapter } from './index.js';

/**
 * Creates a showcase for the html showcase adapter
 * @param kind Kind of the showcase
 * @param entry Path of its entry point
 * @param extra Other fields to set (e.g. options)
 * @returns The showcase
 */
function _showcase(kind: Showcase['kind'], entry: string, extra: Partial<Showcase> = {}): Showcase {
  return { id: 'README.md#1', documentation: 'README.md', line: 1, offset: 0, kind, adapter: 'html', entry, ...extra };
}

describe('adapters/showcase/html', () => {
  // Tests the html showcase adapter's static half on hand-made showcases; its build comes with showcase frames in `build`.

  const adapter = new HtmlShowcaseAdapter();

  it('Accepts HTML entry points without options', () => {
    expect(adapter.validate(_showcase('inline', 'README.showcase-1.html'))).toEqual({ errors: [] });
    expect(adapter.validate(_showcase('linked', 'docs/demo.HTM'))).toEqual({ errors: [] });
  });

  it('Rejects other entry points', () => {
    expect(adapter.validate(_showcase('inline', 'README.showcase-1.js')).errors).toEqual(['The html showcase adapter needs an "html" or "htm" code block']);
    expect(adapter.validate(_showcase('linked', 'demo.js')).errors).toEqual(['The html showcase adapter needs a link to an .html or .htm file, not "demo.js"']);
  });

  it('Rejects any options', () => {
    // A marker with options always has them, even `null`, which JSON5 can parse
    expect(adapter.validate(_showcase('inline', 'a.html', { options: null })).errors).toEqual(['The html showcase adapter takes no options']);
  });

  it('Has no host requirements', () => {
    expect((adapter as ShowcaseAdapter).check).toBeUndefined();
  });

  it('Does not build yet', async () => {
    await expect(
      adapter.build({ root: '.', showcase: _showcase('inline', 'a.html'), options: undefined, virtualFiles: [], scratchFolder: '.' }),
    ).rejects.toThrow('not implemented yet');
  });
});
