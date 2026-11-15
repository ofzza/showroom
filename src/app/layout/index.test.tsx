/**
 * Tests of the showroom's layout
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { ProjectInformation } from '../../host/index.js';
import type { ShownNavigationItem } from '../navigation/index.js';
import type { ThemeName } from '../theme/index.js';
import { CONTENT_MAX_WIDTH, LAYOUT_MAX_WIDTH, Layout, NAVIGATION_WIDTH } from './index.js';

/**
 * The default navigation's items, as getNavigationItems() gives them
 */
const _NAVIGATION: ShownNavigationItem[] = [
  { kind: 'page', label: 'README', href: '#/', route: '#/', path: 'README.md' },
  { kind: 'page', label: 'docs/guide.md', href: '#/docs/guide.md', route: '#/docs/guide.md', path: 'docs/guide.md' },
];

/**
 * A configured navigation's items: nested groups, an anchor and a URL
 */
const _GROUPED: ShownNavigationItem[] = [
  { kind: 'page', label: 'Home', href: '#/', route: '#/' },
  {
    kind: 'group',
    label: 'Guides',
    items: [
      { kind: 'page', label: 'Install', href: '#/docs/guide.md#install', route: '#/docs/guide.md', path: 'docs/guide.md' },
      { kind: 'group', label: 'Deeper', items: [{ kind: 'page', label: 'Deep', href: '#/docs/deep.md', route: '#/docs/deep.md', path: 'docs/deep.md' }] },
    ],
  },
  { kind: 'url', label: 'npm', href: 'https://www.npmjs.com/package/p' },
];

/**
 * Renders the layout around a placeholder page to HTML on the server
 * @param project Project information
 * @param current URL hash of the page shown
 * @param theme Name of the theme in use
 * @param navigation Navigation items
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(project: ProjectInformation, current?: string, theme: ThemeName = 'light', navigation = _NAVIGATION): string {
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>
        <Layout project={project} navigation={navigation} current={current} theme={theme} onThemeChange={() => undefined}>
          <p>The page</p>
        </Layout>
      </FluentProvider>
    </SSRProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('app/layout', () => {
  // Tests the layout by rendering it to HTML with `react-dom/server`, around a placeholder page. Which navigation a viewport shows is switched by
  // media queries alone, which the rendered HTML doesn't apply, so both are rendered in every test.

  it('Shows the project name and version, the theme toggle, the navigation and the page', () => {
    const html = _render({ name: 'my-library', version: '1.2.3' });
    expect(html).toMatch(/<header[^>]*>.*my-library.*1\.2\.3.*Dark theme.*<\/header>/s);
    expect(html).toMatch(/<nav aria-label="Documentation">.*href="#\/"[^>]*>README<\/a>.*href="#\/docs\/guide.md"[^>]*>docs\/guide.md<\/a>.*<\/nav>/s);
    expect(html).toMatch(/<main[^>]*><p>The page<\/p><\/main>/);
  });

  it('Shows no version without one', () => {
    const html = _render({ name: 'my-library' });
    expect(html).toContain('my-library');
    expect(html).not.toContain('fui-Badge');
  });

  it("Marks the current page's navigation item", () => {
    const html = _render({ name: 'p' }, '#/docs/guide.md');
    expect(html).toMatch(/<a [^>]*href="#\/docs\/guide.md"[^>]*aria-current="page"[^>]*>|<a [^>]*aria-current="page"[^>]*href="#\/docs\/guide.md"[^>]*>/);
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(_render({ name: 'p' })).not.toContain('aria-current');
  });

  it('Shows a tooltip with the path of each documentation file', () => {
    expect(_render({ name: 'p' })).toMatch(/<a [^>]*title="docs\/guide.md"[^>]*>docs\/guide.md<\/a>/);
  });

  it('Shows groups expanded, their items nested under a caption button', () => {
    const html = _render({ name: 'p' }, undefined, 'light', _GROUPED);
    expect(html).toMatch(/<button[^>]*aria-expanded="true"[^>]*>.*Guides<\/button><ul[^>]*><li><a [^>]*href="#\/docs\/guide.md#install"[^>]*>Install<\/a>/s);
    expect(html).toMatch(/Deeper<\/button><ul[^>]*><li><a [^>]*>Deep<\/a><\/li><\/ul>/s);
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(2);
  });

  it("Marks a page by its route, whatever its item's anchor", () => {
    const html = _render({ name: 'p' }, '#/docs/guide.md', 'light', _GROUPED);
    expect(html).toMatch(/<a [^>]*aria-current="page"[^>]*>Install<\/a>/);
  });

  it('Opens a URL in a new tab', () => {
    const html = _render({ name: 'p' }, undefined, 'light', _GROUPED);
    expect(html).toMatch(/<a [^>]*href="https:\/\/www.npmjs.com\/package\/p"[^>]*>npm<\/a>/);
    const link = html.match(/<a [^>]*>npm<\/a>/)![0];
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
  });

  it('Shows the theme toggle switched on in the dark theme', () => {
    expect(_render({ name: 'p' }, undefined, 'dark')).toMatch(/<input [^>]*checked=""/);
    expect(_render({ name: 'p' }, undefined, 'light')).not.toMatch(/<input [^>]*checked=""/);
  });

  it("Has a menu button for the narrow viewport's navigation, closed at first", () => {
    const html = _render({ name: 'p' });
    expect(html).toMatch(/<header[^>]*><div[^>]*><button [^>]*aria-label="Open the navigation"[^>]*>/);
    expect(html).toMatch(/<button [^>]*aria-expanded="false"/);
  });

  it('Renders the navigation once while the overlay navigation is closed', () => {
    // The overlay drawer renders nothing while closed, so the inline drawer's navigation is the only one in the page
    expect(_render({ name: 'p' }).match(/<nav /g)).toHaveLength(1);
  });

  it("Links the project's name to the home page, with its full text as a tooltip", () => {
    // The name is cut off with an ellipsis when the header is too narrow for it
    const html = _render({ name: 'a-very-long-project-name' });
    expect(html).toMatch(/<header[^>]*>.*<a [^>]*href="#\/"[^>]*>a-very-long-project-name<\/a>/s);
    expect(html).toMatch(/<a [^>]*title="a-very-long-project-name"[^>]*>/);
  });

  it("Centers the navigation and the content, and the header's contents, at the same maximum width", () => {
    // The width itself is a style (Griffel's class), checked in a browser; the constants keep the two containers in step
    expect([NAVIGATION_WIDTH, CONTENT_MAX_WIDTH, LAYOUT_MAX_WIDTH]).toEqual([320, 960, 1280]);
    expect(_render({ name: 'p' })).toMatch(/<header[^>]*><div[^>]*>.*Dark theme.*<\/div><\/header>/s);
  });
});
