/**
 * The code sidebar: a panel opening from the right over the showroom, showing a text linked file's content, fetched when it opens, highlighted with
 * line numbers, under its name, with a link opening the file in a new tab, and a close button; for a linked showcase shown inline with included
 * files, or a code pane, a tab per file, each marked with its issues. Also what the code pane shares with it: fetching a linked file by its URL, the
 * tab list, a tab's content, and the tabs' marks.
 */

import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Button,
  DrawerBody,
  DrawerHeader,
  Link,
  MessageBar,
  MessageBarBody,
  OverlayDrawer,
  Spinner,
  Tab,
  TabList,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular, DismissCircle12Filled, Open16Regular, Warning12Filled } from '@fluentui/react-icons';
import type { DocumentationFile, LinkedFile } from '../../host/index.js';
import { getLanguage, getLinkedFileUrl } from '../../linked-files/index.js';
import { getLineMarkers, HighlightedCode, NO_MARKERS, type LineMarkers } from '../code/index.js';
import type { ShownShowcase, ShownTab } from '../host/index.js';

// #region Content

/**
 * Represents the content of a linked file shown in the code sidebar or a tab: being fetched, fetched, or failed to fetch
 */
export type LinkedFileContent =
  | {
      /**
       * Being fetched
       */
      status: 'loading';
    }
  | {
      /**
       * Fetched
       */
      status: 'loaded';
      /**
       * The file's text
       */
      text: string;
    }
  | {
      /**
       * Failed to fetch
       */
      status: 'failed';
      /**
       * Why
       */
      message: string;
    };

/**
 * Fetches a linked file's text, never from the cache, so `serve` shows the file as it is now
 * @param url URL of the linked file, relative to the showroom's page (`files/<path>`, maybe with its hash as its query)
 * @param signal Aborts the fetch
 * @returns The content fetched, or why it failed
 */
export async function fetchLinkedFile(url: string, signal?: AbortSignal): Promise<LinkedFileContent> {
  try {
    const response = await fetch(url, { cache: 'no-store', signal });
    if (!response.ok) {
      const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
      return { status: 'failed', message: `The file couldn't be loaded (${status}).` };
    }
    return { status: 'loaded', text: await response.text() };
  } catch (err) {
    return { status: 'failed', message: `The file couldn't be loaded (${(err as Error).message}).` };
  }
}

/**
 * Gets the content of a linked file by its URL, fetched the first time the URL is asked for, and kept for the component's life by URL, so a tab
 * shown again isn't fetched again, and a new URL (a changed file's new hash) is
 * @param url URL of the linked file to show, if any
 * @returns Its content
 */
export function useLinkedFileContent(url: string | undefined): LinkedFileContent {
  const [fetched, setFetched] = useState<ReadonlyMap<string, LinkedFileContent>>(() => new Map());
  useEffect(() => {
    if (url === undefined || fetched.has(url)) return;
    const controller = new AbortController();
    void fetchLinkedFile(url, controller.signal).then((content) => {
      if (!controller.signal.aborted) setFetched((previous) => new Map(previous).set(url, content));
    });
    return () => controller.abort();
  }, [url, fetched]);
  return (url !== undefined ? fetched.get(url) : undefined) ?? { status: 'loading' };
}

/**
 * Gets the URL a tab's content is fetched from: a text linked file's; none for any other tab, whose content needs no fetch
 * @param tab The tab
 * @returns The URL, or undefined
 */
export function getFetchedTabUrl(tab: ShownTab | undefined): string | undefined {
  return tab?.source.kind === 'file' && tab.source.text ? tab.source.url : undefined;
}

/**
 * Gets a tab's text, when it is at hand: a virtual or documentation file's content, or a text linked file's once fetched
 * @param tab The tab
 * @param documentation The shown documentation files
 * @param content The content fetched for a text linked file's tab (see getFetchedTabUrl())
 * @returns The text, or undefined while it loads, when it failed, or for a file that can't be shown
 */
