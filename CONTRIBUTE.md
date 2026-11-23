# Contributing

## Reporting Issues

Report bugs and ask for features in [the repository's issues](https://github.com/ofzza/showroom/issues). For a bug, please include:

- the `showroom` version (`npm ls @ofzza/showroom`), your Node.js version and your OS;
- your `showroom.json`;
- the command you ran, and its full output on `stderr` (`npx showroom check --showcases --quiet` reproduces most problems, and prints only the issues);
- for a showcase: its marker and its code, and the TypeScript, React or Angular versions the host repository has installed;
- ideally, a minimal host repository that reproduces it.

Before reporting issues, please read: [GitHub Work-Flow](https://github.com/ofzza/onboarding/blob/master/CONTRIBUTING/github.md)

## Setting up

1. Install **Node.js 22.13 or later, or 24**. Node 20 isn't supported, and neither are earlier 22.x releases: the development toolchain (Vitest, Vite and ESLint) needs them. `showroom` itself is tested on Node 22 and 24.
2. Install the **.NET SDK 10 or later**, with `dotnet` on the `PATH`: the `cs` showcase adapter's `integration`, `e2e` and `serve` tests, and its showcase adapter example (which `ci:showroom` checks), build C# with it.
3. Clone the repository and install its dependencies:

   ```sh
   $ git clone https://github.com/ofzza/showroom.git
   $ cd showroom
   $ npm ci
   ```

   Never run `npm ci --ignore-scripts` here: ESLint's resolver (`unrs-resolver`) and `@parcel/watcher` link their native bindings in their install scripts, and ESLint can break without them (see [AGENTS.md](./AGENTS.md) › Gotchas and known issues). `npm ci` also builds `dist/`, through the `prepare` script.

4. Run the tests: `npm test` runs every test tier (see [Tests](#tests)). The first run of `test:integration` or `test:e2e`, and every run after an installed fixture's lockfile changes, installs those fixtures from the npm registry, so it needs network access.
5. Try a change on a real host repository: run `npm run dev` (it compiles `src/` into `dist/` in watch mode) beside `npm start -- serve --root <host>`, where `<host>` is a copy of a host repository, never a fixture in `test/fixtures/` itself, which the tests rely on. Reload the page after a change to `src/app/`; restart `serve` after a change to its Node code, and after `npm run build`, which empties `dist/` first. Restart `npm run dev` after changing `src/app/index.html`. Try `npm start -- build --root <host>` on a copy too, as it writes the output folder into the host repository, and serve that folder over HTTP to look at it (browsers won't run it from `file://`).

The commands are listed in `README.md` › [Development](./README.md#development).

## Contributing Code

For work-flow and general etiquette when contributing, please see:

- [Git Source-Control Work-Flow](https://github.com/ofzza/onboarding/blob/master/CONTRIBUTING/git.md)
- [GitHub Work-Flow](https://github.com/ofzza/onboarding/blob/master/CONTRIBUTING/github.md)

This repository uses two long-lived branches:

- `develop` - the work-in-progress trunk.
- `master` - always contains the latest stable released version. It is never committed to directly, and only ever gets merged into from `develop`, when a stable version is released.

Small changes are committed directly to the branch you are working on, usually `develop`. Larger work, or any work you want reviewed, goes in its own feature branch, created from `develop` and named after the work (see [Git Source-Control Work-Flow](https://github.com/ofzza/onboarding/blob/master/CONTRIBUTING/git.md) for branch naming conventions). Once it is pushed, request a merge into `develop` with a pull request. Ideally, accompany such work with its own issue.

Before committing or requesting a merge, make sure `npm run ci` passes locally (the build, `showroom check --showcases` on this repository, ESLint, Prettier and every test tier), and that `README.md`, `CONTRIBUTE.md` and `AGENTS.md` reflect the change.

The [Workflow](#workflow) below is the maintainers', for working on this repository with an AI agent; outside contributors don't need to follow it: open an issue, then a pull request against `develop`, as above.

## Architecture and glossary

### Project structure

```
src/
  index.ts              Entry point and public API
  index.test.ts         Tests, colocated with the code they test
  host/                 Host information types
  configuration/        Reading and validating showroom.json
  adapters/stack/       The StackAdapter interface and the built-in stack adapters
    typescript/         The TypeScript stack adapter
    dotnet/             The .NET stack adapter
    resolve/            Resolving the host repository's stack: its stack adapter, or none when showroom.json gives the project information
  adapters/showcase/    The ShowcaseAdapter interface (experimental)
    registry/           The built-in showcase adapters, and loading custom showcase adapters
    html/               The html showcase adapter
    ts/                 The ts showcase adapter: TypeScript and JavaScript bundled with Vite, from memory
      typecheck/        Type checking ts showcases with the host repository's own TypeScript
    react/              The react showcase adapter: a component rendered by a generated mount module, built as ts showcases are
    angular/            The angular showcase adapter: a standalone component compiled ahead of time by the host's Angular, created by a mount module, built as ts showcases are
      compile/          The Angular compile, with the host repository's own Angular compiler and TypeScript, in memory
      plugins/          Its Vite plugins: the emitted modules, the Angular Linker, the production defines
    cs/                 The cs showcase adapter: a C# file-based app built with the host's .NET SDK in the host copy, then run and recorded
    jsonschema/         The jsonschema showcase adapter: a JSON Schema read with tsschema, written as a Mermaid class diagram's source, drawn by its page
  markdown/             Scanning documentation files' Markdown: showcase markers, showcases, virtual files, links, images and headings (Node-free: the showroom uses its link resolution)
  navigation/           Resolving showroom.json's navigation against the documentation files (Node-free)
  linked-files/         Linked files: their folder and URLs, the showcase sidebar's limit, telling text from binary (Node-free)
  showcases/            Building every showcase into its showcase frame, in memory, with the frame script, or its recording
  processes/            Running the programs of recorded showcases under showroom's limits: resolving commands, the cleaned environment, the time limit, the output cap
  host-copy/            The host copy, kept in step with the host repository, and the run session owning its run folder
  frame/                The frame script and its postMessage contract with the showroom (browser code, Node-free)
  cli/                  The showroom command line (bin.ts is its executable entry point)
    check/              check(): collecting the host information from a host repository
      internal/         The output folder, the ignore matcher and issue formatting, shared with serve and build
    serve/              showroom serve: Vite's dev server, building showcases, and updating the page on changes
    build/              showroom build: Vite's build, into the output folder
  vite/                 The showroom's Vite configuration: the shown host information, the showcase frames, the shared Mermaid bundle and the linked files
  testing/              Test helpers: scratch folders, fixture copies, and the test projects' global setups (never built)
  app/                  The showroom: React/FluentUI browser code, compiled to dist/app/ and bundled by Vite
    host/               The shown host information, and finding documentation files in it
    routing/            The hash router
    links/              Resolving links in Markdown
    navigation/         The navigation items: the configured navigation, or the default one; and its groups' expansion
    theme/              The light/dark theme
    markdown/           Rendering Markdown
    code/               The code block (line numbers, copy button), shared by Markdown, the showcase sidebar and the code pane
    code-pane/          The showcase block: its header bar, issue list, showcase views and code pane; on a page, or in the showcase sidebar
    showcase-sidebar/   The showcase sidebar, and the tabs it shares with the code pane
    issues/             The issues bar, showing serve's current issues
    console/            The console panel: its state, from the frame script's messages, the overlay over a showcase frame, and the console view
    showcases/          Placing showcase blocks and shown virtual files in rendered Markdown, their iframes (shown, or hidden), and the markdown and source views
    pages/              The home, documentation and not-found pages
    layout/             The header and the navigation (inline, or an overlay on narrow viewports), centered at a maximum width
build/mermaid/          The shared Mermaid bundle's build: Mermaid bundled by Vite into dist/mermaid/, for showcase frames that draw diagrams (never compiled into dist/ itself)
test/fixtures/          Fixture host repositories the tests run against
examples/               README.md's own linked showcase's page, and the showcase adapter examples (html/, ts/, react/, angular/, cs/, number-table/)
```

Every module lives in `src/`, as an `index.ts` + `index.test.ts` pair. `src/index.ts` re-exports the public ones: `src/host/`, `src/configuration/`, `src/adapters/stack/` (with its stack adapters), the `ShowcaseAdapter` interface and its types from `src/adapters/showcase/`, and `src/cli/` (`main()`) with `src/cli/check/` (`check()`). The rest is internal, and never re-exported:

- the showroom's modules in `src/app/`, which are browser code;
- `src/markdown/`, `src/navigation/`, `src/linked-files/`, `src/showcases/`, `src/frame/`, `src/vite/` and `src/testing/`;
- the showcase adapter registry and the built-in showcase adapters;
- the stack's resolution, `src/adapters/stack/resolve/`;
- `src/cli/serve/`, `src/cli/build/` and `src/cli/check/internal/`, which only the command line uses.

#### Overview

```text
showroom.json, documentation files, code
                    |
                    v
      check (src/cli/check/) ----------> host information: showroom check, check()
                    |
                    v
      showcase builds (src/showcases/), each by its showcase adapter
                    |
                    v
      shown host information, showcase frames, linked files (src/vite/)
                    |
         +----------+-----------+
         v                      v
  serve (src/cli/serve/)   build (src/cli/build/)
  Vite's dev server        Vite's build, into the output folder
         +----------+-----------+
                    v
      the showroom (src/app/), in the browser
```

- `check` collects the host information. `serve` and `build` run it first, then build every showcase, then hand the shown host information, the showcase frames and the linked files to Vite, with the configuration in `src/vite/`.
- `main()` imports `serve` and `build` dynamically, and the `ts` showcase adapter imports Vite only when it builds, so `check` without `--showcases`, and library users, never load Vite.

#### The check

`showroom check` (and `check()`, `src/cli/check/`):

- **Reads the host repository's `showroom.json`** (`src/configuration/`), and resolves its stack (`src/adapters/stack/resolve/`): the stack adapter it names (`src/adapters/stack/`), or none when its `project` is an object, the project information itself, for a host repository whose stack has no stack adapter (the source root then the root, and no default patterns).
- **Has the stack adapter read the project information**, unless `project` is an object, which is taken as it is: from `package.json`, or from the file the configuration's `project` key names, which must be inside the host repository. The `dotnet` stack adapter requires it, and reads that project file and the nearest `Directory.Build.props` as XML, with `sax`, never running MSBuild.
- **Walks the host repository once**, skipping ignored files and the output folder, to collect the documentation files and the code file index. Each list of patterns (`ignore`, `code`, `documentation`) works like a `.gitignore` file, matched by the `ignore` package: the built-in patterns (for documentation), then the stack adapter's, then the configuration's.
- **Scans the Markdown documentation files** (`.md`) with `src/markdown/` (`unified` with `remark-parse` and `remark-gfm`, as the showroom parses them): showcase markers in code fences' info strings and inline links' titles give the showcases and virtual files, whose names must not collide.
- **Validates each showcase of a built-in showcase adapter** (plain parsing), and names the tools a build would load (an internal hook of the registry, `getTrustTools()`: the host's TypeScript, Angular's compiler, the CSS preprocessors), resolving them without loading anything.
- **Decides trust**, once, when the host repository has something to trust (a showcase, or a custom showcase adapter): `CheckOptions.trust`, `false` by default, `true`, or a function given a `TrustRequest` (the custom showcase adapter modules, the tools, the number of showcases), which the command line passes: without `--trust` or `--no-trust`, it asks the person at the terminal (`main()`'s `CliInput`, only when standard input and standard error are both terminals), or warns where there is none; `CheckResult.trusted` carries the decision, which `serve` and `build` pass on as a boolean. Nothing of the host repository has run before it.
- **Under trust, loads the custom showcase adapters** from `customShowcaseAdapters` and validates their showcases. Without trust, it loads none (their showcases get their marker's views, else `showcaseViews`', else `demo`), runs no host check, and warns, by showcase adapter, or once about the showcases not built (`checkHost()`'s `build` report, internal, for `check --showcases`, `serve` and `build`).
- **Runs each showcase adapter's host check**, under trust, for the showcase adapters in use, given the showcases using it whose validation passed (`{ errors, warnings }`): e.g. the `ts` showcase adapter checks, once per documentation file's folder of the showcases that type check, that they find a supported TypeScript.
- **Checks each showcase's included files** (`include=`) on disk, by their exact paths, unless they are virtual or documentation files. Its tabs keep `include=`'s order, its keywords (`source`, `markdown`) among its files.
- **Reports** broken showcases as errors, and broken relative links and images as warnings.
- **Collects the linked files** (`src/linked-files/`): the files the links, images and linked showcases' entry points name, and the included real files, other than documentation files, each with its size, and whether it is text (UTF-8 with no NUL byte, read up to the showcase sidebar's 1 MB limit). They are collected whether the `ignore` patterns skip them or not, except those in the output folder, or outside the host repository through a symbolic link, which are warned about (errors, for included files).
- **Resolves `showroom.json`'s `navigation`** (`src/navigation/`): patterns expanded, labels and anchors checked against each file's headings, which the Markdown scan finds with the ids `rehype-slug` gives them.
- **With `--showcases`** (`showcases: true`), a check that found no errors then builds every showcase, as `build` does, and throws the showcase frames away. Build warnings are reported, and fail nothing.

#### Showcase builds

`buildShowcases()` (`src/showcases/`), run by `serve`, `build` and `check --showcases`, given the check's trust decision (without it, it builds and loads nothing, and reports nothing):

- **Builds every showcase with its showcase adapter**, in memory, into a showcase frame, with the frame script from `src/frame/` inlined into its page.
- **A showcase adapter's build result** holds its files, its checks and its issues together: an error naming no check (the build's own) means there are no files, while a check's errors leave them usable. It also lists the files the build read, which `serve` watches.
- **Recorded showcases**: a showcase adapter declaring `recorded` returns a recording in place of files, and `buildShowcases()` adds its `runtime` check, failed by a non-zero exit, the time limit, a signal or anything on standard error. A showcase adapter declaring `hostCopy` gets the host copy (`src/host-copy/`), synced once per run before any build, and its `run()`, which starts a program through `src/processes/`: resolved from the `PATH` outside the host repository and the host copy, in a process group of its own, with a cleaned environment, its input closed, a time limit and its output capped. The run session (`createRunSession()`) owns the run folder in the user's cache folder: made by `check --showcases`, `build` and `serve` (kept across its runs), removed at their end; the command line's entry point kills every process group and removes the run folders when it is stopped.
- **Custom showcase adapters** are imported by a URL carrying their content's hash, so a changed one is loaded again.
- **The frame script** reports the showcase frame's height to the showroom, and applies the theme the showroom tells it. It posts `start` before any of the page's own scripts run, then the lines it captures from the page's console, formatted inside the showcase frame and posted in batches (at most every 50 ms, the newest 128 with the number dropped), and `ready` once the page has loaded.

#### The showroom

The showroom (`src/app/`):

- **Presents the shown host information**: the host information without the code file index, with every showcase, built or not, each with how it is shown, its showcase views, its Markdown source, its tabs (in `include=`'s order, the Markdown tab flagged), its checks and issues (as its showcase adapter reported them, from `buildShowcases()`), whether it shows a `build` status mark and, where it builds and a view loads it, the frame's URL; and the virtual files with no showcase adapter shown otherwise than as a code block. It is built in Node by `src/vite/`: a virtual file's content shipped, a documentation file looked up, a linked file fetched by its URL.
- **Is compiled and bundled**: `tsc` compiles it to `dist/app/`, next to its static `index.html`, and Vite bundles it from there, with the data served as the `virtual:showroom-host` module, which `main.ts` passes to `mount()`.
- **Routes through the URL's hash** (`#/` for the home page, `#/<path>` for any other documentation file, then `#<heading id>`), so it works on static hosting under any path.
- **Shows a navigation**: the one `showroom.json`'s `navigation` configures, resolved by the check, or else the default one, every documentation file labelled by its first heading. Groups collapse and expand, and the group holding the page shown expands again when it changes.
- **Renders Markdown** with `react-markdown`, `remark-gfm`, `rehype-slug` (GitHub-compatible heading ids) and `rehype-highlight`:
  - relative links to documentation files become routes;
  - links to linked files are marked with a "code" icon before their text: a text file up to 1 MB opens in the showcase sidebar (`src/app/showcase-sidebar/`, FluentUI's `OverlayDrawer` from the right: its content fetched on open, and highlighted through the same `react-markdown` and `rehype-highlight`, `src/app/code/`), and any other file in a new tab;
  - relative images are shown from their linked files;
  - other relative links are plain text.
- **Places each showcase** with a remark plugin, found by its entry point's offset:
  - a showcase shown as a block (a code block showcase, or a linked showcase marked `block`) becomes its showcase block (`src/app/code-pane/`) in its fence's or paragraph's place, or is removed with the view `none`;
  - a shown virtual file with no showcase adapter takes its fence's place;
  - a linked showcase shown inline stays a link, marked with a "play" icon, opening the same showcase block in the showcase sidebar (`SidebarShowcase`). There, its header bar holds a close button too, a button in its header bar collapses and expands its views, and its code pane is always shown, below them or filling the showcase sidebar (the views running hidden). It is mounted only while the showcase sidebar is open, so closing it unloads its showcase frame.
- **Lays out a showcase block** as a grid: its header bar, holding its status marks and the code pane's button, with its issue list under it, across the top; its showcase views stacked below it; and its code pane beside or below them. Its states change the template alone, so the views never move; it is stacked by a container query; its third state opens its tabs in the showcase sidebar.
- **Embeds each showcase frame** in an iframe, which gets the theme in its URL at mount, and later by `postMessage` (through a React context, so a theme change never reloads it), and follows the height its showcase frame reports.
- **Keeps each showcase frame's console panel** (`src/app/console/`): its state is a pure function of the frame script's messages and the user's actions, cleared on every `start`, and kept by the showcase block when a `console` view shows it too. It is rendered over the iframe in a positioned box that grows to fit it, or as the `console` view. Below a `console` view, without a `demo` view, the showcase frame runs hidden: at its real width and height, with `opacity: 0`, in a box with no height that clips it, so its page lays out and runs as a shown one scrolled out of view.
- **Shows the other views**: the `markdown` view highlights a fence's lines as Markdown and its inside as its language, in one code block; the `source` view shows the entry point's tab.
- **Marks a showcase's state**: the status marks come from the showcase's checks and issues, and `runtime`'s from its console panel's state (the warnings and errors since the load, dropped lines included, and `ready`). The issue lines are marked in the code blocks of the views and the tabs (the gutter's line in the issue's colour, and a band across the line). A showcase that doesn't build shows a "Not built" placeholder in place of its showcase frame.
- **Is styled** with Griffel's `makeStyles` and FluentUI tokens, so everything, highlighted code included, follows the light or dark theme.
- **Switches to narrow viewports** (below 768 px: the navigation in an overlay drawer, opened from the header) through CSS media queries alone (`NARROW_VIEWPORT`, `src/app/layout/`), so the page rendered on the server and the first paint agree.

#### `showroom serve`

`showroom serve` (`src/cli/serve/`):

- **Runs the check, then builds every showcase** with `src/showcases/`, in development mode. A showcase that doesn't build is shown with no URL, beside its issues, and doesn't stop `serve`; one whose checks fail is served as built. The first check decides trust for the session, and a trusted session writes a notice whenever a later check loads a custom showcase adapter module it hasn't loaded yet; without it, nothing is built, the shown host information (`trusted: false`) shows every showcase as its source, and the linked files middleware sends linked files of active types (`.html`, `.svg`, …) as plain text. Every linked file is sent with `X-Content-Type-Options: nosniff`.
- **Starts Vite's dev server** with the configuration in `src/vite/`:
  - Vite's root is the package's `dist/app/`, and its cache a fresh temporary folder; it reads no configuration file, PostCSS configuration, `.env` files or public folder, which it would otherwise look for from its root up, inside the host repository when `showroom` is installed in it;
  - a plugin serves the shown host information and the current issues as the virtual module;
  - a middleware hands out the showcase frames from memory (ahead of Vite's own, at the paths `build` writes them to), another the shared Mermaid bundle from the package (at `mermaid/<path>`, only while a showcase frame uses it, and a 404 otherwise), another the linked files from the host repository (at `files/<path>`, and a 404 for anything else there);
  - React is aliased to `showroom`'s own copy.
- **Watches the host repository** with the server's watcher, skipping what the `ignore` patterns skip. After a change, the host watcher (debounced) runs the check and, when it passes, builds every showcase again, as one run, then swaps the shown host information, the showcase frames and the issues together:
  - when anything but the showcases' updates (the URLs of the showcase frames and their tabs, the checks, the issues and the `build` status marks) changed, it invalidates the virtual module and fully reloads the page;
  - when only those changed (each URL carries its content's hash, a tab's that of its text linked file), it sends the `showroom:showcases` event, and `main.ts` passes the updates to `mount()`'s updater, so only the changed iframes reload, the changed tabs fetch again, and the status marks and issue lists follow;
  - changed issues are sent as the `showroom:issues` event, shown in the issues bar.
- **Watches what the builds read, even under ignored folders**: the files the latest builds read, the custom showcase adapter modules and the linked files. The watcher's `ignored` function lets them and the folders leading to them through, and the topmost ignored folder holding each is added to the watcher after a run, so a host's own package rebuilt into its `dist/` reruns the builds. While any showcase fails to build, the previous run's files stay watched too, so a deleted `dist/` is seen when it's built again.

#### `showroom build`

`showroom build` (`src/cli/build/`):

- **Runs the check, and makes sure the output folder may be emptied.** Vite empties the output folder first, so `build` only lets it when the folder is missing, empty, or holds the `.showroom` marker file every build writes; anything else is refused, so a mistyped `outDir` never deletes the host repository's files. The output folder must be inside the host repository, and isn't its root.
- **Builds every showcase** with `src/showcases/`, in production mode. Any error, of a build or of its checks, stops the build before the output folder is touched.
- **Runs Vite's `build()`** with the same configuration as `serve`, and two plugins:
  - one emitting the showcase frames' files into `showcases/<documentation file's path>/<n>/`, only those a `demo` or `console` view loads (a showcase shown by its `markdown` or `source` view alone is built and checked, and that's all);
  - another copying the shared Mermaid bundle into `mermaid/`, once, only when an emitted showcase frame uses it;
  - another copying the linked files into `files/<path>`.
- **Leaves out the bundler's warnings about the showroom's own dependencies** (FluentUI's `'use client'` directives, and its single large chunk), as the host repository can't act on them.

#### The `ts` showcase adapter

The `ts` showcase adapter (`src/adapters/showcase/ts/`):

- **Bundles a showcase with `showroom`'s own Vite**, one Vite build per showcase, in memory (`write: false`), with an inline configuration reading nothing from the host repository: no Vite, PostCSS or environment configuration; `base: './'`; the mode pinned in `define`, the resolve conditions, minifying and source maps, never through `process.env.NODE_ENV`. The entry point is the input.
- **Adds two plugins**:
  - one resolving relative imports to virtual files as if they were on disk (from virtual and real importers alike, the virtual file before the real one at each candidate path), reporting the host's own imports that nothing resolves at their line, and loading virtual files from memory;
  - the other recording the files each build reads, as modules load, for `serve`'s watcher.
- **Maps the bundler's errors and warnings** to the virtual or real file and line they concern.
- **Writes the showcase frame's page itself**, around the bundle: the CSS, the showcase frame root, then the module.
- **Type checks a showcase once it bundles** (`src/adapters/showcase/ts/typecheck/`):
  - with the host repository's own TypeScript, 5.x or 6.x, which it resolves as Node does from the documentation file's folder and loads with `createRequire` (`showroom`'s own `typescript` is only used for its types);
  - as a program of the nearest `tsconfig.json`'s files and the entry point, under its compiler options (with `noEmit`, and without the options a file outside the project can't have), through a compiler host serving the virtual files from memory, its current directory the documentation file's folder;
  - parsed source files are shared between a run's showcases, keyed by the TypeScript install and the compiler options, and released in `close()`;
  - only the errors of the files the showcase reaches are reported (followed from the entry point through the imports the compiler host resolves, and `/// <reference path>`s), outside `node_modules` and TypeScript's library files, with the program's global, option and tsconfig errors, each named after the `type check`, which the build result lists among its `checks`;
  - the files the program read join the build's reads, so `serve` watches them.

#### The `react` showcase adapter

The `react` showcase adapter (`src/adapters/showcase/react/`):

- **Builds through the `ts` showcase adapter's function** (`buildTsShowcase()`), with a generated module as Vite's input: the mount module, a virtual module beside the entry point (so its `react` and `react-dom/client` imports resolve from the host repository, as the showcase's do), which imports the entry point's default export and renders it into the showcase frame root with `createRoot`.
- **Generated modules are never among a build's reads**, and the build errors in them (e.g. a missing default export) are placed at the entry point.
- **Pins JSX's automatic runtime** for Oxc, and the type check defaults to `jsx: react-jsx` where the tsconfig leaves `jsx` unset.
- **Its host check** resolves `react`, `react-dom` and `@types/react` as Node does, from each documentation file's folder.

#### The `angular` showcase adapter

The `angular` showcase adapter (`src/adapters/showcase/angular/`):

- **Compiles a showcase before Vite runs**, with the host repository's own Angular compiler (`@angular/compiler-cli`'s `NgtscProgram`, loaded with `import()`) and the TypeScript it resolves itself (one instance for both): a program of the nearest tsconfig's files and the entry point, with its `angularCompilerOptions`, served by the `ts` showcase adapter's compiler host (virtual files from memory), with only what emitting in memory needs overridden.
- **Filters its diagnostics** to the files the showcase reaches, with their components' templates and styles:
  - syntax and structural errors, and a default export that isn't a standalone component, fail the showcase before Vite;
  - type errors (and its extended diagnostics' warnings), named after the `type check`, fail it once it bundles, beside its files.
- **Emits every module of the program in memory**, with its source map, and hands them to `buildTsShowcase()` through plugins of its own:
  - one loading the emitted modules (excluded from Vite's own TypeScript transform);
  - the Angular Linker, completing every partially compiled JavaScript module (Angular's packages, and the host's own built libraries) with the compiler's own Babel;
  - the production mode's defines.
- **Its mount module**, a generated module as for `react`, imports `zone.js` first with the `zone` option, creates an application, creates the component in the showcase frame root, and attaches its view.
- **Its host check** resolves the Angular packages and `zone.js` as Node does, from each documentation file's folder, and the TypeScript from `@angular/compiler-cli`'s.

The `cs` showcase adapter (`src/adapters/showcase/cs/`), the first built-in one that records:

- **Builds in the host copy**, through `run()` (`src/host-copy/`, `src/processes/`): `dotnet build <file> --artifacts-path <the showcase's own folder>`, then `dotnet <its .dll>` (found by `findCsProgram()` in either SDK's layout of the output, `bin/debug/` for the .NET SDK 10, `bin/<file>.cs/debug/` for 11), recorded. Every setting of `dotnet` goes through the environment (`CS_DOTNET_ENVIRONMENT`: no node reuse, build server or compiler server; `DefaultItemExcludes` naming every `.cs` virtual file, so a project never compiles one in its folder), as an MSBuild switch on the command line makes `dotnet` read the `.cs` file as a project.
- **Reads its diagnostics** from the build's output, paths already root-relative (`parseDiagnostics()`): every error, and the warnings in the showcase's own file (`getCsBuildIssues()`). Its reads are the showcase's file and the project files its `#:project` directives name.
- **Its host check** runs nothing of the host repository: `dotnet --list-sdks` from the `PATH`, in a run session of its own (removed by `close()`), judged with the host's `global.json`, read statically (`judgeSdks()`). The registry's trust hook names `dotnet` and the `global.json`'s SDK folders inside the host repository (`getTrustExecutables()`), and passes `DOTNET_ROOT` on (`getShowcaseAdapterEnvironmentNames()`).

The `jsonschema` showcase adapter (`src/adapters/showcase/jsonschema/`), the first built-in one whose showcase frame is derived from its entry point's content:

- **Reads the schema** as strict JSON (`parseJsonSchema()`, a syntax error at its line), then with `@ofzza/tsschema`'s `reflect()`, walking its definitions by name and following references by their names, never their `target`s (`mapJsonSchema()`), so a recursive schema never recurses.
- **Writes the Mermaid source** of a `classDiagram` in Node: generated node ids, every display text through one escaper (`escapeDisplayText()`), so the schema's text is never markup; it fails the build over Mermaid's own limits.
- **Warns of what `tsschema` doesn't read yet** by reading the raw JSON (`getSchemaWarnings()`): `definitions`, the `$ref`s `tsschema` doesn't resolve (asked of `tsschema` itself), and `properties` without `"type": "object"`.
- **Its page** carries the source as a JSON data element and draws it with the shared Mermaid bundle (`jsonSchemaPageScript()`, inlined as its source text), imported by a fixed specifier that the import map `buildShowcases()` inserts after the frame script resolves to the bundle's URL with its hash; it draws again, with a fresh id, when the theme changes. The registry marks it as using the bundle (`usesMermaidBundle()`), never a custom showcase adapter.

#### Where to change things

[AGENTS.md](./AGENTS.md) › Testing says what each module's tests cover, and its Gotchas and known issues what to watch out for.

| To change ...                                | Look in ...                                                                                                                                               | Tests and fixtures                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `showroom.json`'s keys                       | `src/configuration/`, then where the key is used                                                                                                          | `src/configuration/`; `invalid-configuration`, `wrong-configuration`                            |
| The command line's commands and options      | `src/cli/` (`USAGE`, the argument parsing, `main()`)                                                                                                      | `src/cli/index.test.ts`, `src/cli/index.e2e.test.ts`                                            |
| What `check` collects or reports             | `src/cli/check/`, `src/cli/check/internal/` (the output folder, the ignore matcher, issue formatting)                                                     | `src/cli/check/`; the fixture of the area (`patterns`, `links`, `linked-files`, `showcases`, …) |
| A stack adapter                              | `src/adapters/stack/<name>/`, registered in `src/adapters/stack/`                                                                                         | `src/adapters/stack/`; `dotnet`, `minimal`                                                      |
| The showcase marker grammar                  | `src/markdown/` (`parseShowcaseMarker()`, `scanMarkdown()`), then `README.md` › Showcases' cheat-sheet                                                    | `src/markdown/`, `src/cli/check/`; `showcase-keys`, `showcase-errors`, `showcase-views`         |
| A new built-in showcase adapter              | `src/adapters/showcase/<name>/`, registered in `src/adapters/showcase/registry/`; its showcase adapter example in `examples/<name>/README.md` (AGENTS.md) | its `index.test.ts` and `index.integration.test.ts`; `showcase-<name>` fixtures                 |
| How showcases are built, or the frame script | `src/showcases/`, `src/frame/`                                                                                                                            | `src/showcases/`, `src/frame/`; `showcase-frames`, `showcase-build-errors`                      |
| How Markdown renders                         | `src/app/markdown/`, `src/app/code/` (code blocks), `src/app/links/`; heading ids must stay those of `src/markdown/`                                      | `src/app/markdown/`, `src/app/code/`, `src/app/links/` (rendered on the server)                 |
| Where showcases are placed, and their views  | `src/app/showcases/`, `src/app/code-pane/` (the showcase block), `src/app/console/`                                                                       | the same modules (rendered on the server); `showcase-views`                                     |
| The showcase sidebar, or linked files        | `src/app/showcase-sidebar/`, `src/linked-files/`, `src/vite/` (serving and copying them)                                                                  | the same modules; `linked-files`                                                                |
| The navigation                               | `src/configuration/` (validation), `src/navigation/` (`resolveNavigation()`), `src/app/navigation/`, `src/app/layout/`                                    | the same modules, `src/cli/check/`; `navigation`, `navigation-errors`                           |
| `serve`'s reloads and events                 | `src/cli/serve/` (`createHostWatcher()`, `getShownChange()`), `src/vite/`, `src/app/main.ts`                                                              | `src/cli/serve/` (unit tests, and `index.serve.test.ts`), `src/vite/`                           |
| `build`'s output                             | `src/cli/build/` (`getBuildConfiguration()`), `src/vite/`                                                                                                 | `src/cli/build/` (unit tests, and `index.e2e.test.ts`); `output-folder`, `out-dir-root`         |
| The shared Mermaid bundle                    | `build/mermaid/` (its build), `src/vite/` (serving and copying it), `src/showcases/` (its URL and import map from a page)                                 | `src/vite/` (unit tests, and `index.integration.test.ts`), `src/showcases/`                     |

### Tests

`npm test` runs every test tier, each an npm script and a Vitest project, told apart by the test file's suffix:

- **`unit`** (`*.test.ts(x)`, `npm run test:unit`): a single Vitest invocation that executes test files, runs their runtime expectations, and type checks them, reporting type errors as test failures. Tests run against the fixture host repositories in `test/fixtures/`; the showroom's tests render it to HTML with `react-dom/server`.
- **`integration`** (`*.integration.test.ts`, `npm run test:integration`): real showcase adapter builds, on the fixture host repositories.
- **`e2e`** (`*.e2e.test.ts`, `npm run test:e2e`): the command line, and `build()` with Vite's build of the showroom, on copies of the fixture host repositories. It first compiles `src/` once into a scratch folder, so it never depends on, or writes to, `dist/`.
- **`serve`** (`*.serve.test.ts`, `npm run test:serve`): `serve()` with its dev server, on copies of the fixture host repositories, on a free port, fetching the showroom, its showcase frames and their files, with the showroom compiled as for `e2e`. Updates after a change are only unit-tested, as the dev server doesn't watch the copies (they are under `node_modules/`).

Where tests write:

- **Fixtures** (`test/fixtures/<name>/`, one per area under test) are never written to. Tests copy fixtures, and create scratch folders, only inside `node_modules/.cache/showroom-tests/`, and remove them afterwards.
- **Temporary folders**: the `integration`, `e2e` and `serve` tests also see a temporary folder of their own there as the system's temporary folder (`TMPDIR`, `TMP`, `TEMP`).
- **The shared Mermaid bundle**: the `integration`, `e2e` and `serve` tests build it once into `node_modules/.cache/showroom-tests/mermaid-<hash>/`, kept until Mermaid's version or its build changes, so they never depend on `dist/mermaid/`.
- **Installed fixtures**: a fixture host repository on an older React or Angular major than `showroom`'s own (`test/fixtures/showcase-react-18/`, `showcase-angular-20/`, `showcase-angular-21/`) carries a lockfile, and is installed with `npm ci` once per lockfile into `node_modules/.cache/showroom-tests/installs/` (by `test:integration` and `test:e2e`), so their first run, and every run after a lockfile changes, needs the npm registry.

`npm run ci` runs the build, `showroom check --showcases --quiet` on this repository itself (with the command line just built), ESLint, Prettier and every test tier. GitHub Actions runs it on every pull request targeting, and every push to, `master` or `develop`, on Node 22 and 24. [AGENTS.md](./AGENTS.md) › Testing details what each module's tests cover.

### Glossary

Terms used across code, comments and documentation. Use them as defined here. A new concept is added to this list in the change that introduces it (an agent proposes it first, see [WORKFLOW.md](./WORKFLOW.md) › "Glossary").

| Term                     | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host repository          | The repository that uses `showroom`, and that the showroom presents.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Host information         | The data `showroom` collects from a host repository (project information, documentation files, code file index, showcases, virtual files and linked files, and the resolved navigation when `showroom.json` configures one), which the showroom presents.                                                                                                                                                                                                                                                                                                                                                                                   |
| Shown host information   | The part of the host information the showroom presents: the project information and the documentation files, without the code file index; every showcase, built or not, each with where it is placed, how it is shown, its showcase views and Markdown source, what its code pane shows, its checks and issues and, where it builds and a view loads it, its showcase frame's URL, or its recording; and the virtual files with no showcase adapter shown by other views than `source`.                                                                                                                                                     |
| Showroom                 | The static React/FluentUI SPA that `showroom` builds (or serves, for previewing) for a host repository: its documentation, enriched by the showcases embedded in it. Not to be confused with `showroom`, the tool (always written as code).                                                                                                                                                                                                                                                                                                                                                                                                 |
| Project information      | The host repository's name, version, description, license, author, homepage and repository URL, read by its stack adapter (from `package.json`, or a .NET project file), with `showroom.json`'s `project` overriding any of it, or given there in full for a host repository without one.                                                                                                                                                                                                                                                                                                                                                   |
| Documentation file       | A file in the host repository found by the built-in documentation patterns and the `documentation` patterns, and shown in the showroom.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Linked file              | A file in the host repository that isn't a documentation file, which a documentation file links to by a relative path (or shows as an image), or a showcase includes (an included file); copied into the showroom, where a text file opens in the showcase sidebar, syntax highlighted, and any other file opens in a new tab.                                                                                                                                                                                                                                                                                                              |
| Code file index          | The sorted paths of the code files under the source root.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Source root              | The folder under which the code file index is collected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Output folder            | The folder `showroom build` builds the showroom into (`outDir`, `./showroom` by default), emptied on every build.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Stack adapter            | An implementation of the common interface for one kind of host repository (language or framework). It supplies the project information and which files count as code. A host repository whose stack has none gives its project information in `showroom.json` instead.                                                                                                                                                                                                                                                                                                                                                                      |
| SCM adapter              | (Planned; none exists yet.) An adapter for the service where the host repository's code is kept (GitHub, GitLab, Bitbucket, …), used to link to, read or show the host repository's files from there. SCM stands for source code management.                                                                                                                                                                                                                                                                                                                                                                                                |
| Showcase                 | A component demonstrating the usage of a unit of the host repository (a service, hook, directive, component, …), embedded in a documentation file, built by a showcase adapter, and shown in the showroom by its showcase views.                                                                                                                                                                                                                                                                                                                                                                                                            |
| Showcase marker          | The `showcase` keyword (with its showcase adapter, options and keys) in a code fence's info string or a link's title, marking a showcase's entry point, or naming a virtual file (`file=`).                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Showcase entry point     | The code block or linked file a showcase is built from, marked with its showcase adapter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Showcase adapter         | An implementation of the common interface for building showcases of one kind of code or data (HTML, TypeScript, React, Angular, C#, a JSON Schema, or the host repository's own) into a showcase frame or a recording, chosen per showcase by its marker.                                                                                                                                                                                                                                                                                                                                                                                   |
| Showcase view            | One of the ways a showcase is shown, in its block, named by its marker's `view=` or the defaults (`showroom.json`'s `showcaseViews`, or its showcase adapter's): `markdown` (the showcase as written), `source` (its entry point's code), `demo` (its showcase frame) and `console` (its console panel), stacked in their order; or `none`. A virtual file with no showcase adapter takes `source`, `markdown` or `none`.                                                                                                                                                                                                                   |
| Code block showcase      | A showcase whose entry point is a code block in a documentation file, its virtual file named by `file=` or generated; shown as a block: its header bar, showcase views and code pane in place of the code block.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Linked showcase          | A showcase whose entry point is a real file, linked from a documentation file; shown inline (a link, marked with a "play" icon, opening it in the showcase sidebar, as a block shows it; the default, or `inline`) or as a block (`block`: its header bar, showcase views and code pane in place of the paragraph).                                                                                                                                                                                                                                                                                                                         |
| Included file            | A file a showcase lists with `include=` in its marker: shown as a tab of its code pane (in the showcase sidebar too, for a linked showcase shown inline), and made available to its build. `include=` also takes the keywords `source` and `markdown`, which place tabs, not files.                                                                                                                                                                                                                                                                                                                                                         |
| Virtual file             | The content of a code block with a showcase marker, available to showcases as a file in its documentation file's folder: named by `file=` (with or without a showcase adapter), or generated for a code block showcase without one.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Custom showcase adapter  | A showcase adapter the host repository supplies as a JavaScript module, listed in `showroom.json`'s `customShowcaseAdapters` ("bring your own build"), which may record; experimental until its interface is declared stable.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Recorded showcase        | A showcase that its showcase adapter builds and runs on the machine running `showroom`, recording its console output and exit code, which the showroom shows in place of a showcase frame's console.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Host copy                | `showroom`'s copy of the host repository, in a folder of the user's cache, with virtual files written where they belong, in which the showcase adapters that ask for it build (and record) showcases, so that the host repository itself is never written to by `showroom`.                                                                                                                                                                                                                                                                                                                                                                 |
| Showcase adapter example | A documentation file of this repository, `examples/<showcase adapter>/README.md`, showing one showcase adapter's abilities in more detail than `README.md`, with live showcases; every showcase adapter comes with one.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Host requirement         | What a showcase adapter needs from the host repository (e.g. a package installed), checked once per run by its host check: a missing one is an error of `showroom check`; the host check can also warn.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Host check               | A showcase adapter's check of the host repository's host requirements (`check?()`), run once per run with the showcases using it, only with trust.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Trust                    | The permission the person running `showroom` gives it, for one command, to run the host repository's code: on their machine (custom showcase adapters, the host's tools, recordings), and in the showroom (its showcases' code). Given with `--trust` or by answering the prompt (`CheckOptions.trust`), never by the host repository itself; without it, every showcase shows its source.                                                                                                                                                                                                                                                  |
| Showcase frame           | The page that renders one showcase, in isolation, embedded in the showroom with an iframe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Frame script             | The small, framework-free script `showroom` adds to every showcase frame page: it reports the showcase frame's height to the showroom, applies the theme the showroom tells it, and captures the page's console, uncaught errors and rejected promises, and posts them to the showroom.                                                                                                                                                                                                                                                                                                                                                     |
| Console panel            | The showroom's list of what a showcase frame's page writes to the browser's console, its uncaught errors and its rejected promises, as the frame script reports them, shown as the `console` view, or over the `demo` view behind fading lines and a counter that opens it; or of a recorded showcase's recording, shown as the `console` view only.                                                                                                                                                                                                                                                                                        |
| Mount module             | The module `showroom` generates for a framework's showcase, which imports its entry point and renders it into the showcase frame root (e.g. the `react` showcase adapter's, rendering the default export with `createRoot`).                                                                                                                                                                                                                                                                                                                                                                                                                |
| Showcase frame root      | The empty element (`#root`) in a showcase frame's page that a `ts` showcase may write to, that the `react` showcase adapter renders the showcase into, and that the `angular` showcase adapter creates its component in.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Showcase block           | What a showcase shown as a block is rendered as: its header bar, issue list, showcase views and code pane, in place of its code block or its link's paragraph; the showcase sidebar shows the same block for a linked showcase shown inline.                                                                                                                                                                                                                                                                                                                                                                                                |
| Code pane                | The code shown beside a showcase shown as a block's showcase views: a tab per file (the entry point's, the source tab, where `include=` places it, else before the first included file; the included files', in `include=`'s order), and, where `include=` lists `markdown`, the showcase as written in its documentation file (its Markdown), in its place; hidden, beside the views, or in the showcase sidebar, switched by its buttons in the header bar (in the half state, a second one hides it); in the showcase sidebar (a linked showcase shown inline's), always shown: below the views, or filling it while they are collapsed. |
| Header bar               | A showcase block's top bar, above its issue list and its showcase views: its status marks and the code pane's button (in the showcase sidebar, a button collapsing and expanding the views instead, and a close button).                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Status mark              | A mark in a showcase's header bar saying what was verified: `build`, each check its showcase adapter performed (e.g. `type check`), and `runtime` while its page runs, or from its recording; ✓, ⚠ or ✗.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Issue list               | A showcase's errors and warnings, of its build and its checks, listed under its header bar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Issues bar               | The bar at the top of the showroom, in `showroom serve` only, listing the current issues.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Navigation               | The showroom's list of links to documentation files (and other pages), grouped and titled by `showroom.json`'s `navigation`, or else the default one: the home page, CONTRIBUTING and LICENSE, then every other documentation file, labelled by its first heading. A documentation file may be listed again under another anchor.                                                                                                                                                                                                                                                                                                           |
| Showcase sidebar         | The panel opening from the right over the showroom that shows a linked file's content, highlighted, a code pane's tabs, or a linked showcase shown inline as a block shows it.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

<!-- <@ofzza/repo-skill:contribute> Managed by the repo skill: this tag marks where its Workflow section starts. -->

## Workflow

Work in this repository is done together with an AI agent (e.g. Claude Code), following the rules in [WORKFLOW.md](./WORKFLOW.md). This section explains them for you, the person working with the agent. Where the text above and this section differ, this section applies; where this section and `WORKFLOW.md` differ, `WORKFLOW.md` applies. Words in **bold** are defined in [Terminology](#terminology) below.

### How it works

- **Stages**: the work moves through three **stages**:
  1. **Specification**: you and the agent agree on what to build, in `./.workflow/SPEC.md`. If there's none yet, the agent starts here, asking for the idea, what the project must do or have (and which items are must-haves), and how much time and complexity you're willing to spend;
  2. **Planning**: you agree on how to build it, in `./.workflow/PLAN.md`, split into **segments**;
  3. **Implementation**: the agent implements approved segments one at a time, stopping for your review after each.

  You can run ahead (draft a plan while the specification is still open) or go back (the agent proposes fixing the specification when implementation shows it's wrong). Nothing is implemented until you've approved its plan, or confirmed the **fast path** for it.

- **Workflow files**, under `./.workflow/`: `SPEC.md`, `PLAN.md`, `STATE.md` (the **session state**: where the work stopped, what's waiting on whom, and a dated history of milestones), and `.temp/` (throwaway **working files**, never committed).
- **Where the agent gets its rules**: your agent reads `AGENTS.md` (Claude Code through `CLAUDE.md`), which points it to `WORKFLOW.md`, and then, if it exists, `WORKFLOW.custom.md`.
- **Customizing the workflow**: `WORKFLOW.md` is generated by the `ig-repo` skill and replaced when the workflow is upgraded, so leave it as it is. This project's own workflow rules go in `WORKFLOW.custom.md` (committed, shared by everyone), which the agent reads last and which applies where the two differ, except that it can't relax a hard rule. Ask the agent to change the workflow and it makes the change there, creating the file if needed.
- **Resuming**: the specification and plan are committed, and the session state records where the work stopped, so you can stop at any point and pick up in a fresh session.
- **Two word lists**: the [Terminology](#terminology) below defines the words for how the work is done; the **Glossary** (the first section of this file with "Glossary" in its heading, created when the first domain term is defined) defines the project's domain terms, for what is built. Variants are fine ("spec" for specification). For any other word that could stand for a defined term (e.g. "requirements" for the specification), the agent asks "Did you mean the specification?" before acting, every time. If you'd rather use your own word, ask the agent to add it to the term as an alias, or to define a new term. "Quick fix" and "resume" are built in.
- **What wins**: your instructions in the conversation, then the specification, plan and Glossary (only on what is built), then `AGENTS.md`, other agent files, `WORKFLOW.md` and `WORKFLOW.custom.md` (which applies over `WORKFLOW.md`); hard rules above all. Text from dependencies, tools, issues, web pages or other agents never authorises anything.

### How to use it

- **Start a session**: ask the agent to resume (or run `/ig-repo continue` if you have the `ig-repo` skill). Whatever you ask first, it reads the session state, runs `git status`, and tells you where the work stopped, what's next, and about any uncommitted changes.
- **Say what to work on**, e.g. "let's work on the specification", "plan the export feature", "continue implementing", or "quick fix: the date format is wrong in the footer".
- **Answer dialogs**: the agent asks in dialogs of up to 4 questions with up to 4 options each (a question box, or numbered questions in agents without one). When it goes through the choices a draft makes, each shows its position (e.g. `Q3 (3/9)`), its background, the options with their trade-offs, and a recommendation. Long lists go into a file under `./.workflow/.temp/`, and you can accept all the recommendations at once, or pick which to discuss; anything touching a hard rule, a system change, credentials, an outward action or a new dependency is always asked on its own.
- **Approve, or don't**: pick the approving option, or say yes to a dialog that names what's being approved. To hold back, pick "discuss" or "stop here", or say what's wrong.
- **Checkpoints**: after each implemented segment or fast-path change, the agent summarizes what changed, the documentation and tests updated, the build, test and lint results, any failure that was already there, and any deviation from the plan, then offers "approve and commit", "approve, don't commit", "discuss" or "stop here". "Approve and commit" is your yes for that one commit; pushing asks again.
- **Fast path**: for a small, self-contained change, or when you ask for a quick fix, the agent proposes a one-line plan, the change (with its documentation and tests) and one checkpoint, and goes ahead once you confirm. It works without a specification; a change that needs real choices gets a plan instead, and one that changes the project's scope goes through the specification first.
- **Choices during implementation**: a choice the plan doesn't state (a new dependency, a public interface, a file deleted or moved, a data format) is put to you before the agent acts on it.
- **Reviews and spikes**: the agent may propose **zero-context reviews** and **spikes**, and you can ask for either. Neither runs without your **go-ahead** (asking for one is the go-ahead). Review findings come back as questions, fixes and skips for you to confirm, plus points for later; spikes run only in `./.workflow/.temp/`, never in the real code.
- **Long tasks**: tasks over a couple of minutes run in the background, announced with an estimate, with progress at least every 5 minutes; every subagent's start and finish is reported.
- **Quick checks by you**: when you can check something faster yourself (look at a screen, try a button), the agent asks you to, with exact paths and what to look for.

### What you need to do

- **Give approvals explicitly**: only a clear yes, in answer to a dialog naming what's being approved, counts. Silence, a comment on wording or an answer about something else approves nothing.
- **Answer "Did you mean …?" questions**: the agent won't act on a request with an undefined word until you do.
- **Resume after a stop**: when the agent stops and reports a problem, it waits until you tell it to continue.
- **Grant hard-rule exceptions yourself**: the agent never offers one; only you can, by naming the rule, and each exception covers one action.
- **Keep credentials out of files**: never ask the agent to write one into a file; if you paste one into the conversation, rotate it once the task is done.
- **Commit the workflow files** when the agent proposes it after an approval, so that others, and your future sessions, see the same state.
- **Your own agent instructions still apply** alongside this workflow; where they conflict, the agent asks you.

### What the agent always does

- **Asks before any commit or outward action**: every commit, amend, rebase, tag, push, pull-request action, publish, deploy or post to an external service needs your yes for that one action.
- **Stops and reports**: if it, or a subagent, breaks a rule or changes something you didn't ask for, it stops, reports what ran, what changed and how to undo it, records the stop in the session state, and doesn't clean up on its own.
- **Follows the hard rules**: yours, kept as HARD RULES in `./.workflow/SPEC.md`, and the workflow's own (stop and report, system changes, credentials, no AI attribution, working files, subagents, plus those of any additional workflow below). Nothing relaxes them.
- **Asks before system changes**: no `sudo`, system packages, global tools or toolchains, containers, or global git or tool configuration, and nothing outside the repository and its session scratch directory, without your yes for that one action.
- **Protects credentials**: it never writes them into files, never reads ones it wasn't given, and never commits a file that contains one. Tools like git may use their own stored credentials for actions you've approved, but the agent never looks at them.
- **Credits no AI**: commits, pull requests and documentation never credit the agent.
- **Keeps documentation and tests current**: whenever it adds or changes code, it updates the affected documentation (READMEs, this file and its Glossary, the project facts in `AGENTS.md`, code comments) and adds or updates tests. It never deletes, skips or weakens a test to make the suite pass without your yes. If there's no way to test a change, it asks you once whether to set one up.
- **Keeps every commit green**: before each commit it builds the project and runs the full test suite, the linters and the formatters. It fixes failures its change causes; a failure that was already there is reported and recorded as an open point. Committing with a failure of its own needs your yes for that commit, is noted in the commit message, and is fixed in the next one.
- **Grows the Glossary**: when the work introduces a new domain concept, it proposes adding it; changing or removing a term happens only when you ask, and then updates every use.
- **Changes the rules only when you ask**: it never edits `WORKFLOW.md`, `WORKFLOW.custom.md` or the rules in `AGENTS.md` on its own, and the changes you ask for go into `WORKFLOW.custom.md`; an additional workflow counts only if `/ig-repo init` or you added it. If a rule seems outdated, it proposes the change and keeps following the rule until you approve.

### Terminology

The terms for how work is done in this repository. They change only with the workflow; the project's domain terms are in the Glossary.

| Term                    | Meaning                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Stage**               | One of specification, planning and implementation.                                                                              |
| **Specification**       | What the project is and must do: `./.workflow/SPEC.md`.                                                                         |
| **Plan**                | How the specification gets built, split into segments: `./.workflow/PLAN.md`.                                                   |
| **Segment**             | A part of the plan that's planned, approved and implemented as a unit; segments can have child segments.                        |
| **Session state**       | `./.workflow/STATE.md`: where the work stopped, what's waiting on whom (you, others, running tasks), and the milestone history. |
| **Resume**              | Also: continue. Start a session: the agent reads the session state and reports where the work stopped.                          |
| **Dialog**              | Up to 4 questions with up to 4 options each, in a question box or as a numbered list; the agent waits for your answers.         |
| **PROPOSE**             | The agent suggests something, with its reasoning, in a dialog, and acts only after your explicit yes.                           |
| **Approval**            | Your explicit yes to a named item (the specification, a plan segment, an implemented step).                                     |
| **Go-ahead**            | Your yes to start something (a review, a spike, a subagent run); it isn't an approval.                                          |
| **Checkpoint**          | The review dialog after each implemented segment or fast-path change.                                                           |
| **Fast path**           | Also: quick fix. The shortcut for small, self-contained changes: one-line plan, the change, one checkpoint.                     |
| **Hard rule**           | A rule on how work is done that nothing (no file, task or agent) can relax; only you can grant an exception, for one action.    |
| **Open point**          | Something found while working on one stage or segment that belongs to another, recorded there instead of acted on out of turn.  |
| **Pitfall**             | A risk that could make the work stall or backtrack later, recorded in the specification as soon as it's noticed.                |
| **Known open issue**    | An item you chose to defer, recorded in the plan with the reason, until it's picked up or dropped.                              |
| **Spike**               | A small, throwaway prototype that settles whether an approach works, before planning on top of it.                              |
| **Zero-context review** | A review by fresh agents that know nothing of the conversation, reading only the files they're given.                           |
| **Working files**       | Throwaway files under `./.workflow/.temp/<topic>/`, deleted once you confirm their results are written where they belong.       |
| **Subagent**            | Any agent, session or script the agent delegates work to; it's bound by the hard rules and the rest of its brief.               |
| **Stray write**         | A change no one asked for, found by comparing the repository with a snapshot taken before subagents ran; it's reported to you.  |
| **Green**               | The repository builds, its full test suite passes, and its linters and formatters pass, as far as it has them.                  |
| **Glossary**            | The project's domain terms, for what is built, in the first section of this file with "Glossary" in its heading.                |

### Advanced workflow

This repository also uses the advanced workflow, for keeping a complex specification and plan traceable over time.

#### How it works

- **Every item is tagged**, and tags are never renumbered or reused; untagged prose is only context. In documents, tags are written as italic code (_`D3`_) so they stand out:

  | Tag  | Meaning                                                               |
  | ---- | --------------------------------------------------------------------- |
  | `D3` | A decision: one thing a segment requires or decides                   |
  | `S2` | A specification segment (`S2.1`, `S2.1.1`, … for its children)        |
  | `P4` | A plan segment (`P4.1`, … for its children)                           |
  | `O1` | An open point                                                         |
  | `L1` | A known open issue                                                    |
  | `R1` | A revision of an approved segment                                     |
  | `H1` | A hard rule (the HARD RULES are a specification segment of their own) |
  | `K1` | A pitfall                                                             |

- **Approval lines**: the specification, the plan and every segment open with their status: `draft`, `approved <date>`, `revised <date> (R<n>), pending re-approval`, `implemented <date>` or `merged into P<n>`. Approving a parent segment doesn't approve its draft children.
- **Append-only decision logs**: in normal work, decisions are never rewritten or deleted. A change adds a new decision, and the old one's status points to it: `refined by`, `changed by`, `replaced by` or `superseded by`. Only statuses, approval lines, ticks and noted wording fixes change in place. Reading the statuses tells you what's currently in force.
- **Extracted files**: parts of the specification or plan can move into their own files when that helps, e.g. `./.workflow/PLAN-P2-uploads.md`, linked from `SPEC.md` or `PLAN.md`. Pitfalls live in `./.workflow/SPEC-pitfalls.md`.
- **Drift and re-approval**: wording fixes to an approved segment need no re-approval, but any change in scope does. When work on a child segment changes its parent, the parent is marked `revised` and re-approved together with the child.
- **Compaction**: once a log grows long, the agent may propose compacting it down to the decisions in force, on your go-ahead, as a commit of its own; the full history stays in git, and **stubs** keep dropped tags that are still referenced.

#### Terminology (advanced)

| Term                | Meaning                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Tag**             | An item's permanent identifier (e.g. `D3`, `S2.1`), never renumbered or reused.                                   |
| **Decision**        | A tagged bullet (`D<n>`) recording one thing a segment requires or decides.                                       |
| **Decision log**    | An append-only document of decisions: the specification, the plan and their extracted files.                      |
| **Decision status** | Whether a decision is in force: `live`, `refined by`, `changed by`, `replaced by` or `superseded by`.             |
| **Approval line**   | The status line a document or segment opens with: `draft`, `approved`, `revised`, `implemented` or `merged into`. |
| **Revision**        | A tagged note (`R<n>`) on an approved segment that a later decision changed.                                      |
| **Drift**           | A decision in a child segment that changes its parent segment or the specification.                               |
| **Compaction**      | Rewriting a decision log down to the decisions in force.                                                          |
| **Stub**            | The one line left in place of a tag dropped by compaction while it's still referenced.                            |
| **Extracted file**  | A part of the specification or plan moved into its own `SPEC-…` or `PLAN-…` file.                                 |
| **Evidence**        | The note under a decision recording a spike's conclusions.                                                        |
| **Next free**       | The session state's line with the next free number of each tag type.                                              |

#### What to watch out for

- Don't edit decisions or tags by hand; ask the agent for the change, so that it's recorded as a new decision with its relations.
- Refer to items by their tag when asking for changes (e.g. "replace D12", "resolve O3"); tags are how the agent finds and links them.

<!-- </@ofzza/repo-skill:contribute> -->
