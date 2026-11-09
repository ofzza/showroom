# AGENTS.md

Guidance for AI coding agents when working in this repository.

## Keeping documentation and tests current

**`README.md`, `CONTRIBUTE.md`, `AGENTS.md` and the tests are part of the deliverable of every task, not separate chores.** This holds whether or not the task mentions them. Whenever a change makes any of them inaccurate or incomplete, update it in the same change. Never leave it for later, and never finish a task by reporting only the code change. `PUBLISH.md` falls under the same rule whenever the release process changes.

- **`README.md`** is the user-facing documentation: what the project is, how to get it, how to use every export (`# Usage`), and how to develop it (`# Development`).
- **`CONTRIBUTE.md`** is the contributor-facing documentation: reporting issues, the contribution workflow and branching, and the architecture and glossary.
- **`AGENTS.md`** (this file, included by `CLAUDE.md`) is the agent-facing documentation: layout, commands, testing, conventions and gotchas.

Tests in particular: new or changed behaviour gets tests in the `*.test.ts` beside the changed file. Tests that a change breaks are handled as [WORKFLOW.md](./WORKFLOW.md) › "Documentation and tests" says. The purpose comments of the tests (see [Code style](#code-style)) are part of them, and must be kept current along with them.

Concrete triggers:

| A change that ...                                               | ... requires updating                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| changes behaviour or code                                       | the `*.test.ts` beside it                                                                                                                                     |
| adds, changes or removes a test                                 | the purpose comment of its `describe`, and of the `it` if it has one                                                                                          |
| adds, removes or renames an export                              | `README.md` `# Usage` section, and [Exports](#exports) below                                                                                                  |
| changes an exported type's or function's semantics              | `README.md` `# Usage` section, and any example that demonstrates it                                                                                           |
| adds or changes an npm script, Vitest project or tsconfig       | [Commands](#commands) / [Testing](#testing), and `# Development` in `README.md`                                                                               |
| changes the release process or `package.json` publishing fields | `PUBLISH.md`                                                                                                                                                  |
| adds a source directory under `src/`                            | [Layout](#layout) below, and the project structure in `CONTRIBUTE.md`                                                                                         |
| introduces, renames or retires a concept or term                | a **PROPOSED** glossary change in `CONTRIBUTE.md` (see [WORKFLOW.md](./WORKFLOW.md) › "Glossary"), then every identifier, comment and document using the term |
| changes the branching model or contribution workflow            | [Branching](#branching) below, and `CONTRIBUTE.md`                                                                                                            |
| establishes a new convention, or hits a new gotcha              | [Code style](#code-style) / [Gotchas and known issues](#gotchas-and-known-issues)                                                                             |
| resolves one of the known issues listed below                   | remove it from [Gotchas and known issues](#gotchas-and-known-issues)                                                                                          |

Any code sample added to `README.md` must be verified against `tsc` before it is committed. Extract the ```ts blocks, point their imports at `./src/index.js`, and run `tsc --noEmit`.

## Project

`@ofzza/tsshowcase`: enforce and build documentation/showcase apps for TypeScript libraries. It is MIT licensed, built from `src/` to `dist/`, and published to NPM as `@ofzza/tsshowcase` (source: [github.com/ofzza/tsshowcase](https://github.com/ofzza/tsshowcase)).

Template: ts from ofzza/.templates @ develop@35c447a

- **ESM only** (`"type": "module"`). The entry point is the `exports` map (`.` → `types: ./dist/index.d.ts`, `default: ./dist/index.js`, plus `./package.json`). `main` and `types` mirror it for older tooling.
- **Only `dist/` is published** (`files: ["dist"]`; npm adds `README.md`, `LICENSE.md` and `package.json` itself). The package also sets `sideEffects: false`, and `publishConfig.access: public` because scoped packages otherwise publish as restricted.
- Toolchain last verified against: Node 24, TypeScript 5.9, Vitest 5.0, ESLint 10, Prettier 3.8.

## Branching

The branching rules are in [WORKFLOW.custom.md](./WORKFLOW.custom.md) › "Branching".

## Commits

The commit rules are in [WORKFLOW.custom.md](./WORKFLOW.custom.md) › "Commits".

## Layout

```
src/
  index.ts                 Entry point and public API; re-exports every module (`export * from './<module>/index.js';`)
  index.test.ts            Tests, colocated
tsconfig.json              Type checking config. Includes all .ts/.tsx (tests too), emits nothing
tsconfig.build.json        Build config. Extends tsconfig.json, emits to dist/ with declarations, EXCLUDES test files (*.test / *.spec / *.test-d / *.spec-d)
vite.config.ts             Two Vitest projects: unit, and debug (only with VITEST_DEBUG=1)
eslint.config.js           ESLint flat config (typescript-eslint + prettier compat, ignores what .gitignore ignores)
.prettierrc                Prettier config
dist/                      Build output, gitignored
.github/workflows/ci.yml   GitHub Actions CI
.github/dependabot.yml     Weekly dependency updates
.vscode/extensions.json    Recommended VSCode extensions: ESLint, Prettier, TODO Highlight, Twoslash Query Comments
.vscode/launch.json        Vitest debug launch configs: all tests, unit tests, current file
README.md                  User documentation
CONTRIBUTE.md              Contributor guide: reporting issues, workflow, branching, architecture and glossary
PUBLISH.md                 Pre-publish checklist and release steps
```

Each new module gets its own directory under `src/`, holding an `index.ts` + `index.test.ts` pair, and is re-exported from `src/index.ts`.

## Commands

- `npm run clean`: deletes `dist/` (cross-platform, via `node -e`).
- `npm run build`: runs `tsc -p tsconfig.build.json`, compiling `src/` to `dist/` with declarations. `prebuild` runs `clean` first, so renamed or removed modules never leave stale output behind to be published.
- `npm run dev`: the same in watch mode.
- `npm start`: runs the built entry point, `node dist/index.js`.
- `npm test`: runs every `test:*` script.
  - `npm run test:unit`: `vitest run --project unit`, a single invocation that both executes the tests and type checks them.
- `npm run ci`: runs every `ci:*` script (`ci:build`, `ci:eslint`, `ci:prettier`, `ci:test-unit`). This is what GitHub Actions runs.
- `npm run prepare`: builds. It is invoked automatically by a local `npm install`/`npm ci` and before `npm publish`, but **not** when the package is installed as a dependency.
- `prepublishOnly`: runs `npm run ci` before `npm publish`, so a failing build is never published.

**Script wiring matters when adding one.** `test` is `npm-run-all test:*` and `ci` is `npm-run-all ci:*`, so a new `test:<name>` joins `npm test` automatically. It will _not_ run in CI until a matching `ci:test-<name>` script exists, so add both.

## Testing

Vitest, with `describe`/`it`/`expect` imported explicitly (`globals` is not enabled). `vite.config.ts` defines two projects:

- **`unit`** matches `src/**/*.{test,unit.test,spec,unit.spec}.{js,jsx,ts,tsx}`, and runs each TypeScript test file through **both** Vitest pools in one invocation. The default pool executes it for its runtime expectations. `tsc` (via `typecheck.tsconfig: './tsconfig.json'`) type checks it for its compile-time assertions (`expectTypeOf`, `@ts-expect-error`), reporting type errors as failed tests.

  Two kinds of file only go through one pool. JavaScript test files (`.js`, `.jsx`) are only executed, as `tsc` does not check JavaScript. Type-only test files, Vitest's `*.test-d.{ts,tsx}` / `*.spec-d.{ts,tsx}` convention, are only type checked: put pure `expectTypeOf` / `@ts-expect-error` assertions there, with no runtime expectations.

  `tsc` only checks files `tsconfig.json` includes, whatever `typecheck.include` says. A test file outside its `include` is collected but never checked, so its type assertions pass silently. This is why `tsconfig.json` includes `.tsx` files.

  `include` and `typecheck.include` deliberately match the same TypeScript test files. Vitest globs the two independently and does not warn when they overlap, so **every test file is collected and reported twice**, with each test counted once per pool. That is expected, not a misconfiguration. It has two consequences:
  - A file change triggers two reruns in watch mode.
  - A file containing no runtime `test()`/`describe()` call fails the runtime pass with "No test suite found in file", unless `--passWithNoTests` is set (it is set in `test:unit`).

  Type errors in non-test sources are reported too. `tsc` runs over the whole `tsconfig.json` program with no file list, so an error outside a test file surfaces as an "Unhandled Source Error" and fails the run without being attributed to any test.

  `typecheck.spawnTimeout` is pinned to `10000`. Vitest 5 documents a default for it but never applies one, yet uses the value unguarded when spawning the checker, which leaves an intermittent race.

- **`debug`** matches every file the `unit` project executes, plus files ending in `.debug.{js,jsx,ts,tsx}`. Type-only `*.test-d.*` files are not in it, as there is nothing in them to execute. It executes them at runtime only, with no type checking, and is driven by the "Debug Current Test File" config in `.vscode/launch.json`.

  It is **only defined when `VITEST_DEBUG=1` is set**, so an unfiltered run (plain `vitest`, "Debug ALL Test Files", or a tool that runs every project it finds) does not run every test a second time. "Debug Current Test File" sets the variable through its `env`. From a terminal, set it yourself, e.g. `$ VITEST_DEBUG=1 npx vitest run --project debug src/index.test.ts`. Without it, `--project debug` fails with "No projects were found". There is deliberately no npm script for this: setting a variable inline is not portable to Windows, and a `test:debug` script would join `npm test`.

  `.gitignore` excludes `*.debug.test.{js,jsx,ts,tsx}`. Those files also match the `unit` glob, so scratch debug tests run locally but are never committed.

**`.tsx` / `.jsx` files are supported, but JSX in them is not configured.** They are collected, linted, type checked and built like any other file. An actual JSX element, though, fails at runtime (Vite's default transform imports `react/jsx-dev-runtime`) and under `tsc` (no `jsx` compiler option), until the project adds a framework and configures both.

After adding or changing type-level assertions, sanity-check them: break one deliberately, confirm the run fails, then revert. Vitest prints an "experimental" warning for typecheck, which is expected.

## Code style

`ci:prettier` and `ci:eslint` enforce the style, but both only look at `src`. **Markdown files are not checked by CI**: format the ones you touch as [WORKFLOW.md](./WORKFLOW.md) › "Markdown formatting" says.

- Prettier: `printWidth: 160`, single quotes, 2-space indent, semicolons, trailing commas, always-parenthesised arrow params.
- Every file opens with a descriptive header comment.
- JSDoc on every exported symbol: a summary in third person ("Gets ...", "Checks if ...", "Represents ..."). Only `@param` and `@returns` are used, never `@example`, `@template` or `@see`.
- Internal, non-exported symbols are `_`-prefixed and still get JSDoc. ESLint's `no-unused-vars` ignores `_`-prefixed vars, args and catch bindings.
- Group sections with `// #region Name` / `// #endregion`.
- Generic parameters are `T`-prefixed and descriptive (`TArray`, `TObject`), including `infer` bindings, which must never shadow an outer parameter.
- In conditional type chains, put a `// comment` line before each branch saying what it handles, rather than a trailing comment.
- Each test file has one top-level `describe` named after its module. `it()` names are capitalised verb phrases: `it('Greets the world by default', ...)`.
- **Every `describe` callback opens with a purpose comment.** It is a `//` block on the first line inside the callback, saying _what_ is under test and _how_ it is tested. A nested `describe` says only what its parent's comment does not.
- **An `it` callback gets a comment only when its title and body do not explain why it exists.** Examples: a regression, an edge case, a test guarding a gotcha (link it: `See AGENTS.md › <gotcha title>`), or a non-obvious assertion. Never restate the title.
- Rules deliberately off: `@typescript-eslint/no-explicit-any`, `ban-ts-comment`, `no-empty-object-type`. `any` and `@ts-expect-error` are fine to use where they earn their place.

## Gotchas and known issues

- **`npm-run-all2`, not `npm-run-all`.** The original `npm-run-all@4` validates the package name and aborts on names it rejects (e.g. a leading `.`). Its maintained fork `npm-run-all2` installs the same `npm-run-all` binary without that check.
- **Relative imports in `src/` must carry an explicit `.js` extension.** `moduleResolution: bundler` lets TSC accept `./module`, and TSC does not rewrite specifiers on emit. The extensionless form then ships to `dist/`, and Node's ESM resolver rejects it (`ERR_MODULE_NOT_FOUND` / `ERR_UNSUPPORTED_DIR_IMPORT`). Write `./module/index.js`.
- **Never use `npm ci --ignore-scripts` here.** `unrs-resolver` (`postinstall`) and `@parcel/watcher` (`install`) rely on their install hooks to link native bindings, and skipping them risks breaking ESLint. The CI workflow uses plain `npm ci` for this reason.
- **`prepare` builds during install**, so `npm ci` compiles once and `ci:build` compiles again. The duplicate build costs about a second and is accepted.
- **The real Node floor is 22.13.0 / 24.0.0**, not the bare major versions. It is set by `vitest@5`, `vite@8` and `eslint-visitor-keys@5`, and Node 20 is not supported. `actions/setup-node` with `node-version: 22` resolves to the latest 22.x and satisfies this.
- **Do not add an `engines` field for the dev-toolchain Node floor.** It would restrict consumers for no reason.
- **`files: ["dist"]` is an allowlist.** Anything else that must ship has to be added there. Check with `npm pack --dry-run`.
- **The `exports` map seals deep imports.** Only `.` and `./package.json` resolve, so `<package>/dist/<module>/index.js` fails under `node16`/`nodenext`/`bundler`. A new module only needs re-exporting from `src/index.ts`. Add an `exports` subpath only if the module should be importable on its own.
- **Do not add a `paths` alias to the tsconfigs.** TSC does not rewrite aliased specifiers on emit, so they would ship to `dist/` unresolvable.
- **Anything in `dependencies` is installed for every consumer.** Keep build, lint and test tooling in `devDependencies`.
- **`@types/node` is pinned to the lowest supported Node major** (currently `^22`), so type checking cannot silently rely on APIs newer than the CI matrix floor. `.github/dependabot.yml` ignores its semver-major updates for this reason, so bump it by hand together with the matrix.
- **`@eslint/js` must be a direct devDependency.** `eslint.config.js` imports it, and since ESLint 10 `eslint` no longer pulls it in transitively.
- **`tsconfig.build.json` excludes test files**, so `npm run build` never reports a type error in a test, and never emits one to `dist/`. Its `exclude` lists each test suffix (`.test`, `.spec`, `.test-d`, `.spec-d`) for both `.ts` and `.tsx`, as tsconfig globs have no `{a,b}` braces. A new test naming convention must be added there, or its files ship in the package. Use `npm test` (the `unit` project type checks them) or `tsc --noEmit -p tsconfig.json`.
- **`src/index.ts` only prints when run directly.** It compares `import.meta.url` against `process.argv[1]`, so importing it (from tests, or as a dependency) has no side effect, which keeps `sideEffects: false` truthful.
- `.gitignore` ignores `.vscode/` but re-includes `settings.json`, `tasks.json`, `launch.json` and `extensions.json`. Any other `.vscode/` file must be re-included there before it can be committed.
- **`*.gitignore.*` files and `*.gitignore/` directories are local-only** (e.g. `TODO.gitignore.md`), a convention for keeping scratch files next to the code. `.gitignore` ignores them, so never commit them. They are for your own local notes: an agent's working files still go under `./.workflow/.temp/<topic>/` (see [WORKFLOW.md](./WORKFLOW.md) › "Working files").

## Continuous integration

`.github/workflows/ci.yml` runs `npm ci && npm run ci` on every pull request targeting, and every push to, `master` or `develop`. It runs across a Node matrix of `[22, 24]` with `fail-fast: false`, and cancels in-progress runs only for pull requests, never for `master`.

`.github/dependabot.yml` opens weekly npm and github-actions updates against `develop`. devDependencies are grouped into one pull request, and `@types/node` majors are ignored.

**A workflow alone does not block merges.** To make it mandatory, set up branch protection on `master` in the GitHub repo settings, with `CI / Node 22` and `CI / Node 24` as required status checks. That is a repo setting, not a file in this repository.

## Exports

Everything public is re-exported from `src/index.ts`:

- `hello(name?: string): string` (`src/index.ts`): gets a greeting for the given name, defaulting to `'World'`.

---

## Workflow

Follow the workflow defined in [WORKFLOW.md](./WORKFLOW.md).

@WORKFLOW.md
