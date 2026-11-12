/**
 * Tests of the showroom
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SSRProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components';
import type { ThemeName } from './theme/index.js';
import { App, MountedShowroom, applyUpdate, createShowroomStore, mount, type ShownHostInformation } from './index.js';

/**
 * Shown host information of a small host repository
 */
const _DATA: ShownHostInformation = {
  project: { name: 'my-library', version: '1.2.3', description: 'A library' },
  documentation: [
    { path: 'LICENSE', kind: 'license', extension: '', content: 'MIT License' },
    { path: 'README.md', kind: 'readme', extension: '.md', content: '# Welcome\n\nSee the [guide](docs/guide.md).' },
    { path: 'docs/guide.md', kind: 'other', extension: '.md', content: '# Guide\n\n## Install' },
  ],
  showcases: [],
};

/**
 * Renders the showroom to HTML on the server
 * @param route URL hash of the page to show
 * @param theme Name of the theme to start with
 * @param data The shown host information
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(route?: string, theme?: ThemeName, data: ShownHostInformation = _DATA): string {
  return renderToString(
    <SSRProvider>
      <App data={data} route={route} theme={theme} />
    </SSRProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('app', () => {
  // Smoke tests of the whole showroom, rendered to HTML with `react-dom/server` (never through mount(), which needs a DOM), with injected
  // routes and themes, so every page and both themes are covered.

  it('Shows the home page by default', () => {
    const html = _render();
    // The README opens with its own title, which replaces the project's name
    expect(html).not.toMatch(/<h1 [^>]*>my-library<\/h1>/);
    expect(html).toContain('<h1 id="welcome">Welcome</h1>');
    expect(html).toMatch(/<a [^>]*href="#\/docs\/guide.md"[^>]*>guide<\/a>/);
    expect(html).toMatch(/<a [^>]*aria-current="page"[^>]*>README<\/a>|<a [^>]*href="#\/"[^>]*aria-current="page"[^>]*>/);
  });

  it('Lists README (the home page), LICENSE, then every other documentation file in the navigation', () => {
    const navigation = _render().match(/<nav [^>]*>.*<\/nav>/s)?.[0] ?? '';
    expect([...navigation.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((match) => match[1])).toEqual(['README', 'LICENSE', 'docs/guide.md']);
  });

  it("Shows a documentation file's page", () => {
    const html = _render('#/docs/guide.md#install');
    expect(html).toContain('<h1 id="guide">Guide</h1>');
    expect(html).toContain('<h2 id="install">Install</h2>');
    expect(html).not.toContain('<h1 id="welcome">');
  });

  it("Shows the home page for the root README's own route", () => {
    expect(_render('#/README.md')).toContain('<h1 id="welcome">Welcome</h1>');
  });

  it('Shows the not-found page for any other route', () => {
    expect(_render('#/docs/missing.md')).toContain('Page not found');
    expect(_render('#nowhere')).toContain('Page not found');
  });

  it('Renders in either theme', () => {
    expect(_render(undefined, 'light')).toContain(`--colorNeutralBackground1: ${webLightTheme.colorNeutralBackground1};`);
    const dark = _render(undefined, 'dark');
    expect(dark).toContain(`--colorNeutralBackground1: ${webDarkTheme.colorNeutralBackground1};`);
    expect(dark).toMatch(/<input [^>]*checked=""/);
  });

  it('Shows only the project information without a root README', () => {
    const html = _render(undefined, undefined, { project: { name: 'bare' }, documentation: [], showcases: [] });
    expect(html).toMatch(/<h1 [^>]*>bare<\/h1>/);
    expect(html).not.toContain('<h1 id=');
  });

  it('Shows showcase frames in the theme, on the page of their documentation file', () => {
    const content = '# Guide\n\n```html showcase\n<p>x</p>\n```';
    const data: ShownHostInformation = {
      ..._DATA,
      documentation: [..._DATA.documentation.slice(0, 2), { path: 'docs/guide.md', kind: 'other', extension: '.md', content }],
      showcases: [
        { id: 'docs/guide.md#1', documentation: 'docs/guide.md', offset: content.indexOf('```'), url: 'showcases/docs/guide.md/1/index.html?hash=0123abcd' },
      ],
    };
    expect(_render('#/docs/guide.md', 'dark', data)).toMatch(/<iframe [^>]*src="showcases\/docs\/guide.md\/1\/index.html\?hash=0123abcd&amp;theme=dark"/);
    expect(_render(undefined, 'dark', data)).not.toContain('<iframe');
  });

  it('Exports mount()', () => {
    // mount() needs a DOM, which the tests don't have (see AGENTS.md › Testing); this only guards its export, which `main.ts` relies on
    expect(typeof mount).toBe('function');
  });

  it('Shows the issues bar above the page, only with issues', () => {
    const html = _render(undefined, undefined, _DATA);
    expect(html).not.toContain('role="group"');
    const withIssues = renderToString(
      <SSRProvider>
        <App data={_DATA} issues={[{ severity: 'error', message: 'Broke', path: 'README.md', line: 3 }]} />
      </SSRProvider>,
    ).replaceAll('<!-- -->', '');
    expect(withIssues).toContain('1 error');
    expect(withIssues.indexOf('Broke')).toBeLessThan(withIssues.indexOf('<h1 id="welcome">'));
  });

  describe('Updates', () => {
    // What serve's events change in the mounted showroom: the store's state, and the showroom rendered from it.

    const showcase = { id: 'README.md#1', documentation: 'README.md', offset: 0, url: 'showcases/README.md/1/index.html?hash=00000001' };
    const state = { data: { ..._DATA, showcases: [showcase] }, issues: [] };

    it("Applies showcase frames' new URLs, keeping the rest", () => {
      const next = applyUpdate(state, { showcases: [{ id: 'README.md#1', url: 'showcases/README.md/1/index.html?hash=00000002' }] });
      expect(next.data.showcases).toEqual([{ ...showcase, url: 'showcases/README.md/1/index.html?hash=00000002' }]);
      expect(next.data.documentation).toBe(state.data.documentation);
      expect(next.issues).toBe(state.issues);
    });

    it('Applies the new issues', () => {
      const issues = [{ severity: 'warning' as const, message: 'Several' }];
      expect(applyUpdate(state, { issues })).toEqual({ ...state, issues });
    });

    it('Keeps the state when nothing changed', () => {
      expect(applyUpdate(state, { showcases: [{ id: 'README.md#1', url: showcase.url }] })).toBe(state);
      expect(applyUpdate(state, {})).toBe(state);
    });

    it('Renders the latest state of the store, and tells its listeners of changes', () => {
      const store = createShowroomStore(state);
      let told = 0;
      const unsubscribe = store.subscribe(() => told++);
      store.set({ ...state, issues: [{ severity: 'error', message: 'Broke' }] });
      unsubscribe();
      store.set(state);
      expect(told).toBe(1);
      store.set({ ...state, issues: [{ severity: 'error', message: 'Broke' }] });
      const html = renderToString(
        <SSRProvider>
          <MountedShowroom store={store} />
        </SSRProvider>,
      );
      expect(html).toContain('Broke');
    });
  });
});
