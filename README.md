# `showroom`

[![npm](https://img.shields.io/npm/v/@ofzza/showroom)](https://www.npmjs.com/package/@ofzza/showroom)

Build a showroom for a repository: its documentation, enriched by showcases.

`showroom` reads a host repository (the repository that uses it) and collects its host information: the project information, the documentation files (`README`, `CONTRIBUTE`, `LICENSE`, ...) and an index of its code files. `showroom check` collects and checks it, `showroom build` builds the showroom that presents it into static files, ready for static hosting such as GitHub Pages, and `showroom serve` previews it. The showroom is a React/FluentUI SPA with the project information, a page per documentation file, and a light/dark toggle.

---

Jump to section:

- [Get `showroom`](#get-showroom)
- [Usage](#usage)
  - [Configuration: `showroom.json`](#configuration-showroomjson)
  - [Patterns](#patterns)
  - [Documentation files](#documentation-files)
  - [Stack adapters](#stack-adapters)
  - [`showroom check`](#showroom-check)
  - [`showroom serve`](#showroom-serve)
  - [`showroom build`](#showroom-build)
  - [Publishing to GitHub Pages](#publishing-to-github-pages)
  - [API](#api)
- [Development](#development)
- [Contributing](#contributing)

# Get `showroom`

`showroom` is published as an NPM package. Install it in the host repository, and run it through `npx`:

```sh
$ npm install --save-dev @ofzza/showroom
$ npx showroom check
```

Or install it globally:

```sh
$ npm install -g @ofzza/showroom
$ showroom check
```

Or run it without installing it:

```sh
$ npx @ofzza/showroom check
```

A host repository with no `package.json` of its own (e.g. a .NET one) can run it the same way, with Node installed: `npx --package @ofzza/showroom showroom build`. It still needs a stack adapter for its kind of repository, and the only one so far is `typescript`.

# Usage

## Configuration: `showroom.json`

Every host repository needs a `showroom.json` file in its root. Without it, `showroom` stops with an error.

```json
{
  "stack": "typescript",
  "sourceRoot": "src",
  "ignore": ["examples"],
  "code": ["!*.test.ts"],
  "documentation": ["docs/*.md"]
}
```

| Key             | Required | Default             | Meaning                                                                                                                                                                |
| --------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack`         | yes      |                     | Name of the [stack adapter](#stack-adapters) to use.                                                                                                                   |
| `sourceRoot`    | no       | the stack adapter's | Source root directory, relative to the host repository's root. Code files are only looked for under it.                                                                |
| `outDir`        | no       | `./showroom`        | Output folder of `showroom build`, relative to the host repository's root. It must be inside the host repository, and isn't its root. Nothing in it is ever collected. |
| `ignore`        | no       | `[]`                | [Patterns](#patterns) of files to ignore, appended to the stack adapter's.                                                                                             |
| `code`          | no       | `[]`                | [Patterns](#patterns) of code files, relative to the source root, appended to the stack adapter's.                                                                     |
| `documentation` | no       | `[]`                | [Patterns](#patterns) of documentation files, appended to the built-in ones and the stack adapter's.                                                                   |

Any other key is an error, which catches typos.

## Patterns

`ignore`, `code` and `documentation` are each a list of patterns that work like a `.gitignore` file:

- The stack adapter's patterns come first, and the configuration's are appended to them.
- They're applied in order, and the last pattern matching a file wins. A pattern starting with `!` re-includes what an earlier one matched, e.g. `!dist` in `ignore` stops ignoring `dist`, or `!*.test.ts` in `code` drops test files from the code file index. As in `.gitignore`, a file can't be re-included if a folder it's in is ignored: ignore `vendor/*` and re-include `!vendor/keep`, rather than ignoring `vendor`.
- A pattern without a `/` matches at any depth; one with a `/` is anchored to the host repository's root (to the source root, for `code`).
- Matching is case-insensitive.

Ignored files are left out of everything: the documentation files and the code file index. Symbolic links are not followed.

## Documentation files

`showroom` collects these documentation files, matching their names regardless of case, in UK or US spelling, and with the `.md` or `.txt` extension or none:

- `README` files anywhere in the host repository;
- `LICENSE` (or `LICENCE`) and `CONTRIBUTE` (or `CONTRIBUTING`) in the host repository's root.

The stack adapter's and the configuration's `documentation` patterns can add more files, or remove these with `!` (e.g. `!README.txt`). If one folder holds several files of the same kind (e.g. `README.md` and `README.txt`), `showroom` keeps one of them, preferring `.md`, then no extension, then `.txt`, and reports a warning.

## Stack adapters

A stack adapter handles one kind of host repository: it reads the project information and sets the default source root and patterns. The `stack` key selects one by name.

| Stack adapter | Project information | Source root | Code (`code`)                                                        | Ignored (`ignore`)                         | Documentation (`documentation`) |
| ------------- | ------------------- | ----------- | -------------------------------------------------------------------- | ------------------------------------------ | ------------------------------- |
| `typescript`  | `package.json`      | `src`       | `*.ts`, `*.tsx`, `*.mts`, `*.cts`, `*.js`, `*.jsx`, `*.mjs`, `*.cjs` | `.git`, `node_modules`, `dist`, `coverage` | none beyond the built-in ones   |

The `typescript` stack adapter reads the `name` (required), `version`, `description`, `license`, `author`, `homepage` and `repository` fields of `package.json`.

## `showroom check`

Checks the host repository in the current directory (or the one `--root` names):

```sh
$ npx showroom check [--root <dir>] [--out-dir <dir>]
```

- Every issue found goes to `stderr`, one per line, as `error: <path>: <message>` or `warning: <path>: <message>`.
- If the check passes, the host information goes to `stdout`, as indented JSON. If it fails, `stdout` stays empty.
- The exit code is `0` if the check passes, and `1` if it finds any error, or the arguments are wrong. Warnings alone don't fail it.

`--out-dir` overrides `showroom.json`'s `outDir`, relative to the current directory (as `--root` is); `check` takes it so it skips the same files `build` would.

Errors are: a missing or invalid `showroom.json`, an unknown `stack`, project information that can't be read, a source root that doesn't exist or is outside the host repository, and an output folder that is the host repository's root or outside it. Warnings are: several documentation files of the same kind in one folder.

The host information has this shape (types `HostInformation`, `ProjectInformation` and `DocumentationFile`):

```json
{
  "project": { "name": "my-library", "version": "1.0.0" },
  "documentation": [{ "path": "README.md", "kind": "readme", "extension": ".md", "content": "# My library\n" }],
  "code": ["src/index.ts"]
}
```

Documentation files have a `kind` of `readme`, `contribute`, `license`, or `other` for the files the `documentation` patterns add. Paths are POSIX-style and relative to the host repository's root, and both lists are sorted by path.

## `showroom serve`

Serves the showroom of the host repository in the current directory (or the one `--root` names), for previewing it while writing its documentation:

```sh
$ npx showroom serve [--root <dir>] [--port <port>] [--out-dir <dir>]
```

- It checks the host repository first, as `showroom check` does, writing the issues to `stderr`. If the check fails, it exits with `1` without serving.
- It then serves the showroom with Vite's dev server on `--port` (default: `5173`, or the next free port), writing its URL to `stdout`, until you stop it with Ctrl+C.
- It watches the host repository, skipping the files the `ignore` patterns skip, and the output folder (`--out-dir`, as for `check`). After any change it checks the host repository again, and reloads the page when the project information or a documentation file changed. A failed check writes its issues and keeps showing the last good data. Changes to `showroom.json` apply without a restart.

The showroom has a page per documentation file, its address in the URL's hash (e.g. `#/docs/guide.md`), and a home page with the project information and the root `README`. The navigation lists `README` (the home page), `CONTRIBUTING` and `LICENSE` first, whatever the root files' actual names (e.g. `CONTRIBUTE.md`, `LICENCE.txt`), then every other documentation file by its path. `.md` files are rendered as GitHub-flavoured Markdown, with syntax-highlighted code blocks and the same heading ids as on GitHub; other documentation files are shown as plain text. In Markdown:

- relative links to documentation files (or to folders whose `README` is one) open their page; other relative links (e.g. to code files) are shown as plain text;
- relative images are shown as their alt text, as images aren't collected yet; absolute image URLs work;
- raw HTML tags are left out, keeping the Markdown between them.

Each run keeps Vite's cache in a fresh folder in the system's temporary folder, and removes it on exit; starting takes a few seconds while Vite prepares the dependencies.

## `showroom build`

Builds the showroom of the host repository in the current directory (or the one `--root` names) into its output folder, as static files:

```sh
$ npx showroom build [--root <dir>] [--out-dir <dir>]
```

- It checks the host repository first, as `showroom check` does, writing the issues to `stderr`. If the check fails, it exits with `1` without building.
- The output folder is `outDir` from `showroom.json` (default: `./showroom`), or `--out-dir`, relative to the current directory. It must be inside the host repository, and can't be its root.
- **The output folder is emptied before every build.** To keep a mistyped `outDir` from deleting your files, every build writes a `.showroom` marker file into it, and `build` refuses (exiting with `1`) to empty a folder that holds anything but a `.showroom` file from an earlier build. A missing or empty folder is fine.
- It writes the output folder's path to `stdout` once built, and exits with `0`. Warnings from the check don't fail it.

The output is an `index.html`, its `assets/` and the `.showroom` marker, with relative paths throughout, so it works wherever it's hosted, under any path (e.g. GitHub Pages' `https://<user>.github.io/<repo>/`). Pages are addressed in the URL's hash, so the host needs no rewrite rules. It needs to be served over HTTP: browsers won't run it from `file://`. Add the output folder to your `.gitignore`, unless you mean to commit it.

## Publishing to GitHub Pages

`showroom` only builds; publishing is up to the host repository. With `showroom` in its `devDependencies`, a GitHub Actions workflow like this one (e.g. `.github/workflows/showroom.yml`) builds and publishes the showroom on every push to `master`, once the repository's Settings › Pages › Source is set to "GitHub Actions":

```yaml
name: Showcase

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx showroom build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: showroom
      - id: deployment
        uses: actions/deploy-pages@v4
```

Publishing this way skips Jekyll, so no `.nojekyll` file is needed. If you configured another `outDir`, change the artifact's `path` to match. Without `showroom` in `devDependencies`, run `npx --yes @ofzza/showroom build` instead of `npx showroom build`.

## API

Everything the command line does is also exported, except serving and building, which are only available through the command line and `main()`:

```ts
import { check, readConfiguration, getStackAdapter, getStackAdapterNames, type CheckResult } from '@ofzza/showroom';

// Checks a host repository, and collects its host information if the check passes
const result: CheckResult = await check('./path/to/host');
// The output folder can be overridden, as with --out-dir
await check('./path/to/host', { outDir: './path/to/host/site' });
if (result.passed) {
  console.log(result.host?.code);
}
for (const issue of result.issues) {
  console.error(issue.severity, issue.path, issue.message);
}

// Reads and validates a host repository's showroom.json
const { configuration, errors } = await readConfiguration('./path/to/host');

// Looks up a built-in stack adapter by name
const adapter = getStackAdapter(configuration?.stack ?? 'typescript');
const project = await adapter?.readProject('./path/to/host');
console.log(getStackAdapterNames(), project, errors);
```

- `check(root, options?)`: checks a host repository and collects its host information; resolves to a `CheckResult` (`passed`, `host` when it passed, and `issues`). `options` (`CheckOptions`) overrides the configuration: `outDir`, absolute or relative to the current directory.
- `readConfiguration(root)` / `validateConfiguration(value)`: read and validate a `showroom.json`, resolving to either a `configuration` or `errors`.
- `getStackAdapter(name)` / `getStackAdapterNames()`: look up the built-in stack adapters, which implement the `StackAdapter` interface; `TypeScriptStackAdapter` is the `typescript` one.
- `main(args, output?)`: runs the command line with the given arguments, resolving to its exit code; `USAGE` is its help text.
- Constants: `CONFIGURATION_FILE_NAME` (`showroom.json`), `DEFAULT_OUT_DIR` (`./showroom`), and `BUILT_IN_DOCUMENTATION` (the built-in documentation patterns).
- Types: `HostInformation`, `ProjectInformation`, `DocumentationFile`, `DocumentationKind`, `Configuration`, `ConfigurationResult`, `StackAdapter`, `CheckOptions`, `CheckResult`, `CheckIssue`, `CheckIssueSeverity` and `CliOutput`.

# Development

- `npm run build` - cleans `dist/` (`npm run clean`), then compiles `src/` into it, emitting declarations, and copies the showroom's `src/app/index.html` to `dist/app/` (`npm run copy-app`). Also run on `prepare`, so a local `npm install` builds too.
- `npm run dev` - the same, in watch mode (restart it after changing `src/app/index.html`).
- `npm start` - runs the built command line, `dist/cli/bin.js`; pass it arguments after `--`, e.g. `npm start -- check --root test/fixtures/minimal`. Try `build` on a copy of a host repository (never on a fixture in `test/fixtures/`, which tests rely on), and serve its output folder over HTTP to look at it. To preview the showroom while working on it, serve a host repository with `npm start -- serve --root <host>` while `npm run dev` recompiles `src/app/` into `dist/app/`, and reload the page after a change. `npm run build` empties `dist/` first, so restart `serve` after it.
- `npm test` - runs every `test:*` script.
  - `npm run test:unit` - a single Vitest invocation that executes test files, runs their runtime expectations, and type checks them, reporting type errors as test failures. Tests run against the fixture host repositories in `test/fixtures/`; the showroom's tests render it to HTML with `react-dom/server`.
- `npm run ci` - runs every `ci:*` script: build, ESLint, Prettier and the tests. This is what GitHub Actions runs on every pull request targeting, and every push to, `master` or `develop`, against Node 22 and 24. It also runs on `prepublishOnly`, so `npm publish` refuses to publish a failing build.

# Contributing

For reporting issues, contribution workflow and branching, see [CONTRIBUTE.md](./CONTRIBUTE.md).
For releasing a version, see [PUBLISH.md](./PUBLISH.md).

MIT - see [LICENSE.md](./LICENSE.md).