export function getShownTabText(tab: ShownTab | undefined, documentation: DocumentationFile[], content: LinkedFileContent): string | undefined {
  switch (tab?.source.kind) {
    case 'virtual':
      return tab.source.content;
    case 'documentation':
      return documentation.find((file) => file.path === tab.path)?.content;
    case 'file':
      return tab.source.text && content.status === 'loaded' ? content.text : undefined;
    default:
      return undefined;
  }
}

/**
 * Says that a tab's file can't be shown as text, beside a link opening it
 */
export const NOT_TEXT_MESSAGE = "This file can't be shown here.";

/**
 * Says that a tab's file isn't copied into the showroom (`check` warned why)
 */
export const MISSING_FILE_MESSAGE = "This file isn't copied into the showroom.";

/**
 * Says that a tab's documentation file isn't in the showroom
 */
export const MISSING_DOCUMENTATION_MESSAGE = "This documentation file isn't in the showroom.";

/**
 * Represents the properties of a linked file's content in the code sidebar
 */
export interface LinkedFileViewProps {
  /**
   * POSIX-style path of the file, relative to the host repository's root, whose extension gives the highlighting language
   */
  path: string;
  /**
   * Its content
   */
  content: LinkedFileContent;
  /**
   * True to fill its parent (see CodeBlockProps' `fill`)
   */
  fill?: boolean;
  /**
   * False to leave out the code block's copy button (see CodeBlockProps' `copy`)
   */
  copy?: boolean;
  /**
   * True for a showcase view (see CodeBlockProps' `view`)
   */
  view?: boolean;
  /**
   * The markers of its lines (see CodeBlockProps' `markers`)
   */
  markers?: LineMarkers;
}

/**
 * Renders a linked file's content: a spinner while it is fetched, then the content highlighted with line numbers, or why it failed
 * @param props Properties of the component
 * @returns The rendered content
 */
export function LinkedFileView({ path, content, fill, copy, view, markers }: LinkedFileViewProps): ReactNode {
  switch (content.status) {
    case 'loading':
      return <Spinner label="Loading…" />;
    case 'failed':
      return (
        <MessageBar intent="error">
          <MessageBarBody>{content.message}</MessageBarBody>
        </MessageBar>
      );
    case 'loaded':
      return <HighlightedCode content={content.text} language={getLanguage(path)} fill={fill} copy={copy} view={view} markers={markers} />;
  }
}

/**
 * Represents the properties of a tab's content
 */
export interface ShownTabViewProps {
  /**
   * The tab
   */
  tab: ShownTab;
  /**
   * The shown documentation files, holding a documentation file's content
   */
  documentation: DocumentationFile[];
  /**
   * The content fetched for a text linked file's tab (see getFetchedTabUrl()); ignored for any other tab
   */
  content: LinkedFileContent;
  /**
   * True to fill its parent (see CodeBlockProps' `fill`)
   */
  fill?: boolean;
  /**
   * False to leave out the code block's copy button (see CodeBlockProps' `copy`)
   */
  copy?: boolean;
  /**
   * True for a showcase view (see CodeBlockProps' `view`)
   */
  view?: boolean;
  /**
   * The markers of its lines (see CodeBlockProps' `markers`)
   */
  markers?: LineMarkers;
}

/**
 * Renders a tab's content: a virtual or documentation file's content highlighted, a text linked file's as fetched, or a message saying why the file
 * can't be shown (with a link opening it, for a linked file that isn't text)
 * @param props Properties of the component
 * @returns The rendered content
 */
export function ShownTabView({ tab, documentation, content, fill, copy, view, markers }: ShownTabViewProps): ReactNode {
  const { source } = tab;
  switch (source.kind) {
    case 'virtual':
      return <HighlightedCode content={source.content} language={tab.language} fill={fill} copy={copy} view={view} markers={markers} />;
    case 'documentation': {
      const file = documentation.find((candidate) => candidate.path === tab.path);
      return file ? (
        <HighlightedCode content={file.content} language={tab.language} fill={fill} copy={copy} view={view} markers={markers} />
      ) : (
        _message(MISSING_DOCUMENTATION_MESSAGE)
      );
    }
    case 'file':
      return source.text ? (
        <LinkedFileView path={tab.path} content={content} fill={fill} copy={copy} view={view} markers={markers} />
      ) : (
        _message(NOT_TEXT_MESSAGE, <NewTabLink href={source.url} />)
      );
    case 'missing':
      return _message(MISSING_FILE_MESSAGE);
  }
}

