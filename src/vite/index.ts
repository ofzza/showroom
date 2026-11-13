/**
 * The Vite configuration of the showroom, shared by `showroom serve` and `showroom build`: Vite's root is the application's folder inside
 * the package (`dist/app/`), the shown host information is served as a virtual module, the showcase frames are served from memory or emitted into
 * the build, the linked files are served from the host repository or copied into the build, and React is always `showroom`'s own copy. Internal: not
 * re-exported.
 */

import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Alias, InlineConfig, Plugin } from 'vite';
import type { CheckIssue } from '../cli/check/index.js';
import type { HostInformation, LinkedFile } from '../host/index.js';
import { LINKED_FILES_FOLDER } from '../linked-files/index.js';
import type { ShownHostInformation } from '../app/host/index.js';
import { getShowcaseFrameUrl, type ShowcaseFrame } from '../showcases/index.js';

// #region Shown host information

/**
 * Id of the virtual module serving the shown host information, which the showroom's entry point imports
 */
export const HOST_MODULE_ID = 'virtual:showroom-host';

/**
 * Id the virtual module is resolved to; the `\0` prefix keeps other plugins from treating it as a file
 */
export const RESOLVED_HOST_MODULE_ID = `\0${HOST_MODULE_ID}`;

/**
 * Gets the shown host information: the part of the host information the showroom presents
 * @param host Host information
 * @param frames The showcase frames built, by showcase id; none when they aren't built
 * @returns The project information, documentation files and linked files, without the code file index, and the showcases with a showcase frame
 */
export function getShownHostInformation(
  host: HostInformation,
  frames?: ReadonlyMap<string, Pick<ShowcaseFrame, 'folder' | 'page' | 'files'>>,
): ShownHostInformation {
  const showcases = host.showcases.flatMap(({ id, documentation, offset }) => {
    const frame = frames?.get(id);
    return frame ? [{ id, documentation, offset, url: getShowcaseFrameUrl(frame) }] : [];
  });
  return { project: host.project, documentation: host.documentation, showcases, linkedFiles: host.linkedFiles };
}

/**
 * Escapes text for HTML
 * @param text Text to escape
 * @returns The text with `&`, `<`, `>` and `"` escaped
 */
