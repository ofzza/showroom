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
import { ChevronDown16Regular, ChevronRight16Regular, Dismiss24Regular, Navigation24Regular } from '@fluentui/react-icons';
import type { ProjectInformation } from '../../host/index.js';
import { isNavigationGroupExpanded, type ShownNavigationItem } from '../navigation/index.js';
import { formatRoute } from '../routing/index.js';
import type { ThemeName } from '../theme/index.js';

// #region Styles

/**
 * Media query matching a narrow (phone) viewport, below the showroom's breakpoint of 768 px: every style that differs on one uses it, so the layout
 * switches through CSS alone, and server-side rendering and the first paint agree
 */
export const NARROW_VIEWPORT = '@media (max-width: 767.98px)';

/**
 * The content's maximum width, in pixels
 */
export const CONTENT_MAX_WIDTH = 960;

/**
 * Width of the inline navigation drawer, in pixels (FluentUI's `small` drawer)
 */
export const NAVIGATION_WIDTH = 320;

/**
 * The layout's maximum width, in pixels: the navigation and the content beside it, centered in the viewport, with the header's contents above them
 */
export const LAYOUT_MAX_WIDTH = NAVIGATION_WIDTH + CONTENT_MAX_WIDTH;

/**
 * Styles of the layout
 */
const _useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  // The border spans the viewport; the contents sit in the centered container, as wide as the body
  header: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  headerContent: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: `${LAYOUT_MAX_WIDTH}px`,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
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
  // The navigation and the content, centered together
  body: { display: 'flex', flexGrow: 1, minHeight: '0', width: '100%', maxWidth: `${LAYOUT_MAX_WIDTH}px`, margin: '0 auto' },
  // Stretched to the page's height, but at most the viewport's (FluentUI's own cap is `100vh`), and kept in view while the page scrolls
  drawer: { position: 'sticky', top: '0', maxHeight: '100dvh', [NARROW_VIEWPORT]: { display: 'none' } },
  navigation: { listStyleType: 'none', margin: '0', padding: '0', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  // A group's items, indented under its caption
  group: { paddingLeft: tokens.spacingHorizontalL, paddingTop: tokens.spacingVerticalS },
  // A group's caption: a button collapsing and expanding it, as wide as the navigation, its chevron before its text
  caption: { justifyContent: 'flex-start', minWidth: '0', padding: '0', fontWeight: tokens.fontWeightSemibold, textAlign: 'left' },
  current: { fontWeight: tokens.fontWeightSemibold },
  main: {
    flexGrow: 1,
    minWidth: '0',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXXL}`,
    maxWidth: `${CONTENT_MAX_WIDTH}px`,
    [NARROW_VIEWPORT]: { padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}` },
  },
});

// #endregion

// #region Navigation

/**
 * Represents the properties of the navigation, and of a list of its items
 */
interface _NavigationProps {
  /**
   * Navigation items
   */
  navigation: ShownNavigationItem[];
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
 * Renders the navigation: its items, with the current page's item marked, and its groups collapsible
 * @param props Properties of the component
 * @returns The rendered navigation
 */
function _Navigation(props: _NavigationProps): ReactNode {
  return (
    <nav aria-label="Documentation">
      <_NavigationList {...props} />
    </nav>
  );
}

/**
 * Renders a list of navigation items
 * @param props Properties of the component, with the class of the list
 * @returns The rendered list
 */
function _NavigationList({ navigation, current, onNavigate, className }: _NavigationProps & { className?: string }): ReactNode {
  const styles = _useStyles();
  return (
    <ul className={mergeClasses(styles.navigation, className)}>
      {navigation.map((item, index) => (
        <li key={`${index}:${item.label}`}>
          {item.kind === 'group' ? (
            <NavigationGroup group={item} current={current} onNavigate={onNavigate} />
          ) : item.kind === 'url' ? (
            <Link href={item.href} target="_blank" rel="noopener noreferrer" title={item.href} onClick={onNavigate}>
              {item.label}
            </Link>
          ) : (
            <Link
              href={item.href}
              title={item.path}
              className={mergeClasses(item.route === current && styles.current)}
              aria-current={item.route === current ? 'page' : undefined}
              onClick={onNavigate}
            >
              {item.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Represents the properties of a navigation group
 */
export interface NavigationGroupProps {
  /**
   * The group
   */
  group: Extract<ShownNavigationItem, { kind: 'group' }>;
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
 * Renders a navigation group: its caption, a button collapsing and expanding it, and its items, indented. It starts expanded, and expands again
 * whenever the page shown changes to one of its items; collapsing it keeps it collapsed until then
 * @param props Properties of the component
 * @returns The rendered group
 */
export function NavigationGroup({ group, current, onNavigate }: NavigationGroupProps): ReactNode {
  const styles = _useStyles();
  // The page shown when the group was collapsed, or null while it is expanded (no effect needed: it is derived on rendering)
  const [collapsedOn, setCollapsedOn] = useState<{ page?: string } | null>(null);
  const expanded = isNavigationGroupExpanded(group, collapsedOn, current);
  return (
    <>
      <Button
        appearance="transparent"
        className={styles.caption}
        icon={expanded ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
        aria-expanded={expanded}
        onClick={() => setCollapsedOn(expanded ? { page: current } : null)}
      >
        {group.label}
      </Button>
      {expanded && <_NavigationList navigation={group.items} current={current} onNavigate={onNavigate} className={styles.group} />}
    </>
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
  navigation: ShownNavigationItem[];
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
        <div className={styles.headerContent}>
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
        </div>
      </header>
      <div className={styles.body}>
        <InlineDrawer open separator size="small" className={styles.drawer}>
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
