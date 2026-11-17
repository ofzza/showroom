/**
 * The host copy and the run session: `showroom`'s copy of the host repository, in a run folder of the user's cache folder, with the virtual files
 * written where they belong, kept in step with the host repository at the start of each run; and the run session owning that run folder for one
 * command (`check --showcases`, `build`, or `serve` across its runs), with its folders for the processes and the showcases, and `run()`. Node code,
 * internal, never re-exported.
 */

import ignore, { type Ignore } from 'ignore';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readdir, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { ShowcaseHostCopy, ShowcaseHostCopyContent, ShowcaseRun, ShowcaseRunOptions } from '../adapters/showcase/index.js';
import {
  BUILD_TIME_LIMIT,
  createPathReplacer,
  getCacheFolder,
  getRunEnvironment,
  registerRunFolder,
  resolveCommand,
  RUN_TIME_LIMIT,
  runProcess,
  unregisterRunFolder,
} from '../processes/index.js';

// #region Host copy

/**
 * Represents a file the host copy writes at its path, beside the host repository's own: a virtual file
 */
export interface HostCopyFile {
  /**
   * POSIX-style path, relative to the host repository's root
   */
  path: string;
  /**
   * Its content
   */
  content: string;
}

/**
 * Represents what the host copy knows of an entry it copied: the host repository's side as it was copied, and the copy's side as it was written
 */
interface _Copied {
  /**
   * Size and modification time of the host repository's file
   */
  size: number;
  mtimeMs: number;
  /**
   * Size and modification time of the copy's file, once written
   */
  copySize: number;
  copyMtimeMs: number;
}

/**
 * Represents an entry of a walked folder: a folder, a regular file or a symbolic link (anything else is left out)
 */
type _EntryKind = 'folder' | 'file' | 'link';

/**
 * Converts a path to POSIX style
 * @param path The path
 * @returns The path with `/` separators
 */
function _toPosix(path: string): string {
  return path.split(sep).join('/');
}

/**
 * Checks if a path is a folder or inside it
 * @param path Absolute path
 * @param folder Absolute path of the folder
 * @returns True if it is
 */
function _isInside(path: string, folder: string): boolean {
  const fromFolder = relative(folder, path);
  return !fromFolder.startsWith(`..${sep}`) && fromFolder !== '..' && !isAbsolute(fromFolder);
}

/**
 * Creates the function deciding what the host copy holds: a path is copied when any of the contents copies it, i.e. it isn't left out by its
 * `exclude` patterns, nor `.git` without `git`; the output folder is always left out
 * @param contents What each showcase adapter using the host copy copies
 * @param outputFolder POSIX-style path of the output folder, relative to the root, if any
 * @returns The function, given a POSIX-style path relative to the root, and whether it is a folder
 */
export function createCopyFilter(contents: readonly ShowcaseHostCopyContent[], outputFolder?: string): (path: string, folder: boolean) => boolean {
  const matchers = contents.map((content): { matcher: Ignore; git: boolean } => ({ matcher: ignore().add([...content.exclude]), git: content.git }));
  return (path, folder) => {
    if (outputFolder && (path === outputFolder || path.startsWith(`${outputFolder}/`))) return false;
    const git = path === '.git' || path.startsWith('.git/');
    return matchers.some(({ matcher, git: copiesGit }) => (!git || copiesGit) && !matcher.ignores(folder ? `${path}/` : path));
  };
}

/**
 * Represents the host copy: a copy of the host repository's root in a folder of the run folder, kept in step with it by sync()
 */
export class HostCopy {
  /**
   * Absolute path of the host repository's root
   */
  readonly root: string;
  /**
   * Absolute path of the host copy's root
   */
  readonly folder: string;
  /**
   * What it knows of the files it copied, by POSIX-style path
   */
  readonly #copied = new Map<string, _Copied>();
  /**
   * The virtual files it wrote, by path, with their content
   */
  readonly #written = new Map<string, string>();

