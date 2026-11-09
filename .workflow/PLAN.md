# Plan

## Goals

A first working version of the approved specification (`./.workflow/SPEC.md`): `tsshowcase build` run in a host repository using the TypeScript stack adapter produces a static React/FluentUI showcase application in `./showcase`, presenting the host repository's project information and documentation files (the code file index is collected but not shown, D12). Showcases, other stack adapters and SCM adapters are out of scope.

## Segments

Segmentation approved (see the session state's history).

1. **S1 Host scanning**: everything that reads the host repository, with no React or Vite involved.
   - The data collected from a host repository (project information, documentation files, code file index), as a typed, serialisable structure: the contract between S1 and S2.
   - The stack adapter interface, and the TypeScript stack adapter (D1).
   - Documentation file matching (case, UK/US spelling, `.md`/`.txt`/none) and discovery (D6).
   - The code file index under the source root (D3), and the skipped files (D10).
   - The `tsshowcase.json` configuration format, as far as scanning reads it (D5).
   - The `tsshowcase check` command, which outputs all the collected data to `stdout` and every issue to `stderr`, so S1 is self-contained and testable on its own (C10; originally planned as temporary, now permanent).
2. **S2 Showcase application**: the React/FluentUI SPA, kept in this repository, rendering the data S1 collects, and `tsshowcase serve` to preview it (changed 2026-11-09: the code file index is no longer shown (D12), and `serve` with the shared Vite setup moved here from S3).
   - Navigation, project information, and a page per documentation file, with syntax-highlighted code blocks (D12).
   - Hash routing, relative links inside Markdown rewritten, and the light/dark toggle (D9).
   - The Vite configuration, and `tsshowcase serve` (D2, D4).
   - Vite, React and FluentUI as tsshowcase's own dependencies (pitfall 7).
3. **S3 Build command**: the `tsshowcase build` CLI tying S1 and S2 together.
   - The `build` command and the CLI flags overriding the configuration (D4, D5).
   - Building the showcase application with S2's Vite configuration into `./showcase` with relative asset paths (D2, D7).
   - The README's usage documentation and an example GitHub Pages workflow (D7).

Order: S1 first. S2 and S3 both depend only on S1's data structure, so once it's planned they can be planned in parallel; S3 is implemented last, as it builds S2. At the user's request, S1 is implemented before S2 and S3 are planned.

### S1 Host scanning

Approved 2026-11-09. Implemented and approved 2026-11-09.

#### Goals

Must-haves 2, 3 and 4 of the specification, as far as reading the host repository goes: collect the host information (C1) from a host repository and output it, without React or Vite.

#### Steps

1. **Host information** (`src/host/`): the typed, serialisable structure S2 renders (C13):
   - project information (C3);
   - documentation files: their path, kind (`readme`, `contribute`, `license`, `other`), extension and raw text;
   - the code file index: a sorted list of paths relative to the host root.
2. **Configuration** (`src/configuration/`): reading and validating the mandatory `tsshowcase.json` at the host root (C9).
3. **Stack adapters** (`src/adapters/stack/`): the stack adapter interface (C2), and the TypeScript stack adapter with its defaults (C8).
4. **Checking** (`src/cli/check/`): `check()`, walking the host repository:
   - ignoring files by the stack adapter's and the configuration's patterns (C9a, C9b);
   - documentation file matching and discovery (C4, C5, C14);
   - the code file index under the source root.
5. **Command** (`src/cli/`): the `tsshowcase` entry point running `check()` (C10), plus the `bin` entry in `package.json`.
6. **Public API**: `src/index.ts` re-exports the types and `check()`; the template's `hello()` is removed (C11).
7. **Tests**: a `*.test.ts` beside each module, plus fixture host repositories (C12). The `ignore` dependency is added to `package.json`.
8. **Documentation**: `README.md` (`# Usage`: `tsshowcase.json`, `tsshowcase check`, the exports; the `package.json` description no longer says "Enforce", per D8), `AGENTS.md` (Layout, Exports, Commands, Testing), `CONTRIBUTE.md` (project structure, the Glossary term from C1), and `PUBLISH.md` (the `bin` field).

#### Open points

#### Decisions

- **C1** Glossary term **Host information** for the collected data, as proposed.
- **C2** A stack adapter is a class implementing a `StackAdapter` interface (a base class may hold shared defaults). Only built-in stack adapters, selected by name, for now; custom ones loaded by path come later. New capabilities (e.g. showcases, pitfall 2) are added as optional members. Rejected: a plain object.
- **C3** Project information: `name` (required), and the optional `version`, `description`, `license`, `author`, `homepage`, `repository` (URL). More may be added later. Rejected: passing the raw project file along.
- **C4** Accepted names: `README`, `LICENSE`/`LICENCE`, `CONTRIBUTE`/`CONTRIBUTING`.
- **C5** Several matches in one folder: one is taken, by priority `.md`, then no extension, then `.txt`, with a warning.
- **C8** TypeScript stack adapter defaults: source root `src`; code `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs` (as patterns, see C9); ignored `.git`, `node_modules`, `dist`, `coverage`.
- **C9** Configuration (`tsshowcase.json`), as the user specified:
  - The file is mandatory: not finding it is an unrecoverable error.
  - `stack`: required, no default.
  - `sourceRoot`: optional; defaults to the stack adapter's.
  - `outDir`: optional; defaults to `./showcase`.
  - `ignore` (was `skip`): patterns, extending the stack adapter's, like `.gitignore` inheritance.
  - `code` (was `codeExtensions`): patterns matching code files, instead of extensions; stack adapters define code files as patterns too.
  - `documentation` (was `markdown`): patterns, as documentation can be more than Markdown.
  - Rejected: a default `stack`, a missing file meaning all defaults, extension lists.
- **C9a** The three pattern lists (`ignore`, `code`, `documentation`) all work like `.gitignore`: applied in order, the last match wins, `!pattern` re-includes, and a pattern without `/` matches at any depth. The stack adapter's patterns come first and the configuration's are appended. `code` patterns apply under the source root, the others from the host root. Rejected: `.gitignore` semantics for `ignore` only.
- **C9b** Patterns are matched with the `ignore` package (MIT, no dependencies, implements the `.gitignore` spec), a new runtime `dependency`. Rejected: our own matcher on Node's `path.matchesGlob` (re-implements `.gitignore` rules; Node 22 unverified); `picomatch` with our own ordering and `!` logic.
- **C10** The command is `tsshowcase check`: it writes every issue to `stderr`, the collected host information to `stdout`, and its exit code says whether the check passed. It's permanent: `tsshowcase build` (S3) runs the same check first. Issues are errors (e.g. a missing or invalid `tsshowcase.json`, an unknown `stack`, a missing project file) or warnings (e.g. C5's duplicates); the exit code is 1 on any error, and warnings alone don't fail it. Rejected: `tsshowcase scan` with `--out` writing `info.json`; a temporary command; warnings failing the check.
- **C14** Details:
  - Built-in documentation discovery (root `README`/`CONTRIBUTE`/`LICENSE`, `README` anywhere, per C4/C5) is the start of the `documentation` pattern list: the stack adapter's and the configuration's `documentation` patterns follow it, so they can add files (kind `other`) or remove built-in ones with `!`. `ignore` applies to all of it. Patterns are matched case-insensitively (`ignore`'s default), which the case-insensitive file names need.
  - Paths in the host information are POSIX-style and relative to the host root; the code file index is sorted.
  - Symbolic links are not followed.
  - `stdout` gets the host information (JSON, 2-space indented) only when the check passes; on an error, `stdout` stays empty.
- **C11** The package exports the types and `check()`; the template's `hello()` is removed.
- **C12** Static fixture host repositories in `test/fixtures/`, outside `src/`, with no `node_modules` in them: the ignore mechanism is tested with ordinary committed folders (e.g. `vendor/` with `ignore: ["vendor"]`, and a `!` pattern re-including it), and a unit test checks the TypeScript stack adapter's default ignore list. Rejected: fixtures built in a temporary folder at runtime; committing fixture `node_modules` through a `.gitignore` exception; running `npm install` in fixtures before the tests.
- **C13** No `formatVersion` field in the host information. Rejected: a version field.

#### Open points

- [x] Pitfall 2: the stack adapter interface must leave room for showcases of other frameworks (iframes or web components), without designing them now. Resolved by C2: new capabilities are added as optional members.

### S2 Showcase application

Approved 2026-11-09. Reviewed 2026-11-09 (zero-context review, 2 agents); its outcomes are applied below.

#### Goals

Must-have 1 of the specification, except building into the output folder (S3): the showcase application presenting the project information and the documentation files (the code file index is collected but not shown, D12), with the light/dark toggle (D9) and syntax-highlighted code blocks (D12), and `tsshowcase serve` to preview it (D4).

#### Child segments

S2 is split in two (A19), each implemented and checkpointed on its own:

- **S2.1 Showcase application**: steps 1 and 2, with their tests and documentation. Checked by its tests.
- **S2.2 Serve command**: steps 3 and 4, with their tests and documentation. Checked by its tests, and by the user in a browser.

#### Steps

1. **Dependencies and toolchain** (S2.1; A13, A14, A15, A21):
   - `dependencies`: `react`, `react-dom`, `@fluentui/react-components`, `react-markdown`, `remark-gfm`, `rehype-highlight`, `rehype-slug` (S2.1), and `vite` (S2.2);
   - `devDependencies`: `@types/react`, `@types/react-dom`, `eslint-plugin-react-hooks` (enabled in `eslint.config.js`);
   - `tsconfig.json` gets `jsx: react-jsx`, so `src/**/*.tsx` builds, lints and tests with the existing setup; `npm run build` also copies `src/app/index.html` to `dist/app/` (A16).
2. **Showcase application** (`src/app/`, browser code, S2.1; A1, A2): `mount(element, data)` renders `App` into an element; `App` takes the data, and optionally the route and the initial theme (A22):
   - the hash router (A3), with a not-found page;
   - the layout (A8): header, `InlineDrawer` navigation;
   - the home page: the project information and the root `README`;
   - the documentation page: `.md` files rendered as Markdown, others as plain text (A7);
   - Markdown rendering: link rules (A4), relative images as their alt text (A5), no raw HTML (A6), heading ids (A20), fenced code blocks (told apart through the `pre` element, not `react-markdown`'s removed `inline` prop) highlighted (A13);
   - the theme (A10);
   - the static `index.html` and the entry (`main.ts`: imports the virtual module and calls `mount()`, A16).
3. **Vite configuration** (`src/vite/`, Node code, S2.2; A16): a function returning Vite's `InlineConfig` for a host repository (the app's folder is a parameter, so tests don't depend on `dist/`), the plugin serving the shown host information as a virtual module and setting `<title>` (A24), and the React aliases (A23). S3's `build` reuses it.
4. **`tsshowcase serve`** (`src/cli/serve/`, S2.2; A12, A17, A24): `main()` and `USAGE` get the `serve` command and `--port`; `main()` loads `serve` with a dynamic `import()`. It runs the check (C10), starts Vite's dev server, watches the host repository, and reloads when the shown host information changes.
5. **Tests** (A11, A18): a `*.test.ts(x)` beside each module.
6. **Documentation**: `README.md` (`# Usage`: `tsshowcase serve`; `# Development`: previewing with `npm start -- serve --root <host>`), `AGENTS.md` (Layout, Commands, Testing, Exports: `mount` is not exported, and the gotchas in A25), `CONTRIBUTE.md` (project structure, and the Glossary entries in A26).

#### Decisions

- **A1** The app's source is `src/app/`, compiled by `tsc` to `dist/app/` (`jsx: react-jsx`); Vite only bundles JS. It's not re-exported from `src/index.ts`, being browser code. Rejected: a separate `app/` folder shipped as TSX source.
- **A2** The app exports `mount(element, data)`, where `data` is the shown host information: the host information's `project` and `documentation` only, not its `code` (D12); the entry passes it in. Rejected: the app importing a virtual module itself; passing the whole host information (bundles the unshown code file index, and reloads on code file changes).
- **A3** Routing: a hash router of our own (`hashchange` + `useSyncExternalStore`, with `getServerSnapshot`). `#/` is home; `#/<path>` shows any other documentation file, its path segments `encodeURIComponent`-encoded; `#/README.md` redirects to `#/`; a heading anchor follows a second hash (`#/docs/guide.md#install`); any other route shows a not-found page with a link home. Rejected: `react-router`; separate `/docs` and `/code` routes.
- **A4** Relative links in Markdown, URL-decoded and resolved against the documentation file's folder (or the host root, for a link starting with `/`), matched against the documentation files' paths case-insensitively: a documentation file → its route, keeping the anchor; a folder whose `README` is a documentation file → that `README`'s route; anything else (code files included) → plain text with a tooltip saying it isn't in the showcase application. Anchor-only links scroll within the page; absolute URLs and `mailto:` are unchanged, opening in a new tab. Rejected: GitHub blob URLs from `repository` (SCM adapters' job, D11).
- **A5** Relative images in Markdown show their alt text; absolute image URLs work. See "Known open issues". Rejected: collecting images now.
- **A6** Raw HTML in Markdown is not rendered: its tags are dropped, keeping the Markdown between them (`skipHtml`; chosen at the S2.1 checkpoint over showing them as escaped text). See "Known open issues". Rejected: `rehype-raw` + `rehype-sanitize`.
- **A7** Documentation files that aren't `.md` are shown as plain, wrapped, monospace text. Rejected: rendering them as Markdown.
- **A8** Layout: a header (project name, version, theme toggle), an `InlineDrawer` navigation (README, for the home page even without a root `README`; then the root's contribute and license files as CONTRIBUTING and LICENSE, whatever their file names; then every other documentation file as a flat list, labelled with its full path, in path order; changed 2026-11-09 at the user's request, from Home first and every other file by its full path), and a home page with the project information followed by the root `README` (if any). No code file index page (D12). Rejected: `OverlayDrawer` (portals render nothing in the server-rendered tests).
- **A9** Withdrawn (D12: no code file index page).
- **A10** Theme: starts from `prefers-color-scheme`; the toggle's choice is kept in `localStorage`, guarded so it never breaks the page; `body` gets margin 0 and the theme's background. Every `window` access is guarded or in an effect, so `App` renders on the server.
- **A11** Testing: no new test dependencies. Unit tests for the logic (routing, link resolution, navigation), and smoke tests rendering `App` (never `mount()`, which needs a DOM) with `react-dom/server`'s `renderToString`, with injected routes and themes. Rejected: `jsdom` + `@testing-library/react` for now.
- **A12** `serve` is the only preview of the showcase application, for this repository's development too. Rejected: a development-only preview script.
- **A13** Markdown with `react-markdown` + `remark-gfm`; fenced code blocks highlighted with `rehype-highlight` (highlight.js's common languages, including `bash`, `shell`, `diff`, `csharp`, TypeScript, JSON, YAML; `jsx`/`tsx` through aliases), its token classes coloured with FluentUI tokens through Griffel, so they follow the theme with no CSS file. Changed after the review: `prism-react-renderer` was verified to lack `bash`, `shell`, `diff` and `csharp`. Rejected: `prism-react-renderer`; `marked` (HTML strings, unsafe by default); `shiki` (heavy, asynchronous).
- **A14** React, React DOM and FluentUI are ordinary `dependencies`: on a local install, npm shares the host's copy when its version satisfies tsshowcase's range, and installs a nested one otherwise (A23 keeps the app on tsshowcase's own copy). Using the host's own React is left for showcases (pitfall 7). Rejected: `peerDependencies` (an incompatible host React would fail the install); resolving to the host's copy now.
- **A15** The install size (about 432 MB, 378 MB of it FluentUI) is accepted: FluentUI is a must-have, and the cost is once per install.
- **A16** Vite's root is the app's folder inside the package (`dist/app/`, holding the static `index.html` and the compiled entry), as in the spike: nothing is generated. Only Vite's `cacheDir` lives outside it, in a fresh `fs.mkdtemp` folder per run (`<tmp>/tsshowcase-XXXXXX`), removed on exit, so concurrent runs and other users never share it; each `serve` start pays a few seconds of dependency pre-bundling. `server.fs.allow` and `optimizeDeps` need nothing extra (modules reached through imports are allowed; the scanner follows the entry), and `optimizeDeps.include` is not used (its ids would resolve from elsewhere). Changed after the review: a shared, predictable folder in the OS temp folder isn't writable for a second user on Linux and macOS, and another user could plant code in it. Rejected: generating the Vite project into `<tmp>/tsshowcase/<hash>/`; a per-user cache folder kept between runs (per-platform paths); a `.tsshowcase/` folder in the host repository; inside the output folder.
- **A17** `tsshowcase serve` takes `--root` and `--port` (default 5173, or the next free port). It adds the host root to Vite's watcher, through an `ignored` wrapper around the ignore matcher of the latest successful check (so changes to `tsshowcase.json` apply without a restart): the wrapper returns false for the host root itself and for paths outside it, converts the rest to relative POSIX paths, and tests both `p` and `p/`. Any change reruns the check (debounced, about 100 ms); when the shown host information changed, it invalidates the virtual module and fully reloads the page. When the check fails, it prints the issues and keeps the last good data. Rejected: watching only the files the check read (new files need a restart); watching the whole host repository without the ignore patterns (slow start, watch limits, constant events).
- **A18** `serve` is tested by unit tests of the Vite configuration, the virtual module plugin, the `ignored` wrapper and the reload decision (with a fake server), without starting a server (tests never create temporary folders); the user checks `serve` in a browser. Rejected: an integration test starting a real server.
- **A19** S2 is split into child segments S2.1 (the app) and S2.2 (the Vite setup and `serve`). Rejected: one segment (about twice the size of the others).
- **A20** Heading ids come from `rehype-slug` (GitHub-compatible slugs, via `github-slugger`), so links written for GitHub work. Rejected: our own slugger.
- **A21** `@vitejs/plugin-react` is not used: `tsc` compiles the JSX, and there is no Fast Refresh for `dist/app/`. `eslint-plugin-react-hooks` checks the hand-written hooks.
- **A22** `App`'s route and initial theme can be injected (props), so the server-rendered tests cover every page and both themes.
- **A23** Vite aliases `react`, `react-dom`, `react/jsx-runtime`, `react-dom/client` and `scheduler` to tsshowcase's own copies, so a host's different React (e.g. one FluentUI is hoisted next to) never mixes in ("Invalid hook call").
- **A24** Public API and `serve`'s behaviour: no new exports (`check()`'s ignore matcher stays internal; `src/index.test.ts`'s export list is unchanged); `main()` loads `serve` with a dynamic `import()`, so library users and `tsshowcase check` never load Vite. `serve` exits with 1 if the first check fails; warnings go to `stderr`, the URL to `stdout`; `main()` stays pending until the server closes, and closes it on `SIGINT`/`SIGTERM`; `main()`'s unit tests never start `serve`. The configuration-override flags (D5) are shared by `check`, `serve` and `build`, and added in S3. `index.html` has `lang="en"` and no favicon; its `<title>` is the project name, set by the plugin.
- **A25** AGENTS.md gotchas: `types: ["node"]` applies to browser code too (Node globals type-check there); `sideEffects: false` applies to the bundled app, so it never relies on import-only side effects (no CSS imports); the "JSX in them is not configured" note is replaced.
- **A26** Glossary: new entries Documentation file, Project information, Code file index and Source root; "Showcase application" widened to cover `serve`.

#### Review notes

- No workflow terminology misuse was found (review 01, finding 20): nothing to do.

#### Open points

- [x] Pitfall 4: hash routing (no server-side rewrites on GitHub Pages). Resolved by A3.
- [x] Pitfall 5: relative links inside Markdown rewritten to SPA routes or repository URLs. Resolved by A4.
- [x] The page background must follow the theme everywhere: in the spike, the browser's default `body` margin stayed white in the dark theme (a CSS reset, or the theme's background applied to `body`). Found by the user's check of the spike. Resolved by A10.
- [x] Pitfall 7, as far as S2 goes. Resolved by A14 and A23 (showcases' use of the host's own React stays open in the pitfall).
- [x] The install size (432 MB, 378 MB of it FluentUI): acceptable, or worth reconsidering? Moved from S3, as S2 adds the dependencies. Resolved by A15.
- [x] Where Vite's root and `cacheDir` live, writable for a global install too. Moved from S3, with the Vite setup. Resolved by A16.
- [x] How `serve` reloads, and how it's tested. Resolved by A17 and A18.

### S3 Build command

Approved 2026-11-09. Choices B1–B10 settled (the user accepted every recommendation).

#### Goals

Must-have 1's build into the output folder (D2, D4, D7), and the configuration-override flags (D5): `tsshowcase build` checks the host repository and builds the showcase application with S2's Vite configuration into `./showcase` (or the configured output folder), with relative asset paths, ready for static hosting; the README documents it, with an example GitHub Pages workflow (D7). Resolves pitfalls 3 and 4 as far as S3 goes.

#### Child segments

None (B1).

#### Steps

1. **Output folder** (`src/configuration/`, `src/cli/check/`; B2, B3, B4): `check(root, options?)` takes the overrides (`outDir`), resolves the output folder against the host root (the flag's value against the current directory), reports an error when it is the host root, contains it, or is outside it, and adds it to the ignore patterns. `HostInformation` is unchanged.
2. **`tsshowcase build`** (`src/cli/build/`; B5, B6): `main()` and `USAGE` get the `build` command and `--out-dir` (shared by `check`, `serve` and `build`); `main()` loads `build` with a dynamic `import()`. It runs the check, then Vite's `build()` with `getViteConfiguration()` plus `build: { outDir, emptyOutDir: true }`, guarded by the output folder marker (B2), in a fresh `mkdtemp` cache folder removed afterwards.
3. **Tests** (B7): beside each changed module.
4. **Documentation**: `README.md` (`# Usage`: `tsshowcase build`, `--out-dir`, `outDir` no longer "not used yet", the `check()` signature, the GitHub Pages workflow and running without a `package.json` (B8, B9); `# Development`), `AGENTS.md` (Layout: `src/cli/build/`; Commands; Testing; Exports; gotchas), `CONTRIBUTE.md` (project structure; Glossary entry "Output folder", B10).
5. **Trial runs and checks by hand**: `build` on copies of a fixture and of `../tsstd` in working files; the user checks a built showcase application in a browser, served over HTTP, including one built in a host with a different React installed (open point below).

#### Decisions

- **B1** One segment, no child segments: it's about the size of S2.2. Rejected: splitting off the output folder and flags.
- **B2** The output folder is emptied (`emptyOutDir: true`, as it's outside Vite's root), but only when it doesn't exist, is empty, or holds the marker file `.tsshowcase` that every build writes into it; otherwise `build` exits with 1, naming the folder, so a mistyped `outDir` (e.g. `src`, `docs`) never wipes host files. Rejected: relying on B3's location rules alone; never emptying (stale hashed assets pile up).
- **B3** The output folder must be inside the host repository, and not its root: the check reports an error otherwise, so `check` and `serve` report it too. Rejected: anywhere except the host root and its parents.
- **B4** The check appends `/<output folder>/` to the ignore patterns, so a built showcase application is never scanned for code files nor watched by `serve`. Rejected: leaving it to the host's `ignore` patterns.
- **B5** One configuration-override flag, `--out-dir`, shared by `check`, `serve` and `build`, resolved against the current directory (like `--root`); the API gets `check(root, { outDir })`. Rejected: `--source-root` and `--stack` too; no flags yet.
- **B6** `build` works like `serve`: it checks first (exit 1 on a failed check; warnings don't fail it), runs Vite's `build()` with Vite's logs at `warn`, in a fresh `mkdtemp` cache folder removed afterwards, and writes one line to `stdout`: "Built the showcase application of <name> into <folder>". `build()` is internal (not re-exported), loaded by `main()` with a dynamic `import()`. No `--strict` for now.
- **B7** Testing: unit tests of the build's Vite options, the output folder rules (fixtures with bad `outDir`s), the ignore pattern, and the marker guard's decision (read-only fixtures: missing, empty, marked and unmarked folders); `build()` and `main()`'s `build` only run on a fixture whose first check fails. Trial runs on copies by hand, and the user's browser check. Rejected: an integration test building into a temporary folder (against the testing rules).
- **B8** The README's GitHub Pages example: on a push to `master` and `workflow_dispatch`; `actions/checkout`, `actions/setup-node`, `npm ci`, `npx tsshowcase build`, `actions/upload-pages-artifact` (`path: showcase`), `actions/deploy-pages`, with `pages: write` and `id-token: write`. This deploy skips Jekyll, so no `.nojekyll` is written. Rejected: writing `.nojekyll` for branch-based deploys.
- **B9** Pitfall 3: the README documents `npx --package @ofzza/tsshowcase tsshowcase build`, which the spike showed works without a `package.json`; such hosts still need a stack adapter of their own (later). Rejected: leaving the pitfall open until a .NET stack adapter exists.
- **B10** Glossary: new entry "Output folder". Rejected: no new term.
- **B11** The build leaves out the bundler's warnings about the showcase application's own dependencies: `MODULE_LEVEL_DIRECTIVE` (FluentUI's and Griffel's `'use client'`, about 1900 lines per build) and the chunk-size warning (limit raised to 2048 kB); every other warning still shows. Chosen at the S3 checkpoint (implementation choice 1). Rejected: showing them (noise the host can't act on).
- **B12** `main()` resolves `--out-dir` against the current directory before the check, so its error messages, like the success line, name the absolute path. Confirmed at the S3 checkpoint (implementation choice 2).
- **B13** This repository's `.gitignore` ignores `/showcase/`, as its own `tsshowcase.json` lets it build itself. Added at the S3 checkpoint at the user's request.

#### Spike: Vite, React and FluentUI from tsshowcase's own dependencies (2026-11-09)

- **Tried:** a tiny package with Vite 8.3, `@vitejs/plugin-react` 6.3, React 19.3 and `@fluentui/react-components` 9.75 as its `dependencies`, and a `bin` script calling Vite's `build()` programmatically: `configFile: false`, `root` set to the app folder inside the package, `base: './'`, `outDir` set to `<cwd>/showcase`, and the host's data passed in through a virtual module. It was run from a host with `package.json` and no React, and from a host with no `package.json` at all.
- **Worked:** every way of installing it the specification needs (must-have 5):
  - run directly from the package: 0.6 s build;
  - local install + `npx`: 42 s install, 0.6 s build;
  - `npx --package` with nothing installed: 41 s the first time, 1.5 s once npx has it cached;
  - global install (into a prefix inside the spike folder): 41 s install, 0.5 s build.

  The host needs neither React, Vite nor a `package.json`. The output is 340 KB, with relative asset paths (`./assets/…`). The user checked the result in a browser: hash routing and the light/dark toggle both work.

- **Didn't work / costs:**
  - **The install is 432 MB, 378 MB of it FluentUI.** Each `@fluentui/react-components` package ships several builds plus source maps. Vite and rolldown are about 25 MB. Every host pays it once per install (and per CI run, without an npm cache).
  - Vite needs a writable cache folder (`cacheDir`). Its default sits inside `root`, which, for a global install, may not be writable. tsshowcase must choose it deliberately (e.g. under the output folder, or in a temporary folder it cleans up).
  - The built app needs an HTTP server: Chrome won't run its module script from `file://`. GitHub Pages is fine.
- **For the plan:** pitfall 7 is settled in principle. Vite, React and FluentUI can be tsshowcase's own `dependencies`, the app is built with `configFile: false` and S1's data passed in programmatically, and the host installs nothing else. Whether the install size is acceptable is an open point.

#### Open points

- [x] Pitfall 3: running in a host repository without Node tooling (e.g. through `npx`). Resolved by B9.
- [x] Pitfall 4: relative asset paths (Vite `base: './'`). Resolved by S2.2's `getViteConfiguration()` (`base: './'`), which B6 reuses.
- [x] Pitfall 7: where Vite, React and FluentUI come from. The spike shows they can be tsshowcase's own `dependencies` (see "Spike" above). Moved to S2 (A14), with the install size and `cacheDir` open points.
- [x] Set `build.emptyOutDir: true`: the output folder is outside Vite's root (A16), so Vite won't empty it otherwise. From the S2 review. Resolved by B2.
- [x] Check by hand, in a host repository with a different React installed, that the showcase application uses tsshowcase's own React (A23). From the S2 review. Resolved by step 5's trial: a host with React 18 and FluentUI hoisted next to it bundled only React 19.3.1, and the user's browser check passed.

## Known open issues

- Relative images in Markdown aren't shown (S2, A5): S1 doesn't collect image files. Deferred to keep S2 small.
- Raw HTML in Markdown isn't rendered (S2, A6). Deferred: rendering it safely needs sanitising.
