/**
 * Tests of the Markdown module: paths, the showcase marker's grammar, and scanning documentation files
 */

import { describe, expect, it } from 'vitest';
import {
  getFolder,
  getOpeningTitleOffset,
  isAbsoluteUrl,
  isMarkdownPath,
  isValidVirtualFileName,
  parseShowcaseMarker,
  resolvePath,
  scanMarkdown,
  splitLink,
} from './index.js';

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

    it('Parses the inline, block and include keys', () => {
      expect(parseShowcaseMarker('showcase inline')).toEqual({ marker: { hasOptions: false, display: 'inline' } });
      expect(parseShowcaseMarker('showcase=x({ a: 1 }) block include=./a.css')).toEqual({
        marker: { adapter: 'x', hasOptions: true, options: { a: 1 }, display: 'block', include: ['./a.css'] },
      });
      // Paths are URL-decoded as link targets are, after their raw text is judged
      expect(parseShowcaseMarker('showcase include=a.css,../b%20c.ts,d%3F.js').marker?.include).toEqual(['a.css', '../b c.ts', 'd?.js']);
    });

    it('Rejects misused inline, block and include keys', () => {
      expect(parseShowcaseMarker('showcase block=yes').error).toMatch(/^The key "block" takes no value/);
      expect(parseShowcaseMarker('showcase inline=').error).toMatch(/^The key "inline" takes no value/);
      expect(parseShowcaseMarker('showcase inline block').error).toMatch(/^The keys "inline" and "block" can't be used together/);
      expect(parseShowcaseMarker('showcase block block').error).toMatch(/^Repeated key "block"/);
      expect(parseShowcaseMarker('showcase include=a include=b').error).toMatch(/^Repeated key "include"/);
      expect(parseShowcaseMarker('showcase Block').error).toMatch(/^Unknown key "Block"/);
      expect(parseShowcaseMarker('showcase include=').error).toMatch(/^The key "include" needs paths/);
      expect(parseShowcaseMarker('showcase include').error).toMatch(/^The key "include" needs paths/);
      for (const value of ['a,,b', 'a,', ',a']) {
        expect(parseShowcaseMarker(`showcase include=${value}`).error).toMatch(/^Empty path in "include=/);
      }
      for (const path of ['a.css?x', 'a.css#x', '/a.css']) {
        expect(parseShowcaseMarker(`showcase include=${path}`).error).toMatch(/^Invalid included path/);
      }
      expect(parseShowcaseMarker('showcase include=%E0%A4%A').error).toMatch(/^Included path "%E0%A4%A" can't be URL-decoded/);
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

  describe('Opening title', () => {
    // Tests getOpeningTitleOffset(), which the showroom's home page uses to tell if the README opens with its own title.

    it('Finds a level-1 heading the document opens with', () => {
      expect(getOpeningTitleOffset('# Title\n\nText')).toBe(0);
      expect(getOpeningTitleOffset('\n\nTitle\n=====\n')).toBe(2);
    });

    it('Skips raw HTML before the heading', () => {
      // The showroom doesn't render raw HTML (e.g. a README's centred logo), so the heading after it is the first thing shown
      expect(getOpeningTitleOffset('<p align="center">logo</p>\n\n# Title\n')).toBe(28);
    });

    it('Finds none when the document opens otherwise', () => {
      expect(getOpeningTitleOffset('Text\n\n# Title\n')).toBeUndefined();
      expect(getOpeningTitleOffset('## Title\n')).toBeUndefined();
      expect(getOpeningTitleOffset('')).toBeUndefined();
    });
  });

  describe('Scanning', () => {
    // Tests scanMarkdown() on small Markdown documents, each focusing on one kind of embed.

    it('Finds code block showcases and their generated entry points', () => {
      const scan = scanMarkdown(
        'docs/guide.md',
        ['# Guide', '', '```html showcase', '<p>Hi</p>', '```', '', '```TypeScript showcase=ts({ strict: false })', 'log(1);', '```'].join('\n'),
      );
      expect(scan.errors).toEqual([]);
      expect(scan.showcases).toEqual([
        {
          id: 'docs/guide.md#1',
          documentation: 'docs/guide.md',
          line: 3,
          offset: 9,
          kind: 'code-block',
          display: 'block',
          adapter: 'html',
          entry: 'docs/guide.showcase-1.html',
          include: [],
        },
        {
          id: 'docs/guide.md#2',
          documentation: 'docs/guide.md',
          line: 7,
          offset: 41,
          kind: 'code-block',
          display: 'block',
          adapter: 'ts',
          options: { strict: false },
          entry: 'docs/guide.showcase-2.ts',
          include: [],
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
      expect(scan).toEqual({ showcases: [], virtualFiles: [], links: [], images: [], errors: [] });
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

    it('Finds linked showcases, numbered with the code block ones', () => {
      const scan = scanMarkdown(
        'docs/guide.md',
        ['See [the demo](./demo.html "showcase") and [another](/examples/other%20one.js \'showcase=x({ a: 1 })\').', '', '```html showcase', '```'].join('\n'),
      );
      expect(scan.errors).toEqual([]);
      expect(scan.showcases.map(({ id, kind, adapter, options, entry, line }) => ({ id, kind, adapter, options, entry, line }))).toEqual([
        { id: 'docs/guide.md#1', kind: 'link', adapter: 'html', options: undefined, entry: 'docs/demo.html', line: 1 },
        { id: 'docs/guide.md#2', kind: 'link', adapter: 'x', options: { a: 1 }, entry: 'examples/other one.js', line: 1 },
        { id: 'docs/guide.md#3', kind: 'code-block', adapter: 'html', options: undefined, entry: 'docs/guide.showcase-3.html', line: 3 },
      ]);
      expect(scan.links).toEqual([]);
    });

    it('Finds how showcases are shown, and their included files, resolved against the documentation file', () => {
      const scan = scanMarkdown(
        'docs/guide.md',
        [
          'See [a](./a.html "showcase") and [b](./b.html "showcase inline include=./b.css,../shared/theme.css").',
          '',
          '[c](./c.html "showcase block")',
          '',
          '- [d](./d.html "showcase block include=d%20one.css")',
          '',
          '>   [e](./e.html "showcase block")  ',
          '',
          '```html showcase include=./b.css,README.showcase-1.html',
          '```',
        ].join('\n'),
      );
      expect(scan.errors).toEqual([]);
      expect(scan.showcases.map(({ kind, display, include }) => ({ kind, display, include }))).toEqual([
        { kind: 'link', display: 'inline', include: [] },
        { kind: 'link', display: 'inline', include: ['docs/b.css', 'shared/theme.css'] },
        { kind: 'link', display: 'block', include: [] },
        { kind: 'link', display: 'block', include: ['docs/d one.css'] },
        { kind: 'link', display: 'block', include: [] },
        { kind: 'code-block', display: 'block', include: ['docs/b.css', 'docs/README.showcase-1.html'] },
      ]);
    });

    it('Reports the inline, block and include keys where they can not be', () => {
      const errors = (markdown: string) => scanMarkdown('docs/guide.md', markdown).errors.map(({ message }) => message);
      expect(errors('```html showcase block\n```')).toEqual([expect.stringMatching(/^A code block showcase is always shown as a block/)]);
      expect(errors('```html showcase inline\n```')).toEqual([expect.stringMatching(/^A code block showcase is always shown as a block/)]);
      expect(errors('```css showcase file=a.css block\n```')).toEqual([expect.stringMatching(/^A code block showcase is always shown as a block/)]);
      expect(errors('```css showcase file=a.css include=b.css\n```')).toEqual([expect.stringMatching(/^A resource can't include files/)]);
      // A block must be a paragraph's only content, apart from whitespace
      expect(errors('See [c](./c.html "showcase block").')).toEqual(['A linked showcase shown as a block must be alone in its paragraph']);
      expect(errors('[c](./c.html "showcase block") [d](./d.html "showcase")')).toEqual(['A linked showcase shown as a block must be alone in its paragraph']);
      expect(errors('*[c](./c.html "showcase block")*')).toEqual([
        expect.stringMatching(/^A linked showcase shown as a block must be alone in a paragraph, not in a "emphasis" node/),
      ]);
      expect(errors('## [c](./c.html "showcase block")')).toEqual([expect.stringMatching(/not in a "heading" node/)]);
      expect(errors('| x |\n| - |\n| [c](./c.html "showcase block") |')).toEqual([expect.stringMatching(/not in a "tableCell" node/)]);
      expect(errors('Text[^1]\n\n[^1]: [c](./c.html "showcase block")')).toEqual(["A linked showcase shown as a block can't be in a footnote"]);
      // The included files, resolved
      expect(errors('[c](./c.html "showcase include=../../x.css")')).toEqual(['Included file "../../x.css" is outside the host repository']);
      for (const path of ['./css/', '.', '..']) {
        expect(errors(`[c](./c.html "showcase include=${path}")`)).toEqual([`Included file "${path}" must name a file, not a folder`]);
      }
      expect(errors('[c](./c.html "showcase include=c.html")')).toEqual(['Included file "c.html" is the showcase\'s own entry point']);
      expect(errors('```html showcase include=guide.showcase-1.html\n```')).toEqual([
        'Included file "guide.showcase-1.html" is the showcase\'s own entry point',
      ]);
      expect(errors('[c](./c.html "showcase include=./a.css,a.css")')).toEqual(['Included file "docs/a.css" is listed twice']);
      // A showcase with an error is left out, and not numbered, as for any marker error
      const scan = scanMarkdown('docs/guide.md', 'See [c](./c.html "showcase block").\n\n[d](./d.html "showcase block")');
      expect(scan.showcases.map(({ id }) => id)).toEqual(['docs/guide.md#1']);
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

    it('Collects images with relative sources', () => {
      const scan = scanMarkdown(
        'README.md',
        ['![a](./a.png) ![b](https://example.com/b.png) ![c](#c) ![d][ref]', '', 'Text ![e](docs/e%20f.svg "a title")', '', '[ref]: ./ref.png'].join('\n'),
      );
      // An image reference's source is its reference definition, collected as a link
      expect(scan.images).toEqual([
        { href: './a.png', line: 1 },
        { href: 'docs/e%20f.svg', line: 3 },
      ]);
      expect(scan.links).toEqual([{ href: './ref.png', line: 5 }]);
    });
  });
});