function _escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Creates the Vite plugin serving the shown host information as the `virtual:showroom-host` module's default export, and the current issues as its
 * `issues` export, and setting the page's `<title>` to the project's name
 * @param getHost Gets the shown host information to serve; called on every load, so it can change while serving
 * @param getIssues Gets the current issues to show (`serve`'s); none if not given (`build`, which stops on errors)
 * @returns The Vite plugin
 */
export function createHostPlugin(getHost: () => ShownHostInformation, getIssues: () => CheckIssue[] = () => []): Plugin {
  return {
    name: 'showroom-host',
    resolveId: (id) => (id === HOST_MODULE_ID ? RESOLVED_HOST_MODULE_ID : undefined),
    load: (id) =>
      id === RESOLVED_HOST_MODULE_ID ? `export default ${JSON.stringify(getHost())};\nexport const issues = ${JSON.stringify(getIssues())};\n` : undefined,
    transformIndexHtml: (html) => html.replace(/<title>[^<]*<\/title>/, `<title>${_escapeHtml(getHost().project.name)}</title>`),
  };
}

// #endregion

// #region Showcase frames

/**
 * Content types of the files a showcase frame is served with, by extension; any other file is served as `application/octet-stream`
 */
const _CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/**
 * Gets the content type of a showcase frame's file
 * @param path Path of the file
 * @returns Its content type, by its extension, case-insensitively
 */
export function getContentType(path: string): string {
  const extension = /\.([^./]+)$/.exec(path)?.[1].toLowerCase();
  return (extension && Object.hasOwn(_CONTENT_TYPES, extension) && _CONTENT_TYPES[extension]) || 'application/octet-stream';
}

/**
 * Represents a Connect middleware, as Vite's dev server runs them
 */
export type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

/**
 * Gets the path a request names, relative to the server's root and URL-decoded, without its query or fragment
 * @param request The request
 * @returns The path, or undefined if it can't be URL-decoded
 */
function _getRequestPath(request: IncomingMessage): string | undefined {
  try {
    return (request.url ?? '').split(/[?#]/)[0].replace(/^\/+/, '').split('/').map(decodeURIComponent).join('/');
  } catch (_err) {
    return undefined;
  }
}

/**
 * Answers a request with a 404, with `Cache-Control: no-store`
 * @param request The request
 * @param response Its response
 */
function _notFound(request: IncomingMessage, response: ServerResponse): void {
  response.statusCode = 404;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end(request.method === 'HEAD' ? undefined : 'Not found');
}

/**
 * Answers a request with a file's content, with `Cache-Control: no-store`
 * @param request The request
 * @param response Its response
 * @param contentType Content type of the file
 * @param content Content of the file
 */
function _send(request: IncomingMessage, response: ServerResponse, contentType: string, content: Uint8Array): void {
  response.statusCode = 200;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', content.byteLength);
  response.end(request.method === 'HEAD' ? undefined : content);
}

/**
 * Creates the dev server's middleware serving the showcase frames from memory, at the paths `build` writes them to, with `Cache-Control: no-store`.
 * It answers only the requests inside a showcase frame's folder: a file of the showcase frame, or a 404 for a missing one; every other request
 * (e.g. the showroom's own `showcases/index.js`) goes on to Vite.
 * @param getFrames Gets the showcase frames to serve, by showcase id; called on every request, so they can change while serving
 * @returns The middleware
 */
export function createShowcaseFramesMiddleware(getFrames: () => ReadonlyMap<string, ShowcaseFrame>): Middleware {
  return (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();
    const path = _getRequestPath(request);
    if (path === undefined) return next();
    for (const frame of getFrames().values()) {
      if (!path.startsWith(`${frame.folder}/`)) continue;
      const file = frame.files.find((candidate) => candidate.path === path.slice(frame.folder.length + 1));
      if (!file) return _notFound(request, response);
      const content = typeof file.content === 'string' ? Buffer.from(file.content, 'utf8') : Buffer.from(file.content);
      return _send(request, response, getContentType(file.path), content);
    }
    next();
  };
}

/**
 * Creates the Vite plugin of the showcase frames: in `serve`, its middleware hands them out from memory, ahead of Vite's own; in `build`, it emits
 * their files into the build, each in its showcase frame's folder, so that the build's `emptyOutDir` and its marker cover them
 * @param getFrames Gets the showcase frames to serve or emit, by showcase id
 * @returns The Vite plugin
 */
export function createShowcaseFramesPlugin(getFrames: () => ReadonlyMap<string, ShowcaseFrame>): Plugin {
  return {
    name: 'showroom-showcase-frames',
    configureServer(server) {
      server.middlewares.use(createShowcaseFramesMiddleware(getFrames));
    },
    generateBundle() {
      for (const frame of getFrames().values()) {
        for (const file of frame.files) {
          this.emitFile({ type: 'asset', fileName: `${frame.folder}/${file.path}`, source: file.content });
        }
      }
    },
  };
}

// #endregion

// #region Linked files

/**
 * Gets the content type a linked file is served with in `serve`: by its extension, or plain text for a text file whose extension says nothing
 * @param file The linked file
 * @returns Its content type
 */
export function getLinkedFileContentType(file: LinkedFile): string {
  const contentType = getContentType(file.path);
  return file.text && contentType === 'application/octet-stream' ? 'text/plain; charset=utf-8' : contentType;
}

/**
 * Creates the dev server's middleware serving the linked files from the host repository, read on every request, at the paths `build` copies them
 * to (`files/<path>`), with `Cache-Control: no-store`. It answers every request in the linked files' folder: a linked file, or a 404 for any other
 * path, so `serve` hands out nothing `build` doesn't publish; every other request goes on.
 * @param root Path of the host repository's root
 * @param getLinkedFiles Gets the linked files to serve; called on every request, so they can change while serving
 * @returns The middleware
 */
export function createLinkedFilesMiddleware(root: string, getLinkedFiles: () => readonly LinkedFile[]): Middleware {
  return (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();
    const path = _getRequestPath(request);
    if (path === undefined || !path.startsWith(`${LINKED_FILES_FOLDER}/`)) return next();
    const file = getLinkedFiles().find((candidate) => candidate.path === path.slice(LINKED_FILES_FOLDER.length + 1));
    if (!file) return _notFound(request, response);
    readFile(join(root, file.path)).then(
      (content) => _send(request, response, getLinkedFileContentType(file), content),
      () => _notFound(request, response),
    );
  };
}

/**
 * Creates the Vite plugin of the linked files: in `serve`, its middleware hands them out from the host repository, ahead of Vite's own; in `build`,
 * it copies them into the build, each at `files/<path>`, so that the build's `emptyOutDir` and its marker cover them
 * @param root Path of the host repository's root
 * @param getLinkedFiles Gets the linked files to serve or copy
 * @returns The Vite plugin
 */
export function createLinkedFilesPlugin(root: string, getLinkedFiles: () => readonly LinkedFile[]): Plugin {
  return {
    name: 'showroom-linked-files',
    configureServer(server) {
      server.middlewares.use(createLinkedFilesMiddleware(root, getLinkedFiles));
    },
    async generateBundle() {
      for (const file of getLinkedFiles()) {
        this.emitFile({ type: 'asset', fileName: `${LINKED_FILES_FOLDER}/${file.path}`, source: await readFile(join(root, file.path)) });
      }
    },
  };
}

// #endregion

// #region React aliases

/**
 * Gets the aliases resolving React, React DOM and the scheduler to `showroom`'s own copies, so a host repository's different React (e.g. one FluentUI is
 * hoisted next to) never mixes in, which would break hooks
 * @returns The aliases, matching each package and its subpaths (e.g. `react/jsx-runtime`, `react-dom/client`)
 */
export function getReactAliases(): Alias[] {
  const require = createRequire(import.meta.url);
  const reactDomPath = require.resolve('react-dom/package.json');
  const packages: [string, string][] = [
    ['react', require.resolve('react/package.json')],
    ['react-dom', reactDomPath],
    ['scheduler', createRequire(reactDomPath).resolve('scheduler/package.json')],
  ];
  return packages.map(([name, packageJson]) => ({ find: new RegExp(`^${name}(/.*)?$`), replacement: `${dirname(packageJson)}$1` }));
}

// #endregion

// #region Configuration

/**
 * Gets the folder of the showroom inside the package: `dist/app/`, holding its static `index.html` and its compiled code
 * @returns Path of the folder
 */
export function getAppDir(): string {
  return fileURLToPath(new URL('../app/', import.meta.url));
}

/**
 * Represents the options of the showroom's Vite configuration
 */
export interface ViteConfigurationOptions {
  /**
   * Folder of the showroom, Vite's root (see getAppDir())
   */
  appDir: string;
  /**
   * Vite's cache folder: a fresh folder per run, outside the package and the host repository
   */
  cacheDir: string;
  /**
   * Path of the host repository's root, which the linked files are read from
   */
  hostRoot: string;
  /**
   * Gets the shown host information to serve or build, its linked files included
   */
  getHost: () => ShownHostInformation;
  /**
   * Gets the showcase frames to serve or build, by showcase id; none if not given
   */
  getFrames?: () => ReadonlyMap<string, ShowcaseFrame>;
  /**
   * Gets the current issues the showroom shows (`serve`'s); none if not given
   */
  getIssues?: () => CheckIssue[];
}

/**
 * Gets the Vite configuration of the showroom. It reads no Vite configuration file, and uses relative asset paths (`base: './'`), so the
 * built application works on static hosting under any path.
 * @param options Options of the configuration
 * @returns Vite's inline configuration; `serve` and `build` add their own `server` and `build` options
 */
export function getViteConfiguration({ appDir, cacheDir, hostRoot, getHost, getFrames = () => new Map(), getIssues }: ViteConfigurationOptions): InlineConfig {
  return {
    configFile: false,
    root: appDir,
    base: './',
    cacheDir,
    clearScreen: false,
    logLevel: 'warn',
    plugins: [createHostPlugin(getHost, getIssues), createShowcaseFramesPlugin(getFrames), createLinkedFilesPlugin(hostRoot, () => getHost().linkedFiles)],
    resolve: { alias: getReactAliases() },
  };
}

// #endregion