  /**
   * Creates a host copy; nothing is copied until sync()
   * @param root Absolute path of the host repository's root
   * @param folder Absolute path of the host copy's root, an existing folder
   */
  constructor(root: string, folder: string) {
    this.root = resolve(root);
    this.folder = folder;
  }

  /**
   * Brings the host copy in step with the host repository: on its first call, copies what the contents copy (with copy-on-write clones where the
   * file system has them); then copies again each file whose size or modification time changed on either side since it was copied, removes what
   * the host repository no longer has (what the contents leave out, e.g. `bin/`, is left as it is), and writes the virtual files at their paths.
   * Symbolic links are kept as they are, a link whose real path leads outside the root is left out, and an absolute one into the root is made
   * relative, so nothing in the host copy reaches the host repository through it. Nothing is ever written through a link.
   * @param contents What each showcase adapter using the host copy copies
   * @param virtualFiles The files to write at their paths (the virtual files)
   * @param outputFolder POSIX-style path of the output folder, relative to the root, which is left out
   * @returns Resolves once in step; rejects when a virtual file would be written through a link
   */
  async sync(contents: readonly ShowcaseHostCopyContent[], virtualFiles: readonly HostCopyFile[], outputFolder?: string): Promise<void> {
    const copies = createCopyFilter(contents, outputFolder);
    const realRoot = await realpath(this.root);
    const virtualPaths = new Set(virtualFiles.map((file) => file.path));

    // The host repository's side
    const source = new Map<string, _EntryKind>();
    await this.#walk(this.root, '', copies, source);

    // Remove from the copy what the host repository doesn't have, or has as another kind
    await this.#prune('', copies, source, virtualPaths);

    // Copy what changed
    for (const [path, kind] of source) {
      const from = join(this.root, path);
      const to = join(this.folder, path);
      if (kind === 'folder') {
        await this.#ensureFolder(to);
      } else if (kind === 'file') {
        await this.#copyFile(path, from, to);
      } else {
        await this.#copyLink(from, to, realRoot);
      }
    }

    // Write the virtual files, never through a link
    for (const file of virtualFiles) {
      const to = join(this.folder, file.path);
      await this.#ensureParents(file.path);
      const current = await lstat(to).catch(() => undefined);
      if (current && this.#written.get(file.path) === file.content && current.isFile()) continue;
      if (current) await rm(to, { recursive: true, force: true });
      await writeFile(to, file.content);
      this.#written.set(file.path, file.content);
    }
    for (const path of [...this.#written.keys()]) if (!virtualPaths.has(path)) this.#written.delete(path);
  }

  /**
   * Walks a folder of the host repository, without following links, collecting what the host copy holds
   * @param folder Absolute path of the folder
   * @param path Its POSIX-style path, relative to the root
   * @param copies Decides what is copied
   * @param found The entries found, added to
   */
  async #walk(folder: string, path: string, copies: (path: string, folder: boolean) => boolean, found: Map<string, _EntryKind>): Promise<void> {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      const kind: _EntryKind | undefined = entry.isDirectory() ? 'folder' : entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'link' : undefined;
      if (!kind || !copies(entryPath, kind === 'folder')) continue;
      found.set(entryPath, kind);
      if (kind === 'folder') await this.#walk(join(folder, entry.name), entryPath, copies, found);
    }
  }

  /**
   * Removes from a folder of the host copy, without following links, each entry the host repository doesn't have (or has as another kind), unless
   * the host copy leaves it out (e.g. a build's `bin/`) or it is a virtual file
   * @param path POSIX-style path of the folder, relative to the root
   * @param copies Decides what is copied
   * @param source The host repository's entries
   * @param virtualPaths Paths of the virtual files
   */
  async #prune(path: string, copies: (path: string, folder: boolean) => boolean, source: Map<string, _EntryKind>, virtualPaths: Set<string>): Promise<void> {
    const entries = await readdir(join(this.folder, path), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      const kind: _EntryKind | undefined = entry.isDirectory() ? 'folder' : entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'link' : undefined;
      if (virtualPaths.has(entryPath)) {
        if (kind !== 'file') await rm(join(this.folder, entryPath), { recursive: true, force: true });
        continue;
      }
      if (kind && !copies(entryPath, kind === 'folder')) continue;
      if (kind && source.get(entryPath) === kind) {
        if (kind === 'folder') await this.#prune(entryPath, copies, source, virtualPaths);
        continue;
      }
      // Not the host repository's (anymore): fs.rm() removes a link itself, never what it leads to
      await rm(join(this.folder, entryPath), { recursive: true, force: true });
      this.#copied.delete(entryPath);
    }
  }

