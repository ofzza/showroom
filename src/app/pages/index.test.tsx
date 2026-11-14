/**
 * Tests of the showroom's pages
 */

import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { DocumentationFile, ProjectInformation } from '../../host/index.js';
import { scanMarkdown } from '../../markdown/index.js';
import { DocumentationPage, HomePage, NotFoundPage } from './index.js';
import type { ShownShowcase } from '../host/index.js';

/**
 * Renders a page to HTML on the server
 * @param page The page
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(page: ReactNode): string {
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>{page}</FluentProvider>
    </SSRProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('app/pages', () => {
  // Tests each page by rendering it to HTML with `react-dom/server`, with hand-made project information and documentation files.

  const project: ProjectInformation = {
    name: 'my-library',
    version: '1.2.3',
    description: 'A library',
    license: 'MIT',
    author: 'Jane Doe',
    homepage: 'https://example.com',
    repository: 'git+https://example.com/my-library.git',
  };
  const readme: DocumentationFile = { path: 'README.md', kind: 'readme', extension: '.md', content: '# Welcome\n\nHello.' };
  const license: DocumentationFile = { path: 'LICENSE', kind: 'license', extension: '', content: 'MIT License\n\n<b>not HTML</b> *not Markdown*' };
  const documentation = [license, readme];

  describe('HomePage', () => {
    // The project information and the root README: the README's opening level-1 heading as the title, with the project information right after it,
    // or else the project's name as the title, then the project information, then the README.

    it("Shows the README's opening heading as the title, then the project information, then the rest of the README", () => {
      const html = _render(<HomePage project={project} readme={readme} documentation={documentation} />);
      expect(html).not.toContain('my-library</h1>');
      expect(html.match(/<h1 /g)).toHaveLength(1);
      for (const text of ['A library', 'Version', '1.2.3', 'License', 'MIT', 'Author', 'Jane Doe']) {
        expect(html).toContain(text);
      }
      expect(html).toMatch(/<a [^>]*href="https:\/\/example.com"[^>]*>https:\/\/example.com<\/a>/);
      expect(html.indexOf('<h1 id="welcome">Welcome</h1>')).toBeLessThan(html.indexOf('A library'));
      expect(html.indexOf('Jane Doe')).toBeLessThan(html.indexOf('Hello.'));
    });

    it("Shows the project's name as the title, then the project information, then a README opening otherwise", () => {
      for (const content of ['Hello.\n\n# Welcome', '## Welcome\n\nHello.']) {
        const html = _render(<HomePage project={project} readme={{ ...readme, content }} documentation={documentation} />);
        expect(html).toMatch(/<h1 [^>]*>my-library<\/h1>/);
        expect(html.indexOf('my-library</h1>')).toBeLessThan(html.indexOf('A library'));
        expect(html.indexOf('Jane Doe')).toBeLessThan(html.indexOf('Hello.'));
      }
    });

    it("Places the README's showcase frames after its opening heading too", () => {
      // The README is still rendered whole, so showcase frames placed by their offsets in it still find their place
      const content = '# Welcome\n\n```html showcase\n<b>Hi</b>\n```\n';
      const [found] = scanMarkdown('README.md', content).showcases;
      const showcases: ShownShowcase[] = [
        { id: found!.id, documentation: 'README.md', offset: found!.offset, display: 'block', tabs: [], url: 'showcases/README.md/1/index.html?hash=00000001' },
      ];
      const html = _render(<HomePage project={project} readme={{ ...readme, content }} documentation={documentation} showcases={showcases} />);
      expect(html.indexOf('Jane Doe')).toBeLessThan(html.indexOf('<iframe'));
      expect(html).toContain('showcases/README.md/1/index.html?hash=00000001');
    });

    it('Links a git+ repository URL to its HTTP(S) URL, showing it as written', () => {
      const html = _render(<HomePage project={project} documentation={documentation} />);
      expect(html).toMatch(/<a [^>]*href="https:\/\/example.com\/my-library.git"[^>]*>git\+https:\/\/example.com\/my-library.git<\/a>/);
    });

    it('Shows only the fields the project information has, and no README without one', () => {
      const html = _render(<HomePage project={{ name: 'bare' }} documentation={[]} />);
      expect(html).toMatch(/<h1 [^>]*>bare<\/h1>/);
      expect(html).not.toContain('Version');
      expect(html).not.toContain('<dt');
      expect(html).not.toContain('<a ');
    });

    it('Shows a project information value that is no HTTP(S) URL as text', () => {
      const html = _render(<HomePage project={{ name: 'p', repository: 'github:me/p' }} documentation={[]} />);
      expect(html).toContain('github:me/p');
      expect(html).not.toContain('<a ');
    });
  });

  describe('DocumentationPage', () => {
    // A documentation file's path, then its content, as Markdown or as plain text by its extension.

    it('Shows a .md file as Markdown', () => {
      const guide: DocumentationFile = { path: 'docs/guide.md', kind: 'other', extension: '.md', content: '## Install' };
      const html = _render(<DocumentationPage file={guide} documentation={[guide]} />);
      expect(html).toContain('docs/guide.md');
      expect(html).toContain('<h2 id="install">Install</h2>');
    });

    it('Shows any other file as plain text, escaped', () => {
      const html = _render(<DocumentationPage file={license} documentation={documentation} />);
      expect(html).toMatch(/<pre [^>]*>MIT License\n\n&lt;b&gt;not HTML&lt;\/b&gt; \*not Markdown\*<\/pre>/);
    });
  });

  it('Shows the not-found page with a link home', () => {
    const html = _render(<NotFoundPage />);
    expect(html).toContain('Page not found');
    expect(html).toMatch(/<a [^>]*href="#\/"[^>]*>Go to the home page<\/a>/);
  });
});
