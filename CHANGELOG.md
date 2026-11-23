# Changelog

All notable changes to `@ofzza/showroom`, by version as published to npm. This project is before its 1.0 release, so any version may change what it does; the showcase adapter interface (`ShowcaseAdapter` and its types) is experimental, and may change in any release until it is declared stable.

## Unreleased

### Breaking changes

- **`showroom.json`'s `sourceRoot`, `ignore`, `code` and `documentation` moved into `project`**: at the top level, they are now unknown keys. Write `{ "stack": "typescript", "project": { "sourceRoot": "lib", "ignore": ["vendor/"] } }` where you wrote `{ "stack": "typescript", "sourceRoot": "lib", "ignore": ["vendor/"] }`.
- **`showroom.json`'s `project` is an object only**: the project file's path is now its `path`. Write `"project": { "path": "src/App/App.csproj" }` where you wrote `"project": "src/App/App.csproj"`; a string is an error saying so.
- **`stack` alone decides whether a stack adapter runs**: a stack adapter's name, exactly as written, runs it; any other name, or none, runs none. A name that is no stack adapter's is no longer an error by itself: without a stack adapter, `project` must give a `name`, and the error for a missing one says that `stack` names no stack adapter, listing them. A stack adapter's name in another case is still an error.
- **`Configuration`** (`readConfiguration()`, `validateConfiguration()`): `stack` is optional, `project` is a `ProjectConfiguration` (below), and `sourceRoot`, `ignore`, `code` and `documentation` are gone from it.
- **`StackAdapter.readProject()` resolves to `Partial<ProjectInformation>`**: a project file may give no `name`, as `showroom.json`'s `project` can; the `typescript` stack adapter no longer fails on a `package.json` without one, and `showroom` requires a name once both are merged.
- **The showcase adapter interface's `ShowcaseBuildRequest.project` and `ShowcaseCheckContext.project` are a `ShowcaseProject`** (experimental), always given: the merged project, not `showroom.json`'s `project` as written.
- **Error messages name the new keys**: `"project": "path" "<path>" is outside the host repository` (was `Project "<path>" is …`), `"project": "sourceRoot" "<path>" is outside the host repository` (was `Source root "<path>" is …`), and the `dotnet` stack adapter's `"project": "path"`.

### Added

- **Project overrides**: `showroom.json`'s `project` overrides what the stack adapter gives, whichever stack adapter runs: `path`, the project information (`name`, `version`, `description`, `license`, `author`, `homepage`, `repository`), `sourceRoot`, and `ignore`, `code` and `documentation`, appended to the stack adapter's patterns. `null` unsets a value: a field is dropped, `sourceRoot` falls back to the root, and a pattern list drops the stack adapter's patterns. See README.md › Configuration › `project`.
- **Host repositories without a stack adapter** (e.g. a Java one): with a `stack` naming no stack adapter (`custom` if left out), no stack adapter runs, and `project` gives the project information itself, `name` required. There are no defaults: the source root is the root, and nothing is code or ignored unless `project`'s `code` and `ignore` say so. See README.md › Without a stack adapter.
- **`StackAdapter.defaultProject`**: the project file a stack adapter reads by default (`package.json` for `typescript`, none for `dotnet`).
- **The types `ProjectConfiguration`** (`showroom.json`'s `project`) **and `ShowcaseProject`** (experimental: the merged project information, `path`, `sourceRoot`, and every pattern that applies, as showcase adapters get it).

### Changed

- **No host check runs when the check has no project**: when the stack adapter can't read the project file, or the merged project has no name, `check` still reports every other issue, but runs no showcase adapter's host check.

## 0.1.0-alpha.3 (2026-11-18)

### Breaking changes

- **`showroom` runs the host repository's code only when you trust it**: pass `--trust` to `check`, `serve` or `build` (or `trust: true` to `check()`). Without it, no custom showcase adapter is loaded, no host check runs, no tool is loaded from the host repository (its TypeScript, Angular's compiler, a CSS preprocessor), and no showcase is built, `html` included: every showcase shows its source, with a notice in place of its status marks, `check`, `serve` and `build` warn, and `build` publishes a showroom of the sources. Add `--trust` where you build or check your own repository, e.g. in CI (see README.md › Trust; its GitHub Pages recipe now builds and deploys in two jobs).

