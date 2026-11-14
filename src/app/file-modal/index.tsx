/**
 * The linked files' modal: a text linked file's content, fetched when it opens, highlighted with line numbers, under its path, with a link opening
 * the file in a new tab, and a close button; for a linked showcase shown inline with included files, a tab per file. Also what the code pane shares
 * with it: fetching a linked file by its URL, the tab list, and a tab's content.
 */

import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Link,
  MessageBar,
  MessageBarBody,
  Spinner,
  Tab,
  TabList,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Open16Regular } from '@fluentui/react-icons';
import type { DocumentationFile, LinkedFile } from '../../host/index.js';
import { getLanguage, getLinkedFileUrl } from '../../linked-files/index.js';
import { HighlightedCode } from '../code/index.js';
import type { ShownTab } from '../host/index.js';

// #region Content

/**
 * Represents the content of a linked file shown in the modal or a tab: being fetched, fetched, or failed to fetch
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
 * Represents the properties of a linked file's content in the modal
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
}

/**
 * Renders a linked file's content: a spinner while it is fetched, then the content highlighted with line numbers, or why it failed
 * @param props Properties of the component
 * @returns The rendered content
 */
export function LinkedFileView({ path, content, fill, copy }: LinkedFileViewProps): ReactNode {
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
      return <HighlightedCode content={content.text} language={getLanguage(path)} fill={fill} copy={copy} />;
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
}

/**
 * Renders a tab's content: a virtual or documentation file's content highlighted, a text linked file's as fetched, or a message saying why the file
 * can't be shown (with a link opening it, for a linked file that isn't text)
 * @param props Properties of the component
 * @returns The rendered content
 */
