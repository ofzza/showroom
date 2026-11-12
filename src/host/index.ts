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
}

// #endregion
