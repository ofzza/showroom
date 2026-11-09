/**
 * CLI: the `tsshowcase` command line, parsing its arguments and running the requested command
 */

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { check, type CheckIssue } from './check/index.js';

export * from './check/index.js';

// #region Usage

/**
 * Usage text of the `tsshowcase` command line
 */
export const USAGE = `Usage: tsshowcase <command> [options]

Commands:
  check    Checks the host repository, writing every issue to stderr and, if the
           check passes, the collected host information (JSON) to stdout

Options:
  --root <dir>  Root of the host repository (default: the current directory)
  --help        Shows this help
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
 * @returns Exit code: 0 on success, 1 on a failed check or invalid arguments
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
  if (command !== 'check' || rest.length) {
    output.stderr(`${command ? `Unknown command: ${[command, ...rest].join(' ')}` : 'No command given'}\n\n${USAGE}`);
    return 1;
  }

  // Run the check
  const result = await check(resolve(values.root ?? '.'));
  for (const issue of result.issues) output.stderr(`${_formatIssue(issue)}\n`);
  if (result.host) output.stdout(`${JSON.stringify(result.host, null, 2)}\n`);
  return result.passed ? 0 : 1;
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
    options: { root: { type: 'string' }, help: { type: 'boolean' } },
  });
}

/**
 * Formats a check issue as one line of output
 * @param issue Issue to format
 * @returns The formatted line, without a line break
 */
function _formatIssue(issue: CheckIssue): string {
  return `${issue.severity}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`;
}

/**
 * Gets the output streams of the current process
 * @returns Output streams writing to the process's stdout and stderr
 */
function _processOutput(): CliOutput {
  return { stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text) };
}

// #endregion
