/**
 * CLI: the `showroom` command line, parsing its arguments and running the requested command
 */

import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { check, type CheckOptions } from './check/index.js';
import { escapeControlCharacters, formatIssues, formatTrustPrompt } from './check/internal/index.js';
import { isValidEnvironmentName } from '../processes/index.js';

export { BUILT_IN_DOCUMENTATION, check } from './check/index.js';
export type { CheckIssue, CheckIssueSeverity, CheckOptions, CheckResult, TrustRequest } from './check/index.js';

// #region Usage

/**
 * Usage text of the `showroom` command line
 */
export const USAGE = `Usage: showroom <command> [options]

Commands:
  check    Checks the host repository, writing every issue to stderr and, if the
           check passes, the collected host information (JSON) to stdout
  serve    Serves the showroom for previewing, reloading it when the
           host repository's documentation changes; stop it with Ctrl+C
  build    Builds the showroom into the output folder, as static files

Options:
  --root <dir>     Root of the host repository (default: the current directory)
  --out-dir <dir>  Output folder, overriding showroom.json's outDir (default:
                   ./showroom in the host repository)
  --port <port>    Port to serve on (serve only; default: 5173, or the next free one)
  --showcases      Also builds every showcase, throwing the result away (check only;
                   build always builds them)
  --quiet          Writes no host information to stdout, only the issues (check only)
  --trust          Trusts the host repository: lets its code run on this machine, with
                   your rights (its custom showcase adapters, its tools such as its
                   TypeScript, and its showcases); without it, showroom asks in a
                   terminal, and otherwise none of it runs, and every showcase is
                   shown as its source
  --no-trust       Runs without trust, without asking or warning about it
  --pass-env <name>
                   Passes the environment variable of that name on to recorded
                   showcases' build steps (e.g. a private package feed's
                   credentials), never to their recorded run; repeatable
  --help           Shows this help
`;

/**
 * Warning written when the host repository has something to trust, neither `--trust` nor `--no-trust` was given, and there is no terminal to ask in
 */
const _UNTRUSTED_WARNING =
  "warning: The host repository isn't trusted, so none of its code runs, and its showcases are shown as their source; in a terminal, showroom " +
  'would have asked: pass --trust to run its code on this machine (its custom showcase adapters, its tools and its showcases), or --no-trust to ' +
  'run without it, without this warning\n';

/**
 * Exit code of a command ended by Ctrl-C at the prompt (128 + SIGINT, the shells' convention)
 */
const _INTERRUPTED_EXIT_CODE = 130;

/**
 * Represents the output streams the command line writes to
 */
export interface CliOutput {
  /**
   * Writes to the standard output
   */
  stdout: (text: string) => void;
  /**
   * Writes to the standard error
   */
  stderr: (text: string) => void;
}

/**
 * Represents the input the command line asks the person running it to trust the host repository through
 */
export interface CliInput {
  /**
   * True if the person running the command line can be asked: standard input and standard error are both terminals
   */
  isTerminal: boolean;
  /**
   * Asks a question, writing it to the standard error, and reads the answer from the terminal
   * @param question Question to ask, ending where the answer is typed
   * @returns The line typed, an empty string at the end of the input (Ctrl-D), or null on Ctrl-C
   */
  ask: (question: string) => Promise<string | null>;
}

// #endregion

// #region Command line

/**
 * Runs the `showroom` command line. Without `--trust` or `--no-trust`, and with something to trust, it asks the person running it whether to trust
 * the host repository, when the input is a terminal
 * @param args Command line arguments, without the `node` executable and script paths
 * @param output Output streams to write to; defaults to the process's
 * @param input Input to ask through; defaults to the terminal on the process's standard input, never a pipe
 * @returns Exit code: 0 on success, 1 on a failed check, a failed build or invalid arguments, 130 when Ctrl-C answers the prompt
 */
