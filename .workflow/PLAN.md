# Plan

implemented 2026-11-09

## Goals

A first working version of the approved specification (`./.workflow/SPEC.md`): `showroom build` run in a host repository using the TypeScript stack adapter produces a static React/FluentUI showroom in `./showroom`, presenting the host repository's project information and documentation files (the code file index is collected but not shown, _`D12`_). Showcases, other stack adapters and SCM adapters are out of scope.

## Segments

Segmentation approved (see the session state's history).

1. **_`P1`_ Host scanning**: everything that reads the host repository, with no React or Vite involved.
   - The data collected from a host repository (project information, documentation files, code file index), as a typed, serialisable structure: the contract between _`P1`_ and _`P2`_.
   - The stack adapter interface, and the TypeScript stack adapter (_`D1`_).
   - Documentation file matching (case, UK/US spelling, `.md`/`.txt`/none) and discovery (_`D6`_).
   - The code file index under the source root (_`D3`_), and the skipped files (_`D10`_).
   - The `showroom.json` configuration format, as far as scanning reads it (_`D5`_).
   - The `showroom check` command, which outputs all the collected data to `stdout` and every issue to `stderr`, so _`P1`_ is self-contained and testable on its own (_`D30`_; originally planned as temporary, now permanent).
2. **_`P2`_ Showroom**: the React/FluentUI SPA, kept in this repository, rendering the data _`P1`_ collects, and `showroom serve` to preview it (changed 2026-11-09: the code file index is no longer shown (_`D12`_), and `serve` with the shared Vite setup moved here from _`P3`_).
   - Navigation, project information, and a page per documentation file, with syntax-highlighted code blocks (_`D12`_).
   - Hash routing, relative links inside Markdown rewritten, and the light/dark toggle (_`D9`_).
   - The Vite configuration, and `showroom serve` (_`D2`_, _`D4`_).
   - Vite, React and FluentUI as `showroom`'s own dependencies (_`K7`_).
3. **_`P3`_ Build command**: the `showroom build` CLI tying _`P1`_ and _`P2`_ together.
   - The `build` command and the CLI flags overriding the configuration (_`D4`_, _`D5`_).
   - Building the showroom with _`P2`_'s Vite configuration into `./showroom` with relative asset paths (_`D2`_, _`D7`_).
   - The README's usage documentation and an example GitHub Pages workflow (_`D7`_).

Order: _`P1`_ first. _`P2`_ and _`P3`_ both depend only on _`P1`_'s data structure, so once it's planned they can be planned in parallel; _`P3`_ is implemented last, as it builds _`P2`_. At the user's request, _`P1`_ is implemented before _`P2`_ and _`P3`_ are planned.

### _`P1`_ Host scanning

implemented 2026-11-09 (approved 2026-11-09).

#### Goals

_`D14`_, _`D15`_ and _`D16`_ of the specification, as far as reading the host repository goes: collect the host information (_`D21`_) from a host repository and output it, without React or Vite.

#### Steps

1. **Host information** (`src/host/`): the typed, serialisable structure _`P2`_ renders (_`D33`_):
   - project information (_`D23`_);
   - documentation files: their path, kind (`readme`, `contribute`, `license`, `other`), extension and raw text;
   - the code file index: a sorted list of paths relative to the host root.
2. **Configuration** (`src/configuration/`): reading and validating the mandatory `showroom.json` at the host root (_`D27`_).
3. **Stack adapters** (`src/adapters/stack/`): the stack adapter interface (_`D22`_), and the TypeScript stack adapter with its defaults (_`D26`_).
4. **Checking** (`src/cli/check/`): `check()`, walking the host repository:
   - ignoring files by the stack adapter's and the configuration's patterns (_`D28`_, _`D29`_);
   - documentation file matching and discovery (_`D24`_, _`D25`_, _`D34`_);
   - the code file index under the source root.
5. **Command** (`src/cli/`): the `showroom` entry point running `check()` (_`D30`_), plus the `bin` entry in `package.json`.
6. **Public API**: `src/index.ts` re-exports the types and `check()`; the template's `hello()` is removed (_`D31`_).
7. **Tests**: a `*.test.ts` beside each module, plus fixture host repositories (_`D32`_). The `ignore` dependency is added to `package.json`.
8. **Documentation**: `README.md` (`# Usage`: `showroom.json`, `showroom check`, the exports; the `package.json` description no longer says "Enforce", per _`D8`_), `AGENTS.md` (Layout, Exports, Commands, Testing), `CONTRIBUTE.md` (project structure, the Glossary term from _`D21`_), and `PUBLISH.md` (the `bin` field).

#### Decisions

- _`D21`_ (was C1; `live`): Glossary term **Host information** for the collected data, as proposed.
- _`D22`_ (was C2; `live`): A stack adapter is a class implementing a `StackAdapter` interface (a base class may hold shared defaults). Only built-in stack adapters, selected by name, for now; custom ones loaded by path come later. New capabilities (e.g. showcases, _`K2`_) are added as optional members. Rejected: a plain object.
- _`D23`_ (was C3; `live`): Project information: `name` (required), and the optional `version`, `description`, `license`, `author`, `homepage`, `repository` (URL). More may be added later. Rejected: passing the raw project file along.
- _`D24`_ (was C4; `live`): Accepted names: `README`, `LICENSE`/`LICENCE`, `CONTRIBUTE`/`CONTRIBUTING`.
- _`D25`_ (was C5; `live`): Several matches in one folder: one is taken, by priority `.md`, then no extension, then `.txt`, with a warning.
- _`D26`_ (was C8; `live`): TypeScript stack adapter defaults: source root `src`; code `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs` (as patterns, see _`D27`_); ignored `.git`, `node_modules`, `dist`, `coverage`.
- _`D27`_ (was C9; `live`): Configuration (`showroom.json`), as the user specified:
  - The file is mandatory: not finding it is an unrecoverable error.
  - `stack`: required, no default.
  - `sourceRoot`: optional; defaults to the stack adapter's.
  - `outDir`: optional; defaults to `./showroom`.
  - `ignore` (was `skip`): patterns, extending the stack adapter's, like `.gitignore` inheritance.
  - `code` (was `codeExtensions`): patterns matching code files, instead of extensions; stack adapters define code files as patterns too.
  - `documentation` (was `markdown`): patterns, as documentation can be more than Markdown.
  - Rejected: a default `stack`, a missing file meaning all defaults, extension lists.
- _`D28`_ (was C9a; `live`): The three pattern lists (`ignore`, `code`, `documentation`) all work like `.gitignore`: applied in order, the last match wins, `!pattern` re-includes, and a pattern without `/` matches at any depth. The stack adapter's patterns come first and the configuration's are appended. `code` patterns apply under the source root, the others from the host root. Rejected: `.gitignore` semantics for `ignore` only.
- _`D29`_ (was C9b; `live`): Patterns are matched with the `ignore` package (MIT, no dependencies, implements the `.gitignore` spec), a new runtime `dependency`. Rejected: our own matcher on Node's `path.matchesGlob` (re-implements `.gitignore` rules; Node 22 unverified); `picomatch` with our own ordering and `!` logic.
- _`D30`_ (was C10; `refined by D228`): The command is `showroom check`: it writes every issue to `stderr`, the collected host information to `stdout`, and its exit code says whether the check passed. It's permanent: `showroom build` (_`P3`_) runs the same check first. Issues are errors (e.g. a missing or invalid `showroom.json`, an unknown `stack`, a missing project file) or warnings (e.g. _`D25`_'s duplicates); the exit code is 1 on any error, and warnings alone don't fail it. Rejected: `showroom scan` with `--out` writing `info.json`; a temporary command; warnings failing the check.
- _`D34`_ (was C14; `live`): Details:
  - Built-in documentation discovery (root `README`/`CONTRIBUTE`/`LICENSE`, `README` anywhere, per _`D24`_/_`D25`_) is the start of the `documentation` pattern list: the stack adapter's and the configuration's `documentation` patterns follow it, so they can add files (kind `other`) or remove built-in ones with `!`. `ignore` applies to all of it. Patterns are matched case-insensitively (`ignore`'s default), which the case-insensitive file names need.
  - Paths in the host information are POSIX-style and relative to the host root; the code file index is sorted.
  - Symbolic links are not followed.
  - `stdout` gets the host information (JSON, 2-space indented) only when the check passes; on an error, `stdout` stays empty.
- _`D31`_ (was C11; `live`): The package exports the types and `check()`; the template's `hello()` is removed.
- _`D32`_ (was C12; `live`): Static fixture host repositories in `test/fixtures/`, outside `src/`, with no `node_modules` in them: the ignore mechanism is tested with ordinary committed folders (e.g. `vendor/` with `ignore: ["vendor"]`, and a `!` pattern re-including it), and a unit test checks the TypeScript stack adapter's default ignore list. Rejected: fixtures built in a temporary folder at runtime; committing fixture `node_modules` through a `.gitignore` exception; running `npm install` in fixtures before the tests.
- _`D33`_ (was C13; `live`): No `formatVersion` field in the host information. Rejected: a version field.

#### Open points

- [x] _`O1`_ From _`K2`_. The stack adapter interface must leave room for showcases of other frameworks (iframes or web components), without designing them now. Resolved by _`D22`_: new capabilities are added as optional members.

### _`P2`_ Showroom

implemented 2026-11-09 (approved 2026-11-09). Reviewed 2026-11-09 (zero-context review, 2 agents); its outcomes are applied below. Revised 2026-11-12 (_`R11`_), pending re-approval; re-approved 2026-11-12.

- _`R11`_ 2026-11-12: `serve` updates a changed showcase frame by event, without a full reload (_`D51`_ changed), and is tested with a real dev server (_`D52`_ replaced), caused by _`D185`_ and _`D190`_ (PLAN-P4.3-serve.md).

#### Goals

_`D13`_ of the specification, except building into the output folder (_`P3`_): the showroom presenting the project information and the documentation files (the code file index is collected but not shown, _`D12`_), with the light/dark toggle (_`D9`_) and syntax-highlighted code blocks (_`D12`_), and `showroom serve` to preview it (_`D4`_).

#### Child segments

_`P2`_ is split in two (_`D53`_), each implemented and checkpointed on its own:

- **_`P2.1`_ Showroom** (implemented 2026-11-09): steps 1 and 2, with their tests and documentation. Checked by its tests.
- **_`P2.2`_ Serve command** (implemented 2026-11-09): steps 3 and 4, with their tests and documentation. Checked by its tests, and by the user in a browser.

#### Steps

1. **Dependencies and toolchain** (_`P2.1`_; _`D47`_, _`D48`_, _`D49`_, _`D55`_):
   - `dependencies`: `react`, `react-dom`, `@fluentui/react-components`, `react-markdown`, `remark-gfm`, `rehype-highlight`, `rehype-slug` (_`P2.1`_), and `vite` (_`P2.2`_);
   - `devDependencies`: `@types/react`, `@types/react-dom`, `eslint-plugin-react-hooks` (enabled in `eslint.config.js`);
   - `tsconfig.json` gets `jsx: react-jsx`, so `src/**/*.tsx` builds, lints and tests with the existing setup; `npm run build` also copies `src/app/index.html` to `dist/app/` (_`D50`_).
2. **Showroom** (`src/app/`, browser code, _`P2.1`_; _`D35`_, _`D36`_): `mount(element, data)` renders `App` into an element; `App` takes the data, and optionally the route and the initial theme (_`D56`_):
   - the hash router (_`D37`_), with a not-found page;
   - the layout (_`D42`_): header, `InlineDrawer` navigation;
   - the home page: the project information and the root `README`;
   - the documentation page: `.md` files rendered as Markdown, others as plain text (_`D41`_);
   - Markdown rendering: link rules (_`D38`_), relative images as their alt text (_`D39`_), no raw HTML (_`D40`_), heading ids (_`D54`_), fenced code blocks (told apart through the `pre` element, not `react-markdown`'s removed `inline` prop) highlighted (_`D47`_);
   - the theme (_`D44`_);
   - the static `index.html` and the entry (`main.ts`: imports the virtual module and calls `mount()`, _`D50`_).
3. **Vite configuration** (`src/vite/`, Node code, _`P2.2`_; _`D50`_): a function returning Vite's `InlineConfig` for a host repository (the app's folder is a parameter, so tests don't depend on `dist/`), the plugin serving the shown host information as a virtual module and setting `<title>` (_`D58`_), and the React aliases (_`D57`_). _`P3`_'s `build` reuses it.
4. **`showroom serve`** (`src/cli/serve/`, _`P2.2`_; _`D46`_, _`D51`_, _`D58`_): `main()` and `USAGE` get the `serve` command and `--port`; `main()` loads `serve` with a dynamic `import()`. It runs the check (_`D30`_), starts Vite's dev server, watches the host repository, and reloads when the shown host information changes.
5. **Tests** (_`D45`_, _`D52`_): a `*.test.ts(x)` beside each module.
6. **Documentation**: `README.md` (`# Usage`: `showroom serve`; `# Development`: previewing with `npm start -- serve --root <host>`), `AGENTS.md` (Layout, Commands, Testing, Exports: `mount` is not exported, and the gotchas in _`D59`_), `CONTRIBUTE.md` (project structure, and the Glossary entries in _`D60`_).

#### Decisions

- _`D35`_ (was A1; `live`): The app's source is `src/app/`, compiled by `tsc` to `dist/app/` (`jsx: react-jsx`); Vite only bundles JS. It's not re-exported from `src/index.ts`, being browser code. Rejected: a separate `app/` folder shipped as TSX source.
- _`D36`_ (was A2; `live`): The app exports `mount(element, data)`, where `data` is the shown host information: the host information's `project` and `documentation` only, not its `code` (_`D12`_); the entry passes it in. Rejected: the app importing a virtual module itself; passing the whole host information (bundles the unshown code file index, and reloads on code file changes).
- _`D37`_ (was A3; `live`): Routing: a hash router of our own (`hashchange` + `useSyncExternalStore`, with `getServerSnapshot`). `#/` is home; `#/<path>` shows any other documentation file, its path segments `encodeURIComponent`-encoded; `#/README.md` redirects to `#/`; a heading anchor follows a second hash (`#/docs/guide.md#install`); any other route shows a not-found page with a link home. Rejected: `react-router`; separate `/docs` and `/code` routes.
- _`D38`_ (was A4; `live`): Relative links in Markdown, URL-decoded and resolved against the documentation file's folder (or the host root, for a link starting with `/`), matched against the documentation files' paths case-insensitively: a documentation file → its route, keeping the anchor; a folder whose `README` is a documentation file → that `README`'s route; anything else (code files included) → plain text with a tooltip saying it isn't in the showroom. Anchor-only links scroll within the page; absolute URLs and `mailto:` are unchanged, opening in a new tab. Rejected: GitHub blob URLs from `repository` (SCM adapters' job, _`D11`_).
- _`D39`_ (was A5; `live`): Relative images in Markdown show their alt text; absolute image URLs work. See _`L1`_. Rejected: collecting images now.
- _`D40`_ (was A6; `live`): Raw HTML in Markdown is not rendered: its tags are dropped, keeping the Markdown between them (`skipHtml`; chosen at the _`P2.1`_ checkpoint over showing them as escaped text). See _`L2`_. Rejected: `rehype-raw` + `rehype-sanitize`.
- _`D41`_ (was A7; `live`): Documentation files that aren't `.md` are shown as plain, wrapped, monospace text. Rejected: rendering them as Markdown.
- _`D42`_ (was A8; `live`): Layout: a header (project name, version, theme toggle), an `InlineDrawer` navigation (README, for the home page even without a root `README`; then the root's contribute and license files as CONTRIBUTING and LICENSE, whatever their file names; then every other documentation file as a flat list, labelled with its full path, in path order; changed 2026-11-09 at the user's request, from Home first and every other file by its full path), and a home page with the project information followed by the root `README` (if any). No code file index page (_`D12`_). Rejected: `OverlayDrawer` (portals render nothing in the server-rendered tests).
- _`D43`_ (was A9; superseded by _`D12`_): Withdrawn (_`D12`_: no code file index page).
- _`D44`_ (was A10; `live`): Theme: starts from `prefers-color-scheme`; the toggle's choice is kept in `localStorage`, guarded so it never breaks the page; `body` gets margin 0 and the theme's background. Every `window` access is guarded or in an effect, so `App` renders on the server.
- _`D45`_ (was A11; `live`): Testing: no new test dependencies. Unit tests for the logic (routing, link resolution, navigation), and smoke tests rendering `App` (never `mount()`, which needs a DOM) with `react-dom/server`'s `renderToString`, with injected routes and themes. Rejected: `jsdom` + `@testing-library/react` for now.
- _`D46`_ (was A12; `live`): `serve` is the only preview of the showroom, for this repository's development too. Rejected: a development-only preview script.
- _`D47`_ (was A13; `live`): Markdown with `react-markdown` + `remark-gfm`; fenced code blocks highlighted with `rehype-highlight` (highlight.js's common languages, including `bash`, `shell`, `diff`, `csharp`, TypeScript, JSON, YAML; `jsx`/`tsx` through aliases), its token classes coloured with FluentUI tokens through Griffel, so they follow the theme with no CSS file. Changed after the review: `prism-react-renderer` was verified to lack `bash`, `shell`, `diff` and `csharp`. Rejected: `prism-react-renderer`; `marked` (HTML strings, unsafe by default); `shiki` (heavy, asynchronous).
- _`D48`_ (was A14; `live`): React, React DOM and FluentUI are ordinary `dependencies`: on a local install, npm shares the host's copy when its version satisfies `showroom`'s range, and installs a nested one otherwise (_`D57`_ keeps the app on `showroom`'s own copy). Using the host's own React is left for showcases (_`K7`_). Rejected: `peerDependencies` (an incompatible host React would fail the install); resolving to the host's copy now.
  - Evidence: Spike 2026-11-09 (Vite, React and FluentUI from `showroom`'s own dependencies):

    - **Tried:** a tiny package with Vite 8.3, `@vitejs/plugin-react` 6.3, React 19.3 and `@fluentui/react-components` 9.75 as its `dependencies`, and a `bin` script calling Vite's `build()` programmatically: `configFile: false`, `root` set to the app folder inside the package, `base: './'`, `outDir` set to `<cwd>/showcase`, and the host's data passed in through a virtual module. It was run from a host with `package.json` and no React, and from a host with no `package.json` at all.
    - **Worked:** every way of installing it the specification needs (_`D17`_):
      - run directly from the package: 0.6 s build;
      - local install + `npx`: 42 s install, 0.6 s build;
      - `npx --package` with nothing installed: 41 s the first time, 1.5 s once npx has it cached;
      - global install (into a prefix inside the spike folder): 41 s install, 0.5 s build.

      The host needs neither React, Vite nor a `package.json`. The output is 340 KB, with relative asset paths (`./assets/…`). The user checked the result in a browser: hash routing and the light/dark toggle both work.

    - **Didn't work / costs:**
      - **The install is 432 MB, 378 MB of it FluentUI.** Each `@fluentui/react-components` package ships several builds plus source maps. Vite and rolldown are about 25 MB. Every host pays it once per install (and per CI run, without an npm cache).
      - Vite needs a writable cache folder (`cacheDir`). Its default sits inside `root`, which, for a global install, may not be writable. `showroom` must choose it deliberately (e.g. under the output folder, or in a temporary folder it cleans up).
      - The built app needs an HTTP server: Chrome won't run its module script from `file://`. GitHub Pages is fine.
    - **For the plan:** _`K7`_ is settled in principle. Vite, React and FluentUI can be `showroom`'s own `dependencies`, the app is built with `configFile: false` and _`P1`_'s data passed in programmatically, and the host installs nothing else. Whether the install size is acceptable is an open point.

- _`D49`_ (was A15; `live`): The install size (about 432 MB, 378 MB of it FluentUI) is accepted: FluentUI is a must-have (_`D13`_), and the cost is once per install (see the Evidence under _`D48`_).
- _`D50`_ (was A16; `live`): Vite's root is the app's folder inside the package (`dist/app/`, holding the static `index.html` and the compiled entry), as in the spike (see the Evidence under _`D48`_): nothing is generated. Only Vite's `cacheDir` lives outside it, in a fresh `fs.mkdtemp` folder per run (`<tmp>/showroom-XXXXXX`), removed on exit, so concurrent runs and other users never share it; each `serve` start pays a few seconds of dependency pre-bundling. `server.fs.allow` and `optimizeDeps` need nothing extra (modules reached through imports are allowed; the scanner follows the entry), and `optimizeDeps.include` is not used (its ids would resolve from elsewhere). Changed after the review: a shared, predictable folder in the OS temp folder isn't writable for a second user on Linux and macOS, and another user could plant code in it. Rejected: generating the Vite project into `<tmp>/showroom/<hash>/`; a per-user cache folder kept between runs (per-platform paths); a `.showroom/` folder in the host repository; inside the output folder.
- _`D51`_ (was A17; `live`, changed by _`D185`_ (PLAN-P4.3-serve.md)): `showroom serve` takes `--root` and `--port` (default 5173, or the next free port). It adds the host root to Vite's watcher, through an `ignored` wrapper around the ignore matcher of the latest successful check (so changes to `showroom.json` apply without a restart): the wrapper returns false for the host root itself and for paths outside it, converts the rest to relative POSIX paths, and tests both `p` and `p/`. Any change reruns the check (debounced, about 100 ms); when the shown host information changed, it invalidates the virtual module and fully reloads the page. When the check fails, it prints the issues and keeps the last good data. Rejected: watching only the files the check read (new files need a restart); watching the whole host repository without the ignore patterns (slow start, watch limits, constant events).
- _`D52`_ (was A18; `replaced by _`D190`_ (PLAN-P4.3-serve.md)`): `serve` is tested by unit tests of the Vite configuration, the virtual module plugin, the `ignored` wrapper and the reload decision (with a fake server), without starting a server (tests never create temporary folders); the user checks `serve` in a browser. Rejected: an integration test starting a real server.
- _`D53`_ (was A19; `live`): _`P2`_ is split into child segments _`P2.1`_ (the app) and _`P2.2`_ (the Vite setup and `serve`). Rejected: one segment (about twice the size of the others).
- _`D54`_ (was A20; `live`): Heading ids come from `rehype-slug` (GitHub-compatible slugs, via `github-slugger`), so links written for GitHub work. Rejected: our own slugger.
- _`D55`_ (was A21; `live`): `@vitejs/plugin-react` is not used: `tsc` compiles the JSX, and there is no Fast Refresh for `dist/app/`. `eslint-plugin-react-hooks` checks the hand-written hooks.
- _`D56`_ (was A22; `live`): `App`'s route and initial theme can be injected (props), so the server-rendered tests cover every page and both themes.
- _`D57`_ (was A23; `live`): Vite aliases `react`, `react-dom`, `react/jsx-runtime`, `react-dom/client` and `scheduler` to `showroom`'s own copies, so a host's different React (e.g. one FluentUI is hoisted next to) never mixes in ("Invalid hook call").
- _`D58`_ (was A24; `live`): Public API and `serve`'s behaviour: no new exports (`check()`'s ignore matcher stays internal; `src/index.test.ts`'s export list is unchanged); `main()` loads `serve` with a dynamic `import()`, so library users and `showroom check` never load Vite. `serve` exits with 1 if the first check fails; warnings go to `stderr`, the URL to `stdout`; `main()` stays pending until the server closes, and closes it on `SIGINT`/`SIGTERM`; `main()`'s unit tests never start `serve`. The configuration-override flags (_`D5`_) are shared by `check`, `serve` and `build`, and added in _`P3`_. `index.html` has `lang="en"` and no favicon; its `<title>` is the project name, set by the plugin.
- _`D59`_ (was A25; `live`): AGENTS.md gotchas: `types: ["node"]` applies to browser code too (Node globals type-check there); `sideEffects: false` applies to the bundled app, so it never relies on import-only side effects (no CSS imports); the "JSX in them is not configured" note is replaced.
- _`D60`_ (was A26; `live`): Glossary: new entries Documentation file, Project information, Code file index and Source root; "Showroom" widened to cover `serve`.

#### Review notes

- No workflow terminology misuse was found (review 01, finding 20): nothing to do.

#### Open points

- [x] _`O2`_ From _`K4`_. Hash routing (no server-side rewrites on GitHub Pages). Resolved by _`D37`_.
- [x] _`O3`_ From _`K5`_. Relative links inside Markdown rewritten to SPA routes or repository URLs. Resolved by _`D38`_.
- [x] _`O4`_ From the user's check of the _`K7`_ spike. The page background must follow the theme everywhere: in the spike, the browser's default `body` margin stayed white in the dark theme (a CSS reset, or the theme's background applied to `body`). Resolved by _`D44`_.
- [x] _`O5`_ From _`K7`_. _`K7`_, as far as _`P2`_ goes. Resolved by _`D48`_ and _`D57`_ (showcases' use of the host's own React stays open in the pitfall).
- [x] _`O6`_ From the _`K7`_ spike (moved from _`P3`_). The install size (432 MB, 378 MB of it FluentUI): acceptable, or worth reconsidering? Moved from _`P3`_, as _`P2`_ adds the dependencies. Resolved by _`D49`_.
- [x] _`O7`_ From the _`K7`_ spike (moved from _`P3`_). Where Vite's root and `cacheDir` live, writable for a global install too. Moved from _`P3`_, with the Vite setup. Resolved by _`D50`_.
- [x] _`O8`_ From _`D46`_. How `serve` reloads, and how it's tested. Resolved by _`D51`_ and _`D52`_.

### _`P3`_ Build command

implemented 2026-11-09 (approved 2026-11-09). Choices _`D61`_–_`D70`_ settled (the user accepted every recommendation).

#### Goals

_`D13`_'s build into the output folder (_`D2`_, _`D4`_, _`D7`_), and the configuration-override flags (_`D5`_): `showroom build` checks the host repository and builds the showroom with _`P2`_'s Vite configuration into `./showroom` (or the configured output folder), with relative asset paths, ready for static hosting; the README documents it, with an example GitHub Pages workflow (_`D7`_). Resolves _`K3`_ and _`K4`_ as far as _`P3`_ goes.

#### Child segments

None (_`D61`_).

#### Steps

1. **Output folder** (`src/configuration/`, `src/cli/check/`; _`D62`_, _`D63`_, _`D64`_): `check(root, options?)` takes the overrides (`outDir`), resolves the output folder against the host root (the flag's value against the current directory), reports an error when it is the host root, contains it, or is outside it, and adds it to the ignore patterns. `HostInformation` is unchanged.
2. **`showroom build`** (`src/cli/build/`; _`D65`_, _`D66`_): `main()` and `USAGE` get the `build` command and `--out-dir` (shared by `check`, `serve` and `build`); `main()` loads `build` with a dynamic `import()`. It runs the check, then Vite's `build()` with `getViteConfiguration()` plus `build: { outDir, emptyOutDir: true }`, guarded by the output folder marker (_`D62`_), in a fresh `mkdtemp` cache folder removed afterwards.
3. **Tests** (_`D67`_): beside each changed module.
4. **Documentation**: `README.md` (`# Usage`: `showroom build`, `--out-dir`, `outDir` no longer "not used yet", the `check()` signature, the GitHub Pages workflow and running without a `package.json` (_`D68`_, _`D69`_); `# Development`), `AGENTS.md` (Layout: `src/cli/build/`; Commands; Testing; Exports; gotchas), `CONTRIBUTE.md` (project structure; Glossary entry "Output folder", _`D70`_).
5. **Trial runs and checks by hand**: `build` on copies of a fixture and of `../tsstd` in working files; the user checks a built showroom in a browser, served over HTTP, including one built in a host with a different React installed (open point below).

#### Decisions

- _`D61`_ (was B1; `live`): One segment, no child segments: it's about the size of _`P2.2`_. Rejected: splitting off the output folder and flags.
- _`D62`_ (was B2; `live`): The output folder is emptied (`emptyOutDir: true`, as it's outside Vite's root), but only when it doesn't exist, is empty, or holds the marker file `.showroom` that every build writes into it; otherwise `build` exits with 1, naming the folder, so a mistyped `outDir` (e.g. `src`, `docs`) never wipes host files. Rejected: relying on _`D63`_'s location rules alone; never emptying (stale hashed assets pile up).
- _`D63`_ (was B3; `live`): The output folder must be inside the host repository, and not its root: the check reports an error otherwise, so `check` and `serve` report it too. Rejected: anywhere except the host root and its parents.
- _`D64`_ (was B4; `live`): The check appends `/<output folder>/` to the ignore patterns, so a built showroom is never scanned for code files nor watched by `serve`. Rejected: leaving it to the host's `ignore` patterns.
- _`D65`_ (was B5; `live`): One configuration-override flag, `--out-dir`, shared by `check`, `serve` and `build`, resolved against the current directory (like `--root`); the API gets `check(root, { outDir })`. Rejected: `--source-root` and `--stack` too; no flags yet.
- _`D66`_ (was B6; `live`): `build` works like `serve`: it checks first (exit 1 on a failed check; warnings don't fail it), runs Vite's `build()` with Vite's logs at `warn`, in a fresh `mkdtemp` cache folder removed afterwards, and writes one line to `stdout`: "Built the showroom of <name> into <folder>". `build()` is internal (not re-exported), loaded by `main()` with a dynamic `import()`. No `--strict` for now.
- _`D67`_ (was B7; `live`): Testing: unit tests of the build's Vite options, the output folder rules (fixtures with bad `outDir`s), the ignore pattern, and the marker guard's decision (read-only fixtures: missing, empty, marked and unmarked folders); `build()` and `main()`'s `build` only run on a fixture whose first check fails. Trial runs on copies by hand, and the user's browser check. Rejected: an integration test building into a temporary folder (against the testing rules).
- _`D68`_ (was B8; `live`): The README's GitHub Pages example: on a push to `master` and `workflow_dispatch`; `actions/checkout`, `actions/setup-node`, `npm ci`, `npx showroom build`, `actions/upload-pages-artifact` (`path: showroom`), `actions/deploy-pages`, with `pages: write` and `id-token: write`. This deploy skips Jekyll, so no `.nojekyll` is written. Rejected: writing `.nojekyll` for branch-based deploys.
- _`D69`_ (was B9; `live`): _`K3`_: the README documents `npx --package @ofzza/showroom showroom build`, which the spike showed works without a `package.json`; such hosts still need a stack adapter of their own (later). Rejected: leaving the pitfall open until a .NET stack adapter exists.
- _`D70`_ (was B10; `live`): Glossary: new entry "Output folder". Rejected: no new term.
- _`D71`_ (was B11; `live`): The build leaves out the bundler's warnings about the showroom's own dependencies: `MODULE_LEVEL_DIRECTIVE` (FluentUI's and Griffel's `'use client'`, about 1900 lines per build) and the chunk-size warning (limit raised to 2048 kB); every other warning still shows. Chosen at the _`P3`_ checkpoint (implementation choice 1). Rejected: showing them (noise the host can't act on).
- _`D72`_ (was B12; `live`): `main()` resolves `--out-dir` against the current directory before the check, so its error messages, like the success line, name the absolute path. Confirmed at the _`P3`_ checkpoint (implementation choice 2).
- _`D73`_ (was B13; `live`): This repository's `.gitignore` ignores `/showroom/`, as its own `showroom.json` lets it build itself. Added at the _`P3`_ checkpoint at the user's request.

#### Open points

- [x] _`O9`_ From _`K3`_. Running in a host repository without Node tooling (e.g. through `npx`). Resolved by _`D69`_.
- [x] _`O10`_ From _`K4`_. Relative asset paths (Vite `base: './'`). Resolved by _`P2.2`_'s `getViteConfiguration()` (`base: './'`), which _`D66`_ reuses.
- [x] _`O11`_ From _`K7`_. Where Vite, React and FluentUI come from. The spike shows they can be `showroom`'s own `dependencies` (see the Evidence under _`D48`_). Moved to _`P2`_ (_`D48`_), with the install size and `cacheDir` open points.
- [x] _`O12`_ From review 2026-11-09: set `build.emptyOutDir`. Set `build.emptyOutDir: true`: the output folder is outside Vite's root (_`D50`_), so Vite won't empty it otherwise. Resolved by _`D62`_.
- [x] _`O13`_ From review 2026-11-09: check a host with a different React by hand. Check by hand, in a host repository with a different React installed, that the showroom uses `showroom`'s own React (_`D57`_). Resolved by _`D67`_ (step 5's trial): a host with React 18 and FluentUI hoisted next to it bundled only React 19.3.1, and the user's browser check passed.

## Showcases

- _`P4`_ Showcases: the showcase adapter interface, `html` and "bring your own build" (draft). [See Showcases](./PLAN-P4-showcases.md)

## Showroom layout

- _`P5`_ Showroom layout fixes (implemented 2026-11-12, [See Showroom layout fixes](./PLAN-P5-layout.md)): the known open issues _`L4`_–_`L9`_, found dogfooding `showroom` on its own repository (phone navigation, sideways scrolling, the navigation scrolling away, the doubled home page title, the favicon and unhighlighted code blocks, the wrapping "Dark theme" label). _`L7`_ needs a choice of what the home page shows above the README.
  - _`D177`_ (`live`; the user, 2026-11-12: "Please note that we do P4.3 next, then fix layout after"): **_`P4.3`_ is planned and implemented next, then _`P5`_**, before the first release. Rejected: the layout fixes first (they don't block _`P4.3`_, and nothing is published yet).

## Publishing this repository's showroom

- _`P6`_ Publishing this repository's own showroom to GitHub Pages (approved 2026-11-12; implemented 2026-11-12), after _`P5`_: dogfooding `showroom` on its own repository for real, the way `README.md` › Publishing to GitHub Pages documents.
  - Goals: _`D178`_–_`D180`_; _`O27`_. Facts found while planning (2026-11-12): the repository's default branch is `develop`; `origin/master` is still at `bec26ca` (_`P3`_), so nothing is published until the next release reaches `master`; Pages isn't enabled yet; the latest action majors are `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`.
  - Not in _`P6`_: a custom domain; publishing from `develop` or pull requests (_`D180`_); style customization (_`L10`_).
  - Steps:
    1. `showroom check --quiet` (_`D228`_): the option in `src/cli/` (`USAGE`, the argument check), with its tests (`src/cli/index.test.ts`, and an `e2e` test of `check --quiet` on a fixture); `README.md`'s `check` usage.
    2. The `ci:showroom` script (_`D226`_); `AGENTS.md` › Commands, `README.md` › Development.
    3. `.github/workflows/showroom.yml` (_`D178`_, _`D219`_, _`D220`_).
    4. `README.md` › Publishing to GitHub Pages: the example named `Showroom` (_`O27`_), with the same action versions; the link to this repository's own showroom (_`D223`_).
    5. `PUBLISH.md`: the one-time Pages setup, with the environment's branch rule, and checking the deployment after pushing `master` (_`D224`_, _`D227`_). `AGENTS.md` › Layout and › Continuous integration: the new workflow.
    6. Verification (_`D225`_): `node dist/cli/bin.js build` on a copy of this repository in the working files, served and checked in Playwright; `npm run ci` green, `ci:showroom` included.
  - _`D219`_ (`live`; Q1 "rest are approved"): **The workflow is the README's example, adapted to this repository**: `name: Showroom`; on pushes to `master` and `workflow_dispatch`; `permissions` `contents: read`, `pages: write`, `id-token: write`; `concurrency` group `pages`, never cancelled; one `deploy` job in the `github-pages` environment: `actions/checkout@v7`, `actions/setup-node@v7` (`cache: npm`), `npm ci`, `node dist/cli/bin.js build`, `actions/upload-pages-artifact@v5` (`path: showroom`), `actions/deploy-pages@v5`. The README's example gets the same action versions; Dependabot's `github-actions` updates keep the workflow current, but not the README, which is bumped by hand.
  - _`D220`_ (`live`; Q2 "rest are approved"): **Node 24 only**, the newest of the CI matrix; the build doesn't depend on the Node version, which CI already covers.
  - _`D221`_ (`replaced by D226`; Q3): **No build of this repository's showroom in CI on pull requests.** `src/cli/check/index.integration.test.ts` already builds every showcase of this repository, and the `e2e` tier runs `build()` with Vite on fixtures; a failure only the real build would catch shows on the release's `master` push.
  - _`D222`_ (`replaced by D227`; Q4): **The README notes the `github-pages` environment's branch rule**: GitHub only lets the default branch deploy to it, so a repository publishing from another branch (as this one does, `master` with `develop` as the default) adds that branch under Settings › Environments › `github-pages` › Deployment branches.
  - _`D223`_ (`live`; Q5 "rest are approved"): **`README.md` links to this repository's own showroom**, `https://ofzza.github.io/showroom/`, in a line under the npm badge; it is live from the release that publishes it (the README on npm is published with the same release). `package.json`'s `homepage` stays the GitHub README.
  - _`D224`_ (`live`, `refined by D227`; Q6 "rest are approved"): **`PUBLISH.md` gets the Pages setup and a check**: a one-time "Showroom on GitHub Pages" section (Settings › Pages › Source "GitHub Actions", and `master` allowed in the `github-pages` environment, _`D222`_); and after pushing `master` (its step 3), checking that the `Showroom` workflow run passed and the published showroom loads.
  - _`D225`_ (`live`; Q7 "rest are approved"): **No automated test of the workflow file**: it only runs on GitHub, and a linter for it (`actionlint`) isn't installed (installing one is a system change). It is verified by running its build command on a copy of this repository, and on GitHub with the first release; each checkpoint says it has no tests.
  - _`D226`_ (`live`; replaces _`D221`_; the user, Q3: "I want to run check on PR. Both for testing purposes, but also as more dog fooding ...", then "ci:showroom npm script"): **`npm run ci` checks this repository with its own `showroom`**: a `ci:showroom` script, `node dist/cli/bin.js check --showcases --quiet` (_`D228`_), placed after `ci:build` in `package.json` (`npm-run-all ci:*` runs them in that order, and it needs `dist/`). So it runs in CI on every pull request and push to `master` and `develop`, on Node 22 and 24, locally in `npm run ci`, and before `npm publish`. Rejected: a step in `ci.yml` (CI only); a check job in `showroom.yml`.
  - _`D227`_ (`live`; replaces _`D222`_; the user, Q4: "PUBLISH.md only"): **Only `PUBLISH.md` documents the `github-pages` environment's branch rule**: GitHub only lets the default branch (`develop` here) deploy to it, so `master` is added under Settings › Environments › `github-pages` › Deployment branches and tags, or the deploy fails ("Branch "master" is not allowed to deploy to github-pages due to environment protection rules"). The README's example stays without the note. Rejected: a note in the README too.
  - _`D228`_ (`live`; refines _`D30`_ (P1); the user, on `ci:showroom`'s stdout: "--quiet flag"): **`showroom check --quiet` writes no host information to `stdout`**; issues still go to `stderr`, and the exit code is unchanged. Like `--showcases`, it only applies to `check`: with `serve` or `build` it's an error (`--quiet only applies to check`), exiting with `1`. Rejected: `node -e` calling `main()` with a discarding `stdout` (not the real bin); keeping the 77 kB of JSON in every `npm run ci` output; `> /dev/null` (not portable to Windows).
  - _`D178`_ (`live`; the user, 2026-11-12: "Actions workflow (Rec.)"): **A GitHub Actions workflow builds and deploys the showroom** (`.github/workflows/showroom.yml`, like the README's example, with `actions/deploy-pages`); nothing built is committed, and `.gitignore` keeps ignoring `/showroom/` (_`D73`_). In this repository it runs `npm ci` (which builds `dist/`) and then `node dist/cli/bin.js build`, as a package's own `bin` isn't linked into its own `node_modules` (`npx showroom` doesn't resolve here). The user sets Settings › Pages › Source to "GitHub Actions" (a repository setting, not a file). Rejected: building into a committed folder (branch-based Pages only serves the root or `/docs`; the output goes stale and its hashed bundle, about 810 kB, would be replaced in the history on every rebuild; it would reverse _`D73`_).
  - _`D179`_ (`live`; the user: "After P5 (Rec.)"): **Order: after _`P5`_**, so the first published showroom has the layout fixes; _`P4.3`_ stays next (_`D177`_). Rejected: now, as a fast path; between _`P4.3`_ and _`P5`_.
  - _`D180`_ (`live`; the user: "master (Rec.)"): **Pushes to `master` publish it**, so the published showroom matches the latest release, as the README's example does. Rejected: `develop`.
  - Open points:
    - [x] _`O27`_ From the dogfooding discussion (2026-11-12). The README's example workflow is named `name: Showcase`, likely a leftover from before the rename to `showroom`: fix it with _`P6`_'s workflow. Resolved by _`D219`_: the example is named `Showroom`.

## The `ts` and `react` showcase adapters

- _`P7`_ Showcases: the `ts` and `react` showcase adapters (approved 2026-11-13), in two child segments, _`P7.1`_ `ts` and _`P7.2`_ `react`. [See The `ts` and `react` showcase adapters](./PLAN-P7-ts-react.md)

## Showcase adapter examples

- _`P8`_ Showcase adapter examples (implemented 2026-11-13): `html`, `ts` and `number-table` examples, and `README.md` restructured around them (_`S8`_, SPEC.md). [See Showcase adapter examples](./PLAN-P8-examples.md)

## Known open issues

- _`L1`_ Relative images in Markdown aren't shown (_`P2`_, _`D39`_): _`P1`_ doesn't collect image files. Deferred to keep _`P2`_ small. Segment: not yet assigned. Status: `open`.
- _`L2`_ Raw HTML in Markdown isn't rendered (_`P2`_, _`D40`_). Deferred: rendering it safely needs sanitising. Segment: not yet assigned. Status: `open`.
- _`L3`_ Showcase frame folders of documentation files whose paths differ only in case (_`P4.2`_, _`D161`_) collide when the output folder is on a case-insensitive file system. Deferred: rare (two documentation files differing only in case, on Linux). Segment: not yet assigned. Status: `open`.
- _`L4`_ On a narrow (phone) viewport the navigation can't be opened: the navigation drawer is 0 px wide and there is no menu button (found dogfooding, 2026-11-12). Deferred: layout polish, not showcases. Segment: _`P5`_. Status: picked up by _`P5`_.
- _`L5`_ On a narrow viewport the page scrolls sideways: the project information's long URLs (homepage, repository) don't wrap (found dogfooding, 2026-11-12). Deferred: layout polish. Segment: _`P5`_. Status: picked up by _`P5`_.
- _`L6`_ The navigation scrolls away on long pages, and its divider ends partway down the page (found dogfooding, 2026-11-12). Deferred: layout polish. Segment: _`P5`_. Status: picked up by _`P5`_.
- _`L7`_ The home page shows the project's name above the README's own top heading, which usually repeats it (found dogfooding, 2026-11-12). Deferred: needs a choice on what the home page shows. Segment: _`P5`_. Status: picked up by _`P5`_.
- _`L8`_ Smaller showroom gaps (found dogfooding, 2026-11-12): no favicon (a 404 in the console); code blocks without a language (e.g. `README.md`'s four-backtick examples) aren't highlighted. Deferred: minor. Segment: _`P5`_. Status: picked up by _`P5`_.
- _`L9`_ The header's "Dark theme" label wraps onto two lines when the header is narrow; it needs `white-space: nowrap` (e.g. through the FluentUI `Switch`'s `label` slot, `src/app/layout/`) (found reviewing the dogfood build, 2026-11-12). Deferred: layout polish, collected with _`L4`_–_`L8`_ (the user: "Collect for later"). Segment: _`P5`_. Status: picked up by _`P5`_.
- _`L10`_ Style customization in `showroom.json` (the user, 2026-11-12: "At some point I would like to expand `showroom.json` with options for style customization"): options for at least the favicon (_`D213`_ (PLAN-P5-layout.md) gives the showroom its own), the title (the page title and the header's name, the project's name today), and the basic light and dark theme colours, passed as CSS variables into the FluentUI theme. Deferred: the user's "for later" item, after _`P6`_. Segment: not yet assigned. Status: `open`.
- _`L11`_ A Vite dev server with hot updates for `ts` and `react` showcase frames in `serve` (_`K13`_; _`D243`_ (PLAN-P7-ts-react.md)): the _`K10`_ spike showed a second Vite dev server in middleware mode works. Deferred: rebuilding on change, as for `html`, keeps `serve` as it is. Segment: not yet assigned. Status: `open`.
- _`L12`_ Type checking on TypeScript 7 (_`K16`_ (SPEC-pitfalls.md); _`D273`_, _`D274`_ (PLAN-P7.1-ts.md)): TypeScript 7 has no classic compiler API, and its unstable API changed between 7.0 and 7.1; type checking is skipped there with a warning. Deferred: until TypeScript 7's API is stable (the user: "Let's not support TS7 for now"). Segment: not yet assigned. Status: `open`.
- _`L13`_ Customizing the showroom's navigation menu (the user, 2026-11-13, after checking it with several showcase adapter examples (_`D310`_, SPEC.md): "Fine as is for now. We'll need to address the ability to customize the menu at some later point ..."): e.g. titles, grouping and order of documentation files. Deferred: the navigation works as it is. Segment: not yet assigned. Status: `open`.
