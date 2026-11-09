/**
 * Tests of the showcase application's layout
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { ProjectInformation } from '../../host/index.js';
import type { NavigationItem } from '../navigation/index.js';
import type { ThemeName } from '../theme/index.js';
import { Layout } from './index.js';

/**
 * Renders the layout around a placeholder page to HTML on the server
 * @param project Project information
 * @param current URL hash of the page shown
 * @param theme Name of the theme in use
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(project: ProjectInformation, current?: string, theme: ThemeName = 'light'): string {
  const navigation: NavigationItem[] = [
    { label: 'README', href: '#/' },
    { label: 'docs/guide.md', href: '#/docs/guide.md', path: 'docs/guide.md' },
  ];
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
  // Tests the layout by rendering it to HTML with `react-dom/server`, around a placeholder page.

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

  it('Shows the theme toggle switched on in the dark theme', () => {
    expect(_render({ name: 'p' }, undefined, 'dark')).toMatch(/<input [^>]*checked=""/);
    expect(_render({ name: 'p' }, undefined, 'light')).not.toMatch(/<input [^>]*checked=""/);
  });
});
