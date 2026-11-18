/**
 * Serve: `showroom serve`, previewing the showroom with Vite's dev server, with every showcase built into its showcase frame, served from memory;
 * after a change, it checks and builds again, and reloads the page, or sends it the showcases' updates. Internal: loaded by main() with a
 * dynamic `import()`, so library users and `showroom check` never load Vite, and not re-exported.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Ignore } from 'ignore';
import { createServer, type ViteDevServer } from 'vite';
import { checkHost, type CheckIssue, type CheckOptions, type CheckResult } from '../check/index.js';
import { escapeControlCharacters, formatIssues, getCustomShowcaseAdapterModules, readIgnoreMatcher } from '../check/internal/index.js';
import type { CliOutput } from '../index.js';
import type { ShownHostInformation, ShownShowcase } from '../../app/host/index.js';
import { readConfiguration } from '../../configuration/index.js';
import { createRunSession, type RunSession } from '../../host-copy/index.js';
import type { HostInformation } from '../../host/index.js';
import { buildShowcases, getBuildShowcasesIssues, type BuildShowcasesResult, type ShowcaseFrame } from '../../showcases/index.js';
import { RESOLVED_HOST_MODULE_ID, getAppDir, getShownHostInformation, getTabFileHashes, getViteConfiguration, type ShownBuild } from '../../vite/index.js';

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
 * Checks if the ignore matcher ignores a path, as a file or as a folder
 * @param matcher The ignore matcher
 * @param path POSIX-style path, relative to the host repository's root
 * @returns True if it is ignored
 */
function _isIgnored(matcher: Ignore, path: string): boolean {
  return matcher.ignores(path) || matcher.ignores(`${path}/`);
}

/**
 * Creates the `ignored` function of the dev server's watcher, which keeps it from watching the host repository's ignored files and folders, except
 * the files to watch that the showcases read (see BuildShowcasesResult's `watched`), and the folders leading to them
 * @param root Path of the host repository's root
 * @param getMatcher Gets the ignore matcher of the latest successful check, so changes to `showroom.json` apply without a restart
 * @param getWatched Gets the POSIX-style paths, relative to the root, of the files to watch, from the latest run; none if not given
 * @returns A function telling if a path is ignored: never the root itself, a path outside it, a file to watch or a folder leading to one; otherwise,
 * if the matcher ignores it as a file or a folder
 */
export function createIgnored(root: string, getMatcher: () => Ignore | undefined, getWatched: () => readonly string[] = () => []): (path: string) => boolean {
  return (path) => {
    const relativePath = _relativeToRoot(root, path);
    const matcher = getMatcher();
    if (!relativePath || !matcher) {
      return false;
    }
    if (getWatched().some((watched) => watched === relativePath || watched.startsWith(`${relativePath}/`))) {
      return false;
    }
    return _isIgnored(matcher, relativePath);
  };
}

/**
 * Gets what to add to the dev server's watcher so that it sees the files to watch under ignored paths: for each, the topmost ignored folder holding
 * it (so a folder deleted and built again is seen), or the file itself when only it is ignored; files to watch that aren't ignored need nothing
 * @param watched POSIX-style paths, relative to the host repository's root, of the files to watch
 * @param matcher The ignore matcher
 * @returns POSIX-style paths, relative to the root, of the folders and files to add, sorted, without duplicates
 */
export function getWatchTargets(watched: readonly string[], matcher: Ignore | undefined): string[] {
  if (!matcher) return [];
  const targets = new Set<string>();
  for (const path of watched) {
    const segments = path.split('/');
    for (let count = 1; count <= segments.length; count++) {
      const target = segments.slice(0, count).join('/');
      if (_isIgnored(matcher, target)) {
        targets.add(target);
        break;
      }
    }
  }
  return [...targets].sort();
}

// #endregion

// #region Shown changes

/**
 * Represents what changed in the shown host information after a run, and so what the page needs
 */
export type ShownChange = 'none' | 'showcases' | 'reload';

/**
 * Gets what changed between two shown host informations: anything but the showcases' updates (the URLs of the showcase frames and of their tabs,
 * the checks, the issues and the `build` status mark) needs a full reload (a documentation file, the project information, a showcase added, removed
 * or moved); changed updates alone are sent to the page, which reloads only the changed showcase frames, and fetches the changed tabs again
 * @param previous The shown host information shown so far
 * @param next The new one
 * @returns What changed
 */
