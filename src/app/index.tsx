/**
 * The showroom: a React/FluentUI SPA presenting the shown host information. It is browser code, compiled to `dist/app/` and bundled by Vite, and
 * not re-exported from the package's entry point.
 */

import { StrictMode, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider } from '@fluentui/react-components';
import type { CheckIssue } from '../cli/check/index.js';
import type { ShownHostInformation, ShownShowcase } from './host/index.js';
import { applyShowcaseUrls, getRootReadme } from './host/index.js';
import { IssuesBar } from './issues/index.js';
import { Layout } from './layout/index.js';
import { getNavigationItems } from './navigation/index.js';
import { DocumentationPage, HomePage, NotFoundPage } from './pages/index.js';
import { formatRoute, parseRoute, resolveRoute, scrollToAnchor, useHash } from './routing/index.js';
import { ThemeContext, getInitialTheme, getTheme, storeTheme, useBodyStyle, type ThemeName } from './theme/index.js';

export type { ShownHostInformation } from './host/index.js';

// #region App

/**
 * No issues, the default of the App's, kept as one array
 */
const _NO_ISSUES: CheckIssue[] = [];

/**
 * Represents the properties of the showroom
 */
export interface AppProps {
  /**
   * The shown host information
   */
  data: ShownHostInformation;
  /**
   * The current issues, shown in the issues bar (`serve`'s); none if not given
   */
  issues?: CheckIssue[];
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
export function App({ data, issues = _NO_ISSUES, route, theme: initialTheme }: AppProps): ReactNode {
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
          <IssuesBar issues={issues} />
          {page}
        </Layout>
      </ThemeContext.Provider>
    </FluentProvider>
  );
}

// #endregion

// #region Mount

/**
 * Represents an update of the mounted showroom, as `serve` sends it
 */
export interface ShowroomUpdate {
  /**
   * The shown showcases with their showcase frames' new URLs, every one of them
   */
  showcases?: Pick<ShownShowcase, 'id' | 'url'>[];
  /**
   * The current issues
   */
  issues?: CheckIssue[];
}

/**
 * Represents what the mounted showroom shows, kept outside React so that updates can reach it
 */
export interface MountedState {
  /**
   * The shown host information
   */
  data: ShownHostInformation;
  /**
   * The current issues
   */
  issues: CheckIssue[];
}

/**
 * Represents the store of the mounted showroom's state
 */
export interface ShowroomStore {
  /**
   * Gets the current state
   */
  get: () => MountedState;
  /**
   * Replaces the state, and tells the listeners
   */
  set: (state: MountedState) => void;
  /**
   * Adds a listener of changes, returning a function removing it
   */
  subscribe: (listener: () => void) => () => void;
}

/**
 * Creates the store of the mounted showroom's state
 * @param initial The state to start with
 * @returns The store
 */
export function createShowroomStore(initial: MountedState): ShowroomStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/**
 * Renders the mounted showroom, with the store's latest state, so updates re-render it
 * @param props Properties of the component: the store
 * @returns The showroom
 */
export function MountedShowroom({ store }: { store: ShowroomStore }): ReactNode {
  const { data, issues } = useSyncExternalStore(store.subscribe, store.get, store.get);
  return <App data={data} issues={issues} />;
}

/**
 * Gets the state after an update: showcase frames' new URLs applied to the shown showcases, and the new issues
 * @param state The state before
 * @param update The update
 * @returns The state after; the same object if nothing changed
 */
export function applyUpdate<TState extends MountedState>(state: TState, update: ShowroomUpdate): TState {
  const showcases = update.showcases ? applyShowcaseUrls(state.data.showcases, update.showcases) : state.data.showcases;
  const issues = update.issues ?? state.issues;
  if (showcases === state.data.showcases && issues === state.issues) return state;
  return { ...state, data: showcases === state.data.showcases ? state.data : { ...state.data, showcases }, issues };
}

/**
 * Mounts the showroom into an element of the page
 * @param element Element to render the application into
 * @param data The shown host information
 * @param issues The current issues, shown in the issues bar; none if not given
 * @returns A function updating the mounted showroom: the showcase frames' URLs (only those that changed reload), and the issues
 */
export function mount(element: Element, data: ShownHostInformation, issues: CheckIssue[] = []): (update: ShowroomUpdate) => void {
  const store = createShowroomStore({ data, issues });
  createRoot(element).render(
    <StrictMode>
      <MountedShowroom store={store} />
    </StrictMode>,
  );
  return (update) => store.set(applyUpdate(store.get(), update));
}

// #endregion