export function ShownTabView({ tab, documentation, content, fill, copy }: ShownTabViewProps): ReactNode {
  const { source } = tab;
  switch (source.kind) {
    case 'virtual':
      return <HighlightedCode content={source.content} language={tab.language} fill={fill} copy={copy} />;
    case 'documentation': {
      const file = documentation.find((candidate) => candidate.path === tab.path);
      return file ? <HighlightedCode content={file.content} language={tab.language} fill={fill} copy={copy} /> : _message(MISSING_DOCUMENTATION_MESSAGE);
    }
    case 'file':
      return source.text ? (
        <LinkedFileView path={tab.path} content={content} fill={fill} copy={copy} />
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
}

/**
 * Renders a tab list of a showcase's files (FluentUI's `TabList`), each tab labelled with its label, its full path as its tooltip
 * @param props Properties of the component
 * @returns The tab list
 */
export function ShownTabList({ tabs, selected, onSelect, idPrefix, className }: ShownTabListProps): ReactNode {
  return (
    <TabList className={className} size="small" selectedValue={selected} onTabSelect={(_event, data) => onSelect(data.value as number)}>
      {tabs.map((tab, index) => (
        <Tab key={tab.path} id={getTabId(idPrefix, index)} value={index} title={tab.path}>
          {tab.label}
        </Tab>
      ))}
    </TabList>
  );
}

// #endregion

// #region Modal

/**
 * Space the modal always leaves above and below it, so it never fills the viewport's height, in pixels
 */
export const DIALOG_VERTICAL_MARGIN = 32;

/**
 * Padding of FluentUI's dialog surface, which its body's maximum height leaves out
 */
const _SURFACE_PADDING = '24px';

/**
 * Styles of the modal
 */
const _useStyles = makeStyles({
  // A little shorter than the viewport: FluentUI's own surface fills it (100vh), with its body scrolling inside
  surface: {
    maxWidth: 'min(1200px, calc(100vw - 32px))',
    width: '100%',
    maxHeight: [`calc(100vh - ${2 * DIALOG_VERTICAL_MARGIN}px)`, `calc(100dvh - ${2 * DIALOG_VERTICAL_MARGIN}px)`],
  },
  body: {
    maxHeight: [
      `calc(100vh - ${2 * DIALOG_VERTICAL_MARGIN}px - 2 * ${_SURFACE_PADDING})`,
      `calc(100dvh - ${2 * DIALOG_VERTICAL_MARGIN}px - 2 * ${_SURFACE_PADDING})`,
    ],
  },
  title: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400, overflowWrap: 'anywhere' },
  content: { minHeight: '64px' },
  // The link to open the file in a new tab well apart from the close button
  actions: { alignItems: 'center', columnGap: tokens.spacingHorizontalXXL },
});

/**
 * Represents what the modal shows: the file alone, or the selected tab
 */
export interface DialogView {
  /**
   * The selected tab, when the modal shows tabs
   */
  tab?: ShownTab;
  /**
   * Index of the selected tab (0 without tabs)
   */
  index: number;
  /**
   * The title: the file's, or the selected tab's, path
   */
  title: string;
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
 * Gets what the modal shows: with more than one tab, the selected tab (its path as the title, the link for a linked file only); otherwise the file
 * alone, as it always was
 * @param file The linked file the modal opened for
 * @param tabs The tabs of the linked showcase shown inline it is the entry point of, if any
 * @param selected Index of the selected tab
 * @returns What the modal shows
 */
export function getDialogView(file: LinkedFile, tabs: ShownTab[] | undefined, selected: number): DialogView {
  if (!tabs || tabs.length < 2) {
    const url = getLinkedFileUrl(file.path);
    return { index: 0, title: file.path, fetchUrl: url, openUrl: url };
  }
  const index = Math.min(selected, tabs.length - 1);
  const tab = tabs[index];
  return { tab, index, title: tab.path, fetchUrl: getFetchedTabUrl(tab), openUrl: tab.source.kind === 'file' ? tab.source.url : undefined };
}

/**
 * Represents the properties of the modal
 */
export interface LinkedFileDialogProps {
  /**
   * The linked file shown, or undefined while the modal is closed
   */
  file?: LinkedFile;
  /**
   * The tabs to show instead of the file alone, the file's first (a linked showcase shown inline, with included files), if any
   */
  tabs?: ShownTab[];
  /**
   * The shown documentation files, holding a documentation file tab's content
   */
  documentation?: DocumentationFile[];
  /**
   * Closes the modal
   */
  onClose: () => void;
}

/**
 * Renders the modal showing a text linked file: its path as the title, its content, a link opening the file in a new tab, and a close button; with
 * tabs, a tab list above the selected tab's content, which gives the title, and the link for a linked file only. Its content is fetched each time it
 * opens.
 * @param props Properties of the component
 * @returns The modal
 */
export function LinkedFileDialog({ file, tabs, documentation = [], onClose }: LinkedFileDialogProps): ReactNode {
  // Rendered only while open, so each opening fetches anew
  return file ? <OpenLinkedFileDialog file={file} tabs={tabs} documentation={documentation} onClose={onClose} /> : null;
}

/**
 * Renders the open modal (see LinkedFileDialog()); exported only as ESLint's React hooks rules take a `_`-prefixed function for no component
 * @param props Properties of the component
 * @returns The modal
 */
export function OpenLinkedFileDialog({
  file,
  tabs,
  documentation,
  onClose,
}: LinkedFileDialogProps & { file: LinkedFile; documentation: DocumentationFile[] }): ReactNode {
  const styles = _useStyles();
  const idPrefix = useId();
  const [selected, setSelected] = useState(0);
  const view = getDialogView(file, tabs, selected);
  const content = useLinkedFileContent(view.fetchUrl);
  const tab = view.tab;
  return (
    <Dialog open onOpenChange={(_event, data) => !data.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <DialogBody className={styles.body}>
          <DialogTitle className={styles.title}>{view.title}</DialogTitle>
          <DialogContent className={styles.content}>
            {tab ? (
              <>
                <ShownTabList tabs={tabs!} selected={view.index} onSelect={setSelected} idPrefix={idPrefix} />
                <div role="tabpanel" aria-labelledby={getTabId(idPrefix, view.index)}>
                  <ShownTabView tab={tab} documentation={documentation} content={content} />
                </div>
              </>
            ) : (
              <LinkedFileView path={file.path} content={content} />
            )}
          </DialogContent>
          <DialogActions className={styles.actions}>
            {view.openUrl !== undefined && <NewTabLink href={view.openUrl} />}
            <Button appearance="primary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

// #endregion
