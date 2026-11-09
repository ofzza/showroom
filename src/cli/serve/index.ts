/**
 * Serve: `tsshowcase serve`, previewing the showcase application with Vite's dev server, and reloading it when the shown host information changes.
 * Internal: loaded by main() with a dynamic `import()`, so library users and `tsshowcase check` never load Vite, and not re-exported.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Ignore } from 'ignore';
import { createServer, type ViteDevServer } from 'vite';
import { check, type CheckIssue, type CheckResult } from '../check/index.js';
import { formatIssues, readIgnoreMatcher } from '../check/internal/index.js';
import type { CliOutput } from '../index.js';
import type { ShownHostInformation } from '../../app/host/index.js';
import { RESOLVED_HOST_MODULE_ID, getAppDir, getShownHostInformation, getViteConfiguration } from '../../vite/index.js';

// #region Ignored paths

/**
 * Gets the path of a file or folder relative to the host repository's root, in POSIX style
 * @param root Path of the host repository's root
 * @param path Path of the file or folder, absolute or relative to the current directory
 * @returns The relative POSIX-style path, an empty string for the root itself, or undefined for a path outside the host repository
 */
function _relativeToRoot(root: string, path: string): string | undefined {
  const relativePath = relative(resolve(root), resolve(path));
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    return undefined;
  }
  return relativePath.split(sep).join('/');
}

/**
 * Creates the `ignored` function of the dev server's watcher, which keeps it from watching the host repository's ignored files and folders
 * @param root Path of the host repository's root
 * @param getMatcher Gets the ignore matcher of the latest successful check, so changes to `tsshowcase.json` apply without a restart
 * @returns A function telling if a path is ignored: never the root itself nor a path outside it; otherwise, if the matcher ignores it as a file or a folder
 */
export function createIgnored(root: string, getMatcher: () => Ignore | undefined): (path: string) => boolean {
  return (path) => {
    const relativePath = _relativeToRoot(root, path);
    const matcher = getMatcher();
    if (!relativePath || !matcher) {
      return false;
    }
    return matcher.ignores(relativePath) || matcher.ignores(`${relativePath}/`);
  };
}

// #endregion

// #region Host watcher

/**
 * Represents what the host watcher reloads when the shown host information changes
 */
export interface ReloadTarget {
  /**
   * Invalidates the served shown host information, and fully reloads the page
   */
  reload: () => void;
}

/**
 * Represents the options of a host watcher
 */
export interface HostWatcherOptions {
  /**
   * The shown host information of the first check
   */
  host: ShownHostInformation;
  /**
   * The ignore matcher of the first check
   */
  matcher?: Ignore;
  /**
   * The issues the first check reported, as already written
   */
  issues?: CheckIssue[];
  /**
   * Checks the host repository again
   */
  check: () => Promise<CheckResult>;
  /**
   * Reads the ignore matcher again, after a successful check
   */
  readMatcher: () => Promise<Ignore | undefined>;
  /**
   * What to reload when the shown host information changes
   */
  target: ReloadTarget;
  /**
   * Output to write the issues to
   */
  output: CliOutput;
  /**
   * Time to wait after the last change before checking again, in milliseconds
   */
  delay?: number;
}

/**
 * Represents a host watcher: it reruns the check after changes, and reloads the page when the shown host information changed
 */
export interface HostWatcher {
  /**
   * Notifies the watcher of a change, rerunning the check once changes stop for the delay
   */
  notify: () => void;
  /**
   * Reruns the check now, and reloads if the shown host information changed
   * @returns Resolves once the check, and any check requested while it ran, are done
   */
  update: () => Promise<void>;
  /**
   * Gets the shown host information of the latest successful check
   */
  getHost: () => ShownHostInformation;
  /**
   * Gets the ignore matcher of the latest successful check
   */
  getMatcher: () => Ignore | undefined;
  /**
   * Stops the watcher, cancelling a pending check
   */
  close: () => void;
}

/**
 * Default time to wait after the last change before checking again, in milliseconds
 */
export const DEFAULT_WATCH_DELAY = 100;

/**
 * Creates a host watcher
 * @param options Options of the watcher
 * @returns The host watcher
 */
