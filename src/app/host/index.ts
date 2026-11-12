/**
 * The shown host information: the part of the host information the showroom presents, and helpers for finding its documentation files
 */

import type { DocumentationFile, HostInformation } from '../../host/index.js';

// #region Shown host information

/**
 * Represents the shown host information: the host information's project information and documentation files, without the code file index, which the
 * showroom doesn't show
 */
export type ShownHostInformation = Pick<HostInformation, 'project' | 'documentation'>;

// #endregion

// #region Documentation files

/**
 * Checks if a documentation file is the root `README`, which the showroom shows on its home page
 * @param file Documentation file
 * @returns True if the file is the `README` in the host repository's root
 */
export function isRootReadme(file: DocumentationFile): boolean {
  return file.kind === 'readme' && !file.path.includes('/');
}

/**
 * Gets the root `README`, if the host repository has one
 * @param documentation Documentation files
 * @returns The root `README`, or undefined if there is none
 */
export function getRootReadme(documentation: DocumentationFile[]): DocumentationFile | undefined {
  return documentation.find(isRootReadme);
}

/**
 * Checks if a documentation file is rendered as Markdown: only `.md` files are, in any case; every other file is shown as plain text
 * @param file Documentation file
 * @returns True if the file is a Markdown file
 */
export function isMarkdown(file: DocumentationFile): boolean {
  return file.extension.toLowerCase() === '.md';
}

/**
 * Gets the folder of a POSIX-style path relative to the host repository's root
 * @param path Path of a file
 * @returns Path of the file's folder, or an empty string for a file in the root
 */
export function getFolder(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf('/'), 0));
}

/**
 * Finds a documentation file by its path: an exact match first, otherwise a case-insensitive one
 * @param documentation Documentation files
 * @param path POSIX-style path relative to the host repository's root
 * @returns The documentation file, or undefined if none has this path
 */
export function findDocumentationFile(documentation: DocumentationFile[], path: string): DocumentationFile | undefined {
  const lowerCase = path.toLowerCase();
  return documentation.find((file) => file.path === path) ?? documentation.find((file) => file.path.toLowerCase() === lowerCase);
}

/**
 * Finds the `README` of a folder among the documentation files, matching the folder's path case-insensitively
 * @param documentation Documentation files
 * @param folder POSIX-style path of the folder relative to the host repository's root, or an empty string for the root
 * @returns The folder's `README`, or undefined if it has none among the documentation files
 */
export function findFolderReadme(documentation: DocumentationFile[], folder: string): DocumentationFile | undefined {
  const lowerCase = folder.toLowerCase();
  return documentation.find((file) => file.kind === 'readme' && getFolder(file.path).toLowerCase() === lowerCase);
}

// #endregion
