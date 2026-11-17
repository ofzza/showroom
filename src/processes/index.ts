/**
 * Running processes for recorded showcases, under `showroom`'s limits: resolving a command from the `PATH` (never from the host repository or the
 * host copy), the cleaned environment, the closed standard input, the time limit, killing the whole process group, and capping the output while it
 * streams, turning it into a recording. Also the user's cache folder holding the run folders, and the synchronous clean-up the command line does when
 * it is stopped. Node code, internal, never re-exported.
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { accessSync, constants, realpathSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';
import type { ShowcaseConsoleLine, ShowcaseRecording, ShowcaseRun } from '../adapters/showcase/index.js';
import { escapeControlCharacters } from '../cli/check/internal/index.js';
import { CONSOLE_MAX_LINE_LENGTH, CONSOLE_MAX_LINES } from '../frame/index.js';

// #region Limits

/**
 * Time limit of a recorded run (`run()`'s `run` phase), in milliseconds
 */
export const RUN_TIME_LIMIT = 30_000;

/**
 * Time limit of a build step (`run()`'s `build` phase), in milliseconds
 */
export const BUILD_TIME_LIMIT = 300_000;

/**
 * Number of bytes of output kept at most, standard output and error together; the rest is read and left out
 */
export const OUTPUT_LIMIT = 1024 * 1024;

/**
 * Time to wait for a process's output to end once it has exited, in milliseconds, before leaving out what a process outliving it still writes
 */
const _OUTPUT_END_WAIT = 1000;

// #endregion

// #region Cache folder

/**
 * Name of `showroom`'s folder in the user's cache folder
 */
const _CACHE_NAME = 'showroom';

/**
 * Gets `showroom`'s folder in the user's cache folder, which only the user can write to: `$XDG_CACHE_HOME/showroom` when set, else
 * `~/.cache/showroom` on Linux, `~/Library/Caches/showroom` on macOS, `%LOCALAPPDATA%\showroom` on Windows
 * @param env The environment variables
 * @param platform The platform
 * @param home The user's home folder
 * @returns The absolute path of the folder (which may not exist yet)
 */
export function getCacheFolder(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home: string = homedir()): string {
  const xdg = env.XDG_CACHE_HOME;
  if (xdg && isAbsolute(xdg)) return join(xdg, _CACHE_NAME);
  if (platform === 'darwin') return join(home, 'Library', 'Caches', _CACHE_NAME);
  if (platform === 'win32') return join(env.LOCALAPPDATA && isAbsolute(env.LOCALAPPDATA) ? env.LOCALAPPDATA : join(home, 'AppData', 'Local'), _CACHE_NAME);
  return join(home, '.cache', _CACHE_NAME);
}

// #endregion

// #region Command resolution

/**
 * Checks if a command name is one `run()` resolves: not empty, without a path separator, `..`, `:` or a null character
 * @param name The command name
 * @returns True if it is one
 */
export function isValidCommandName(name: unknown): name is string {
  return typeof name === 'string' && name !== '' && name !== '.' && !/[/\\:\0]/.test(name) && !name.includes('..');
}

/**
 * Represents the options of resolving a command from the `PATH`
 */
export interface ResolveCommandOptions {
  /**
   * The `PATH`'s value
   */
  path: string | undefined;
  /**
   * Absolute paths of the folders a command may never be found in, nor through a `PATH` entry inside them: the host repository's root and the host
   * copy
   */
  excluded: readonly string[];
  /**
   * The platform
   */
  platform?: NodeJS.Platform;
  /**
   * The `PATHEXT`'s value, on Windows
   */
  pathext?: string;
}

/**
 * Gets the real path of a path, following symbolic links
 * @param path The path
 * @returns Its real path, or undefined if it doesn't exist
 */
function _realPath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch (_err) {
    return undefined;
  }
}

/**
 * Checks if a path is a folder or inside it, case-insensitively on Windows and macOS
 * @param path Absolute path
 * @param folder Absolute path of the folder
 * @param insensitive True to compare case-insensitively
 * @returns True if it is
 */