export function createHostWatcher(options: HostWatcherOptions): HostWatcher {
  const delay = options.delay ?? DEFAULT_WATCH_DELAY;
  let host = options.host;
  let serialized = JSON.stringify(host);
  let matcher = options.matcher;
  let written = formatIssues(options.issues ?? []);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let again = false;
  let closed = false;

  /**
   * Runs the check once, writing its issues when they differ from the last ones written, and reloading when the shown host information changed
   */
  const run = async () => {
    const result = await options.check();
    const issues = formatIssues(result.issues);
    if (issues !== written) {
      options.output.stderr(issues);
      written = issues;
    }
    // A failed check keeps the last good data
    if (closed || !result.passed || !result.host) {
      return;
    }
    matcher = (await options.readMatcher()) ?? matcher;
    const shown = getShownHostInformation(result.host);
    const next = JSON.stringify(shown);
    if (next !== serialized && !closed) {
      host = shown;
      serialized = next;
      options.target.reload();
    }
  };

  const update = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await run();
        } while (again && !closed);
      } finally {
        running = undefined;
      }
    })();
    return running;
  };

  return {
    notify: () => {
      if (closed) return;
      clearTimeout(timer);
      timer = setTimeout(() => void update().catch((err: Error) => options.output.stderr(`error: ${err.message}\n`)), delay);
    },
    update,
    getHost: () => host,
    getMatcher: () => matcher,
    close: () => {
      closed = true;
      clearTimeout(timer);
    },
  };
}

// #endregion

// #region Serve

/**
 * Default port of the dev server; the next free one is used when it is taken
 */
export const DEFAULT_PORT = 5173;

/**
 * Represents the options of `tsshowcase serve`
 */
export interface ServeOptions {
  /**
   * Path of the host repository's root
   */
  root: string;
  /**
   * Port of the dev server
   */
  port?: number;
  /**
   * Output folder given on the command line, overriding the configuration's; it is never watched
   */
  outDir?: string;
  /**
   * Output to write to: the URL to stdout, issues to stderr
   */
  output: CliOutput;
  /**
   * Folder of the showcase application (see getAppDir())
   */
  appDir?: string;
}

/**
 * Waits until the process is asked to stop (`SIGINT`, `SIGTERM`), or the dev server closes by itself
 * @param server The dev server
 * @returns Resolves when either happens
 */
function _waitForStop(server: ViteDevServer): Promise<void> {
  return new Promise((done) => {
    const stop = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      server.httpServer?.off('close', stop);
      done();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    server.httpServer?.on('close', stop);
  });
}

/**
 * Serves the showcase application of a host repository with Vite's dev server, until the process is asked to stop
 * @param options Options of the command
 * @returns Exit code: 0 once stopped, 1 if the first check fails or the server can't start
 */
export async function serve({ root, port = DEFAULT_PORT, outDir, output, appDir = getAppDir() }: ServeOptions): Promise<number> {
  // Check the host repository first
  const first = await check(root, { outDir });
  output.stderr(formatIssues(first.issues));
  if (!first.passed || !first.host) {
    return 1;
  }

  // Vite's cache lives in a fresh folder of its own, removed on exit
  const cacheDir = await mkdtemp(join(tmpdir(), 'tsshowcase-'));
  let server: ViteDevServer | undefined;
  let watcher: HostWatcher | undefined;
  try {
    const current = createHostWatcher({
      host: getShownHostInformation(first.host),
      matcher: await readIgnoreMatcher(root, outDir),
      issues: first.issues,
      check: () => check(root, { outDir }),
      readMatcher: () => readIgnoreMatcher(root, outDir),
      output,
      target: {
        reload: () => {
          const environment = server?.environments.client;
          const module = environment?.moduleGraph.getModuleById(RESOLVED_HOST_MODULE_ID);
          if (module) environment!.moduleGraph.invalidateModule(module);
          environment?.hot.send({ type: 'full-reload' });
        },
      },
    });
    watcher = current;

    // Start the dev server, watching the host repository too
    const configuration = getViteConfiguration({ appDir, cacheDir, getHost: current.getHost });
    server = await createServer({
      ...configuration,
      server: { port, strictPort: false, watch: { ignored: [createIgnored(root, current.getMatcher)] } },
    });
    server.watcher.add(resolve(root));
    server.watcher.on('all', (_event, path) => {
      if (_relativeToRoot(root, path) !== undefined) current.notify();
    });
    await server.listen();
    const url = server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port}/`;
    output.stdout(`Serving the showcase application of ${first.host.project.name} at ${url}\nPress Ctrl+C to stop.\n`);

    await _waitForStop(server);
    return 0;
  } catch (err) {
    output.stderr(`error: ${(err as Error).message}\n`);
    return 1;
  } finally {
    watcher?.close();
    await server?.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}

// #endregion
