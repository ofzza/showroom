/**
 * Serve: `showroom serve`, previewing the showroom with Vite's dev server, with every showcase built into its showcase frame, served from memory;
 * after a change, it checks and builds again, and reloads the page, or only the showcase frames that changed. Internal: loaded by main() with a
 * dynamic `import()`, so library users and `showroom check` never load Vite, and not re-exported.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Ignore } from 'ignore';
import { createServer, type ViteDevServer } from 'vite';
import { check, type CheckIssue, type CheckResult } from '../check/index.js';
import { formatIssues, readIgnoreMatcher } from '../check/internal/index.js';
import type { CliOutput } from '../index.js';
import type { ShownHostInformation, ShownShowcase } from '../../app/host/index.js';
import { readConfiguration } from '../../configuration/index.js';
import type { HostInformation } from '../../host/index.js';
import { buildShowcases, getBuildShowcasesIssues, getErrorFrame, type BuildShowcasesResult, type ShowcaseFrame } from '../../showcases/index.js';
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
 * @param getMatcher Gets the ignore matcher of the latest successful check, so changes to `showroom.json` apply without a restart
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

// #region Showcase frames

/**
 * Gets the showcase frames `serve` serves after building the showcases: each showcase's showcase frame, or the showcase frame showing its build
 * errors when it didn't build, in showcase order
 * @param host Host information of the check the showcases were built for
 * @param built The outcome of building them
 * @returns The showcase frames, by showcase id
 */
export function getServedFrames(host: HostInformation, built: Pick<BuildShowcasesResult, 'frames' | 'errors'>): Map<string, ShowcaseFrame> {
  const frames = new Map<string, ShowcaseFrame>();
  for (const showcase of host.showcases) {
    const frame = built.frames.get(showcase.id);
    const errors = built.errors.get(showcase.id);
    if (frame) frames.set(showcase.id, frame);
    else if (errors) frames.set(showcase.id, getErrorFrame(showcase, errors));
  }
  return frames;
}

/**
 * Represents what changed in the shown host information after a run, and so what the page needs
 */
export type ShownChange = 'none' | 'showcases' | 'reload';

/**
 * Gets what changed between two shown host informations: anything but the showcase frames' URLs needs a full reload (a documentation file, the
 * project information, a showcase added, removed or moved); changed URLs alone only need the changed showcase frames reloaded
 * @param previous The shown host information shown so far
 * @param next The new one
 * @returns What changed
 */
export function getShownChange(previous: ShownHostInformation, next: ShownHostInformation): ShownChange {
  const withoutUrls = (shown: ShownHostInformation) => JSON.stringify({ ...shown, showcases: shown.showcases.map(({ url: _url, ...rest }) => rest) });
  if (withoutUrls(previous) !== withoutUrls(next)) return 'reload';
  return JSON.stringify(previous.showcases) === JSON.stringify(next.showcases) ? 'none' : 'showcases';
}

// #endregion

// #region Host watcher

/**
 * Name of the custom HMR event telling the showroom the showcase frames' new URLs, with every shown showcase as its data
 */
export const SHOWCASES_EVENT = 'showroom:showcases';

/**
 * Name of the custom HMR event telling the showroom the current issues, as its data
 */
export const ISSUES_EVENT = 'showroom:issues';

/**
 * Represents what the host watcher updates on the page after a run
 */
export interface ReloadTarget {
  /**
   * Invalidates the served shown host information, and fully reloads the page
   */
  reload: () => void;
  /**
   * Invalidates the served shown host information, and sends the page a custom HMR event
   * @param event Name of the event (SHOWCASES_EVENT, ISSUES_EVENT)
   * @param data Its data
   */
  send: (event: string, data: ShownShowcase[] | CheckIssue[]) => void;
}

/**
 * Represents the state `serve` shows, as one run of the host watcher leaves it
 */
export interface ServedState {
  /**
   * The shown host information of the latest successful check, with its showcases' URLs
   */
  host: ShownHostInformation;
  /**
   * The showcase frames of the latest successful build, by showcase id, including those showing build errors
   */
  frames: ReadonlyMap<string, ShowcaseFrame>;
  /**
   * The current issues: the latest check's, and the showcases' build errors
   */
  issues: CheckIssue[];
}

/**
 * Represents the options of a host watcher
 */
