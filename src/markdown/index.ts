/**
 * Markdown: parsing documentation files' Markdown, the showcase marker's grammar, finding showcases, virtual files and links in the syntax tree, and
 * resolving relative links. Node-free, so both `check` and the showroom can use it; internal, never re-exported.
 */

import JSON5 from 'json5';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Showcase, VirtualFile } from '../host/index.js';

// #region Paths

/**
 * Checks if a path names a Markdown file: only files with the `.md` extension are, in any case (as Node's `extname()` sees it, so `.md` alone is
 * a name, not an extension)
 * @param path Path of a file
 * @returns True if the path names a Markdown file
 */
export function isMarkdownPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 && name.slice(dot).toLowerCase() === '.md';
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
 * Gets the path of a file relative to another file's folder, as a link from that file would write it, without a leading `./`
 * @param from POSIX-style path of the file the path is written in, relative to the host repository's root
 * @param to POSIX-style path of the file, relative to the host repository's root
 * @returns The relative path (e.g. `clock.css`, `styles/clock.css`, `../shared/theme.css`)
 */
export function getRelativePath(from: string, to: string): string {
  const folder = getFolder(from).split('/').filter(Boolean);
  const target = to.split('/');
  let common = 0;
  while (common < folder.length && common < target.length - 1 && folder[common] === target[common]) common++;
  return [...folder.slice(common).map(() => '..'), ...target.slice(common)].join('/');
}

/**
 * Checks if a URL is absolute: it has a scheme (e.g. `https:`, `mailto:`), or is protocol-relative (`//`)
 * @param url URL
 * @returns True if the URL is absolute
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//');
}

/**
 * Represents a relative link's target, split into its parts and URL-decoded
 */
export interface LinkTarget {
  /**
   * Path of the target, URL-decoded; empty for a fragment-only link
   */
  path: string;
  /**
   * Fragment of the target, URL-decoded, without the `#`, or undefined if it has none (or an empty one)
   */
  anchor?: string;
  /**
   * True if the target has a query (`?…`), which is dropped from the path
   */
  query: boolean;
  /**
   * True if the target has a fragment (`#…`), even an empty one
   */
  fragment: boolean;
}

/**
 * Splits a relative link's target into its path and fragment, dropping any query, and URL-decodes them
 * @param href The link's target, as written in the Markdown
 * @returns The parts of the target, or undefined if it can't be URL-decoded
 */
export function splitLink(href: string): LinkTarget | undefined {
  const hashIndex = href.indexOf('#');
  const beforeHash = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  try {
    const path = decodeURIComponent(queryIndex < 0 ? beforeHash : beforeHash.slice(0, queryIndex));
    const anchor = hashIndex < 0 || hashIndex === href.length - 1 ? undefined : decodeURIComponent(href.slice(hashIndex + 1));
    return { path, ...(anchor !== undefined ? { anchor } : {}), query: queryIndex >= 0, fragment: hashIndex >= 0 };
  } catch (_err) {
    return undefined;
  }
}

/**
 * Represents a path resolved against the host repository's root
 */
export interface ResolvedPath {
  /**
   * POSIX-style path, relative to the host repository's root (an empty string for the root itself)
   */
  path: string;
  /**
   * True if the path, as written, can only name a folder (it ends with `/`, `.` or `..`)
   */
  isFolder: boolean;
}

/**
 * Resolves a (URL-decoded) relative path written in a file: against the file's folder, or against the root for a path starting with `/`
 * @param from POSIX-style path of the file holding the path, relative to the host repository's root
 * @param path The path, as written (without query or fragment)
 * @returns The resolved path, or undefined if it leads outside the host repository
 */
export function resolvePath(from: string, path: string): ResolvedPath | undefined {
  const segments = path.startsWith('/') ? [] : getFolder(from).split('/').filter(Boolean);
  const parts = path.split('/');
  for (const part of parts) {
    if (part === '..') {
      if (!segments.length) {
        return undefined;
      }
      segments.pop();
    } else if (part !== '' && part !== '.') {
      segments.push(part);
    }
  }
  const last = parts[parts.length - 1];
  return { path: segments.join('/'), isFolder: last === '' || last === '.' || last === '..' };
}