  /**
   * Makes sure a folder of the host copy is a folder, not a link or a file
   * @param to Absolute path of the folder
   */
  async #ensureFolder(to: string): Promise<void> {
    const current = await lstat(to).catch(() => undefined);
    if (current?.isDirectory()) return;
    if (current) await rm(to, { recursive: true, force: true });
    await mkdir(to);
  }

  /**
   * Makes sure every folder leading to a path of the host copy is a folder, creating the missing ones; a link among them is refused
   * @param path POSIX-style path, relative to the root
   */
  async #ensureParents(path: string): Promise<void> {
    const segments = path.split('/').slice(0, -1);
    let folder = this.folder;
    for (const segment of segments) {
      folder = join(folder, segment);
      const current = await lstat(folder).catch(() => undefined);
      if (!current) {
        await mkdir(folder);
      } else if (!current.isDirectory()) {
        throw new Error(`The host copy can't write "${path}": "${_toPosix(relative(this.folder, folder))}" isn't a folder`);
      }
    }
  }

  /**
   * Copies a file of the host repository when it changed on either side since it was last copied
   * @param path Its POSIX-style path, relative to the root
   * @param from Its absolute path in the host repository
   * @param to Its absolute path in the host copy
   */
  async #copyFile(path: string, from: string, to: string): Promise<void> {
    const sourceStat = await lstat(from);
    const copyStat = await lstat(to).catch(() => undefined);
    const known = this.#copied.get(path);
    if (
      known &&
      copyStat?.isFile() &&
      known.size === sourceStat.size &&
      known.mtimeMs === sourceStat.mtimeMs &&
      known.copySize === copyStat.size &&
      known.copyMtimeMs === copyStat.mtimeMs
    ) {
      return;
    }
    if (copyStat && !copyStat.isFile()) await rm(to, { recursive: true, force: true });
    else if (copyStat) await rm(to, { force: true });
    await copyFile(from, to, constants.COPYFILE_FICLONE);
    const written = await lstat(to);
    this.#copied.set(path, { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs, copySize: written.size, copyMtimeMs: written.mtimeMs });
  }

  /**
   * Copies a symbolic link of the host repository as it is, unless its real path leads outside the root (then it is left out, and removed from the
   * host copy); an absolute link into the root becomes a relative one
   * @param from Its absolute path in the host repository
   * @param to Its absolute path in the host copy
   * @param realRoot Real path of the root
   */
  async #copyLink(from: string, to: string, realRoot: string): Promise<void> {
    const target = await readlink(from);
    const resolved = resolve(dirname(from), target);
    const real = await realpath(from).catch(() => resolved);
    const current = await lstat(to).catch(() => undefined);
    if (!_isInside(resolved, this.root) && !_isInside(resolved, realRoot)) {
      if (current) await rm(to, { recursive: true, force: true });
      return;
    }
    if (!_isInside(real, realRoot)) {
      if (current) await rm(to, { recursive: true, force: true });
      return;
    }
    const inside = _isInside(resolved, this.root) ? relative(this.root, resolved) : relative(realRoot, resolved);
    const wanted = isAbsolute(target) ? relative(dirname(to), join(this.folder, inside)) || '.' : target;
    if (current?.isSymbolicLink() && (await readlink(to)) === wanted) return;
    if (current) await rm(to, { recursive: true, force: true });
    await symlink(wanted, to);
  }
}

// #endregion

// #region Run session

/**
 * Names of the stop files written at the root of every run folder, so that the searches of MSBuild, NuGet and the .NET SDK for them up the folders
 * end there, and never reach a parent folder another user could write to
 */
