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
}

// #endregion

// #region Showcases

/**
 * Represents the kind of a showcase: `inline`, its entry point a fenced code block; or `linked`, its entry point a file a link names
 */
export type ShowcaseKind = 'inline' | 'linked';

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
   * Name of the showcase adapter building the showcase (`html` for a naked marker)
   */
  adapter: string;
  /**
   * Options of the showcase adapter, as the showcase adapter validated them, or undefined if the marker has none
   */
  options?: unknown;
  /**
   * POSIX-style path of the entry point, relative to the host repository's root: the virtual file of an inline showcase, or the file a linked one
   * names
   */
  entry: string;
}

/**
 * Represents a virtual file: a fenced code block of a documentation file (a resource, or an inline showcase's entry point) that resolves like a
 * real file in its documentation file's folder
 */
export interface VirtualFile {
  /**
   * POSIX-style path of the virtual file, relative to the host repository's root
   */
  path: string;
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
}

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
}

// #endregion
