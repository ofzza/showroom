/**
 * The showcase application's layout: a header with the project's name and version and the theme toggle, the navigation in an inline drawer, and the page
 */

import type { ReactNode } from 'react';
import { Badge, DrawerBody, InlineDrawer, Link, Switch, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { ProjectInformation } from '../../host/index.js';
import type { NavigationItem } from '../navigation/index.js';
import type { ThemeName } from '../theme/index.js';

// #region Styles

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
  },
  name: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  toggle: { marginLeft: 'auto' },
  body: { display: 'flex', flexGrow: 1, minHeight: '0' },
  navigation: { listStyleType: 'none', margin: '0', padding: '0', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  current: { fontWeight: tokens.fontWeightSemibold },
  main: { flexGrow: 1, minWidth: '0', padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXXL}`, maxWidth: '960px' },
});

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
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Text as="span" className={styles.name}>
          {project.name}
        </Text>
        {project.version ? (
          <Badge appearance="tint" color="informative">
            {project.version}
          </Badge>
        ) : null}
        <Switch
          className={styles.toggle}
          label="Dark theme"
          checked={theme === 'dark'}
          onChange={(_event, data) => onThemeChange(data.checked ? 'dark' : 'light')}
        />
      </header>
      <div className={styles.body}>
        <InlineDrawer open separator>
          <DrawerBody>
            <nav aria-label="Documentation">
              <ul className={styles.navigation}>
                {navigation.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={mergeClasses(item.href === current && styles.current)}
                      aria-current={item.href === current ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </DrawerBody>
        </InlineDrawer>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}

// #endregion