// #endregion

// #region Showcase markers

/**
 * The showcase marker's keyword
 */
export const SHOWCASE_KEYWORD = 'showcase';

/**
 * Represents a parsed showcase marker
 */
export interface ShowcaseMarker {
  /**
   * Name of the showcase adapter, or undefined for a naked marker
   */
  adapter?: string;
  /**
   * True if the marker has options, in parentheses after the adapter's name
   */
  hasOptions: boolean;
  /**
   * The options, parsed from JSON5, if the marker has them
   */
  options?: unknown;
  /**
   * Name given by the `file` key, if the marker has one
   */
  file?: string;
  /**
   * How a linked showcase is shown, if the marker says it with the `inline` or `block` key
   */
  display?: 'inline' | 'block';
  /**
   * Paths the `include` key lists, URL-decoded, as written (relative to the documentation file's folder), if the marker has one
   */
  include?: string[];
}

/**
 * Keys a showcase marker can have after its adapter and options
 */
const _MARKER_KEYS = ['file', 'anchor', 'inline', 'block', 'include'];

/**
 * Pattern of a showcase adapter's name
 */
export const SHOWCASE_ADAPTER_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Checks if a word is a showcase marker's start: `showcase`, or a word starting with `showcase=`
 * @param word A word of an info string or a title
 * @returns True if the word starts a showcase marker
 */
export function isShowcaseMarker(word: string): boolean {
  return word === SHOWCASE_KEYWORD || word.startsWith(`${SHOWCASE_KEYWORD}=`);
}

/**
 * Parses a showcase marker: `showcase`, `showcase=<adapter>` or `showcase=<adapter>(<JSON5 options>)`, followed by space-separated keys
 * (`file=<name>`; `inline` or `block`; `include=<path>,<path>`; `anchor=<name>` is reserved). Keys are checked on their own here; where each
 * may be used is the scan's to check
 * @param text The marker and its keys
 * @returns The marker, or the error that prevents parsing it
 */