### Added

- **`--trust` and `--no-trust`** on every command; `--no-trust` runs without trust, without asking or warning about it.
- **The trust prompt**: without either flag, and when the host repository has something to trust, `showroom` asks in a terminal whether to trust it, naming what would run (`[y/N]`); with no terminal, it runs without trust, and warns. Ctrl-C at the prompt ends the command with exit code `130`. A trusted `serve` writes a notice whenever it loads a custom showcase adapter module it hadn't loaded yet.
- **`main()`'s third parameter, `input`** (`CliInput`, the new type): what the prompt asks through; the terminal on standard input by default, never a pipe.
- **`CheckOptions.trust`** (`false` by default, `true`, or a function given a `TrustRequest`, the new type naming what would run), and **`CheckResult.trusted`**.
- **The `cs` showcase adapter**: C# showcases, each one `.cs` file built and run with the host's .NET SDK (10 or later, 11 included) as a file-based app, referencing the host's projects and packages with its own `#:project` and `#:package` directives, its output recorded; its compiler errors and its own warnings are its issues. It needs the .NET SDK on the `PATH`, which its host check verifies without running anything of the host repository. See README.md › `cs` showcases, and its example, `examples/cs/`.
- **The `jsonschema` showcase adapter**: JSON Schema showcases, each one schema (a `json` code block, or a linked `.json` file) drawn as a class diagram of its definitions and how they reference one another, in the showroom's theme. It reads the schema with `@ofzza/tsschema` (a new dependency, pinned) and draws it with Mermaid, both coming with `showroom`, so it needs nothing from the host repository; its syntax errors, Mermaid's limits, and what `tsschema` doesn't read yet (`definitions`, references into other files, `properties` without `"type": "object"`) are its build's issues. See README.md › `jsonschema` showcases, and its example, `examples/jsonschema/`.
- **The shared Mermaid bundle**: the package now ships Mermaid, bundled, in `dist/mermaid/` (about 3.85 MB, so the package unpacks to about 4.9 MB), and `build` writes it into the output folder's `mermaid/` folder when it builds a `jsonschema` showcase.
- **Recorded showcases** (experimental): a showcase adapter can build and run its showcases as programs on the machine running `showroom`, in a copy of the host repository in the user's cache folder, and record what they print and how they ended. The showroom shows the recording in the `console` view, titled "Recorded output", ending in how the run ended, with a `runtime` status mark "recorded when built"; a failed recording (a non-zero exit code, the time limit, a signal, or anything on standard error) is an error of `check --showcases` and `build`, quoting the first line written to standard error. Programs run with a cleaned environment, their input closed, a time limit (30 s, 300 s for a build step) and their output capped (1 MB); see README.md › Recorded showcases.
- **`--pass-env <name>`** on every command (and `CheckOptions.passEnv`): passes an environment variable on to recorded showcases' build steps, never to their recorded run.
- **The showcase adapter interface** (experimental): `ShowcaseAdapter.recorded` and `hostCopy`; `ShowcaseBuildRequest`'s `project`, `stack`, `hostCopy` (with `run()`) and `showcaseFolder`; `ShowcaseBuildResult.recording`; and the types `ShowcaseCheckContext`, `ShowcaseHostCopyContent`, `ShowcaseHostCopy`, `ShowcaseRunOptions`, `ShowcaseRun`, `ShowcaseRecording` and `ShowcaseConsoleLine`.
- **`TrustRequest.executables` and `recorded`**: the programs the built-in showcase adapters would start (the `cs` showcase adapter's `dotnet`, and the SDK folders a `global.json` names inside the host repository), and how many showcases would be recorded; the prompt names them.

### Changed

- **A host check gets a third argument**, `context` (`ShowcaseCheckContext`: the configured `project` and `stack`); and a showcase adapter's `checks` can't list `runtime`, which `showroom` adds for a recording.
- **`cs` is a built-in showcase adapter's name**: a custom showcase adapter can't take it.
- **The fence languages `csharp` and `c#` give a code block showcase's entry point the `.cs` extension**, as `cs` does.
- **Control characters from the host repository are shown escaped** (e.g. `\x1b`) in everything `showroom` writes to the terminal: the issues, the prompt and its notices.
- **`serve` sends linked files with `X-Content-Type-Options: nosniff`**, and without trust, linked `.html`, `.htm`, `.svg`, `.xml` and `.xhtml` files as plain text.
- **A navigation item's URL must be `http:`, `https:`, `mailto:` or protocol-relative**: any other scheme (e.g. `javascript:`) is an error.
- **`build` refuses an output folder that is a symbolic link**, or that leads outside the host repository through one.
- **The showroom's own Vite reads no PostCSS configuration, `.env` files or public folder**, which it looked for from its folder up, inside the host repository when `showroom` is installed in it.

### Fixed

- **A project name holding `$&` or `$'`** no longer garbles the showroom page's title.
- **The bundler's plugin timings** ("JavaScript callbacks ran for 3.3s of this 3.8s build") are no longer reported as a showcase's build warning: they say nothing the host repository can act on, and came and went with the machine's speed.

## 0.1.0-alpha.2 (2026-11-16)

### Breaking changes

- **`ShowcaseAdapter.build()` returns `issues` and `checks`** instead of `errors` and `warnings` (since `0.1.0-alpha.1`): `issues` is one list of `ShowcaseBuildIssue`s (replacing `ShowcaseBuildError`), each with its `severity` (`error` or `warning`) and, for an issue of a check, the `check` it belongs to, one of the result's `checks` (e.g. `type check`). An error naming no check means there are no files; a check's errors leave them usable.
- **`VirtualFile`'s `kind` gives way to `named` and `showcase`**, and `VirtualFileKind` is removed: "resources" are now virtual files with no showcase adapter (`showcase file=<name>`), and `file=` can also name a code block showcase's virtual file.
- **`showroom.json`'s `exposeShowcaseMarkdownSyntax` is removed**: list `markdown` in a showcase's `include=` instead, for a tab showing it as written.
- **A linked showcase shown inline is a link opening the showcase sidebar**, which shows it as a block shows it, with no showcase views by default (`view=demo` runs it there), instead of a showcase frame before its paragraph.

### Added

- **Navigation from `showroom.json`**: `navigation` lists pages (documentation files, with an optional heading anchor, the home page, absolute URLs and patterns) and groups, nested to any depth; a documentation file may be listed again under another anchor. `check()` gives it as `HostInformation.navigation` (`NavigationItem`; `NavigationEntry` in the configuration).
- **The default navigation labels each documentation file by its first heading** (`DocumentationFile.heading`), or by its path when it has none or the label is taken.
- **Showcase views**: a showcase shown as a block is shown by its `markdown`, `source`, `demo` and `console` views, or `none`, chosen by its marker's `view=`, `showroom.json`'s `showcaseViews`, or its showcase adapter's defaults (`ShowcaseAdapter.defaultViews`; `source,console` for `ts` showcases, `demo` for the others); `Showcase.views`.
- **Status marks and an issue list** on every showcase block (`build`, each check, and `runtime`), with the issues' lines marked in its code; a showcase that doesn't build shows "Not built". `serve` updates them without reloading the page.
- **The console panel is the showroom's**, over every showcase frame, `html` ones included, capturing the page's console from its start.
- **`include=` takes the keywords `source` and `markdown`**, placing the entry point's tab and a tab showing the showcase as written among the included files (`Showcase.tabs`, `ShowcaseTab`).
- **Named virtual files**: `file=` names a code block showcase's virtual file, so other showcases can use it by a name that doesn't change when a showcase is added above it.
- **The `dotnet` stack adapter**, for .NET host repositories (`DotNetStackAdapter`), and `showroom.json`'s `project` key, naming the project file.

## 0.1.0-alpha.1 (2026-11-14)

First published version.
