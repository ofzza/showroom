/**
 * CLI: the `tsshowcase` command line, parsing its arguments and running the requested command
 */

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { check } from './check/index.js';
import { formatIssues } from './check/internal/index.js';

export * from './check/index.js';

// #region Usage

/**
 * Usage text of the `tsshowcase` command line
 */
export const USAGE = `Usage: tsshowcase <command> [options]

Commands:
  check    Checks the host repository, writing every issue to stderr and, if the
           check passes, the collected host information (JSON) to stdout
  serve    Serves the showcase application for previewing, reloading it when the
           host repository's documentation changes; stop it with Ctrl+C
  build    Builds the showcase application into the output folder, as static files

Options:
  --root <dir>     Root of the host repository (default: the current directory)
  --out-dir <dir>  Output folder, overriding tsshowcase.json's outDir (default:
                   ./showcase in the host repository)
  --port <port>    Port to serve on (serve only; default: 5173, or the next free one)
  --help           Shows this help
`;

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

// #endregion

// #region Command line

/**
 * Runs the `tsshowcase` command line
 * @param args Command line arguments, without the `node` executable and script paths
 * @param output Output streams to write to; defaults to the process's
 * @returns Exit code: 0 on success, 1 on a failed check, a failed build or invalid arguments
 */
export async function main(args: string[], output: CliOutput = _processOutput()): Promise<number> {
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

  // Serve the showcase application; Vite is only loaded here
  if (command === 'serve') {
    const port = values.port === undefined ? undefined : _parsePort(values.port);
    if (port === null) {
      output.stderr(`Invalid port: ${values.port}\n\n${USAGE}`);
      return 1;
    }
    const { serve } = await import('./serve/index.js');
    return serve({ root, port, outDir, output });
  }
  if (values.port !== undefined) {
    output.stderr(`--port only applies to serve\n\n${USAGE}`);
    return 1;
  }

  // Build the showcase application; Vite is only loaded here
  if (command === 'build') {
    const { build } = await import('./build/index.js');
    return build({ root, outDir, output });
  }

  // Run the check
  const result = await check(root, { outDir });
  output.stderr(formatIssues(result.issues));
  if (result.host) output.stdout(`${JSON.stringify(result.host, null, 2)}\n`);
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
    options: { root: { type: 'string' }, 'out-dir': { type: 'string' }, port: { type: 'string' }, help: { type: 'boolean' } },
  });
}

/**
 * Gets the output streams of the current process
 * @returns Output streams writing to the process's stdout and stderr
 */
function _processOutput(): CliOutput {
  return { stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text) };
}

// #endregion
