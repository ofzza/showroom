/**
 * Linked files: where the showroom serves and publishes them, the limit of the modal showing them, telling text from binary content, and their
 * highlighting language. Node-free, so `check`, `serve`, `build` and the showroom can all use it; internal, never re-exported.
 */

// #region Paths

/**
 * Folder of the output folder the linked files are copied to (and served from in `serve`), each at its path relative to the host repository's root
 */
export const LINKED_FILES_FOLDER = 'files';

/**
 * Gets the URL of a linked file, relative to the showroom's page: its path in the linked files' folder, each segment URL-encoded
 * @param path POSIX-style path of the linked file, relative to the host repository's root
 * @returns The URL (e.g. `files/src/my%20file.ts`)
 */
export function getLinkedFileUrl(path: string): string {
  return `${LINKED_FILES_FOLDER}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

// #endregion

// #region Content

/**
 * Size up to which a text file opens in the modal, in bytes (1 MB); a larger one opens directly, as highlighting it would freeze the page
 */
export const LINKED_FILE_MODAL_LIMIT = 1024 * 1024;

/**
 * Checks if content is text: valid UTF-8 with no NUL byte, whatever the file's name
 * @param content The file's content
 * @returns True if the content is text
 */
export function isText(content: Uint8Array): boolean {
  if (content.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(content);
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Gets the highlighting language of a linked file: its extension, lower-cased, or its lower-cased name when it has none (e.g. `makefile`); a
 * language highlight.js doesn't know is shown as plain text
 * @param path POSIX-style path of the linked file
 * @returns The language
 */
export function getLanguage(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(dot + 1) : name).toLowerCase();
}

// #endregion