/**
 * Styles of the link opening a file in a new tab
 */
const _useLinkStyles = makeStyles({
  link: { display: 'inline-flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXS },
});

/**
 * Renders the link opening a file in a new tab, "Open in a new tab", with an "open" icon after its text (hidden from screen readers, as the text
 * says it)
 * @param props Properties of the component: the file's URL
 * @returns The link
 */
export function NewTabLink({ href }: { href: string }): ReactNode {
  const styles = _useLinkStyles();
  return (
    <Link className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
      Open in a new tab
      <Open16Regular aria-hidden="true" />
    </Link>
  );
}

/**
 * Renders a message in place of a tab's content
 * @param text The message
 * @param action A link after it, if any
 * @returns The message
 */
function _message(text: string, action?: ReactNode): ReactNode {
  return (
    <MessageBar intent="info">
      <MessageBarBody>
        {text} {action}
      </MessageBarBody>
    </MessageBar>
  );
}

// #endregion

// #region Tabs

/**
 * Represents a tab's marks: the markers of its lines, and the most serious severity among its file's issues, if it has any
 */
export interface TabMarks {
  /**
   * The markers of its lines
   */
  markers: LineMarkers;
  /**
   * The most serious severity among its file's issues (with a line or not), if it has any
   */
  severity?: 'error' | 'warning';
}

/**
 * Gets the markers of a showcase's Markdown source (its `markdown` view, and its Markdown tab): a code block showcase's entry point's issues, one
 * line below, after the fence's opening line; none for a linked showcase, whose Markdown source is its link
 * @param showcase The shown showcase
 * @returns The markers
 */
export function getMarkdownMarkers(showcase: Pick<ShownShowcase, 'tabs' | 'entryTab' | 'issues'>): LineMarkers {
  const entry = showcase.tabs[showcase.entryTab];
  return entry?.source.kind === 'virtual' ? getLineMarkers(showcase.issues, entry.path, 1) : NO_MARKERS;
}

/**
 * Gets the marks of a showcase's tabs from its issues: each file's issues; the Markdown tab (wherever `include=` places it) a code block
 * showcase's entry point's issues, one line below, after the fence's opening line
 * @param showcase The shown showcase
 * @returns The marks, one per tab
 */
export function getTabMarks(showcase: Pick<ShownShowcase, 'tabs' | 'entryTab' | 'issues'>): TabMarks[] {
  const entry = showcase.tabs[showcase.entryTab];
  return showcase.tabs.map((tab) => {
    const markdown = tab.markdown === true;
    if (markdown && entry?.source.kind !== 'virtual') return { markers: NO_MARKERS };
    const path = markdown ? entry!.path : tab.path;
    const issues = showcase.issues.filter((issue) => issue.path === path);
    const severity = issues.some((issue) => issue.severity === 'error') ? 'error' : issues.length ? 'warning' : undefined;
    return { markers: markdown ? getMarkdownMarkers(showcase) : getLineMarkers(issues, path), ...(severity ? { severity } : {}) };
  });
}

/**
 * Styles of the tab list
 */
const _useTabStyles = makeStyles({
  error: { color: tokens.colorPaletteRedForeground1 },
  warning: { color: tokens.colorPaletteMarigoldForeground1 },
});

/**
 * Gets the id of a tab's element, by which its tab panel is labelled
 * @param prefix The tab list's own prefix (from `useId()`)
 * @param index The tab's index
 * @returns The id
 */
export function getTabId(prefix: string, index: number): string {
  return `${prefix}-tab-${index}`;
}

/**
 * Represents the properties of a tab list
 */
export interface ShownTabListProps {
  /**
   * The tabs
   */
  tabs: ShownTab[];
  /**
   * Index of the selected tab
   */
  selected: number;
  /**
   * Selects a tab
   */
  onSelect: (index: number) => void;
  /**
   * The prefix of its tabs' ids (see getTabId())
   */
  idPrefix: string;
  /**
   * Its class name
   */
  className?: string;
  /**
   * The tabs' marks (see getTabMarks()); none by default
   */
  marks?: readonly TabMarks[];
}

/**
 * Renders a tab list of a showcase's files (FluentUI's `TabList`), each tab labelled with its label, its full path as its tooltip, and a small ✗
 * or ⚠ icon before a tab whose file has issues
 * @param props Properties of the component
 * @returns The tab list
 */
export function ShownTabList({ tabs, selected, onSelect, idPrefix, className, marks = [] }: ShownTabListProps): ReactNode {
  const styles = _useTabStyles();
  return (
    <TabList className={className} size="small" selectedValue={selected} onTabSelect={(_event, data) => onSelect(data.value as number)}>
      {tabs.map((tab, index) => {
        const severity = marks[index]?.severity;
        const icon =
          severity === 'error' ? (
            <DismissCircle12Filled className={styles.error} aria-label="Has errors" />
          ) : severity === 'warning' ? (
            <Warning12Filled className={styles.warning} aria-label="Has warnings" />
          ) : undefined;
        return (
          <Tab key={tab.path} id={getTabId(idPrefix, index)} value={index} title={tab.path} icon={icon} data-tab-severity={severity}>
            {tab.label}
          </Tab>
        );
      })}
    </TabList>
  );
}

// #endregion

// #region Code sidebar

/**
 * The code sidebar's width, as a share of the viewport's
 */
export const CODE_SIDEBAR_WIDTH = '66vw';

/**
 * The code sidebar's minimum width, in pixels, unless the viewport is narrower
 */
export const CODE_SIDEBAR_MIN_WIDTH = 400;

/**
 * The code sidebar's maximum width, in pixels
 */
export const CODE_SIDEBAR_MAX_WIDTH = 1200;

/**
 * Styles of the code sidebar
 */
const _useStyles = makeStyles({
  // Switched by CSS alone: never wider than the viewport, so it fills a phone's
  drawer: {
    width: `clamp(min(${CODE_SIDEBAR_MIN_WIDTH}px, 100vw), ${CODE_SIDEBAR_WIDTH}, min(${CODE_SIDEBAR_MAX_WIDTH}px, 100vw))`,
    maxWidth: '100vw',
  },
  // The title (or the tab list) takes the room left by the link and the close button
  header: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalM, minWidth: '0' },
  title: {
    flex: '1 1 auto',
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  tabs: { flex: '1 1 auto', minWidth: '0', overflowX: 'auto' },
  actions: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, flexShrink: 0 },
});