export function getShownChange(previous: ShownHostInformation, next: ShownHostInformation): ShownChange {
  const withoutUpdates = (shown: ShownHostInformation) =>
    JSON.stringify({
      ...shown,
      showcases: shown.showcases.map(({ url: _url, checks: _checks, issues: _issues, buildMark: _buildMark, recording: _recording, tabs, ...rest }) => ({
        ...rest,
        tabs: tabs.map((tab) => (tab.source.kind === 'file' ? { ...tab, source: { ...tab.source, url: tab.source.url.split('?')[0] } } : tab)),
      })),
    });
  if (withoutUpdates(previous) !== withoutUpdates(next)) return 'reload';
  return JSON.stringify(previous.showcases) === JSON.stringify(next.showcases) ? 'none' : 'showcases';
}

// #endregion

// #region Host watcher

/**
 * Name of the custom HMR event telling the showroom the showcases' updates (the URLs of their showcase frames and tabs, their checks and issues),
 * with every shown showcase as its data
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
   * The showcase frames of the latest successful build, by showcase id: those of the showcases that built, their checks' errors or not
   */
  frames: ReadonlyMap<string, ShowcaseFrame>;
  /**
   * The checks each showcase's build ran, and its issues as shown, from the latest successful build; none if not given
   */
  shown?: Omit<ShownBuild, 'frames'>;
  /**
   * The current issues: the latest check's, and the showcases' build errors and warnings
   */
  issues: CheckIssue[];
  /**
   * POSIX-style paths, relative to the host repository's root, of the files to watch, from the latest build (see BuildShowcasesResult's `watched`)
   */
  watched: readonly string[];
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
  /**
   * Called with the files to watch after each run that changes them, and with the latest ignore matcher (see getWatchTargets())
   * @param watched POSIX-style paths, relative to the host repository's root, of the files to watch
   * @param matcher The ignore matcher of the latest successful check
   */
  watch?: (watched: readonly string[], matcher: Ignore | undefined) => void;
  /**
   * Gets the hashes of the text linked files shown as tabs, after a successful check (see getTabFileHashes()); none if not given
   */
  hashFiles?: (host: HostInformation) => Promise<ReadonlyMap<string, string>>;
  /**
   * True if the host repository is trusted, as the first check decided, for the whole session; not trusted if not given
   */
  trusted?: boolean;
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
   * Gets the files to watch, from the latest successful build
   */
  getWatched: () => readonly string[];
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
 * Runs the first build of `serve`, or a later one: builds the showcases of a passed check, and gets the state to serve. The files to watch are the
 * build's when every showcase builds; when any doesn't, the previous ones are kept as well, as a failed build only reads what it reached (e.g. a
 * deleted `dist/` it imports isn't among its reads, yet its rebuild must rerun it). The linked files are always among them, so a change of their
 * size or text-ness reloads the page.
 * @param host Host information of the passed check
 * @param build Builds the showcases
 * @param previous The showcase frames to keep if the build throws
 * @param previousWatched The files to watch to keep if the build throws, or a showcase doesn't build
 * @param previousShown The showcases' checks and issues to keep if the build throws
 * @returns The showcase frames to serve, the showcases' checks and issues, the build's issues (or the error it threw), and the files to watch
 */
export async function runBuild(
  host: HostInformation,
  build: (host: HostInformation) => Promise<BuildShowcasesResult>,
  previous: ReadonlyMap<string, ShowcaseFrame>,
  previousWatched: readonly string[] = [],
  previousShown: Omit<ShownBuild, 'frames'> = {},
): Promise<{ frames: ReadonlyMap<string, ShowcaseFrame>; shown: Omit<ShownBuild, 'frames'>; issues: CheckIssue[]; watched: readonly string[] }> {
  const linked = host.linkedFiles.map(({ path }) => path);
  const merge = (...lists: (readonly string[])[]): string[] => [...new Set(lists.flat())].sort();
  try {
    const built = await build(host);
    const watched = merge(built.errors.size ? previousWatched : [], built.watched, linked);
    return {
      frames: built.frames,
      shown: { checks: built.checks, shownIssues: built.shownIssues, recordings: built.recordings },
      issues: getBuildShowcasesIssues(built),
      watched,
    };
  } catch (err) {
    return {
      frames: previous,
      shown: previousShown,
      issues: [{ severity: 'error', message: `The showcases failed to build: ${(err as Error).message}` }],
      watched: merge(previousWatched, linked),
    };
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
      const built = await runBuild(result.host, options.build, state.frames, state.watched, state.shown);
      if (closed) return;
      matcher = (await options.readMatcher()) ?? matcher;
      const hashes = (await options.hashFiles?.(result.host)) ?? new Map<string, string>();
      if (closed) return;
      next = {
        host: getShownHostInformation(result.host, { frames: built.frames, ...built.shown, trusted: options.trusted ?? false }, hashes),
        frames: built.frames,
        shown: built.shown,
        issues: [...result.issues, ...built.issues],
        watched: built.watched,
      };
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
    const watchedChanged = JSON.stringify(next.watched) !== JSON.stringify(state.watched);
    state = next;
    if (watchedChanged) options.watch?.(state.watched, matcher);
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
      timer = setTimeout(() => void update().catch((err: Error) => options.output.stderr(`error: ${escapeControlCharacters(err.message, true)}\n`)), delay);
    },
    update,
    getHost: () => state.host,
    getFrames: () => state.frames,
    getIssues: () => state.issues,
    getMatcher: () => matcher,
    getWatched: () => state.watched,
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
   * Folder of the shared Mermaid bundle (see getMermaidDir()); the package's if not given
   */
  mermaidDir?: string;
  /**
   * Stops serving once aborted, as `SIGINT` and `SIGTERM` do; internal, for the tests, never set by the command line
   */
  signal?: AbortSignal;
  /**
   * Called with the dev server's URL once it listens; internal, for the tests, never set by the command line
   */
  onListening?: (url: string) => void;
  /**
   * Whether the host repository's code may run, or the function deciding it, called by the first check only (see CheckOptions' `trust`): its
   * decision holds for the whole session; not trusted if not given
   */
  trust?: CheckOptions['trust'];
  /**
   * Names of the environment variables passed on to recorded showcases' build steps (see CheckOptions' `passEnv`)
   */
  passEnv?: string[];
}

/**
 * Gets the notices of the custom showcase adapter modules a trusted session loads for the first time, after its first check: one for each module
 * whose path the session hasn't loaded before (a changed version of a module already loaded gets none), each string from the host repository escaped
 * @param loaded Absolute real paths of the modules the session has loaded so far, to which the new ones are added
 * @param modules The custom showcase adapter modules the latest check loaded (see getCustomShowcaseAdapterModules())
 * @returns One line per new module, each with its line break, or an empty string
 */
export function getTrustNotices(loaded: Set<string>, modules: readonly { name: string; path: string }[]): string {
  let notices = '';
  for (const { name, path } of modules) {
    if (loaded.has(path)) continue;
    loaded.add(path);
    notices += `notice: Running the custom showcase adapter ${escapeControlCharacters(name, false)} (${escapeControlCharacters(path, false)}), trusted for this session\n`;
  }
  return notices;
}

/**
 * Gets the warning of a check of `serve` that has something to trust while the session runs without trust although nobody was asked, as its first
 * check had nothing to trust
 * @param result The check's outcome
 * @returns The warning, or none
 */
export function getRestartWarnings(result: CheckResult): CheckIssue[] {
  if (result.trusted || !result.host?.showcases.length) return [];
  return [{ severity: 'warning', message: 'Showcases were added since `showroom serve` started without trust; restart it with --trust to build them' }];
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
 * Gets the custom showcase adapter modules a trusted check loads: those the configuration lists that exist
 * @param root Path of the host repository's root
 * @returns The modules, by name and absolute real path; none if the configuration can't be read
 */
async function _getLoadedModules(root: string): Promise<{ name: string; path: string }[]> {
  const { configuration } = await readConfiguration(root);
  return configuration ? getCustomShowcaseAdapterModules(root, configuration.customShowcaseAdapters ?? {}) : [];
}

/**
 * Builds the showcases of a passed check, in development mode, reading the configuration again, so a change to its custom showcase adapters applies
 * without a restart
 * @param root Path of the host repository's root
 * @param host Host information of the passed check
 * @param trust True if the host repository is trusted
 * @param session The run session, kept across runs
 * @param outDir Output folder given on the command line, if any
 * @param mermaidDir Folder of the shared Mermaid bundle; the package's if not given
 * @returns The outcome of building them; throws if the configuration can't be read
 */
async function _buildShowcases(
  root: string,
  host: HostInformation,
  trust: boolean,
  session: RunSession,
  outDir?: string,
  mermaidDir?: string,
): Promise<BuildShowcasesResult> {
  const { configuration, errors } = await readConfiguration(root);
  if (!configuration) throw new Error(errors?.join('; ') ?? 'The configuration could not be read');
  return buildShowcases({ root, host, configuration, mode: 'development', trust, session, outDir, mermaidDir });
}

/**
 * Serves the showroom of a host repository with Vite's dev server, until the process is asked to stop: checks it, builds every showcase, then
 * listens. A showcase that doesn't build is shown with its issues, and never stops `serve`. Trust is decided once, by the first check, for the whole
 * session; without it, no showcase is built (so no showcase frame is served), every showcase is shown as its source, and linked files of active
 * types are sent as plain text.
 * @param options Options of the command
 * @returns Exit code: 0 once stopped, 1 if the first check fails or the server can't start
 */
export async function serve({
  root,
  port = DEFAULT_PORT,
  outDir,
  output,
  appDir = getAppDir(),
  mermaidDir,
  signal,
  onListening,
  trust = false,
  passEnv = [],
}: ServeOptions): Promise<number> {
  // Check the host repository first, deciding trust for the session, then build its showcases
  let asked = typeof trust !== 'function';
  const decide: CheckOptions['trust'] =
    typeof trust === 'function'
      ? (request) => {
          asked = true;
          return trust(request);
        }
      : trust;
  const first = await checkHost(root, { outDir, trust: decide }, 'build');
  if (!first.passed || !first.host) {
    output.stderr(formatIssues(first.issues));
    return 1;
  }
  const trusted = first.trusted;
  // A trusted session notices each custom showcase adapter module it loads for the first time after its first check
  const loaded = new Set(trusted ? (await _getLoadedModules(root)).map(({ path }) => path) : []);
  // A later check that has something to trust while nobody was asked warns to restart with trust
  const checkAgain = async (): Promise<CheckResult> => {
    const result = await checkHost(root, { outDir, trust: trusted }, 'build');
    if (trusted) output.stderr(getTrustNotices(loaded, await _getLoadedModules(root)));
    return asked ? result : { ...result, issues: [...result.issues, ...getRestartWarnings(result)] };
  };
  // One run session for the whole session, keeping the host copy and the showcases' own folders across runs
  const session = createRunSession({ passEnv });
  const build = (host: HostInformation) => _buildShowcases(root, host, trusted, session, outDir, mermaidDir);
  let built: Awaited<ReturnType<typeof runBuild>>;
  try {
    built = await runBuild(first.host, build, new Map());
  } catch (err) {
    await session.dispose();
    throw err;
  }
  const initial: ServedState = {
    host: getShownHostInformation(first.host, { frames: built.frames, ...built.shown, trusted }, await getTabFileHashes(root, first.host)),
    frames: built.frames,
    shown: built.shown,
    issues: [...first.issues, ...built.issues],
    watched: built.watched,
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
    // The folders and files added to the dev server's watcher for the files to watch under ignored paths
    let targets: string[] = [];
    /**
     * Adds the folders and files holding the files to watch to the dev server's watcher, and removes those no longer needed
     * @param next POSIX-style paths, relative to the root, of the folders and files to watch (see getWatchTargets())
     */
    const watchTargets = (next: string[]) => {
      if (!server) return;
      const added = next.filter((target) => !targets.includes(target));
      const removed = targets.filter((target) => !next.includes(target));
      targets = next;
      if (removed.length) void server.watcher.unwatch(removed.map((target) => join(resolve(root), target)));
      if (added.length) server.watcher.add(added.map((target) => join(resolve(root), target)));
    };
    const current = createHostWatcher({
      initial,
      matcher: await readIgnoreMatcher(root, outDir),
      check: checkAgain,
      build,
      trusted,
      readMatcher: () => readIgnoreMatcher(root, outDir),
      hashFiles: (host) => getTabFileHashes(root, host),
      watch: (paths, matcher) => watchTargets(getWatchTargets(paths, matcher)),
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
    const configuration = getViteConfiguration({
      appDir,
      cacheDir,
      hostRoot: root,
      getHost: current.getHost,
      getFrames: current.getFrames,
      getIssues: current.getIssues,
      mermaidDir,
      onMermaidMissing: (message) => output.stderr(formatIssues([{ severity: 'warning', message }])),
    });
    server = await createServer({
      ...configuration,
      server: { port, strictPort: false, watch: { ignored: [createIgnored(root, current.getMatcher, current.getWatched)] } },
    });
    server.watcher.add(resolve(root));
    watchTargets(getWatchTargets(current.getWatched(), current.getMatcher()));
    server.watcher.on('all', (_event, path) => {
      if (_relativeToRoot(root, path) !== undefined) current.notify();
    });
    await server.listen();
    const url = server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port}/`;
    output.stdout(`Serving the showroom of ${escapeControlCharacters(first.host.project.name, false)} at ${url}\nPress Ctrl+C to stop.\n`);
    onListening?.(url);

    await _waitForStop(server, signal);
    return 0;
  } catch (err) {
    output.stderr(`error: ${escapeControlCharacters((err as Error).message, true)}\n`);
    return 1;
  } finally {
    await watcher?.close();
    await server?.close();
    await rm(cacheDir, { recursive: true, force: true });
    await session.dispose();
  }
}

// #endregion