export interface HostWatcherOptions {
  /**
   * The state of the first run, whose issues are already written
   */
  initial: ServedState;
  /**
   * The ignore matcher of the first check
   */
  matcher?: Ignore;
  /**
   * Checks the host repository again
   */
  check: () => Promise<CheckResult>;
  /**
   * Builds the showcases of a passed check; when it throws, the last showcase frames are kept
   */
  build: (host: HostInformation) => Promise<BuildShowcasesResult>;
  /**
   * Reads the ignore matcher again, after a successful check
   */
  readMatcher: () => Promise<Ignore | undefined>;
  /**
   * What to update on the page after a run
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
 * Represents a host watcher: after changes, it reruns the check and builds the showcases, as one run, then reloads the page, or sends it the changed
 * showcase frames and issues
 */
export interface HostWatcher {
  /**
   * Notifies the watcher of a change, rerunning once changes stop for the delay
   */
  notify: () => void;
  /**
   * Reruns now
   * @returns Resolves once the run, and any run requested while it ran, are done
   */
  update: () => Promise<void>;
  /**
   * Gets the shown host information of the latest successful check
   */
  getHost: () => ShownHostInformation;
  /**
   * Gets the showcase frames to serve, by showcase id
   */
  getFrames: () => ReadonlyMap<string, ShowcaseFrame>;
  /**
   * Gets the current issues
   */
  getIssues: () => CheckIssue[];
  /**
   * Gets the ignore matcher of the latest successful check
   */
  getMatcher: () => Ignore | undefined;
  /**
   * Stops the watcher, cancelling a pending run; nothing is written or sent after it
   * @returns Resolves once a running run is done
   */
  close: () => Promise<void>;
}

/**
 * Default time to wait after the last change before checking again, in milliseconds
 */
export const DEFAULT_WATCH_DELAY = 100;

/**
 * Runs the first build of `serve`, or a later one: builds the showcases of a passed check, and gets the state to serve
 * @param host Host information of the passed check
 * @param build Builds the showcases
 * @param previous The showcase frames to keep if the build throws
 * @returns The showcase frames to serve, and the build's issues (or the error it threw)
 */
export async function runBuild(
  host: HostInformation,
  build: (host: HostInformation) => Promise<BuildShowcasesResult>,
  previous: ReadonlyMap<string, ShowcaseFrame>,
): Promise<{ frames: ReadonlyMap<string, ShowcaseFrame>; issues: CheckIssue[] }> {
  try {
    const built = await build(host);
    return { frames: getServedFrames(host, built), issues: getBuildShowcasesIssues(built) };
  } catch (err) {
    return { frames: previous, issues: [{ severity: 'error', message: `The showcases failed to build: ${(err as Error).message}` }] };
  }
}

/**
 * Creates a host watcher
 * @param options Options of the watcher
 * @returns The host watcher
 */
export function createHostWatcher(options: HostWatcherOptions): HostWatcher {
  const delay = options.delay ?? DEFAULT_WATCH_DELAY;
  let state = options.initial;
  let matcher = options.matcher;
  let written = formatIssues(state.issues);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let again = false;
  let closed = false;

  /**
   * Runs once: checks, builds the showcases of a passed check, writes the issues when they differ from the last ones written, swaps the state, and
   * reloads the page or sends it what changed
   */
  const run = async () => {
    const result = await options.check();
    if (closed) return;
    let next: ServedState;
    if (result.passed && result.host) {
      // A passed check: build its showcases
      const built = await runBuild(result.host, options.build, state.frames);
      if (closed) return;
      matcher = (await options.readMatcher()) ?? matcher;
      next = { host: getShownHostInformation(result.host, built.frames), frames: built.frames, issues: [...result.issues, ...built.issues] };
    } else {
      // A failed check keeps the last good data, and shows its issues
      next = { ...state, issues: result.issues };
    }
    if (closed) return;

    const issues = formatIssues(next.issues);
    if (issues !== written) {
      options.output.stderr(issues);
      written = issues;
    }
    const change = getShownChange(state.host, next.host);
    const issuesChanged = JSON.stringify(next.issues) !== JSON.stringify(state.issues);
    state = next;
    if (change === 'reload') {
      options.target.reload();
      return;
    }
    if (change === 'showcases') options.target.send(SHOWCASES_EVENT, state.host.showcases);
    if (issuesChanged) options.target.send(ISSUES_EVENT, state.issues);
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
    getHost: () => state.host,
    getFrames: () => state.frames,
    getIssues: () => state.issues,
    getMatcher: () => matcher,
    close: async () => {
      closed = true;
      clearTimeout(timer);
      await running?.catch(() => undefined);
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
 * Represents the options of `showroom serve`
 */
export interface ServeOptions {
  /**
   * Path of the host repository's root
   */
  root: string;
  /**
   * Port of the dev server; 0 for any free one
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
   * Folder of the showroom (see getAppDir())
   */
  appDir?: string;
  /**
   * Stops serving once aborted, as `SIGINT` and `SIGTERM` do; internal, for the tests, never set by the command line
   */
  signal?: AbortSignal;
  /**
   * Called with the dev server's URL once it listens; internal, for the tests, never set by the command line
   */
  onListening?: (url: string) => void;
}

/**
 * Waits until the process is asked to stop (`SIGINT`, `SIGTERM`), the signal is aborted, or the dev server closes by itself
 * @param server The dev server
 * @param signal The signal stopping it, if any
 * @returns Resolves when any of these happens, at once if the signal is already aborted
 */
function _waitForStop(server: ViteDevServer, signal?: AbortSignal): Promise<void> {
  return new Promise((done) => {
    const stop = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      signal?.removeEventListener('abort', stop);
      server.httpServer?.off('close', stop);
      done();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    signal?.addEventListener('abort', stop);
    server.httpServer?.on('close', stop);
    if (signal?.aborted) stop();
  });
}

/**
 * Builds the showcases of a passed check, reading the configuration again, so a change to its custom showcase adapters applies without a restart
 * @param root Path of the host repository's root
 * @param host Host information of the passed check
 * @returns The outcome of building them; throws if the configuration can't be read
 */
async function _buildShowcases(root: string, host: HostInformation): Promise<BuildShowcasesResult> {
  const { configuration, errors } = await readConfiguration(root);
  if (!configuration) throw new Error(errors?.join('; ') ?? 'The configuration could not be read');
  return buildShowcases({ root, host, configuration });
}

/**
 * Serves the showroom of a host repository with Vite's dev server, until the process is asked to stop: checks it, builds every showcase, then
 * listens. A showcase that doesn't build shows its build errors in its showcase frame, and never stops `serve`.
 * @param options Options of the command
 * @returns Exit code: 0 once stopped, 1 if the first check fails or the server can't start
 */
export async function serve({ root, port = DEFAULT_PORT, outDir, output, appDir = getAppDir(), signal, onListening }: ServeOptions): Promise<number> {
  // Check the host repository first, then build its showcases
  const first = await check(root, { outDir });
  if (!first.passed || !first.host) {
    output.stderr(formatIssues(first.issues));
    return 1;
  }
  const build = (host: HostInformation) => _buildShowcases(root, host);
  const built = await runBuild(first.host, build, new Map());
  const initial: ServedState = {
    host: getShownHostInformation(first.host, built.frames),
    frames: built.frames,
    issues: [...first.issues, ...built.issues],
  };
  output.stderr(formatIssues(initial.issues));

  // Vite's cache lives in a fresh folder of its own, removed on exit
  const cacheDir = await mkdtemp(join(tmpdir(), 'showroom-'));
  let server: ViteDevServer | undefined;
  let watcher: HostWatcher | undefined;
  try {
    /**
     * Invalidates the virtual module serving the shown host information, so the page's next load gets the new one
     */
    const invalidate = () => {
      const environment = server?.environments.client;
      const module = environment?.moduleGraph.getModuleById(RESOLVED_HOST_MODULE_ID);
      if (module) environment!.moduleGraph.invalidateModule(module);
    };
    const current = createHostWatcher({
      initial,
      matcher: await readIgnoreMatcher(root, outDir),
      check: () => check(root, { outDir }),
      build,
      readMatcher: () => readIgnoreMatcher(root, outDir),
      output,
      target: {
        reload: () => {
          invalidate();
          server?.environments.client.hot.send({ type: 'full-reload' });
        },
        send: (event, data) => {
          invalidate();
          server?.environments.client.hot.send(event, data);
        },
      },
    });
    watcher = current;

    // Start the dev server, watching the host repository too
    const configuration = getViteConfiguration({ appDir, cacheDir, getHost: current.getHost, getFrames: current.getFrames, getIssues: current.getIssues });
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
    output.stdout(`Serving the showroom of ${first.host.project.name} at ${url}\nPress Ctrl+C to stop.\n`);
    onListening?.(url);

    await _waitForStop(server, signal);
    return 0;
  } catch (err) {
    output.stderr(`error: ${(err as Error).message}\n`);
    return 1;
  } finally {
    await watcher?.close();
    await server?.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}

// #endregion