export const STOP_FILES: Readonly<Record<string, string>> = {
  'Directory.Build.props': '<Project>\n</Project>\n',
  'Directory.Build.targets': '<Project>\n</Project>\n',
  'Directory.Packages.props': '<Project>\n</Project>\n',
  'global.json': '{}\n',
};

/**
 * Represents the options of a run session
 */
export interface RunSessionOptions {
  /**
   * Absolute path of the folder to make the run folder in; `showroom`'s folder in the user's cache folder by default (see getCacheFolder())
   */
  cacheFolder?: string;
  /**
   * Names of the environment variables passed on to build steps (`--pass-env`)
   */
  passEnv?: readonly string[];
}

/**
 * Represents what a showcase's `run()` needs to know
 */
export interface RunContext {
  /**
   * Absolute path of the host repository's root
   */
  root: string;
  /**
   * POSIX-style path of the showcase's documentation file's folder, relative to the root: where commands run by default
   */
  folder: string;
  /**
   * Names of the environment variables the showcase adapter passes on (a built-in one's own)
   */
  names?: readonly string[];
}

/**
 * Represents a run session: the run folder of one command, made when first needed, in the user's cache folder (`copy/`, the host copy; `tmp/`, the
 * processes' `TMPDIR`; `data/`, their `XDG_DATA_HOME`; `showcases/`, a folder of each showcase's own), kept across `serve`'s runs, and removed by
 * dispose()
 */
export interface RunSession {
  /**
   * Makes the run folder if it isn't yet
   * @returns Its absolute path
   */
  getFolder(): Promise<string>;
  /**
   * Gets a showcase's own folder, made if it isn't yet, kept across `serve`'s runs
   * @param id The showcase's id
   * @returns Its absolute path
   */
  getShowcaseFolder(id: string): Promise<string>;
  /**
   * Gets the host copy, made (empty) if it isn't yet
   * @param root Absolute path of the host repository's root
   * @returns The host copy
   */
  getHostCopy(root: string): Promise<HostCopy>;
  /**
   * Creates a showcase's view of the host copy, whose `run()` runs commands in it
   * @param copy The host copy
   * @param context The showcase's root, folder and passed names
   * @returns The host copy, as a showcase adapter gets it
   */
  createShowcaseHostCopy(copy: HostCopy, context: RunContext): ShowcaseHostCopy;
  /**
   * Runs a command in a folder of the run folder (e.g. a host check's), as `run()` does in the host copy
   * @param command Name of the command (see ShowcaseHostCopy's `run()`)
   * @param args Its arguments
   * @param options Its phase, time limit and environment; `cwd` is ignored
   * @param context The root, and the passed names
   * @returns Its recording and output
   */
  run(command: string, args: readonly string[], options: ShowcaseRunOptions, context: Omit<RunContext, 'folder'>): Promise<ShowcaseRun>;
  /**
   * Removes the run folder, with everything in it
   * @returns Resolves once removed
   */
  dispose(): Promise<void>;
}

/**
 * Checks a showcase adapter's options of `run()`
 * @param options The options
 * @returns The problem with them, if any
 */
function _checkRunOptions(options: unknown): string | undefined {
  if (typeof options !== 'object' || options === null) return 'its options must be an object, with a "phase"';
  const { phase, cwd, timeLimit, env } = options as Record<string, unknown>;
  if (phase !== 'build' && phase !== 'run') return '"phase" must be "build" or "run"';
  if (cwd !== undefined && (typeof cwd !== 'string' || cwd.includes('\\') || cwd.startsWith('/'))) return '"cwd" must be a relative, POSIX-style path';
  if (timeLimit !== undefined && (typeof timeLimit !== 'number' || !(timeLimit > 0))) return '"timeLimit" must be a positive number of milliseconds';
  if (env !== undefined && (typeof env !== 'object' || env === null || !Object.values(env).every((value) => typeof value === 'string'))) {
    return '"env" must be an object of strings';
  }
  return undefined;
}

/**
 * Creates a run session; nothing is made until it is first needed
 * @param options Where to make the run folder, and the names passed on to build steps
 * @returns The run session
 */
