# tsshowcase

[![npm](https://img.shields.io/npm/v/@ofzza/tsshowcase)](https://www.npmjs.com/package/@ofzza/tsshowcase)

Build documentation/showcase apps for TypeScript libraries.

tsshowcase reads a host repository (the repository that uses it) and collects its host information: the project information, the documentation files (`README`, `CONTRIBUTE`, `LICENSE`, ...) and an index of its code files. For now, `tsshowcase check` collects and checks it. The showcase application that presents it (a React/FluentUI SPA with a page per documentation file, and a light/dark toggle) is written, but serving and building it, with `tsshowcase serve` and `tsshowcase build`, are still to come.

---

Jump to section:

- [Get tsshowcase](#get-tsshowcase)
- [Usage](#usage)
  - [Configuration: `tsshowcase.json`](#configuration-tsshowcasejson)
  - [Patterns](#patterns)
  - [Documentation files](#documentation-files)
  - [Stack adapters](#stack-adapters)
  - [`tsshowcase check`](#tsshowcase-check)
  - [API](#api)
- [Development](#development)
- [Contributing](#contributing)

# Get tsshowcase

tsshowcase is published as an NPM package. Install it in the host repository, and run it through `npx`:

```sh
$ npm install --save-dev @ofzza/tsshowcase
$ npx tsshowcase check
```

Or install it globally:

```sh
$ npm install -g @ofzza/tsshowcase
$ tsshowcase check
```

Or run it without installing it:

```sh
$ npx @ofzza/tsshowcase check
```

# Usage

## Configuration: `tsshowcase.json`

Every host repository needs a `tsshowcase.json` file in its root. Without it, tsshowcase stops with an error.

```json
{
  "stack": "typescript",
  "sourceRoot": "src",
  "ignore": ["examples"],
  "code": ["!*.test.ts"],
  "documentation": ["docs/*.md"]
}
```

| Key             | Required | Default             | Meaning                                                                                                 |
| --------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `stack`         | yes      |                     | Name of the [stack adapter](#stack-adapters) to use.                                                    |
| `sourceRoot`    | no       | the stack adapter's | Source root directory, relative to the host repository's root. Code files are only looked for under it. |
| `outDir`        | no       | `./showcase`        | Output directory of the showcase application, relative to the host repository's root (not used yet).    |
| `ignore`        | no       | `[]`                | [Patterns](#patterns) of files to ignore, appended to the stack adapter's.                              |
| `code`          | no       | `[]`                | [Patterns](#patterns) of code files, relative to the source root, appended to the stack adapter's.      |
| `documentation` | no       | `[]`                | [Patterns](#patterns) of documentation files, appended to the built-in ones and the stack adapter's.    |

Any other key is an error, which catches typos.

## Patterns

`ignore`, `code` and `documentation` are each a list of patterns that work like a `.gitignore` file:

- The stack adapter's patterns come first, and the configuration's are appended to them.
- They're applied in order, and the last pattern matching a file wins. A pattern starting with `!` re-includes what an earlier one matched, e.g. `!dist` in `ignore` stops ignoring `dist`, or `!*.test.ts` in `code` drops test files from the code file index. As in `.gitignore`, a file can't be re-included if a folder it's in is ignored: ignore `vendor/*` and re-include `!vendor/keep`, rather than ignoring `vendor`.
- A pattern without a `/` matches at any depth; one with a `/` is anchored to the host repository's root (to the source root, for `code`).
- Matching is case-insensitive.

Ignored files are left out of everything: the documentation files and the code file index. Symbolic links are not followed.

## Documentation files

tsshowcase collects these documentation files, matching their names regardless of case, in UK or US spelling, and with the `.md` or `.txt` extension or none:

- `README` files anywhere in the host repository;
- `LICENSE` (or `LICENCE`) and `CONTRIBUTE` (or `CONTRIBUTING`) in the host repository's root.

The stack adapter's and the configuration's `documentation` patterns can add more files, or remove these with `!` (e.g. `!README.txt`). If one folder holds several files of the same kind (e.g. `README.md` and `README.txt`), tsshowcase keeps one of them, preferring `.md`, then no extension, then `.txt`, and reports a warning.

## Stack adapters

A stack adapter handles one kind of host repository: it reads the project information and sets the default source root and patterns. The `stack` key selects one by name.

| Stack adapter | Project information | Source root | Code (`code`)                                                        | Ignored (`ignore`)                         | Documentation (`documentation`) |
| ------------- | ------------------- | ----------- | -------------------------------------------------------------------- | ------------------------------------------ | ------------------------------- |
| `typescript`  | `package.json`      | `src`       | `*.ts`, `*.tsx`, `*.mts`, `*.cts`, `*.js`, `*.jsx`, `*.mjs`, `*.cjs` | `.git`, `node_modules`, `dist`, `coverage` | none beyond the built-in ones   |

The `typescript` stack adapter reads the `name` (required), `version`, `description`, `license`, `author`, `homepage` and `repository` fields of `package.json`.

## `tsshowcase check`

Checks the host repository in the current directory (or the one `--root` names):

```sh
$ npx tsshowcase check [--root <dir>]
```

- Every issue found goes to `stderr`, one per line, as `error: <path>: <message>` or `warning: <path>: <message>`.
- If the check passes, the host information goes to `stdout`, as indented JSON. If it fails, `stdout` stays empty.
- The exit code is `0` if the check passes, and `1` if it finds any error, or the arguments are wrong. Warnings alone don't fail it.

Errors are: a missing or invalid `tsshowcase.json`, an unknown `stack`, project information that can't be read, and a source root that doesn't exist or is outside the host repository. Warnings are: several documentation files of the same kind in one folder.

The host information has this shape (types `HostInformation`, `ProjectInformation` and `DocumentationFile`):

```json
{
  "project": { "name": "my-library", "version": "1.0.0" },
  "documentation": [{ "path": "README.md", "kind": "readme", "extension": ".md", "content": "# My library\n" }],
  "code": ["src/index.ts"]
}
```

Documentation files have a `kind` of `readme`, `contribute`, `license`, or `other` for the files the `documentation` patterns add. Paths are POSIX-style and relative to the host repository's root, and both lists are sorted by path.

## API

Everything the command line does is also exported:

```ts
import { check, readConfiguration, getStackAdapter, getStackAdapterNames, type CheckResult } from '@ofzza/tsshowcase';

// Checks a host repository, and collects its host information if the check passes
const result: CheckResult = await check('./path/to/host');
if (result.passed) {
  console.log(result.host?.code);
}
for (const issue of result.issues) {
  console.error(issue.severity, issue.path, issue.message);
}

// Reads and validates a host repository's tsshowcase.json
const { configuration, errors } = await readConfiguration('./path/to/host');

// Looks up a built-in stack adapter by name
const adapter = getStackAdapter(configuration?.stack ?? 'typescript');
const project = await adapter?.readProject('./path/to/host');
console.log(getStackAdapterNames(), project, errors);
```

- `check(root)`: checks a host repository and collects its host information; resolves to a `CheckResult` (`passed`, `host` when it passed, and `issues`).
- `readConfiguration(root)` / `validateConfiguration(value)`: read and validate a `tsshowcase.json`, resolving to either a `configuration` or `errors`.
- `getStackAdapter(name)` / `getStackAdapterNames()`: look up the built-in stack adapters, which implement the `StackAdapter` interface; `TypeScriptStackAdapter` is the `typescript` one.
- `main(args, output?)`: runs the command line with the given arguments, resolving to its exit code; `USAGE` is its help text.
- Constants: `CONFIGURATION_FILE_NAME` (`tsshowcase.json`), `DEFAULT_OUT_DIR` (`./showcase`), and `BUILT_IN_DOCUMENTATION` (the built-in documentation patterns).
- Types: `HostInformation`, `ProjectInformation`, `DocumentationFile`, `DocumentationKind`, `Configuration`, `ConfigurationResult`, `StackAdapter`, `CheckResult`, `CheckIssue`, `CheckIssueSeverity` and `CliOutput`.

# Development

- `npm run build` - cleans `dist/` (`npm run clean`), then compiles `src/` into it, emitting declarations, and copies the showcase application's `src/app/index.html` to `dist/app/` (`npm run copy-app`). Also run on `prepare`, so a local `npm install` builds too.
- `npm run dev` - the same, in watch mode (restart it after changing `src/app/index.html`).
- `npm start` - runs the built command line, `dist/cli/bin.js`; pass it arguments after `--`, e.g. `npm start -- check --root test/fixtures/minimal`.
- `npm test` - runs every `test:*` script.
  - `npm run test:unit` - a single Vitest invocation that executes test files, runs their runtime expectations, and type checks them, reporting type errors as test failures. Tests run against the fixture host repositories in `test/fixtures/`; the showcase application's tests render it to HTML with `react-dom/server`.
- `npm run ci` - runs every `ci:*` script: build, ESLint, Prettier and the tests. This is what GitHub Actions runs on every pull request targeting, and every push to, `master` or `develop`, against Node 22 and 24. It also runs on `prepublishOnly`, so `npm publish` refuses to publish a failing build.

# Contributing

For reporting issues, contribution workflow and branching, see [CONTRIBUTE.md](./CONTRIBUTE.md).
For releasing a version, see [PUBLISH.md](./PUBLISH.md).

MIT - see [LICENSE.md](./LICENSE.md).
