/**
 * Host information: the data `showroom` collects from a host repository, which the showroom presents
 */

// #region Project information

/**
 * Represents a host repository's project information, as read by its stack adapter
 */
export interface ProjectInformation {
  /**
   * Name of the project
   */
  name: string;
  /**
   * Version of the project
   */
  version?: string;
  /**
   * Short description of the project
   */
  description?: string;
  /**
   * License identifier of the project (e.g. `MIT`)
   */
  license?: string;
  /**
   * Author of the project
   */
  author?: string;
  /**
   * Homepage URL of the project
   */
  homepage?: string;
  /**
   * Source repository URL of the project
   */
  repository?: string;
}

// #endregion

// #region Documentation files

/**
 * Represents the kind of a documentation file: one of the built-in kinds, or `other` for any file the documentation patterns add
 */
export type DocumentationKind = 'readme' | 'contribute' | 'license' | 'other';

/**
 * Represents a documentation file found in a host repository
 */
export interface DocumentationFile {
  /**
   * POSIX-style path of the file, relative to the host repository's root
   */
  path: string;
  /**
   * Kind of the documentation file
   */
  kind: DocumentationKind;
  /**
   * Extension of the file, as written in its name, including the leading dot (e.g. `.md`), or an empty string if it has none
   */
  extension: string;
  /**
   * Raw text content of the file
   */
  content: string;
  /**
   * The file's first heading, of any level, as plain text, if it is a Markdown file with a non-empty one; labels it in the navigation
   */
  heading?: string;
}

// #endregion

// #region Showcases

/**
 * Represents the kind of a showcase: `code-block`, its entry point a fenced code block; or `link`, its entry point a file a link names
 */
export type ShowcaseKind = 'code-block' | 'link';

/**
 * Represents how a showcase is shown: `inline`, a linked showcase's link, opening it in the showcase sidebar as a block shows it; or `block`, its
 * showcase views and code pane in place of its code block, or of the paragraph holding its link
 */
export type ShowcaseDisplay = 'inline' | 'block';

/**
 * Represents a showcase view: one way the showroom shows a showcase in its block, the views stacked in their order. `markdown`, the showcase as
 * written in its documentation file; `source`, its entry point's code; `demo`, its showcase frame; `console`, its console panel alone; `none`,
 * nothing (the showcase is still built and checked)
 */
export type ShowcaseView = 'markdown' | 'source' | 'demo' | 'console' | 'none';

/**
 * Represents one of a showcase's tabs, in its code pane (or its showcase sidebar, for a linked showcase shown inline): `source`, its entry point's code;
 * `markdown`, the showcase as written in its documentation file; `file`, an included file
 */
export type ShowcaseTab = { kind: 'source' } | { kind: 'markdown' } | { kind: 'file'; path: string };

/**
 * Represents a showcase embedded in a documentation file
 */
export interface Showcase {
  /**
   * Identifier of the showcase: its documentation file's path, `#`, and its position among the showcases in that file, from 1 (e.g. `README.md#2`)
   */
  id: string;
  /**
   * POSIX-style path of the documentation file embedding the showcase, relative to the host repository's root
   */
  documentation: string;
  /**
   * Line of the entry point (the fence, or the link) in the documentation file, from 1
   */
  line: number;
  /**
   * Offset of the entry point (the fence, or the link) in the documentation file's content, in characters, from 0
   */
  offset: number;
  /**
   * Kind of the showcase
   */
  kind: ShowcaseKind;
  /**
   * How the showcase is shown: `block` for a code block showcase, and for a linked showcase marked `block`; `inline` for any other linked showcase
   */
  display: ShowcaseDisplay;
  /**
   * Name of the showcase adapter building the showcase (`html` for a naked marker)
   */
  adapter: string;
  /**
   * Options of the showcase adapter, as the showcase adapter validated them, or undefined if the marker has none
   */
  options?: unknown;
  /**
   * POSIX-style path of the entry point, relative to the host repository's root: the virtual file of a code block showcase, or the file a linked one
   * names
   */
  entry: string;
  /**
   * POSIX-style paths of its included files (`include=`, without its keywords), relative to the host repository's root, in the marker's order; empty if it
   * has none
   */
  include: string[];
  /**
   * Its tabs, in their order: `include=`'s, its `source` and `markdown` keywords among its included files; where `include=` doesn't list `source`,
   * the source tab goes before the first included file, or last when there is none
   */
  tabs: ShowcaseTab[];
  /**
   * Its showcase views, in the order they are shown: the marker's `view=`, or else the defaults `showroom.json`'s `showcaseViews` sets for its
   * showcase adapter, or else its showcase adapter's own; for a linked showcase shown inline, its marker's `view=`, or else `none` (no defaults)
   */
  views: ShowcaseView[];
  /**
   * True when its marker has the `overlays` key: its overlays (content placed outside its page's flow, e.g. a dropdown) are drawn over the page
   * around its showcase frame instead of growing it; left out otherwise
   */
  overlays?: true;
}