/**
 * Represents what the code sidebar shows: the file alone, or the selected tab
 */
export interface SidebarView {
  /**
   * The selected tab, when the code sidebar shows tabs
   */
  tab?: ShownTab;
  /**
   * Index of the selected tab (0 without tabs)
   */
  index: number;
  /**
   * The title, the file's name, when it shows a file alone (with tabs, the tab list is the title)
   */
  title?: string;
  /**
   * URL to fetch the content from, if any (see getFetchedTabUrl())
   */
  fetchUrl?: string;
  /**
   * URL of the "Open in a new tab" link, for a linked file only
   */
  openUrl?: string;
}

/**
 * Gets what the code sidebar shows: a file alone (a linked file, or a linked showcase shown inline with no included files), its name as the title;
 * otherwise the selected tab, the link for a linked file only
 * @param file The linked file it opened for, if any (none for a code pane's tabs, which are always shown)
 * @param tabs The tabs: a linked showcase shown inline's, or a code pane's, if any
 * @param selected Index of the selected tab
 * @returns What the code sidebar shows
 */
export function getSidebarView(file: LinkedFile | undefined, tabs: ShownTab[] | undefined, selected: number): SidebarView {
  if (file && (!tabs || tabs.length < 2)) {
    const url = getLinkedFileUrl(file.path);
    return { index: 0, title: file.path.slice(file.path.lastIndexOf('/') + 1), fetchUrl: url, openUrl: url };
  }
  const shown = tabs ?? [];
  const index = Math.max(0, Math.min(selected, shown.length - 1));
  const tab = shown[index];
  return { tab, index, fetchUrl: getFetchedTabUrl(tab), openUrl: tab?.source.kind === 'file' ? tab.source.url : undefined };
}

