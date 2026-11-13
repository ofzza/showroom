/**
 * The linked files' modal: a text linked file's content, fetched when it opens, highlighted with line numbers, under its path, with a link opening
 * the file in a new tab, and a close button
 */

import { useEffect, useState, type ReactNode } from 'react';
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
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { LinkedFile } from '../../host/index.js';
import { getLanguage, getLinkedFileUrl } from '../../linked-files/index.js';
import { HighlightedCode } from '../code/index.js';

// #region Content

/**
 * Represents the content of a linked file shown in the modal: being fetched, fetched, or failed to fetch
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
 * @param file The linked file
 * @param signal Aborts the fetch
 * @returns The content fetched, or why it failed
 */
export async function fetchLinkedFile(file: LinkedFile, signal?: AbortSignal): Promise<LinkedFileContent> {
  try {
    const response = await fetch(getLinkedFileUrl(file.path), { cache: 'no-store', signal });
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
 * Gets the content of the linked file shown in the modal, fetched each time a file is shown
 * @param file The linked file shown, if any
 * @returns Its content
 */
export function useLinkedFileContent(file: LinkedFile | undefined): LinkedFileContent {
  const [content, setContent] = useState<{ file?: LinkedFile; content: LinkedFileContent }>({ content: { status: 'loading' } });
  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    void fetchLinkedFile(file, controller.signal).then((fetched) => {
      if (!controller.signal.aborted) setContent({ file, content: fetched });
    });
    return () => controller.abort();
  }, [file]);
  return content.file === file ? content.content : { status: 'loading' };
}

// #endregion

// #region Modal

/**
 * Styles of the modal
 */
const _useStyles = makeStyles({
  surface: { maxWidth: 'min(1200px, calc(100vw - 32px))', width: '100%' },
  title: { fontFamily: tokens.fontFamilyMonospace, overflowWrap: 'anywhere' },
  content: { minHeight: '64px' },
  actions: { alignItems: 'center' },
});

/**
 * Represents the properties of a linked file's content in the modal
 */
export interface LinkedFileViewProps {
  /**
   * The linked file
   */
  file: LinkedFile;
  /**
   * Its content
   */
  content: LinkedFileContent;
}

/**
 * Renders a linked file's content in the modal: a spinner while it is fetched, then the content highlighted with line numbers, or why it failed
 * @param props Properties of the component
 * @returns The rendered content
 */
export function LinkedFileView({ file, content }: LinkedFileViewProps): ReactNode {
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
      return <HighlightedCode content={content.text} language={getLanguage(file.path)} />;
  }
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
   * Closes the modal
   */
  onClose: () => void;
}

/**
 * Renders the modal showing a text linked file: its path as the title, its content, a link opening the file in a new tab, and a close button
 * @param props Properties of the component
 * @returns The modal
 */
export function LinkedFileDialog({ file, onClose }: LinkedFileDialogProps): ReactNode {
  const styles = _useStyles();
  const content = useLinkedFileContent(file);
  if (!file) return null;
  return (
    <Dialog open onOpenChange={(_event, data) => !data.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle className={styles.title}>{file.path}</DialogTitle>
          <DialogContent className={styles.content}>
            <LinkedFileView file={file} content={content} />
          </DialogContent>
          <DialogActions className={styles.actions}>
            <Link href={getLinkedFileUrl(file.path)} target="_blank" rel="noopener noreferrer">
              Open in a new tab
            </Link>
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
