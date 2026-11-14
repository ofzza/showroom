/**
 * The shown host information: the part of the host information the showroom presents, and helpers for finding its documentation files
 */

import type { DocumentationFile, HostInformation, ShowcaseDisplay } from '../../host/index.js';
import { getFolder, isMarkdownPath } from '../../markdown/index.js';

export { getFolder };

// #region Shown host information

/**
 * Represents where a tab of a showcase's code pane (or modal) gets its content: a virtual file's content, shipped with it (`virtual`); a
 * documentation file, looked up in the shown documentation files (`documentation`); a linked file, fetched from its URL (`file`); or a file that
 * isn't copied into the showroom (`missing`: a linked showcase's entry point `check` left out of the linked files, with a warning)
 */
export type ShownTabSource =
  | {
      /**
       * A virtual file: a code block showcase's entry point, or an included virtual file
       */
      kind: 'virtual';
      /**
       * Its content
       */
      content: string;
    }
  | {
      /**
       * A documentation file, whose content the shown documentation files hold
       */
      kind: 'documentation';
    }
  | {
      /**
       * A linked file, fetched when its tab is shown
       */
      kind: 'file';
      /**
       * URL of the linked file, relative to the showroom's page (`files/<path>`), with its content's hash as its query (`?hash=<hash>`) when it is
       * text, so a changed file gets a new URL
       */
      url: string;
      /**
       * True if the file can be shown as text (see LinkedFile's `text`)
       */
      text: boolean;
    }
  | {
      /**
       * A file that isn't copied into the showroom
       */
      kind: 'missing';
    };

/**
 * Represents a tab of a showcase's code pane, or of its modal: one of its files, the entry point first, then its included files
 */
export interface ShownTab {
  /**
   * The tab's label: a code block showcase's entry point's extension, upper-cased (e.g. `HTML`); any other file's path relative to the
   * documentation file (e.g. `clock.css`, `../shared/theme.css`)
   */
  label: string;
  /**
   * POSIX-style path of the file, relative to the host repository's root (a virtual file's as if on disk)
   */
  path: string;
  /**
   * The file's language, for highlighting: its extension, lower-cased
   */
  language: string;
  /**
   * Where the tab gets its content
   */
  source: ShownTabSource;
}

/**
 * Represents a shown showcase: where the showroom places a showcase's showcase frame, and the URL it loads it by
 */
export interface ShownShowcase {
  /**
   * Identifier of the showcase (e.g. `README.md#2`)
   */
  id: string;
  /**
   * POSIX-style path of the documentation file embedding the showcase, relative to the host repository's root
   */
  documentation: string;
  /**
   * Offset of the showcase's entry point (the fence, or the link) in the documentation file's content, in characters, from 0
   */
  offset: number;
  /**
   * How the showcase is shown: as a block (a code block showcase, or a linked showcase marked `block`), with its code pane, or inline
   */
  display: ShowcaseDisplay;
  /**
   * Its files, as tabs: the entry point, then the included files, in the marker's order
   */
  tabs: ShownTab[];
  /**
   * URL of the showcase frame's page, relative to the showroom's page, with its content's hash as its query (`?hash=<hash>`), so a changed showcase
   * frame gets a new URL
   */
  url: string;
}

/**
 * Represents the shown host information: the host information's project information, documentation files and linked files, without the code file
 * index, which the showroom doesn't show; and the showcases with a showcase frame
 */
export type ShownHostInformation = Pick<HostInformation, 'project' | 'documentation' | 'linkedFiles'> & {
  /**
   * The showcases with a showcase frame, sorted by documentation file and offset; in `serve`, a showcase that doesn't build has the showcase frame
   * showing its build errors
   */
  showcases: ShownShowcase[];
};

/**
 * Applies the new URLs of showcase frames and of their tabs to the shown showcases, by id: what `serve` sends when only URLs changed
 * @param showcases The shown showcases
 * @param next The shown showcases with their new URLs, every one of them
 * @returns The shown showcases with the new URLs (a showcase whose URLs all stayed the same is kept as it was); the same list if no URL changed
 */
export function applyShowcaseUrls(showcases: ShownShowcase[], next: readonly Pick<ShownShowcase, 'id' | 'url' | 'tabs'>[]): ShownShowcase[] {
  const updates = new Map(next.map((update) => [update.id, update]));
  const applied = showcases.map((showcase) => {
    const update = updates.get(showcase.id);
    if (!update || (update.url === showcase.url && JSON.stringify(update.tabs) === JSON.stringify(showcase.tabs))) return showcase;
    return { ...showcase, url: update.url, tabs: update.tabs };
  });
  return applied.some((showcase, index) => showcase !== showcases[index]) ? applied : showcases;
}

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
  return isMarkdownPath(file.path);
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
