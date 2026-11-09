# Plan

## Goals

A first working version of the approved specification (`./.workflow/SPEC.md`): `tsshowcase build` run in a host repository using the TypeScript stack adapter produces a static React/FluentUI showcase application in `./showcase`, presenting the host repository's project information, Markdown files and code file index. Showcases, other stack adapters and SCM adapters are out of scope.

## Segments

Segmentation approved (see the session state's history).

1. **S1 Host scanning**: everything that reads the host repository, with no React or Vite involved.
   - The data collected from a host repository (project information, Markdown files, code file index), as a typed, serialisable structure: the contract between S1 and S2.
   - The stack adapter interface, and the TypeScript stack adapter (D1).
   - Markdown file matching (case, UK/US spelling, `.md`/`.txt`/none) and discovery (D6).
   - The code file index under the source root (D3), and the skipped files (D10).
   - The `tsshowcase.json` configuration format, as far as scanning reads it (D5).
   - The `tsshowcase check` command, which outputs all the collected data to `stdout` and every issue to `stderr`, so S1 is self-contained and testable on its own (C10; originally planned as temporary, now permanent).
2. **S2 Showcase application**: the React/FluentUI SPA, kept in this repository, rendering the data S1 collects.
   - Navigation, project information, a page per Markdown file, and the code file index.
   - Hash routing, relative links inside Markdown rewritten, and the light/dark toggle (D9).
3. **S3 Build command**: the `tsshowcase build` CLI tying S1 and S2 together.
   - The CLI and its flags overriding the configuration (D4, D5).
   - Generating the Vite project and building it into `./showcase` with relative asset paths (D2, D7).
   - Where Vite, React and FluentUI come from (pitfall 7).
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

Not planned yet.

#### Open points

- [ ] Pitfall 4: hash routing (no server-side rewrites on GitHub Pages).
- [ ] Pitfall 5: relative links inside Markdown rewritten to SPA routes or repository URLs.
- [ ] The page background must follow the theme everywhere: in the spike, the browser's default `body` margin stayed white in the dark theme (a CSS reset, or the theme's background applied to `body`). Found by the user's check of the spike.

### S3 Build command

Not planned yet.

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

- [ ] Pitfall 3: running in a host repository without Node tooling (e.g. through `npx`).
- [ ] Pitfall 4: relative asset paths (Vite `base: './'`).
- [ ] Pitfall 7: where Vite, React and FluentUI come from. The spike shows they can be tsshowcase's own `dependencies` (see "Spike" above); to be confirmed when planning this segment.
- [ ] The install size (432 MB, 378 MB of it FluentUI): acceptable, or worth reconsidering?
- [ ] Vite's `cacheDir` location, writable for a global install too.

## Known open issues

- None yet.