function _isInside(path: string, folder: string, insensitive: boolean): boolean {
  const [a, b] = insensitive ? [path.toLowerCase(), folder.toLowerCase()] : [path, folder];
  const base = b.endsWith(sep) ? b : `${b}${sep}`;
  return a === b || a.startsWith(base);
}

/**
 * Resolves a command from the `PATH`, as `run()` does: each entry that is absolute, and whose real path is inside none of the excluded folders, in
 * order; on Windows, only an `.exe` or `.com` file (as `PATHEXT` lists them), elsewhere only an executable file; a file whose real path is inside an
 * excluded folder is skipped too
 * @param name Name of the command
 * @param options The `PATH`, the excluded folders, the platform
 * @returns The absolute real path of the command's file, or undefined if none is found (or the name isn't valid)
 */
export function resolveCommand(name: string, { path, excluded, platform = process.platform, pathext }: ResolveCommandOptions): string | undefined {
  if (!isValidCommandName(name)) return undefined;
  const windows = platform === 'win32';
  const insensitive = windows || platform === 'darwin';
  const excludedReal = excluded.map((folder) => _realPath(folder) ?? resolve(folder));
  const listed = (pathext ?? '').toLowerCase().split(';').filter(Boolean);
  const extensions = windows ? ['.exe', '.com'].filter((extension) => !listed.length || listed.includes(extension)) : [''];
  for (const entry of (path ?? '').split(windows ? ';' : ':')) {
    // Only absolute entries; on Windows, a drive-relative one (`C:bin`) or a rooted one without a drive (`\bin`) isn't
    if (windows ? !/^([a-z]:[\\/]|\\\\)/i.test(entry) : !isAbsolute(entry)) continue;
    const real = _realPath(entry);
    if (real === undefined || excludedReal.some((folder) => _isInside(real, folder, insensitive))) continue;
    for (const extension of extensions) {
      const candidate = join(entry, `${name}${extension}`);
      try {
        if (!statSync(candidate).isFile()) continue;
        if (!windows) accessSync(candidate, constants.X_OK);
      } catch (_err) {
        continue;
      }
      const file = _realPath(candidate);
      if (file === undefined || excludedReal.some((folder) => _isInside(file, folder, insensitive))) continue;
      return file;
    }
  }
  return undefined;
}

// #endregion

// #region Environment

/**
 * Names of the environment variables every process `run()` starts gets, when set; on Windows, WINDOWS_ENVIRONMENT_NAMES too
 */
export const ENVIRONMENT_NAMES: readonly string[] = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ'];

/**
 * Names of the environment variables every process `run()` starts on Windows gets too, when set
 */
export const WINDOWS_ENVIRONMENT_NAMES: readonly string[] = [
  'SystemRoot',
  'windir',
  'ComSpec',
  'PATHEXT',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
];

/**
 * Checks if a name given to `--pass-env` is one: not empty, without `=` or a null character
 * @param name The name
 * @returns True if it is one
 */
export function isValidEnvironmentName(name: string): boolean {
  return name !== '' && !/[=\0]/.test(name);
}

/**
 * Represents the options of the environment of a process `run()` starts
 */
export interface RunEnvironmentOptions {
  /**
   * The environment variables to take the passed ones from: `showroom`'s own
   */
  source: NodeJS.ProcessEnv;
  /**
   * Names passed on beside the fixed ones (a built-in showcase adapter's own, and `--pass-env`'s in a build step)
   */
  names?: readonly string[];
  /**
   * Variables of the showcase adapter's own, given values; the passed and set ones win over them
   */
  own?: Readonly<Record<string, string>>;
  /**
   * Variables set by `showroom` (e.g. `TMPDIR`), which win over everything
   */
  set?: Readonly<Record<string, string>>;
  /**
   * The platform: on Windows, names are matched case-insensitively
   */
  platform?: NodeJS.Platform;
}

/**
 * Gets the cleaned environment of a process `run()` starts: the showcase adapter's own variables, then those of `showroom`'s environment it passes
 * on by their exact names (the fixed ones, ENVIRONMENT_NAMES, and on Windows WINDOWS_ENVIRONMENT_NAMES, then the names given), then the ones it
 * sets, each winning over the ones before it
 * @param options Where the variables come from
 * @returns The environment
 */