export function createRunSession({ cacheFolder = getCacheFolder(), passEnv = [] }: RunSessionOptions = {}): RunSession {
  let folder: Promise<string> | undefined;
  let copy: Promise<HostCopy> | undefined;
  const showcaseFolders = new Map<string, Promise<string>>();

  const getFolder = (): Promise<string> =>
    (folder ??= (async () => {
      await mkdir(cacheFolder, { recursive: true, mode: 0o700 });
      const made = await mkdtemp(join(cacheFolder, 'run-'));
      registerRunFolder(made);
      for (const [name, content] of Object.entries(STOP_FILES)) await writeFile(join(made, name), content);
      for (const name of ['copy', 'tmp', 'data', 'showcases']) await mkdir(join(made, name));
      return made;
    })());

  /**
   * Runs a command, resolved from the `PATH` outside the root and the host copy, in a folder, under its phase's limits
   * @param command Name of the command
   * @param args Its arguments
   * @param options Its options
   * @param root Absolute path of the host repository's root
   * @param cwd Absolute path of the folder to run it in
   * @param names Names passed on
   * @returns Its recording and output
   */
  const runIn = async (command: string, args: readonly string[], options: ShowcaseRunOptions, root: string, cwd: string, names: readonly string[] = []) => {
    const problem = _checkRunOptions(options);
    if (problem) throw new Error(`run(): ${problem}`);
    if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) throw new Error('run(): its arguments must be a list of strings');
    const made = await getFolder();
    const copyRoot = join(made, 'copy');
    const executable =
      command === 'node'
        ? process.execPath
        : resolveCommand(command, { path: process.env.PATH ?? process.env.Path, excluded: [root, copyRoot], pathext: process.env.PATHEXT });
    if (executable === undefined) {
      throw new Error(`Command "${String(command)}" not found on the PATH (outside the host repository and the host copy)`);
    }
    const limit = options.phase === 'build' ? BUILD_TIME_LIMIT : RUN_TIME_LIMIT;
    const tmp = join(made, 'tmp');
    const env = getRunEnvironment({
      source: process.env,
      names: [...names, ...(options.phase === 'build' ? passEnv : [])],
      own: options.env,
      set: { TMPDIR: tmp, TMP: tmp, TEMP: tmp, XDG_DATA_HOME: join(made, 'data') },
    });
    return runProcess({
      executable,
      args,
      cwd,
      env,
      timeLimit: Math.min(options.timeLimit ?? limit, limit),
      replace: createPathReplacer({ copy: copyRoot, run: made, home: homedir() }),
    });
  };

  return {
    getFolder,
    getShowcaseFolder: (id) => {
      if (!showcaseFolders.has(id)) {
        const name = createHash('sha256').update(id).digest('hex').slice(0, 16);
        showcaseFolders.set(
          id,
          getFolder().then(async (made) => {
            const path = join(made, 'showcases', name);
            await mkdir(path, { recursive: true });
            return path;
          }),
        );
      }
      return showcaseFolders.get(id)!;
    },
    getHostCopy: (root) => (copy ??= getFolder().then((made) => new HostCopy(root, join(made, 'copy')))),
    createShowcaseHostCopy: (hostCopy, { root, folder: documentationFolder, names }) => ({
      root: hostCopy.folder,
      run: async (command, args, options) => {
        const cwd = resolve(hostCopy.folder, options?.cwd ?? documentationFolder);
        if (!_isInside(cwd, hostCopy.folder)) throw new Error(`run(): "cwd" leads outside the host copy`);
        return runIn(command, args, options, root, cwd, names);
      },
    }),
    run: async (command, args, options, { root, names }) => {
      const made = await getFolder();
      return runIn(command, args, options, root, made, names);
    },
    dispose: async () => {
      if (!folder) return;
      const made = await folder.catch(() => undefined);
      folder = undefined;
      copy = undefined;
      showcaseFolders.clear();
      if (made === undefined) return;
      await rm(made, { recursive: true, force: true });
      unregisterRunFolder(made);
    },
  };
}

// #endregion
