/**
 * The shown host information: the part of the host information the showroom presents, and helpers for finding its documentation files
 */

import type { DocumentationFile, HostInformation, ShowcaseDisplay, ShowcaseView } from '../../host/index.js';
import { getFolder, isMarkdownPath } from '../../markdown/index.js';

export { getFolder };

// #region Shown host information

/**
 * Represents where a tab of a showcase's code pane (or code sidebar) gets its content: a virtual file's content, shipped with it (`virtual`); a
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
 * Represents a tab of a showcase's code pane, or of its code sidebar: one of its files, the entry point first, then its included files
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
  /**
   * True on the Markdown tab (`include=markdown`): the showcase as written in its documentation file, under the documentation file's path
   */
  markdown?: true;
}

/**
 * Represents an issue of a shown showcase, of its build or of one of its checks, as its showcase adapter reported it
 */
export interface ShownIssue {
  /**
   * How serious the issue is: an error, or a warning, which fails nothing
   */
  severity: 'error' | 'warning';
  /**
   * The showcase adapter's own message
   */
  message: string;
  /**
   * Name of the check it belongs to (e.g. `type check`); none for an issue of the build itself
   */
  check?: string;
  /**
   * POSIX-style path of the file it is in, relative to the host repository's root (a virtual file's as if on disk); the showcase's entry point for an
   * issue the showcase adapter placed in no file
   */
  path: string;
  /**
   * Line it is at in the file, from 1; none when it names no line
   */
  line?: number;
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
   * Its showcase views, in the order they are shown
   */
  views: ShowcaseView[];
  /**
   * Its Markdown source, as written in its documentation file (its fence, or its link): what its `markdown` view and its Markdown tab show
   */
  markdown: string;
  /**
   * Its tabs, in their order (`Showcase.tabs`): its entry point's, its included files', and its Markdown tab, where `include=` lists it
   */
  tabs: ShownTab[];
  /**
   * Index of its entry point's tab (the source tab) among its tabs, which its `source` view shows
   */
  entryTab: number;
  /**
   * URL of the showcase frame's page, relative to the showroom's page, with its content's hash as its query (`?hash=<hash>`), so a changed showcase
   * frame gets a new URL; undefined when none of its views loads it (neither `demo` nor `console`), or when it doesn't build
   */
  url?: string;
  /**
   * The checks its build ran to completion (e.g. `type check`), in the order its showcase adapter listed them
   */
  checks: string[];
  /**
   * Its issues, of its build and its checks, errors and warnings, in the order its showcase adapter reported them
   */
  issues: ShownIssue[];
  /**
   * True if it shows a `build` status mark: every showcase does, but an `html` one without issues of its build, as nothing builds it
   */
  buildMark: boolean;
}

/**
 * Represents a shown showcase whose views load its showcase frame, and that builds, so it has its URL
 */
export type LoadedShowcase = ShownShowcase & { url: string };

/**
 * Checks if a shown showcase's views load its showcase frame, and it builds (it then has its URL)
 * @param showcase The shown showcase
 * @returns True if it has its showcase frame's URL
 */
export function isLoadedShowcase(showcase: ShownShowcase): showcase is LoadedShowcase {
  return showcase.url !== undefined;
}

/**
 * Represents a shown virtual file with no showcase adapter whose views aren't an ordinary code block's (`source`): where the showroom places it,
 * and what it shows
 */
export interface ShownVirtualFile {
  /**
   * POSIX-style path of the virtual file, relative to the host repository's root
   */
  path: string;
  /**
   * POSIX-style path of the documentation file holding it, relative to the host repository's root
   */
  documentation: string;
  /**
   * Offset of its fence in the documentation file's content, in characters, from 0
   */
  offset: number;
  /**
   * Its showcase views (`source`, `markdown` or `none`)
   */
  views: ShowcaseView[];
  /**
   * Its Markdown source, as written in its documentation file (its fence, marker included)
   */
  markdown: string;
}

/**
 * Represents the shown host information: the host information's project information, documentation files and linked files, without the code file
 * index, which the showroom doesn't show; and every showcase, with its checks and issues
 */
export type ShownHostInformation = Pick<HostInformation, 'project' | 'documentation' | 'linkedFiles'> & {
  /**
   * Every showcase, built or not, sorted by documentation file and offset
   */
  showcases: ShownShowcase[];
  /**
   * The virtual files with no showcase adapter whose views aren't `source` alone, sorted by documentation file and offset
   */
  virtualFiles: ShownVirtualFile[];
};

/**
 * Represents what `serve` updates on a shown showcase without reloading the page: its showcase frame's URL, its tabs' URLs, its checks and issues,
 * and its `build` status mark
 */
export type ShownShowcaseUpdate = Pick<ShownShowcase, 'id' | 'url' | 'tabs' | 'checks' | 'issues' | 'buildMark'>;

/**
 * Applies the updates `serve` sends to the shown showcases, by id: the new URLs of showcase frames and of their tabs, the checks and issues, and the
 * `build` status mark
 * @param showcases The shown showcases
 * @param next The shown showcases with their updates, every one of them
 * @returns The shown showcases updated (a showcase whose update changes nothing is kept as it was); the same list if nothing changed
 */
export function applyShowcaseUpdates(showcases: ShownShowcase[], next: readonly ShownShowcaseUpdate[]): ShownShowcase[] {
  const updates = new Map(next.map((update) => [update.id, update]));
  const applied = showcases.map((showcase) => {
    const update = updates.get(showcase.id);
    if (!update) return showcase;
    const { url, tabs, checks, issues, buildMark } = update;
    const changed = { url, tabs, checks, issues, buildMark };
    const current = { url: showcase.url, tabs: showcase.tabs, checks: showcase.checks, issues: showcase.issues, buildMark: showcase.buildMark };
    return JSON.stringify(changed) === JSON.stringify(current) ? showcase : { ...showcase, ...changed };
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