export function parseShowcaseMarker(text: string): { marker: ShowcaseMarker; error?: undefined } | { marker?: undefined; error: string } {
  const quoted = `"${text.trim()}"`;
  let rest = text.trim();
  if (!rest.startsWith(SHOWCASE_KEYWORD)) {
    return { error: `Not a showcase marker: ${quoted}` };
  }
  rest = rest.slice(SHOWCASE_KEYWORD.length);
  const marker: ShowcaseMarker = { hasOptions: false };

  // The adapter's name, and its options
  if (rest.startsWith('=')) {
    const name = /^=([^\s(]*)/.exec(rest)![1];
    if (!SHOWCASE_ADAPTER_NAME.test(name)) {
      return { error: `Invalid showcase adapter name "${name}" in showcase marker ${quoted}: use lower-case letters, digits and "-", starting with a letter` };
    }
    marker.adapter = name;
    rest = rest.slice(name.length + 1);
    if (rest.startsWith('(')) {
      const options = _parseOptions(rest);
      if ('error' in options) {
        return { error: `${options.error} in showcase marker ${quoted}` };
      }
      marker.hasOptions = true;
      marker.options = options.value;
      rest = options.rest;
    }
  }
  if (rest && !/^\s/.test(rest)) {
    return { error: `Invalid showcase marker ${quoted}` };
  }

  // The keys
  const seen = new Set<string>();
  for (const word of rest.trim().split(/\s+/).filter(Boolean)) {
    const equals = word.indexOf('=');
    const key = equals < 0 ? word : word.slice(0, equals);
    const value = equals < 0 ? '' : word.slice(equals + 1);
    if (!_MARKER_KEYS.includes(key)) {
      return { error: `Unknown key "${key}" in showcase marker ${quoted}` };
    }
    if (seen.has(key)) {
      return { error: `Repeated key "${key}" in showcase marker ${quoted}` };
    }
    seen.add(key);
    if (key === 'anchor') {
      return { error: `The key "anchor" is reserved for later, in showcase marker ${quoted}` };
    }
    if (key === 'inline' || key === 'block') {
      if (equals >= 0) {
        return { error: `The key "${key}" takes no value in showcase marker ${quoted}` };
      }
      if (marker.display) {
        return { error: `The keys "inline" and "block" can't be used together, in showcase marker ${quoted}` };
      }
      marker.display = key;
      continue;
    }
    if (key === 'include') {
      const include = _parseInclude(value);
      if ('error' in include) {
        return { error: `${include.error} in showcase marker ${quoted}` };
      }
      marker.include = include.paths;
      continue;
    }
    if (!value) {
      return { error: `The key "file" needs a name ("file=<name>") in showcase marker ${quoted}` };
    }
    marker.file = value;
  }
  return { marker };
}

/**
 * Parses the value of a showcase marker's `include` key: comma-separated paths, each judged on its raw text (no `?`, `#` or leading `/`, as a
 * link's path would lose them), then URL-decoded as link targets are
 * @param value The key's value, after `include=`
 * @returns The paths, URL-decoded, or the error that prevents parsing them
 */
function _parseInclude(value: string): { paths: string[] } | { error: string } {
  if (!value) {
    return { error: 'The key "include" needs paths ("include=<path>,<path>")' };
  }
  const paths: string[] = [];
  for (const raw of value.split(',')) {
    if (!raw) {
      return { error: `Empty path in "include=${value}"` };
    }
    if (/[?#]/.test(raw) || raw.startsWith('/')) {
      return { error: `Invalid included path "${raw}": use a path relative to the documentation file's folder, with no "?" or "#"` };
    }
    try {
      paths.push(decodeURIComponent(raw));
    } catch (_err) {
      return { error: `Included path "${raw}" can't be URL-decoded` };
    }
  }
  return { paths };
}

/**
 * Parses a showcase marker's options: JSON5 in parentheses, ending at the first `)` that closes valid JSON5 and is followed by a space or the end
 * @param text The marker's rest, starting with `(`
 * @returns The options and the text after them, or the error that prevents parsing them
 */
function _parseOptions(text: string): { value: unknown; rest: string } | { error: string } {
  let lastError = 'no closing ")"';
  for (let index = text.indexOf(')'); index >= 0; index = text.indexOf(')', index + 1)) {
    const after = text.slice(index + 1);
    if (after && !/^\s/.test(after)) {
      continue;
    }
    const source = text.slice(1, index);
    if (!source.trim()) {
      return { error: 'Empty showcase options' };
    }
    try {
      return { value: JSON5.parse(source), rest: after };
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  return { error: `Invalid showcase options (${lastError})` };
}

// #endregion

// #region Scanning

/**
 * Represents a link (or reference definition) with a relative target, found in a documentation file
 */
export interface MarkdownLink {
  /**
   * The link's target, as written in the Markdown
   */
  href: string;
  /**
   * Line of the link in the documentation file, from 1
   */
  line: number;
}

/**
 * Represents an error found in a documentation file's showcase markers
 */
export interface MarkdownError {
  /**
   * Line the error concerns, from 1
   */
  line: number;
  /**
   * Description of the error
   */
  message: string;
}

/**
 * Represents what scanning a documentation file's Markdown found
 */
export interface MarkdownScan {
  /**
   * Showcases, in document order, with their options as the marker gives them (not yet validated by their showcase adapters)
   */
  showcases: Showcase[];
  /**
   * Virtual files (resources and code block showcases' entry points), in document order
   */
  virtualFiles: VirtualFile[];
  /**
   * Links and reference definitions with a relative, non-fragment-only target, in document order; linked showcases' links and images are left out
   */
  links: MarkdownLink[];
  /**
   * Images with a relative, non-fragment-only source, in document order (an image reference's source is its reference definition, in `links`)
   */
  images: MarkdownLink[];
  /**
   * Errors in the showcase markers
   */
  errors: MarkdownError[];
}

/**
 * Represents the few fields of a Markdown syntax tree's nodes that scanning reads
 */
interface _Node {
  type: string;
  children?: _Node[];
  position?: { start: { line: number; offset?: number }; end?: { offset?: number } };
  depth?: number;
  lang?: string | null;
  meta?: string | null;
  value?: string;
  url?: string;
  title?: string | null;
}

/**
 * Extensions of code block showcases' entry points, by fence language (lower-cased), where they differ from the language
 */
const _EXTENSIONS: Record<string, string> = { typescript: 'ts', javascript: 'js', htm: 'html' };

/**
 * Parses Markdown into its syntax tree, as the showroom does (CommonMark, with GitHub's extensions)
 * @param content Markdown text
 * @returns The syntax tree's root
 */
function _parse(content: string): _Node {
  return unified().use(remarkParse).use(remarkGfm).parse(content) as unknown as _Node;
}

/**
 * Gets the Markdown source of the fences and links of a documentation file, exactly as written (a blockquote's `>` and a list's indentation
 * included), by their offsets: what a showcase's code pane shows as its Markdown tab
 * @param content Markdown text
 * @returns The source of each fenced code block and link, by its offset in the content
 */
export function getShowcaseSources(content: string): Map<number, string> {
  const sources = new Map<number, string>();
  _visit(_parse(content), [], (node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end?.offset;
    if ((node.type === 'code' || node.type === 'link') && start !== undefined && end !== undefined) sources.set(start, content.slice(start, end));
  });
  return sources;
}

/**
 * Gets the offset of the level-1 heading a Markdown document opens with: its first node, not counting raw HTML (which the showroom doesn't render)
 * @param content Markdown text
 * @returns The heading's start offset in the text, or undefined if the document doesn't open with a level-1 heading
 */
export function getOpeningTitleOffset(content: string): number | undefined {
  const first = _parse(content).children?.find((node) => node.type !== 'html');
  return first?.type === 'heading' && first.depth === 1 ? first.position?.start.offset : undefined;
}

/**
 * Checks if a resource's (or a generated entry point's) name is a plain file name: no `/` or `\`, not `.` or `..`, not empty, and no leading or
 * trailing spaces
 * @param name Name of the virtual file
 * @returns True if the name is valid
 */
export function isValidVirtualFileName(name: string): boolean {
  return !!name && !/[\\/]/.test(name) && name !== '.' && name !== '..' && name === name.trim();
}

/**
 * Scans a documentation file's Markdown for showcases, virtual files, relative links and images, and showcase marker errors
 * @param path POSIX-style path of the documentation file, relative to the host repository's root
 * @param content Markdown text of the documentation file
 * @returns What the scan found
 */
export function scanMarkdown(path: string, content: string): MarkdownScan {
  const scan: MarkdownScan = { showcases: [], virtualFiles: [], links: [], images: [], errors: [] };
  const folder = getFolder(path);
  const name = path.slice(path.lastIndexOf('/') + 1);
  const stem = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  const virtualPath = (file: string): string => (folder ? `${folder}/${file}` : file);
  const error = (node: _Node, message: string): void => void scan.errors.push({ line: _line(node), message });

  /**
   * Adds a showcase found at a node, once its included files resolve
   * @param node The fence or link
   * @param kind Kind of the showcase
   * @param marker Its marker
   * @param entry Path of its entry point, or a function giving it from the showcase's position (for a generated name)
   */
  const addShowcase = (node: _Node, kind: Showcase['kind'], marker: ShowcaseMarker, entry: (index: number) => string | undefined): void => {
    const index = scan.showcases.length + 1;
    const entryPath = entry(index);
    if (entryPath === undefined) return;
    const include = _resolveIncludes(path, entryPath, marker.include ?? []);
    if ('error' in include) return error(node, include.error);
    scan.showcases.push({
      id: `${path}#${index}`,
      documentation: path,
      line: _line(node),
      offset: node.position?.start.offset ?? 0,
      kind,
      display: kind === 'code-block' ? 'block' : (marker.display ?? 'inline'),
      adapter: marker.adapter ?? 'html',
      ...(marker.hasOptions ? { options: marker.options } : {}),
      entry: entryPath,
      include: include.paths,
    });
  };

  _visit(_parse(content), [], (node, ancestors) => {
    // Fenced code blocks: code block showcases' entry points, and resources
    if (node.type === 'code') {
      const lang = node.lang ?? '';
      if (isShowcaseMarker(lang)) {
        error(node, `The showcase marker must follow the code block's language ("\`\`\`<language> ${lang}")`);
        return;
      }
      const meta = (node.meta ?? '').trim();
      if (!lang || !isShowcaseMarker(meta.split(/\s+/)[0])) return;
      const { marker, error: markerError } = parseShowcaseMarker(meta);
      if (!marker) return error(node, markerError);
      // Where a code block's keys may be used
      if (marker.display !== undefined) {
        return error(node, `A code block showcase is always shown as a block; the keys "inline" and "block" are for linked showcases only`);
      }
      // A resource
      if (marker.file !== undefined) {
        if (marker.adapter !== undefined) {
          return error(node, `A showcase's entry point can't have a "file" key; a resource's marker is "showcase file=<name>"`);
        }
        if (marker.include !== undefined) {
          return error(node, `A resource can't include files; only a showcase's marker can have an "include" key`);
        }
        if (!isValidVirtualFileName(marker.file)) {
          return error(node, `Invalid resource name "${marker.file}": use a plain file name, with no "/" or "\\"`);
        }
        scan.virtualFiles.push({ path: virtualPath(marker.file), kind: 'resource', content: node.value ?? '', documentation: path, line: _line(node) });
        return;
      }
      // A code block showcase's entry point, with a generated name
      const extension = _EXTENSIONS[lang.toLowerCase()] ?? lang.toLowerCase();
      addShowcase(node, 'code-block', marker, (index) => {
        const generated = `${stem}.showcase-${index}.${extension}`;
        if (!isValidVirtualFileName(generated)) {
          error(node, `The code block's language "${lang}" can't be a file extension`);
          return undefined;
        }
        scan.virtualFiles.push({ path: virtualPath(generated), kind: 'entry', content: node.value ?? '', documentation: path, line: _line(node) });
        return virtualPath(generated);
      });
      return;
    }

    // Images and reference definitions never hold a marker
    const titled = isShowcaseMarker((node.title ?? '').trim().split(/\s+/)[0]);
    if ((node.type === 'image' || node.type === 'definition') && titled) {
      error(node, `Only inline links can be showcases; ${node.type === 'image' ? 'an image' : 'a reference definition'} can't hold a showcase marker`);
      return;
    }

    // Links: linked showcases' entry points, and links and images to check
    if (node.type === 'link' && titled) {
      const { marker, error: markerError } = parseShowcaseMarker(node.title!);
      if (!marker) return error(node, markerError);
      if (marker.file !== undefined) {
        return error(node, `A showcase's entry point can't have a "file" key; a resource's marker is "showcase file=<name>", on a code block`);
      }
      if (marker.display === 'block') {
        const blockError = _checkBlockPlacement(node, ancestors);
        if (blockError) return error(node, blockError);
      }
      const entry = _resolveEntry(path, node.url ?? '');
      if ('error' in entry) return error(node, entry.error);
      addShowcase(node, 'link', marker, () => entry.path);
      return;
    }
    if (!node.url || isAbsoluteUrl(node.url) || node.url.startsWith('#')) return;
    if (node.type === 'link' || node.type === 'definition') {
      scan.links.push({ href: node.url, line: _line(node) });
    } else if (node.type === 'image') {
      scan.images.push({ href: node.url, line: _line(node) });
    }
  });
  return scan;
}

/**
 * Resolves a linked showcase's entry point: a relative path with no query or fragment, inside the host repository, naming a file
 * @param from POSIX-style path of the documentation file holding the link
 * @param href The link's target
 * @returns The entry point's path, relative to the root, or the error that prevents resolving it (whether the file exists is not checked here)
 */
function _resolveEntry(from: string, href: string): { path: string } | { error: string } {
  if (isAbsoluteUrl(href)) {
    return { error: `A linked showcase's entry point must be a relative path, not "${href}"` };
  }
  const target = splitLink(href);
  if (!target) {
    return { error: `A linked showcase's entry point "${href}" can't be URL-decoded` };
  }
  if (target.query || target.fragment) {
    return { error: `A linked showcase's entry point can't have a query or fragment: "${href}"` };
  }
  const resolved = resolvePath(from, target.path);
  if (!resolved) {
    return { error: `A linked showcase's entry point "${href}" is outside the host repository` };
  }
  if (resolved.isFolder || !resolved.path) {
    return { error: `A linked showcase's entry point "${href}" must name a file, not a folder` };
  }
  return { path: resolved.path };
}

/**
 * Resolves a showcase's included files against its documentation file's folder: each inside the host repository, naming a file (whether it
 * exists is not checked here), none the entry point itself, none twice
 * @param from POSIX-style path of the documentation file holding the showcase
 * @param entry POSIX-style path of the showcase's entry point, relative to the root
 * @param include The included paths, URL-decoded, as written
 * @returns The included files' paths, relative to the root, in the marker's order, or the error that prevents resolving them
 */
function _resolveIncludes(from: string, entry: string, include: string[]): { paths: string[] } | { error: string } {
  const paths: string[] = [];
  for (const written of include) {
    const resolved = resolvePath(from, written);
    if (!resolved) {
      return { error: `Included file "${written}" is outside the host repository` };
    }
    if (resolved.isFolder || !resolved.path) {
      return { error: `Included file "${written}" must name a file, not a folder` };
    }
    if (resolved.path === entry) {
      return { error: `Included file "${written}" is the showcase's own entry point` };
    }
    if (paths.includes(resolved.path)) {
      return { error: `Included file "${resolved.path}" is listed twice` };
    }
    paths.push(resolved.path);
  }
  return { paths };
}

/**
 * Checks where a linked showcase shown as a block is: alone in its paragraph (apart from whitespace), that paragraph anywhere but in a footnote
 * definition (in a list item, a blockquote, or neither)
 * @param node The link
 * @param ancestors Its ancestors, from the root
 * @returns The error, or undefined if it is placed as a block can be
 */
function _checkBlockPlacement(node: _Node, ancestors: _Node[]): string | undefined {
  const parent = ancestors[ancestors.length - 1];
  if (parent?.type !== 'paragraph') {
    return `A linked showcase shown as a block must be alone in a paragraph, not in a "${parent?.type ?? 'root'}" node`;
  }
  if (parent.children!.some((child) => child !== node && !(child.type === 'text' && !child.value?.trim()))) {
    return 'A linked showcase shown as a block must be alone in its paragraph';
  }
  if (ancestors.some((ancestor) => ancestor.type === 'footnoteDefinition')) {
    return "A linked showcase shown as a block can't be in a footnote";
  }
  return undefined;
}

/**
 * Visits every node of a syntax tree, in document order
 * @param node Node to start at
 * @param ancestors The node's ancestors, from the root
 * @param visitor Called for each node, with its ancestors
 */
function _visit(node: _Node, ancestors: _Node[], visitor: (node: _Node, ancestors: _Node[]) => void): void {
  visitor(node, ancestors);
  for (const child of node.children ?? []) {
    _visit(child, [...ancestors, node], visitor);
  }
}

/**
 * Gets the line a node starts at
 * @param node A syntax tree node
 * @returns Its line, from 1
 */
function _line(node: _Node): number {
  return node.position?.start.line ?? 1;
}

// #endregion
