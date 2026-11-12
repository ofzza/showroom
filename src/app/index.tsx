/**
 * The showroom: a React/FluentUI SPA presenting the shown host information. It is browser code, compiled to `dist/app/` and bundled by Vite, and
 * not re-exported from the package's entry point.
 */

import { StrictMode, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider } from '@fluentui/react-components';
import type { ShownHostInformation } from './host/index.js';
import { getRootReadme } from './host/index.js';
import { Layout } from './layout/index.js';
import { getNavigationItems } from './navigation/index.js';
import { DocumentationPage, HomePage, NotFoundPage } from './pages/index.js';
import { formatRoute, parseRoute, resolveRoute, scrollToAnchor, useHash } from './routing/index.js';
import { ThemeContext, getInitialTheme, getTheme, storeTheme, useBodyStyle, type ThemeName } from './theme/index.js';

export type { ShownHostInformation } from './host/index.js';

// #region App

/**
 * Represents the properties of the showroom
 */
export interface AppProps {
  /**
   * The shown host information
   */
  data: ShownHostInformation;
  /**
   * URL hash of the page to show, in place of the URL's own (e.g. when rendering on the server)
   */
  route?: string;
  /**
   * Name of the theme to start with, in place of the stored or preferred one
   */
  theme?: ThemeName;
}

/**
 * Renders the showroom
 * @param props Properties of the component
 * @returns The rendered application
 */
export function App({ data, route, theme: initialTheme }: AppProps): ReactNode {
  const locationHash = useHash();
  const hash = route ?? locationHash;
  const [theme, setTheme] = useState<ThemeName>(() => initialTheme ?? getInitialTheme());
  const resolved = useMemo(() => resolveRoute(parseRoute(hash), data.documentation), [hash, data.documentation]);
  const navigation = useMemo(() => getNavigationItems(data.documentation), [data.documentation]);
  const redirect = resolved.page === 'not-found' ? undefined : resolved.redirect;
  const anchor = resolved.page === 'not-found' ? undefined : resolved.anchor;
  useBodyStyle(theme);

  // Replace a route that isn't a page's own (e.g. `#/README.md`) with the page's, without adding to the history
  useEffect(() => {
    if (redirect) {
      window.location.replace(redirect);
    }
  }, [redirect]);

  // Scroll to the route's heading, or to the top of a newly shown page
  useEffect(() => {
    if (!redirect) {
      scrollToAnchor(anchor);
    }
  }, [hash, redirect, anchor]);

  /**
   * Switches the theme, and keeps the choice
   * @param name Name of the theme
   */
  const onThemeChange = (name: ThemeName) => {
    setTheme(name);
    storeTheme(name);
  };

  let page: ReactNode;
  let current: string | undefined;
  switch (resolved.page) {
    case 'home':
      page = <HomePage project={data.project} readme={getRootReadme(data.documentation)} documentation={data.documentation} showcases={data.showcases} />;
      current = formatRoute();
      break;
    case 'documentation':
      page = <DocumentationPage file={resolved.file} documentation={data.documentation} showcases={data.showcases} />;
      current = formatRoute(resolved.file.path);
      break;
    case 'not-found':
      page = <NotFoundPage />;
      break;
  }

  return (
    <FluentProvider theme={getTheme(theme)}>
      <ThemeContext.Provider value={theme}>
        <Layout project={data.project} navigation={navigation} current={current} theme={theme} onThemeChange={onThemeChange}>
          {page}
        </Layout>
      </ThemeContext.Provider>
    </FluentProvider>
  );
}

// #endregion

// #region Mount

/**
 * Mounts the showroom into an element of the page
 * @param element Element to render the application into
 * @param data The shown host information
 */
export function mount(element: Element, data: ShownHostInformation): void {
  createRoot(element).render(
    <StrictMode>
      <App data={data} />
    </StrictMode>,
  );
}

// #endregion