/**
 * Represents the properties of the code sidebar
 */
export interface CodeSidebarProps {
  /**
   * The linked file shown (alone, or with its linked showcase's tabs), if any
   */
  file?: LinkedFile;
  /**
   * The tabs shown: a linked showcase shown inline's (the file's first, with included files), or a code pane's, if any
   */
  tabs?: ShownTab[];
  /**
   * The shown documentation files, holding a documentation file tab's content
   */
  documentation?: DocumentationFile[];
  /**
   * True while it is open: by default, while a file or tabs are given
   */
  open?: boolean;
  /**
   * Index of the tab it opens at (0 by default)
   */
  initialTab?: number;
  /**
   * The tabs' marks (see getTabMarks()); none by default
   */
  tabMarks?: readonly TabMarks[];
  /**
   * Closes it
   */
  onClose: () => void;
}

/**
 * Renders the code sidebar (FluentUI's `OverlayDrawer`, from the right, modal): a text linked file's content, or a showcase's tabs, highlighted,
 * under a header holding the file's name (or the tab list), the link opening the file in a new tab, and a close button; it closes on Escape, on a
 * click beside it, or on the close button. Its content is fetched each time it opens.
 * @param props Properties of the component
 * @returns The code sidebar
 */
export function CodeSidebar({ file, tabs, documentation = [], open, initialTab = 0, tabMarks, onClose }: CodeSidebarProps): ReactNode {
  const styles = _useStyles();
  const isOpen = open ?? (file !== undefined || tabs !== undefined);
  return (
    <OverlayDrawer className={styles.drawer} position="end" open={isOpen} onOpenChange={(_event, data) => !data.open && onClose()}>
      {/* Rendered only while open, so each opening fetches anew, and starts at its initial tab */}
      {isOpen && <CodeSidebarView file={file} tabs={tabs} documentation={documentation} initialTab={initialTab} tabMarks={tabMarks} onClose={onClose} />}
    </OverlayDrawer>
  );
}

/**
 * Renders the code sidebar's header and body (see CodeSidebar()); rendered on its own by the tests, as FluentUI's drawer renders nothing on the
 * server (through its portal)
 * @param props Properties of the component
 * @returns The header and the body
 */
export function CodeSidebarView({
  file,
  tabs,
  documentation,
  initialTab = 0,
  tabMarks = [],
  onClose,
}: Omit<CodeSidebarProps, 'open' | 'documentation'> & { documentation: DocumentationFile[] }): ReactNode {
  const styles = _useStyles();
  const idPrefix = useId();
  const [selected, setSelected] = useState(initialTab);
  const view = getSidebarView(file, tabs, selected);
  const content = useLinkedFileContent(view.fetchUrl);
  const tab = view.tab;
  return (
    <>
      <DrawerHeader>
        <div className={styles.header}>
          {tab ? (
            <ShownTabList className={styles.tabs} tabs={tabs!} selected={view.index} onSelect={setSelected} idPrefix={idPrefix} marks={tabMarks} />
          ) : (
            <h2 className={styles.title} title={file?.path}>
              {view.title}
            </h2>
          )}
          <div className={styles.actions}>
            {view.openUrl !== undefined && <NewTabLink href={view.openUrl} />}
            <Button appearance="subtle" icon={<Dismiss24Regular />} aria-label="Close" title="Close" onClick={onClose} />
          </div>
        </div>
      </DrawerHeader>
      <DrawerBody>
        {tab ? (
          <div role="tabpanel" aria-labelledby={getTabId(idPrefix, view.index)}>
            <ShownTabView tab={tab} documentation={documentation} content={content} markers={tabMarks[view.index]?.markers} />
          </div>
        ) : (
          file && <LinkedFileView path={file.path} content={content} />
        )}
      </DrawerBody>
    </>
  );
}

// #endregion
