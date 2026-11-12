/**
 * The showroom's layout: a header with the project's name and version and the theme toggle, the navigation, and the page. On a wide viewport the
 * navigation is an inline drawer that stays in view; on a narrow one, an overlay drawer opened by the header's menu button.
 */

import { useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  InlineDrawer,
  Link,
  OverlayDrawer,
  Switch,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular, Navigation24Regular } from '@fluentui/react-icons';
import type { ProjectInformation } from '../../host/index.js';
import type { NavigationItem } from '../navigation/index.js';
import { formatRoute } from '../routing/index.js';
import type { ThemeName } from '../theme/index.js';

// #region Styles

/**
 * Media query matching a narrow (phone) viewport, below the showroom's breakpoint of 768 px: every style that differs on one uses it, so the layout
 * switches through CSS alone, and server-side rendering and the first paint agree
 */
export const NARROW_VIEWPORT = '@media (max-width: 767.98px)';

/**
 * Styles of the layout
 */
const _useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    [NARROW_VIEWPORT]: { gap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}` },
  },
  menu: { display: 'none', [NARROW_VIEWPORT]: { display: 'inline-flex' } },
  // A link to the home page, in the header's text colour, on one line, cut off with an ellipsis when the header is too narrow for it (the full name
  // is the element's tooltip)
  name: {
    color: tokens.colorNeutralForeground1,
    ':hover': { color: tokens.colorNeutralForeground1 },
    ':hover:active': { color: tokens.colorNeutralForeground1 },
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    display: 'block',
    minWidth: '0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  version: { flexShrink: 0 },
  toggle: { marginLeft: 'auto' },
  // On a narrow viewport, only the switch shows, leaving the header to the project's name; screen readers still get the label
  toggleLabel: {
    whiteSpace: 'nowrap',
    [NARROW_VIEWPORT]: { position: 'absolute', width: '1px', height: '1px', padding: '0', margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' },
  },
  body: { display: 'flex', flexGrow: 1, minHeight: '0' },
  // Stretched to the page's height, but at most the viewport's (FluentUI's own cap is `100vh`), and kept in view while the page scrolls
  drawer: { position: 'sticky', top: '0', maxHeight: '100dvh', [NARROW_VIEWPORT]: { display: 'none' } },
  navigation: { listStyleType: 'none', margin: '0', padding: '0', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  current: { fontWeight: tokens.fontWeightSemibold },
  main: {
    flexGrow: 1,
    minWidth: '0',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXXL}`,
    maxWidth: '960px',
    [NARROW_VIEWPORT]: { padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}` },
  },
});

// #endregion

// #region Navigation

/**
 * Represents the properties of the navigation
 */
interface _NavigationProps {
  /**
   * Navigation items
   */
  navigation: NavigationItem[];
  /**
   * URL hash of the page shown, or undefined if no item is
   */
  current?: string;
  /**
   * Called when an item is chosen
   */
  onNavigate?: () => void;
}

/**
 * Renders the navigation's list of items, with the current page's item marked
 * @param props Properties of the component
 * @returns The rendered navigation
 */
function _Navigation({ navigation, current, onNavigate }: _NavigationProps): ReactNode {
  const styles = _useStyles();
  return (
    <nav aria-label="Documentation">
      <ul className={styles.navigation}>
        {navigation.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={mergeClasses(item.href === current && styles.current)}
              aria-current={item.href === current ? 'page' : undefined}
              onClick={onNavigate}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// #endregion

// #region Layout

/**
 * Represents the properties of the layout
 */
export interface LayoutProps {
  /**
   * Project information, for the header
   */
  project: ProjectInformation;
  /**
   * Navigation items
   */
  navigation: NavigationItem[];
  /**
   * URL hash of the page shown, to mark its navigation item as the current one, or undefined if no item is
   */
  current?: string;
  /**
   * Name of the theme in use
   */
  theme: ThemeName;
  /**
   * Called when the theme toggle is switched
   */
  onThemeChange: (theme: ThemeName) => void;
  /**
   * The page shown
   */
  children: ReactNode;
}

/**
 * Renders the layout around a page
 * @param props Properties of the component
 * @returns The rendered layout
 */
export function Layout({ project, navigation, current, theme, onThemeChange, children }: LayoutProps): ReactNode {
  const styles = _useStyles();
  // The overlay navigation is open on the page it was opened on: showing another page, however it was reached, closes it
  const [openOn, setOpenOn] = useState<{ page?: string } | undefined>(undefined);
  const menuOpen = openOn !== undefined && openOn.page === current;
  const setMenuOpen = (open: boolean) => setOpenOn(open ? { page: current } : undefined);
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Button
          className={styles.menu}
          appearance="subtle"
          icon={<Navigation24Regular />}
          aria-label="Open the navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        />
        <Link href={formatRoute()} className={styles.name} title={project.name}>
          {project.name}
        </Link>
        {project.version ? (
          <Badge className={styles.version} appearance="tint" color="informative">
            {project.version}
          </Badge>
        ) : null}
        <Switch
          className={styles.toggle}
          label={{ children: 'Dark theme', className: styles.toggleLabel }}
          checked={theme === 'dark'}
          onChange={(_event, data) => onThemeChange(data.checked ? 'dark' : 'light')}
        />
      </header>
      <div className={styles.body}>
        <InlineDrawer open separator className={styles.drawer}>
          <DrawerBody>
            <_Navigation navigation={navigation} current={current} />
          </DrawerBody>
        </InlineDrawer>
        <OverlayDrawer open={menuOpen} onOpenChange={(_event, data) => setMenuOpen(data.open)}>
          <DrawerHeader>
            <DrawerHeaderTitle
              action={<Button appearance="subtle" icon={<Dismiss24Regular />} aria-label="Close the navigation" onClick={() => setMenuOpen(false)} />}
            >
              Documentation
            </DrawerHeaderTitle>
          </DrawerHeader>
          <DrawerBody>
            <_Navigation navigation={navigation} current={current} onNavigate={() => setMenuOpen(false)} />
          </DrawerBody>
        </OverlayDrawer>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}

// #endregion