export function getRunEnvironment({ source, names = [], own = {}, set = {}, platform = process.platform }: RunEnvironmentOptions): Record<string, string> {
  const windows = platform === 'win32';
  const environment: Record<string, string> = {};
  const put = (name: string, value: string) => {
    if (windows) for (const key of Object.keys(environment)) if (key.toLowerCase() === name.toLowerCase()) delete environment[key];
    environment[name] = value;
  };
  for (const [name, value] of Object.entries(own)) if (typeof value === 'string' && isValidEnvironmentName(name)) put(name, value);
  for (const name of [...ENVIRONMENT_NAMES, ...(windows ? WINDOWS_ENVIRONMENT_NAMES : []), ...names]) {
    const key = windows ? Object.keys(source).find((candidate) => candidate.toLowerCase() === name.toLowerCase()) : name;
    const value = key === undefined ? undefined : source[key];
    if (key !== undefined && value !== undefined) put(key, value);
  }
  for (const [name, value] of Object.entries(set)) put(name, value);
  return environment;
}

// #endregion

// #region Output

/**
 * Represents the paths `run()` replaces in its output
 */
export interface PathReplacements {
  /**
   * Absolute path of the host copy's root, made root-relative
   */
  copy?: string;
  /**
   * Absolute path of the run folder, made `<run>`
   */
  run?: string;
  /**
   * Absolute path of the user's home folder, made `~`
   */
  home?: string;
  /**
   * The platform: on Windows, both slash forms are replaced
   */
  platform?: NodeJS.Platform;
}

/**
 * Creates the function replacing paths in a line of output: the host copy's path (and what is inside it) by the root-relative path, the run folder's
 * by `<run>`, the home folder's by `~`; each in its given and real forms, and as a `file://` URL; on Windows in both slash forms
 * @param replacements The paths to replace
 * @returns The function
 */
export function createPathReplacer({ copy, run, home, platform = process.platform }: PathReplacements): (line: string) => string {
  const pairs: [string | RegExp, string][] = [];
  // A path alone ends where a path can't go on: at the end of the line, or before a space, a quote, a bracket or punctuation
  const ending = '(?=$|[\\s"\'`()\\[\\]{}<>,;:])';
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const add = (path: string | undefined, inside: string, alone: string) => {
    if (!path) return;
    const forms = new Set([path, _realPath(path) ?? path]);
    for (const form of [...forms]) {
      if (platform === 'win32') forms.add(form.replace(/\\/g, '/'));
    }
    for (const form of forms) {
      const trimmed = form.replace(/[\\/]+$/, '');
      if (!trimmed) continue;
      const url = pathToFileURL(trimmed).href;
      pairs.push([`${url}/`, inside], [new RegExp(`${escape(url)}${ending}`, 'g'), alone]);
      for (const separator of platform === 'win32' ? ['\\', '/'] : ['/']) pairs.push([`${trimmed}${separator}`, inside]);
      pairs.push([new RegExp(`${escape(trimmed)}${ending}`, 'g'), alone]);
    }
  };
  add(copy, '', '.');
  add(run, '<run>/', '<run>');
  add(home, '~/', '~');
  // Longest first, so a path inside another is replaced as itself
  const length = (from: string | RegExp) => (typeof from === 'string' ? from.length : from.source.length);
  pairs.sort((a, b) => length(b[0]) - length(a[0]));
  return (line) => {
    let replaced = line;
    for (const [from, to] of pairs) {
      if (typeof from === 'string') {
        if (replaced.includes(from)) replaced = replaced.split(from).join(to);
      } else {
        replaced = replaced.replace(from, to);
      }
    }
    return replaced;
  };
}

/**
 * Pattern of the terminal's escape sequences: CSI sequences (colours, cursor movements), OSC sequences (titles, links) and two-character ones
 */
// eslint-disable-next-line no-control-regex
const _ANSI_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[@-_]/g;