/**
 * Represents a virtual file: the fenced code block of a documentation file marked with a showcase marker (a code block showcase's entry point, or a
 * virtual file with no showcase adapter, `showcase file=<name>`), which resolves like a real file in its documentation file's folder
 */
export interface VirtualFile {
  /**
   * POSIX-style path of the virtual file, relative to the host repository's root
   */
  path: string;
  /**
   * True if the marker's `file=` named the virtual file; false for a code block showcase's generated name
   * (`<documentation file's name>.showcase-<n>.<extension>`)
   */
  named: boolean;
  /**
   * Identifier of the showcase whose entry point the virtual file is (`Showcase.id`), or undefined for a virtual file with no showcase adapter
   */
  showcase?: string;
  /**
   * Showcase views of a virtual file with no showcase adapter, in the order they are shown: the marker's `view=` (`source`, `markdown` or `none`),
   * or `source`, an ordinary code block; undefined for a showcase's entry point, whose showcase has its views
   */
  views?: ShowcaseView[];
  /**
   * Content of the virtual file: the code block's text
   */
  content: string;
  /**
   * POSIX-style path of the documentation file holding the code block, relative to the host repository's root
   */
  documentation: string;
  /**
   * Line of the code block's fence in the documentation file, from 1
   */
  line: number;
  /**
   * Offset of the code block's fence in the documentation file's content, in characters, from 0
   */
  offset: number;
}

// #endregion

// #region Linked files

/**
 * Represents a linked file: a file that isn't a documentation file, which a documentation file links to (or shows as an image, or names as a linked
 * showcase's entry point) by a relative path, or a showcase includes (`include=`), and which the showroom copies
 */
export interface LinkedFile {
  /**
   * POSIX-style path of the file, relative to the host repository's root, as the link resolves it
   */
  path: string;
  /**
   * Size of the file, in bytes
   */
  size: number;
  /**
   * True if the file is text (valid UTF-8 with no NUL byte) and no larger than 1 MB, so the showroom shows it in the showcase sidebar; false for a binary file,
   * or any file larger than 1 MB, which the showroom opens directly
   */
  text: boolean;
}

// #endregion

// #region Navigation

/**
 * Represents an item of the navigation as `showroom.json`'s `navigation` resolves: a page, a documentation file's (its `path`; empty for the home
 * page), opened at its `anchor` heading if it has one; an absolute URL; or a group of items, `collapsed` at first when `showroom.json` says so for
 * it, or, saying nothing for it, for its parent group (left out otherwise)
 */
export type NavigationItem =
  | { kind: 'page'; label: string; path: string; anchor?: string }
  | { kind: 'url'; label: string; url: string }
  | { kind: 'group'; label: string; items: NavigationItem[]; collapsed?: true };

// #endregion

// #region Host information

/**
 * Represents the host information: everything `showroom` collects from a host repository
 */
export interface HostInformation {
  /**
   * Project information
   */
  project: ProjectInformation;
  /**
   * Documentation files, sorted by path
   */
  documentation: DocumentationFile[];
  /**
   * Code file index: POSIX-style paths of the code files, relative to the host repository's root, sorted
   */
  code: string[];
  /**
   * Showcases embedded in the documentation files, sorted by documentation file and line
   */
  showcases: Showcase[];
  /**
   * Virtual files of the documentation files, sorted by documentation file and line
   */
  virtualFiles: VirtualFile[];
  /**
   * Linked files, sorted by path
   */
  linkedFiles: LinkedFile[];
  /**
   * The navigation `showroom.json` configures, resolved; undefined for the default navigation
   */
  navigation?: NavigationItem[];
}

// #endregion
