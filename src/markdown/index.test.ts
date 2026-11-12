/**
 * Tests of the Markdown module: paths, the showcase marker's grammar, and scanning documentation files
 */

import { describe, expect, it } from 'vitest';
import { getFolder, isAbsoluteUrl, isMarkdownPath, isValidVirtualFileName, parseShowcaseMarker, resolvePath, scanMarkdown, splitLink } from './index.js';

describe('markdown', () => {
  // Tests the Markdown module's pure functions on hand-written paths, markers and Markdown text.

  describe('Paths', () => {
    // Tests the path helpers shared by `check` and the showroom's link resolution.

    it('Recognises Markdown files by their .md extension, in any case', () => {
      expect(isMarkdownPath('README.md')).toBe(true);
      expect(isMarkdownPath('docs/Guide.MD')).toBe(true);
      expect(isMarkdownPath('notes.txt')).toBe(false);
      expect(isMarkdownPath('LICENSE')).toBe(false);
      expect(isMarkdownPath('docs/.md')).toBe(false);
      expect(isMarkdownPath('md')).toBe(false);
    });

    it('Gets the folder of a path', () => {
      expect(getFolder('README.md')).toBe('');
      expect(getFolder('docs/guide.md')).toBe('docs');
      expect(getFolder('a/b/c.md')).toBe('a/b');
    });

    it('Recognises absolute URLs', () => {
      expect(isAbsoluteUrl('https://example.com')).toBe(true);
      expect(isAbsoluteUrl('mailto:someone@example.com')).toBe(true);
      expect(isAbsoluteUrl('//example.com/a')).toBe(true);
      expect(isAbsoluteUrl('docs/guide.md')).toBe(false);
      expect(isAbsoluteUrl('/docs/guide.md')).toBe(false);
      expect(isAbsoluteUrl('#install')).toBe(false);
    });

    it('Splits a link into its URL-decoded path and fragment, noting a query', () => {
      expect(splitLink('docs/my%20notes.md')).toEqual({ path: 'docs/my notes.md', query: false, fragment: false });
      expect(splitLink('guide.md?plain=1#a%20b')).toEqual({ path: 'guide.md', anchor: 'a b', query: true, fragment: true });
      expect(splitLink('#install')).toEqual({ path: '', anchor: 'install', query: false, fragment: true });
      expect(splitLink('guide.md#')).toEqual({ path: 'guide.md', query: false, fragment: true });
      expect(splitLink('%E0%A4%A.md')).toBeUndefined();
    });

    it('Resolves paths against the folder of the file holding them, or against the root', () => {
      expect(resolvePath('README.md', 'docs/guide.md')).toEqual({ path: 'docs/guide.md', isFolder: false });
      expect(resolvePath('docs/guide.md', './other.md')).toEqual({ path: 'docs/other.md', isFolder: false });
      expect(resolvePath('docs/guide.md', '../LICENSE')).toEqual({ path: 'LICENSE', isFolder: false });
      expect(resolvePath('docs/guide.md', '/src/index.ts')).toEqual({ path: 'src/index.ts', isFolder: false });
      expect(resolvePath('docs/guide.md', '..')).toEqual({ path: '', isFolder: true });
      expect(resolvePath('README.md', 'src/')).toEqual({ path: 'src', isFolder: true });
      expect(resolvePath('docs/guide.md', '../../outside.md')).toBeUndefined();
    });
  });

  describe('Showcase markers', () => {
    // Tests parseShowcaseMarker() on markers as written in info strings and link titles.

    it('Parses naked markers, adapters and options', () => {
      expect(parseShowcaseMarker('showcase')).toEqual({ marker: { hasOptions: false } });
      expect(parseShowcaseMarker('showcase=html')).toEqual({ marker: { adapter: 'html', hasOptions: false } });
      expect(parseShowcaseMarker('showcase=my-adapter2')).toEqual({ marker: { adapter: 'my-adapter2', hasOptions: false } });
      expect(parseShowcaseMarker('showcase=ts({ strict: true, "x": [1, 2] })')).toEqual({
        marker: { adapter: 'ts', hasOptions: true, options: { strict: true, x: [1, 2] } },
      });
      expect(parseShowcaseMarker('showcase=ts(false)')).toEqual({ marker: { adapter: 'ts', hasOptions: true, options: false } });
    });

    it('Reads options holding parentheses, and keys after them', () => {
      // The options end at the first ")" that closes valid JSON5 and is followed by a space or the end
      expect(parseShowcaseMarker('showcase=x({ a: "(b) c)" }) file=y')).toEqual({
        marker: { adapter: 'x', hasOptions: true, options: { a: '(b) c)' }, file: 'y' },
      });
    });

    it('Parses the file key', () => {
      expect(parseShowcaseMarker('showcase file=styles.css')).toEqual({ marker: { hasOptions: false, file: 'styles.css' } });
      expect(parseShowcaseMarker('  showcase   file=a.js  ')).toEqual({ marker: { hasOptions: false, file: 'a.js' } });
    });

    it('Rejects invalid adapter names, options and keys', () => {
      expect(parseShowcaseMarker('showcase=').error).toMatch(/^Invalid showcase adapter name ""/);
      expect(parseShowcaseMarker('showcase=React').error).toMatch(/^Invalid showcase adapter name "React"/);
      expect(parseShowcaseMarker('showcase=1x').error).toMatch(/^Invalid showcase adapter name "1x"/);
      expect(parseShowcaseMarker('showcase=x()').error).toMatch(/^Empty showcase options/);
      expect(parseShowcaseMarker('showcase=x( )').error).toMatch(/^Empty showcase options/);
      expect(parseShowcaseMarker('showcase=x({ a: }) ').error).toMatch(/^Invalid showcase options \(/);
      expect(parseShowcaseMarker('showcase=x({ a: 1 }').error).toMatch(/^Invalid showcase options \(no closing "\)"\)/);
      expect(parseShowcaseMarker('showcase=x(1)y').error).toMatch(/^Invalid showcase options/);
      expect(parseShowcaseMarker('showcases').error).toMatch(/^Invalid showcase marker "showcases"/);
      expect(parseShowcaseMarker('showcase of buttons').error).toBe('Unknown key "of" in showcase marker "showcase of buttons"');
      expect(parseShowcaseMarker('showcase size=2').error).toMatch(/^Unknown key "size"/);
      expect(parseShowcaseMarker('showcase file=a file=b').error).toMatch(/^Repeated key "file"/);
      expect(parseShowcaseMarker('showcase file=').error).toMatch(/^The key "file" needs a name/);
      expect(parseShowcaseMarker('showcase file').error).toMatch(/^The key "file" needs a name/);
      expect(parseShowcaseMarker('showcase=x anchor=a').error).toMatch(/^The key "anchor" is reserved for later/);
      expect(parseShowcaseMarker('html').error).toMatch(/^Not a showcase marker/);
    });

    it('Accepts only plain file names for virtual files', () => {
      expect(isValidVirtualFileName('styles.css')).toBe(true);
      expect(isValidVirtualFileName('my file.js')).toBe(true);
      for (const name of ['', '.', '..', 'a/b.js', 'a\\b.js', ' a.js', 'a.js ']) {
        expect(isValidVirtualFileName(name)).toBe(false);
      }
    });
  });

  describe('Scanning', () => {
    // Tests scanMarkdown() on small Markdown documents, each focusing on one kind of embed.

    it('Finds inline showcases and their generated entry points', () => {
      const scan = scanMarkdown(
        'docs/guide.md',
        ['# Guide', '', '```html showcase', '<p>Hi</p>', '```', '', '```TypeScript showcase=ts({ strict: false })', 'log(1);', '```'].join('\n'),
      );
      expect(scan.errors).toEqual([]);
      expect(scan.showcases).toEqual([
        { id: 'docs/guide.md#1', documentation: 'docs/guide.md', line: 3, offset: 9, kind: 'inline', adapter: 'html', entry: 'docs/guide.showcase-1.html' },
        {
          id: 'docs/guide.md#2',
          documentation: 'docs/guide.md',
          line: 7,
          offset: 41,
          kind: 'inline',
          adapter: 'ts',
          options: { strict: false },
          entry: 'docs/guide.showcase-2.ts',
        },
      ]);
      expect(scan.virtualFiles).toEqual([
        { path: 'docs/guide.showcase-1.html', kind: 'entry', content: '<p>Hi</p>', documentation: 'docs/guide.md', line: 3 },
        { path: 'docs/guide.showcase-2.ts', kind: 'entry', content: 'log(1);', documentation: 'docs/guide.md', line: 7 },
      ]);
    });

    it('Maps fence languages to entry point extensions', () => {
      const scan = scanMarkdown('README.md', ['```javascript showcase=x', '```', '~~~htm showcase', '~~~', '```CSS showcase=y', '```'].join('\n'));
      expect(scan.virtualFiles.map((file) => file.path)).toEqual(['README.showcase-1.js', 'README.showcase-2.html', 'README.showcase-3.css']);
    });

    it('Finds resources', () => {
      const scan = scanMarkdown('docs/guide.md', ['```css showcase file=styles.css', 'p {}', '```'].join('\n'));
      expect(scan.showcases).toEqual([]);
      expect(scan.virtualFiles).toEqual([{ path: 'docs/styles.css', kind: 'resource', content: 'p {}', documentation: 'docs/guide.md', line: 1 }]);
    });

    it('Ignores fences without a marker after the language', () => {
      const scan = scanMarkdown(
        'README.md',
        ['```js title="showcase"', '```', '```js', '```', '    showcase indented', '```js highlight showcase', '```'].join('\n'),
      );
      expect(scan).toEqual({ showcases: [], virtualFiles: [], links: [], errors: [] });
    });

    it('Reports markers in the wrong place, or broken', () => {
      const scan = scanMarkdown(
        'README.md',
        [
          '```showcase=html', // 1: no language
          '```',
          '```html showcase=html file=a.html', // 3: file on an entry point
          '```',
          '```css showcase file=a/b.css', // 5: invalid resource name
          '```',
          '```html showcase=Html', // 7: broken marker
          '```',
          '![x](a.png "showcase")', // 9: image
          '',
          '[ref]: ./a.html "showcase"', // 11: reference definition
          '',
          '```a/b showcase=x', // 13: language that can't be an extension
          '```',
        ].join('\n'),
      );
      expect(scan.errors.map((error) => error.line)).toEqual([1, 3, 5, 7, 9, 11, 13]);
      expect(scan.errors[0].message).toMatch(/must follow the code block's language/);
      expect(scan.errors[1].message).toMatch(/can't have a "file" key/);
      expect(scan.errors[2].message).toMatch(/^Invalid resource name "a\/b.css"/);
      expect(scan.errors[3].message).toMatch(/^Invalid showcase adapter name "Html"/);
      expect(scan.errors[4].message).toMatch(/an image can't hold a showcase marker/);
      expect(scan.errors[5].message).toMatch(/a reference definition can't hold a showcase marker/);
      expect(scan.errors[6].message).toMatch(/language "a\/b" can't be a file extension/);
      expect(scan.showcases).toEqual([]);
      expect(scan.virtualFiles).toEqual([]);
    });

    it('Finds linked showcases, numbered with the inline ones', () => {
      const scan = scanMarkdown(
        'docs/guide.md',
        ['See [the demo](./demo.html "showcase") and [another](/examples/other%20one.js \'showcase=x({ a: 1 })\').', '', '```html showcase', '```'].join('\n'),
      );
      expect(scan.errors).toEqual([]);
      expect(scan.showcases.map(({ id, kind, adapter, options, entry, line }) => ({ id, kind, adapter, options, entry, line }))).toEqual([
        { id: 'docs/guide.md#1', kind: 'linked', adapter: 'html', options: undefined, entry: 'docs/demo.html', line: 1 },
        { id: 'docs/guide.md#2', kind: 'linked', adapter: 'x', options: { a: 1 }, entry: 'examples/other one.js', line: 1 },
        { id: 'docs/guide.md#3', kind: 'inline', adapter: 'html', options: undefined, entry: 'docs/guide.showcase-3.html', line: 3 },
      ]);
      expect(scan.links).toEqual([]);
    });

    it('Reports linked showcases whose entry point is not a relative path to a file', () => {
      const scan = scanMarkdown(
        'docs/guide.md',
        [
          '[a](https://example.com/a.html "showcase")',
          '[b](./b.html#top "showcase")',
          '[c](./c.html?x=1 "showcase")',
          '[d](../../d.html "showcase")',
          '[e](./ "showcase")',
          '[f](./f.html "showcase file=f.html")',
          '[g](./g.html "showcase of buttons")',
          '[h](%E0%A4%A.html "showcase")',
        ].join('\n\n'),
      );
      expect(scan.errors.map((error) => error.message)).toEqual([
        'A linked showcase\'s entry point must be a relative path, not "https://example.com/a.html"',
        'A linked showcase\'s entry point can\'t have a query or fragment: "./b.html#top"',
        'A linked showcase\'s entry point can\'t have a query or fragment: "./c.html?x=1"',
        'A linked showcase\'s entry point "../../d.html" is outside the host repository',
        'A linked showcase\'s entry point "./" must name a file, not a folder',
        'A showcase\'s entry point can\'t have a "file" key; a resource\'s marker is "showcase file=<name>", on a code block',
        'Unknown key "of" in showcase marker "showcase of buttons"',
        'A linked showcase\'s entry point "%E0%A4%A.html" can\'t be URL-decoded',
      ]);
      expect(scan.errors.map((error) => error.line)).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    });

    it('Collects links and reference definitions with relative targets', () => {
      const scan = scanMarkdown(
        'README.md',
        [
          '[a](docs/a.md) [b](https://example.com) [c](#top) [d](mailto:x@example.com) <https://example.com> www.example.com',
          '',
          '![image](./image.png) [e][ref] [f](../f.md "a title")',
          '',
          '[ref]: ./ref.md',
        ].join('\n'),
      );
      expect(scan.links).toEqual([
        { href: 'docs/a.md', line: 1 },
        { href: '../f.md', line: 3 },
        { href: './ref.md', line: 5 },
      ]);
    });
  });
});