/**
 * Cleans a recorded line for showing: the terminal's escape sequences removed, and the other control and bidirectional characters made visible
 * (tabs kept)
 * @param text The line
 * @returns The cleaned line
 */
export function cleanRecordedLine(text: string): string {
  return escapeControlCharacters(text.replace(_ANSI_SEQUENCE, ''), true).replace(/\n/g, '\\x0a');
}

/**
 * Cuts a line at CONSOLE_MAX_LINE_LENGTH characters, as the frame script does, ending in how many characters were left out
 * @param text The line
 * @param extra Number of characters already left out while it streamed
 * @returns The line, cut if too long
 */
function _cutLine(text: string, extra: number): string {
  const over = text.length - CONSOLE_MAX_LINE_LENGTH + extra;
  return over > 0 ? `${text.slice(0, CONSOLE_MAX_LINE_LENGTH)}… (${over} more characters)` : text;
}

/**
 * Number of characters of a line kept while it streams, before its line break comes: room to replace paths in it before it is cut
 */
const _STREAMED_LINE_LIMIT = CONSOLE_MAX_LINE_LENGTH + 4096;

/**
 * Represents what a recorder keeps of one pipe
 */
interface _Pipe {
  /**
   * Level of its lines
   */
  level: 'log' | 'error';
  /**
   * Decodes its bytes as UTF-8, across chunks
   */
  decoder: StringDecoder;
  /**
   * The line it is writing, up to _STREAMED_LINE_LIMIT characters
   */
  partial: string;
  /**
   * Number of characters of that line left out
   */
  over: number;
  /**
   * Its whole lines, paths replaced, within the output's cap
   */
  text: string[];
}

/**
 * Records a process's output while it streams: standard output's lines as `log` lines, standard error's as `error` lines, in the order they arrive;
 * at most OUTPUT_LIMIT bytes in all (the rest read and left out), each line's paths replaced, then cleaned and cut at CONSOLE_MAX_LINE_LENGTH
 * characters, the newest CONSOLE_MAX_LINES lines kept and the older ones counted
 */
export class OutputRecorder {
  /**
   * The newest lines
   */
  readonly #lines: ShowcaseConsoleLine[] = [];
  /**
   * Number of lines dropped, and how many of them were errors
   */
  #dropped = 0;
  #droppedErrors = 0;
  /**
   * Number of bytes taken so far
   */
  #bytes = 0;
  /**
   * True once the output went past OUTPUT_LIMIT
   */
  #cut = false;
  /**
   * The pipes
   */
  readonly #pipes: Record<'stdout' | 'stderr', _Pipe>;
  /**
   * Replaces paths in a line
   */
  readonly #replace: (line: string) => string;

  /**
   * Creates a recorder
   * @param replace Replaces paths in a line
   */
  constructor(replace: (line: string) => string = (line) => line) {
    this.#replace = replace;
    const pipe = (level: 'log' | 'error'): _Pipe => ({ level, decoder: new StringDecoder('utf8'), partial: '', over: 0, text: [] });
    this.#pipes = { stdout: pipe('log'), stderr: pipe('error') };
  }

  /**
   * Takes a chunk of a pipe's output
   * @param name The pipe
   * @param chunk The bytes
   */
  write(name: 'stdout' | 'stderr', chunk: Uint8Array): void {
    if (this.#cut) return;
    let bytes = chunk;
    if (this.#bytes + bytes.byteLength > OUTPUT_LIMIT) {
      bytes = bytes.subarray(0, OUTPUT_LIMIT - this.#bytes);
      this.#cut = true;
    }
    this.#bytes += bytes.byteLength;
    this.#take(this.#pipes[name], this.#pipes[name].decoder.write(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)));
  }

  /**
   * Takes decoded text of a pipe, ending its lines at line breaks
   * @param pipe The pipe
   * @param text The text
   */
  #take(pipe: _Pipe, text: string): void {
    let rest = text;
    for (let index = rest.indexOf('\n'); index >= 0; index = rest.indexOf('\n')) {
      this.#append(pipe, rest.slice(0, index));
      this.#end(pipe);
      rest = rest.slice(index + 1);
    }
    this.#append(pipe, rest);
  }

  /**
   * Appends text to a pipe's line, keeping at most _STREAMED_LINE_LIMIT characters of it
   * @param pipe The pipe
   * @param text The text
   */
  #append(pipe: _Pipe, text: string): void {
    const room = _STREAMED_LINE_LIMIT - pipe.partial.length;
    pipe.partial += text.slice(0, Math.max(0, room));
    pipe.over += Math.max(0, text.length - Math.max(0, room));
  }

