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

`@ofzza/showroom`: build a showroom for a repository: its documentation, enriched by showcases. A CLI (`showroom`, the `bin` in `package.json`) and a library. It is MIT licensed, built from `src/` to `dist/`, and published to NPM as `@ofzza/showroom` (source: [github.com/ofzza/showroom](https://github.com/ofzza/showroom)).

Template: ts from ofzza/.templates @ develop@35c447a

**Renamed from `tsshowcase` to `showroom` on 2026-11-12**, in the commit right after `d17d05e` (the last one with the old name). Commits up to and including `d17d05e` say `tsshowcase` (the package `@ofzza/tsshowcase`, `tsshowcase.json`, the `.tsshowcase` marker file, the default output folder `./showcase`), and "showcase application" for what the Glossary now calls the Showroom; their Markdown showcase marker `tsshowcase=<adapter>` is now `showcase=<adapter>`. The workflow files under `./.workflow/` were renamed in place, except the user's words quoted in `STATE.md`'s history.

- **ESM only** (`"type": "module"`). The entry point is the `exports` map (`.` → `types: ./dist/index.d.ts`, `default: ./dist/index.js`, plus `./package.json`). `main` and `types` mirror it for older tooling.
- **The `showroom` command line** is `bin: { showroom: dist/cli/bin.js }`, built from `src/cli/bin.ts`, which keeps its `#!/usr/bin/env node` line through `tsc`.
- **Only `dist/` is published** (`files: ["dist"]`; npm adds `README.md`, `LICENSE.md` and `package.json` itself). The package also sets `sideEffects: false`, and `publishConfig.access: public` because scoped packages otherwise publish as restricted.
- Toolchain last verified against: Node 24, TypeScript 5.9, Vitest 5.0, ESLint 10, Prettier 3.8, React 19.3, FluentUI 9.75.

## Branching

The branching rules are in [WORKFLOW.custom.md](./WORKFLOW.custom.md) › "Branching".

## Commits

The commit rules are in [WORKFLOW.custom.md](./WORKFLOW.custom.md) › "Commits".

## Layout

```
src/
  index.ts                 Entry point and public API; re-exports every module (`export * from './<module>/index.js';`)
  index.test.ts            Tests, colocated (one beside every index.ts)
  host/                    Host information types: project information, documentation files, code file index
  configuration/           Reading and validating the host repository's showroom.json
  adapters/stack/          StackAdapter interface and the registry of built-in stack adapters
    typescript/            The TypeScript stack adapter (package.json; TS/JS code)
  adapters/showcase/       ShowcaseAdapter interface and its types (experimental), the only part re-exported
    registry/              The built-in showcase adapters' registry, and loading custom ones; never re-exported
    html/                  The html showcase adapter (its static half; its build comes with showcase frames); never re-exported
  markdown/                Node-free Markdown scanning: the marker grammar, showcases, virtual files, links, path resolution (the showroom uses its link resolution); never re-exported
  showcases/               buildShowcases(): every showcase built into its showcase frame, in memory, with the frame script inserted; result checks, error positions, showcase frame paths; never re-exported
  frame/                   The frame script and its postMessage contract (browser code, Node-free; imported by the showroom and by src/showcases/); never re-exported
  cli/                     Command line: main(), argument parsing, output
    bin.ts                 Executable entry point (the package's bin); never imported, so it has no test
    check/                 check(): walks a host repository and collects its host information and issues
      internal/            The output folder, the ignore matcher and issue formatting, shared with serve and build; never re-exported
    serve/                 serve(): `showroom serve`, Vite's dev server, and the host watcher's runs (check, showcase builds, reload or events); loaded by main() with import(), never re-exported
    build/                 build(): `showroom build`, Vite's build into the output folder, and its marker; loaded by main() with import(), never re-exported
  vite/                    The showroom's Vite configuration, shared by serve and build: the virtual module, and the showcase frames (served from memory, or emitted); never re-exported
  testing/                 Test helpers (scratch folders, fixture copies, compiling the showroom); excluded from the build, never re-exported, but type checked and linted
    setup/                 The test projects' global setups: the temporary folder (integration, e2e, serve), and the compiled showroom (e2e, serve)
  app/                     The showroom (browser code, compiled to dist/app/, never re-exported): App, mount()
    index.html             Its static page, copied to dist/app/ by `npm run build`
    main.ts                Its entry point (loaded by index.html): mounts App with the virtual module's data; never imported, so it has no test
    virtual.d.ts           Type of the `virtual:showroom-host` module the Vite plugin serves
    host/                  The shown host information type, and helpers finding documentation files
    routing/               The hash router: parsing, formatting and resolving routes, useHash()
    links/                 Link resolution in Markdown (onto src/markdown/'s path helpers)
    navigation/            The navigation items
    theme/                 The light/dark theme, and keeping the toggle's choice
    markdown/              Markdown rendering: links, images, heading ids, highlighted code blocks, showcase frames
    issues/                The issues bar (serve's current issues)
    showcases/             The remark plugin placing showcase frames, and the showcase frame's iframe
    pages/                 The home, documentation and not-found pages
    layout/                The header, the navigation drawer and the page
test/fixtures/             Fixture host repositories the tests run against; outside src/, so never built, linted or published
examples/                  Real files behind README.md's live showcases (e.g. the linked showcase's page); outside src/, so never built, linted or published
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

Each new module gets its own directory under `src/`, holding an `index.ts` + `index.test.ts` pair, and is re-exported from `src/index.ts`. The exception is `src/app/`: its modules (`index.ts(x)` + `index.test.ts(x)` pairs too) are only imported by the showroom, never re-exported.

## Commands

- `npm run clean`: deletes `dist/` (cross-platform, via `node -e`).
- `npm run build`: runs `tsc -p tsconfig.build.json`, compiling `src/` to `dist/` with declarations, then `copy-app`. `prebuild` runs `clean` first, so renamed or removed modules never leave stale output behind to be published.
- `npm run dev`: `copy-app`, then the compilation in watch mode (a change to `src/app/index.html` needs a restart).
- `npm run copy-app`: copies `src/app/index.html`, which `tsc` doesn't emit, to `dist/app/`. `ci:build` only compiles, and doesn't run it.
- `npm start`: runs the built command line, `node dist/cli/bin.js`. Pass arguments after `--`, e.g. `npm start -- check --root test/fixtures/minimal`. `npm start -- serve --root <host>` previews the showroom of a host repository; with `npm run dev` running alongside, reload the page to see changes to `src/app/`. Never serve a fixture in `test/fixtures/` while editing its files: work on a copy in a working-files folder. Likewise, run `npm start -- build --root <host>` only on a copy, as it writes the output folder into the host repository; serve the result over HTTP (browsers won't run it from `file://`).
- `npm test`: runs every `test:*` script.
  - `npm run test:unit`: `vitest run --project unit`, a single invocation that both executes the tests and type checks them.
  - `npm run test:integration`, `npm run test:e2e`, `npm run test:serve`: `vitest run --project <tier>`, executing the other test tiers (see [Testing](#testing)); each passes with no tests.
- `npm run ci`: runs every `ci:*` script (`ci:build`, `ci:eslint`, `ci:prettier`, `ci:test-unit`, `ci:test-integration`, `ci:test-e2e`, `ci:test-serve`). This is what GitHub Actions runs.
- `npm run prepare`: builds. It is invoked automatically by a local `npm install`/`npm ci` and before `npm publish`, but **not** when the package is installed as a dependency.
- `prepublishOnly`: runs `npm run ci` before `npm publish`, so a failing build is never published.

**Script wiring matters when adding one.** `test` is `npm-run-all test:*` and `ci` is `npm-run-all ci:*`, so a new `test:<name>` joins `npm test` automatically. It will _not_ run in CI until a matching `ci:test-<name>` script exists, so add both.

## Testing

Vitest, with `describe`/`it`/`expect` imported explicitly (`globals` is not enabled). `vite.config.ts` defines five projects: four test tiers, told apart by file name suffix, and `debug`:

- **`unit`** matches `src/**/*.{test,unit.test,spec,unit.spec}.{js,jsx,ts,tsx}`, except the other tiers' suffixes, and runs each TypeScript test file through **both** Vitest pools in one invocation. The default pool executes it for its runtime expectations. `tsc` (via `typecheck.tsconfig: './tsconfig.json'`) type checks it for its compile-time assertions (`expectTypeOf`, `@ts-expect-error`), reporting type errors as failed tests.

  Two kinds of file only go through one pool. JavaScript test files (`.js`, `.jsx`) are only executed, as `tsc` does not check JavaScript. Type-only test files, Vitest's `*.test-d.{ts,tsx}` / `*.spec-d.{ts,tsx}` convention, are only type checked: put pure `expectTypeOf` / `@ts-expect-error` assertions there, with no runtime expectations.

  `tsc` only checks files `tsconfig.json` includes, whatever `typecheck.include` says. A test file outside its `include` is collected but never checked, so its type assertions pass silently. This is why `tsconfig.json` includes `.tsx` files.

  `include` and `typecheck.include` deliberately match the same TypeScript test files. Vitest globs the two independently and does not warn when they overlap, so **every test file is collected and reported twice**, with each test counted once per pool. That is expected, not a misconfiguration. It has two consequences:
  - A file change triggers two reruns in watch mode.
  - A file containing no runtime `test()`/`describe()` call fails the runtime pass with "No test suite found in file", unless `--passWithNoTests` is set (it is set in `test:unit`).

  Type errors in non-test sources are reported too. `tsc` runs over the whole `tsconfig.json` program with no file list, so an error outside a test file surfaces as an "Unhandled Source Error" and fails the run without being attributed to any test.

  `typecheck.spawnTimeout` is pinned to `10000`. Vitest 5 documents a default for it but never applies one, yet uses the value unguarded when spawning the checker, which leaves an intermittent race.

- **`integration`** (`*.integration.test.*`: real showcase adapter builds, `buildShowcases()` and `check()` with `showcases`, on the fixtures), **`e2e`** (`*.e2e.test.*`: the command line, `main()` called in-process, and `build()` with Vite, on fixture copies) and **`serve`** (`*.serve.test.*`: `serve()` with the dev server, on fixture copies) only execute their files, with a 60 s timeout; none of them type checks. Their files are still type checked by `unit`'s `tsc` run, which covers the whole `tsconfig.json` program, and `tsconfig.build.json`'s `*.test.ts` exclude keeps them out of the build.

  Their `TMPDIR`, `TMP` and `TEMP` point at a folder of each project's own, `node_modules/.cache/showroom-tests/tmp-<project>/` (`env` in `vite.config.ts`), which `src/testing/setup/temporary-folder.ts`, their global setup, creates and removes, so the temporary folders `showroom` makes (the showcases' build, Vite's cache) stay inside the repository. The `e2e` and `serve` projects' second global setup, `src/testing/setup/app.ts`, compiles `src/` once per run into a scratch folder (`compileApp()`: `tsc -p tsconfig.build.json --outDir <scratch>`, run with `process.execPath`, plus `index.html`), provided as `inject('appDir')`, so builds and dev servers never depend on, or write to, `dist/`.

- **`debug`** matches every file the `unit` project executes, plus files ending in `.debug.{js,jsx,ts,tsx}`. Type-only `*.test-d.*` files are not in it, as there is nothing in them to execute. It executes them at runtime only, with no type checking, and is driven by the "Debug Current Test File" config in `.vscode/launch.json`.

  It is **only defined when `VITEST_DEBUG=1` is set**, so an unfiltered run (plain `vitest`, "Debug ALL Test Files", or a tool that runs every project it finds) does not run every test a second time. "Debug Current Test File" sets the variable through its `env`. From a terminal, set it yourself, e.g. `$ VITEST_DEBUG=1 npx vitest run --project debug src/index.test.ts`. Without it, `--project debug` fails with "No projects were found". There is deliberately no npm script for this: setting a variable inline is not portable to Windows, and a `test:debug` script would join `npm test`.

  `.gitignore` excludes `*.debug.test.{js,jsx,ts,tsx}`. Those files also match the `unit` glob, so scratch debug tests run locally but are never committed.

**Fixture host repositories** live in `test/fixtures/<name>/`, one per area under test (the defaults, file name variants, duplicates, configured patterns, one per configuration error; and grouped by area where `check` reports every issue at once: `showcases`, `showcase-errors`, `showcase-adapters`, `links`). Tests reach them with `fileURLToPath(new URL('<relative path to test/fixtures>/<name>', import.meta.url))`, and never write to them. Being outside `src/`, they are neither type checked, linted, formatted by `ci:prettier`, built nor published. See [Gotchas and known issues](#gotchas-and-known-issues) for what they can't contain.

**Scratch folders**: a test that needs to write creates its own folder with `src/testing/`'s `createScratchFolder()` (or copies a fixture into one with `copyFixture()`), inside `node_modules/.cache/showroom-tests/` (ignored by git, ESLint and Prettier, and wiped by `npm ci`), and removes it afterwards (`remove()`, e.g. in `afterEach`). Never create temporary folders anywhere else, e.g. in the OS temp folder. Copies of fixtures still resolve this repository's `node_modules`, from inside it.

**JSX is configured for React.** `tsconfig.json` sets `jsx: react-jsx`, so `.tsx` files are type checked and built by `tsc` like any other file, and Vitest's default transform runs them through React's JSX runtime. ESLint checks them with `eslint-plugin-react-hooks`'s recommended rules.

**The showroom is tested by rendering it on the server**, with `react-dom/server`'s `renderToString`, and asserting on the HTML: there is no DOM in the tests (no `jsdom`), so effects never run, and `mount()` is never called. Wrap what is rendered in FluentUI's `SSRProvider` (otherwise FluentUI warns on `stderr`), and strip the `<!-- -->` comments React puts between adjacent text nodes before matching text. `App` takes the route, the theme and the issues as props for this; `mount()`'s updates are tested through `applyUpdate()` and the store (`createShowroomStore()`, rendered with `MountedShowroom`). Anything that touches `window` or `document` has to be guarded or inside an effect, or the render throws; `getInitialTheme()` is tested with a stubbed `window` (`vi.stubGlobal`).

**`showroom check`'s showcases and links** are unit-tested in `src/markdown/` (the marker grammar and scanning, on Markdown strings), `src/adapters/showcase/` (the `html` showcase adapter, the registry, and loading the `showcase-adapters` fixture's custom showcase adapters), and `src/cli/check/` (on the `showcases`, `showcase-errors`, `showcase-adapters` and `links` fixtures), and end to end in `src/cli/index.e2e.test.ts`.

**Showcase builds** are unit-tested in `src/showcases/` (the frame script's insertion, result checks, error positions and showcase frame paths, on hand-written values: `buildShowcases()` itself makes a temporary folder, so only the `integration` tests call it, on the `showcase-frames` and `showcase-build-errors` fixtures, and `check()` with `showcases` on this repository itself) and `src/frame/` (the frame script, run from its inserted source text with a stubbed `window`). The showroom's placement of showcase frames is tested by rendering Markdown whose showcases `scanMarkdown()` finds, so offsets are the ones `check` gives.

**`showroom serve` is unit-tested without starting a server, and served in the `serve` tier.** The unit tests cover the Vite configuration and its plugins (`src/vite/`, calling the plugins' hooks directly, and the showcase frames middleware with fake requests and responses), the watcher's `ignored` function, the showcase frames served (`getServedFrames()`, error frames included), and the host watcher's runs and decisions (`createHostWatcher()`, with a fake check, a fake build and a fake reload target, and fake timers for the debounce): a full reload, or the `showroom:showcases` and `showroom:issues` events. `main()`'s `serve` command is only run on a fixture whose first check fails. `src/cli/serve/index.serve.test.ts` calls `serve()` itself on fixture copies, on port 0, with the compiled showroom (`inject('appDir')`), stopped through its internal `signal` option (`onListening` gives the URL), and fetches the showroom, the virtual module (`/@id/__x00__virtual:showroom-host`), the showcase frames and their files. No `serve` test edits files (see the gotcha on Vite's watcher). The user checks updates after a change, and the issues bar, in a browser.

**`showroom build` is unit-tested without running Vite, and end to end with it.** The unit tests cover the output folder's resolution and ignore pattern (`src/cli/check/internal/`, and the `output-folder`, `out-dir-root` and `out-dir-outside` fixtures), the marker's decision (`getOutputFolderState()` on entry lists, as git can't hold an empty folder, and `readOutputFolderState()` on the `output-folder` fixture's folders), the build's Vite configuration (`getBuildConfiguration()`) and the plugin emitting showcase frames; `main()`'s `build` command is only run where it stops before building. `src/cli/build/index.e2e.test.ts` calls `build()` itself, with the compiled showroom (`inject('appDir')`), on fixture copies: a full build with showcase frames, and the cases that stop before Vite. The user still checks trial builds in a browser.

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
- **`tsconfig.build.json` excludes test files**, so `npm run build` never reports a type error in a test, and never emits one to `dist/`. Its `exclude` lists each test suffix (`.test`, `.spec`, `.test-d`, `.spec-d`) for both `.ts` and `.tsx`, as tsconfig globs have no `{a,b}` braces. A new test naming convention must be added there, or its files ship in the package. It also excludes `src/testing/`, the test helpers. Use `npm test` (the `unit` project type checks them) or `tsc --noEmit -p tsconfig.json`.
- **Only `src/cli/bin.ts` and `src/app/main.ts` have side effects** (they run the command line, and mount the showroom, on import), which is why nothing imports them, and why `sideEffects: false` stays truthful: every other module, `src/index.ts` included, only declares.
- **`sideEffects: false` also applies to the bundled showroom**, so the app never relies on an import that is only there for its side effects: no CSS imports (styles are Griffel's `makeStyles`, with FluentUI tokens), no polyfills.
- **`types: ["node"]` applies to the showroom's browser code too**, so Node globals (`process`, `Buffer`, …) type check in `src/app/` although they don't exist in the browser. Don't use them there. The DOM types come from TypeScript's default `lib`.
- **`main()` loads `serve` and `build` with a dynamic `import()`**, so `showroom check` and library users never load Vite. Never import `src/cli/serve/`, `src/cli/build/` or `src/vite/` statically from anything `src/index.ts` reaches, and never re-export them: they are internal, like `src/cli/check/internal/` (`src/index.test.ts`'s export list guards this).
- **Vite's root is `dist/app/` inside the package, and its `cacheDir` a fresh `mkdtemp` folder** (`<tmp>/showroom-XXXXXX`), removed when `serve` exits. Nothing is generated into the host repository or the package, so a global install works. `getAppDir()` resolves `../app/` from the module itself, which is `src/app/` in the tests (holding `index.html`, but no compiled `main.js`).
- **`build` empties the output folder, guarded by the `.showroom` marker.** Vite's `emptyOutDir` deletes everything in it, so `build` only lets it when the folder is missing, empty or marked (`readOutputFolderState()`), and writes the marker after every build. Never bypass this check, and never let the output folder be the host root or outside it (`resolveOutputFolder()`, which the check enforces).
- **The build leaves out the bundler's warnings about the showroom's own dependencies**: `MODULE_LEVEL_DIRECTIVE` (FluentUI's and Griffel's `'use client'`, once per file, about 1900 lines) and the chunk size (`CHUNK_SIZE_WARNING_LIMIT`, above the app's single chunk of about 810 kB). A new warning of that kind goes into `SILENCED_WARNINGS` in `src/cli/build/`; warnings the host can act on must still show.
- **React, React DOM and the scheduler are aliased to `showroom`'s own copies** in the Vite configuration (`getReactAliases()`), so a host's different React, next to a hoisted FluentUI, never mixes in ("Invalid hook call"). A new React package the application imports directly needs adding there.
- **`src/app/` is browser code, not part of the library's API.** It is compiled to `dist/app/` (and so published) for Vite to bundle, but never re-exported from `src/index.ts`, and it never imports Node modules. It may import types from the rest of `src/` (e.g. `src/host/`).
- **Markers in this repository's own documentation files are live.** `showroom.json` makes this repository a host of its own, and its `README.md` is a documentation file, so a showcase marker written in it as an example must sit inside a code block (examples of fences inside a fence of four backticks), or `showroom check` on this repository reports it. Every such example of how a showcase is written is followed by the same showcase, live, in a `>` block with a short lead-in line, so this repository's own showroom shows it (_`D173`_ in `.workflow/PLAN-P4.4-html-resources.md`): its real files live in `examples/`, and the custom showcase adapter's examples stay text only. Keep the button the first showcase in `README.md`, as the virtual files paragraph names it `README.showcase-1.html`. `src/cli/check/index.integration.test.ts` runs `check()` with `showcases: true` on this repository, so an edit that breaks a live showcase fails `npm test`.
- **Custom showcase adapters are loaded with `import()`**, so Node caches each module for the life of the process. `loadCustomShowcaseAdapters()` imports each by a URL carrying its content's hash (`?v=<hash>`), so `serve` loads a changed module once more, and reuses an unchanged one; every version loaded stays in memory until the process exits, and the modules it imports are never reloaded (`README.md` says to restart `serve` after changing them). `check()` and `buildShowcases()` each load them, so an edit between the two is picked up by the next run. Their default export is a factory, called once per run, so each run gets fresh objects, closed at its end; never reuse an object across runs. Fixtures with custom showcase adapters set `"type": "module"` in their `package.json`, as their `.js` modules are ES modules.
- **Vite's watcher always ignores `**/node_modules/**`, `**/.git/**` and `**/test-results/**`**, whatever `server.watch.ignored` says, so `serve` never sees changes in a host repository under such a path. Fixture copies live under `node_modules/.cache/`, which is why no `serve` test edits files: updates after a change are unit-tested on the host watcher.
- **A showcase frame's URL carries its content's hash as `?hash=`, never `?v=`**: Vite's dev server treats a `v` query as a dependency's version, and serves it as immutable. In `serve`, the showcase frames middleware answers every request inside a showcase frame's folder before Vite does; any other path under `showcases/` (e.g. the showroom's own `showcases/index.js`) goes on to Vite.
- **The frame script is self-contained.** `frameScript()` (`src/frame/`) is inlined into every showcase frame page as its source text (`getFrameScript()`, `Function.prototype.toString()`), so it must reference no outer names (no imports, no module constants): everything comes from `window` and its constants argument. Its tests run the inserted string, which would fail on such a reference.
- **`src/frame/` is browser code that Node code imports.** `src/showcases/` imports it for the script, and the showroom for the message types, so it stays Node-free and side-effect-free, like `src/markdown/`.
- **The frame script stops reporting growth** after the content grows by the same amount 3 times in a row (`MAX_REPEATED_GROWTHS`): a showcase sized to its viewport (`100vh`) would otherwise grow its iframe forever. Shrinking is still reported.
- **The showroom's placement of showcase frames relies on offsets.** `check` (`scanMarkdown()`) and the showroom's `react-markdown` must parse documentation files the same way (`remark-parse` with `remark-gfm`), or a showcase's offset matches no node and its showcase frame is skipped.
- **Fixtures can't hold `node_modules`, `dist` or `coverage` folders.** `.gitignore` ignores them at any depth, so they would never be committed. Tests of those default ignore patterns check the TypeScript stack adapter's list instead (see `src/adapters/stack/typescript/index.test.ts`), and fixtures exercise ignoring with other folder names (e.g. `vendor/`).
- **Fixture file names must differ by more than case within a folder**, or they collide on case-insensitive file systems (Windows, macOS). The case-insensitive matching is tested across folders (`test/fixtures/names/`).
- `.gitignore` ignores `.vscode/` but re-includes `settings.json`, `tasks.json`, `launch.json` and `extensions.json`. Any other `.vscode/` file must be re-included there before it can be committed.
- **`*.gitignore.*` files and `*.gitignore/` directories are local-only** (e.g. `TODO.gitignore.md`), a convention for keeping scratch files next to the code. `.gitignore` ignores them, so never commit them. They are for your own local notes: an agent's working files still go under `./.workflow/.temp/<topic>/` (see [WORKFLOW.md](./WORKFLOW.md) › "Working files").

## Continuous integration

`.github/workflows/ci.yml` runs `npm ci && npm run ci` on every pull request targeting, and every push to, `master` or `develop`. It runs across a Node matrix of `[22, 24]` with `fail-fast: false`, and cancels in-progress runs only for pull requests, never for `master`.

`.github/dependabot.yml` opens weekly npm and github-actions updates against `develop`. devDependencies are grouped into one pull request, and `@types/node` majors are ignored.

**A workflow alone does not block merges.** To make it mandatory, set up branch protection on `master` in the GitHub repo settings, with `CI / Node 22` and `CI / Node 24` as required status checks. That is a repo setting, not a file in this repository.

## Exports

Everything public is re-exported from `src/index.ts`:

- `check(root, options?): Promise<CheckResult>` (`src/cli/check/`): checks a host repository and collects its host information, its showcases included; `options.outDir` overrides the output folder, and `options.showcases` also builds every showcase (`--showcases`). Also `BUILT_IN_DOCUMENTATION`, and the types `CheckOptions`, `CheckResult`, `CheckIssue` (with an optional `line`), `CheckIssueSeverity`.
- `main(args, output?): Promise<number>` (`src/cli/`): runs the command line, resolving to its exit code. Also `USAGE`, and the type `CliOutput`.
- `readConfiguration(root)`, `validateConfiguration(value)` (`src/configuration/`): read and validate `showroom.json`. Also `CONFIGURATION_FILE_NAME`, `DEFAULT_OUT_DIR`, and the types `Configuration`, `ConfigurationResult`.
- `getStackAdapter(name)`, `getStackAdapterNames()` (`src/adapters/stack/`): look up the built-in stack adapters. Also the type `StackAdapter`, and `TypeScriptStackAdapter` (`src/adapters/stack/typescript/`).
- Types `HostInformation`, `ProjectInformation`, `DocumentationFile`, `DocumentationKind`, `Showcase`, `ShowcaseKind`, `VirtualFile`, `VirtualFileKind` (`src/host/`): the host information.
- Types `ShowcaseAdapter`, `ShowcaseValidation`, `ShowcaseBuildRequest`, `ShowcaseBuildResult`, `ShowcaseBuildFile`, `ShowcaseBuildError` (`src/adapters/showcase/`): the showcase adapter interface, exported and documented as experimental (it may change in any release until declared stable). The registry and the built-in showcase adapters are not exported.

The showroom (`src/app/`: `App`, `mount()`, `ShownHostInformation`) is deliberately not exported: it is browser code, bundled by Vite from `dist/app/`. Neither are `src/markdown/`, `src/showcases/`, `src/frame/`, `src/testing/`, `serve()` (`src/cli/serve/`), `build()` (`src/cli/build/`), the Vite configuration (`src/vite/`) and the check's internals (`src/cli/check/internal/`): `showroom serve` and `showroom build` are only available through the command line and `main()`.

---

## Workflow

Follow the workflow defined in [WORKFLOW.md](./WORKFLOW.md).

@WORKFLOW.md