export async function main(args: string[], output: CliOutput = _processOutput(), input: CliInput = _processInput()): Promise<number> {
  // Parse the arguments
  let parsed: ReturnType<typeof _parse>;
  try {
    parsed = _parse(args);
  } catch (err) {
    output.stderr(`${(err as Error).message}\n\n${USAGE}`);
    return 1;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    output.stdout(USAGE);
    return 0;
  }
  const [command, ...rest] = positionals;
  if (!(command === 'check' || command === 'serve' || command === 'build') || rest.length) {
    output.stderr(`${command ? `Unknown command: ${[command, ...rest].join(' ')}` : 'No command given'}\n\n${USAGE}`);
    return 1;
  }
  const root = resolve(values.root ?? '.');
  const outDir = values['out-dir'] === undefined ? undefined : resolve(values['out-dir']);

  if (values.showcases && command !== 'check') {
    output.stderr(`--showcases only applies to check (build always builds the showcases)\n\n${USAGE}`);
    return 1;
  }
  if (values.quiet && command !== 'check') {
    output.stderr(`--quiet only applies to check\n\n${USAGE}`);
    return 1;
  }
  if (values.trust && values['no-trust']) {
    output.stderr(`--trust and --no-trust can't be given together\n\n${USAGE}`);
    return 1;
  }
  const passEnv = values['pass-env'] ?? [];
  const invalid = passEnv.find((name) => !isValidEnvironmentName(name));
  if (invalid !== undefined) {
    output.stderr(`Invalid --pass-env name: ${escapeControlCharacters(JSON.stringify(invalid), false)}\n\n${USAGE}`);
    return 1;
  }
  // Without either flag, and only when there is something to trust, ask in a terminal, or else run without trust, warning how to allow it; Ctrl-C
  // ends the command, leaving the check waiting on an answer that never comes
  let interrupt = () => {};
  const interrupted = new Promise<typeof _INTERRUPTED_EXIT_CODE>((resolve) => (interrupt = () => resolve(_INTERRUPTED_EXIT_CODE)));
  const trust: NonNullable<CheckOptions['trust']> = values.trust
    ? true
    : values['no-trust']
      ? false
      : async (request) => {
          if (!input.isTerminal) {
            output.stderr(_UNTRUSTED_WARNING);
            return false;
          }
          const answer = await input.ask(formatTrustPrompt(request, root));
          if (answer === null) {
            output.stderr('\n');
            interrupt();
            return new Promise<boolean>(() => {});
          }
          return /^y(es)?$/i.test(answer.trim());
        };
  return Promise.race([_run(command, values, root, outDir, output, trust, passEnv), interrupted]);
}

/**
 * Runs a command whose arguments were checked
 * @param command Command to run
 * @param values Options given
 * @param root Absolute path of the host repository's root
 * @param outDir Absolute path of the output folder given, if any
 * @param output Output streams to write to
 * @param trust Whether the host repository's code may run, or the function deciding it
 * @param passEnv Names of the environment variables passed on to recorded showcases' build steps
 * @returns Exit code
 */
async function _run(
  command: 'check' | 'serve' | 'build',
  values: ReturnType<typeof _parse>['values'],
  root: string,
  outDir: string | undefined,
  output: CliOutput,
  trust: NonNullable<CheckOptions['trust']>,
  passEnv: string[],
): Promise<number> {
  // Serve the showroom; Vite is only loaded here
  if (command === 'serve') {
    const port = values.port === undefined ? undefined : _parsePort(values.port);
    if (port === null) {
      output.stderr(`Invalid port: ${values.port}\n\n${USAGE}`);
      return 1;
    }
    const { serve } = await import('./serve/index.js');
    return serve({ root, port, outDir, output, trust, passEnv });
  }
  if (values.port !== undefined) {
    output.stderr(`--port only applies to serve\n\n${USAGE}`);
    return 1;
  }

  // Build the showroom; Vite is only loaded here
  if (command === 'build') {
    const { build } = await import('./build/index.js');
    return build({ root, outDir, output, trust, passEnv });
  }

  // Run the check
  const result = await check(root, { outDir, trust, passEnv, ...(values.showcases ? { showcases: true } : {}) });
  output.stderr(formatIssues(result.issues));
  if (result.host && !values.quiet) output.stdout(`${JSON.stringify(result.host, null, 2)}\n`);
  return result.passed ? 0 : 1;
}

/**
 * Parses the value of `--port`
 * @param value Value given
 * @returns The port, or null if the value isn't a whole number from 1 to 65535
 */
function _parsePort(value: string): number | null {
  const port = Number(value);
  return /^\d+$/.test(value) && port >= 1 && port <= 65535 ? port : null;
}

/**
 * Parses the command line arguments
 * @param args Command line arguments
 * @returns Parsed options and positionals; throws on unknown options
 */
function _parse(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      'out-dir': { type: 'string' },
      port: { type: 'string' },
      showcases: { type: 'boolean' },
      quiet: { type: 'boolean' },
      trust: { type: 'boolean' },
      'no-trust': { type: 'boolean' },
      'pass-env': { type: 'string', multiple: true },
      help: { type: 'boolean' },
    },
  });
}

/**
 * Gets the output streams of the current process
 * @returns Output streams writing to the process's stdout and stderr
 */
function _processOutput(): CliOutput {
  return { stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text) };
}

/**
 * Gets the input of the current process: the terminal on its standard input, asked on its standard error, never a pipe
 * @returns Input reading the answer from the terminal
 */
function _processInput(): CliInput {
  return {
    get isTerminal() {
      return Boolean(process.stdin.isTTY && process.stderr.isTTY);
    },
    ask: (question) =>
      new Promise((resolve) => {
        const lines = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
        let answered = false;
        const answer = (text: string | null) => {
          if (answered) return;
          answered = true;
          lines.close();
          resolve(text);
        };
        lines.on('SIGINT', () => answer(null));
        lines.on('close', () => answer(''));
        lines.question(question, answer);
      }),
  };
}

// #endregion