  /**
   * Ends a pipe's line: its paths replaced, then kept as text, and recorded
   * @param pipe The pipe
   */
  #end(pipe: _Pipe): void {
    const line = this.#replace(pipe.partial.replace(/\r$/, ''));
    const over = pipe.over;
    pipe.partial = '';
    pipe.over = 0;
    pipe.text.push(line);
    this.#lines.push({ level: pipe.level, text: _cutLine(cleanRecordedLine(line), over) });
    if (this.#lines.length > CONSOLE_MAX_LINES) {
      const dropped = this.#lines.shift()!;
      this.#dropped++;
      if (dropped.level === 'error') this.#droppedErrors++;
    }
  }

  /**
   * Ends the output: each pipe's last line, if it has one without a line break
   * @returns What was recorded, and each pipe's text
   */
  end(): { recording: Pick<ShowcaseRecording, 'lines' | 'dropped' | 'droppedErrors' | 'cut'>; stdout: string; stderr: string } {
    for (const pipe of Object.values(this.#pipes)) {
      this.#append(pipe, pipe.decoder.end());
      if (pipe.partial || pipe.over) this.#end(pipe);
    }
    return {
      recording: {
        lines: [...this.#lines],
        dropped: this.#dropped,
        ...(this.#droppedErrors ? { droppedErrors: this.#droppedErrors } : {}),
        ...(this.#cut ? { cut: true } : {}),
      },
      stdout: this.#pipes.stdout.text.join('\n'),
      stderr: this.#pipes.stderr.text.join('\n'),
    };
  }
}

// #endregion

// #region Processes

/**
 * The processes started and not yet known to be gone, each the leader of its own process group on POSIX
 */
const _live = new Set<ChildProcess>();

/**
 * The run folders to remove when the command line is stopped
 */
const _folders = new Set<string>();

/**
 * Kills a process's whole process group, at once, ignoring a group that is gone: on POSIX, by its group (the process leads it); on Windows, with
 * `taskkill /T /F` while the process is known to be alive, else the process alone
 * @param child The process
 * @param alive True if the process hasn't exited yet
 */
function _killGroup(child: ChildProcess, alive: boolean): void {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    if (!alive) return;
    const system = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows';
    execFile(join(system, 'System32', 'taskkill.exe'), ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true }, () => child.kill('SIGKILL'));
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (_err) {
    // The group is gone
  }
}

/**
 * Kills every process group started and not yet known to be gone, synchronously (on Windows, each process alone)
 */
export function killProcessGroups(): void {
  for (const child of _live) {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else _killGroup(child, false);
  }
  _live.clear();
}

/**
 * Gets the number of processes started and not yet known to be gone
 * @returns The number
 */
export function getLiveProcessCount(): number {
  return _live.size;
}

/**
 * Registers a run folder to remove when the command line is stopped (see cleanUpSync())
 * @param folder Absolute path of the folder
 */
export function registerRunFolder(folder: string): void {
  _folders.add(folder);
}

/**
 * Unregisters a run folder, once removed
 * @param folder Absolute path of the folder
 */
export function unregisterRunFolder(folder: string): void {
  _folders.delete(folder);
}

/**
 * Cleans up synchronously, as the command line does when it is stopped or exits: kills every process group, and removes every run folder
 */
export function cleanUpSync(): void {
  killProcessGroups();
  for (const folder of _folders) {
    try {
      rmSync(folder, { recursive: true, force: true });
    } catch (_err) {
      // Left behind, as a crash would leave it
    }
  }
  _folders.clear();
}

/**
 * Signals the command line cleans up on, with their numbers (its exit code is 128 plus the number)
 */
const _SIGNALS: readonly [NodeJS.Signals, number][] = [
  ['SIGINT', 2],
  ['SIGTERM', 15],
  ['SIGHUP', 1],
];

/**
 * Installs the command line's clean-up: on exit, and on `SIGINT`, `SIGTERM` and `SIGHUP`, every process group is killed and every run folder
 * removed, and a signal exits with 128 plus its number; unless something else listens to the signal (`serve`, which stops by itself, cleaning up),
 * which then only gets the process groups killed. Only the command line's entry point calls it: the library installs no signal handlers.
 */
export function installCleanUp(): void {
  process.on('exit', cleanUpSync);
  for (const [signal, number] of _SIGNALS) {
    process.on(signal, () => {
      killProcessGroups();
      if (process.listenerCount(signal) > 1) return;
      cleanUpSync();
      process.exit(128 + number);
    });
  }
}

/**
 * Represents the options of running a process
 */
export interface RunProcessOptions {
  /**
   * Absolute path of the executable (see resolveCommand())
   */
  executable: string;
  /**
   * Its arguments
   */
  args: readonly string[];
  /**
   * Absolute path of the folder to run it in
   */
  cwd: string;
  /**
   * Its whole environment (see getRunEnvironment())
   */
  env: Record<string, string>;
  /**
   * Its time limit, in milliseconds
   */
  timeLimit: number;
  /**
   * Replaces paths in each line of its output (see createPathReplacer())
   */
  replace?: (line: string) => string;
  /**
   * Stops it once aborted, as the time limit does
   */
  signal?: AbortSignal;
}

/**
 * Runs a process under `showroom`'s limits: never through a shell, in a session and process group of its own (on POSIX), with no controlling
 * terminal and no window, its standard input closed, its output recorded (see OutputRecorder), and its whole process group killed at the time limit
 * and once it exits (what outlives it); on Windows, its process tree is killed at the time limit only
 * @param options What to run, and how
 * @returns Its recording (how it ended, and its lines) and its output as text; rejects if it can't start
 */
export function runProcess({ executable, args, cwd, env, timeLimit, replace, signal }: RunProcessOptions): Promise<ShowcaseRun> {
  return new Promise((resolvePromise, reject) => {
    const recorder = new OutputRecorder(replace);
    let child: ChildProcess;
    try {
      child = spawn(executable, [...args], {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true,
        shell: false,
      });
    } catch (err) {
      reject(err as Error);
      return;
    }
    _live.add(child);
    let timedOut = false;
    let settled = false;
    let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
    const stop = () => {
      if (exit) return;
      timedOut = true;
      _killGroup(child, true);
    };
    const timer = setTimeout(stop, timeLimit);
    signal?.addEventListener('abort', stop);
    if (signal?.aborted) stop();
    child.stdout!.on('data', (chunk: Buffer) => recorder.write('stdout', chunk));
    child.stderr!.on('data', (chunk: Buffer) => recorder.write('stderr', chunk));
    let outputTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (settled || !exit) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(outputTimer);
      signal?.removeEventListener('abort', stop);
      _live.delete(child);
      const { recording, stdout, stderr } = recorder.end();
      const ended: Partial<ShowcaseRecording> = timedOut ? { timedOut: true, timeLimit } : exit.signal ? { signal: exit.signal } : { exitCode: exit.code ?? 0 };
      resolvePromise({ recording: { ...recording, ...ended }, stdout, stderr });
    };
    child.on('error', (err) => {
      if (exit) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      _live.delete(child);
      reject(err);
    });
    child.on('exit', (code, exitSignal) => {
      exit = { code, signal: exitSignal };
      // What outlives it goes with its group (on POSIX)
      _killGroup(child, false);
      // Its output ends once every process holding its pipes is gone; what still holds them is left out after a while
      outputTimer = setTimeout(() => {
        child.stdout?.destroy();
        child.stderr?.destroy();
        finish();
      }, _OUTPUT_END_WAIT);
    });
    child.on('close', finish);
  });
}

// #endregion
