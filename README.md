# `showroom`

[![npm](https://img.shields.io/npm/v/@ofzza/showroom)](https://www.npmjs.com/package/@ofzza/showroom)

Build a showroom for a repository: its documentation, enriched by showcases.

`showroom` turns a repository's Markdown documentation into a static site, the showroom, where showcases embedded in the documentation run live, right where the documentation describes the code they demonstrate. The documentation stays plain Markdown, which reads as well on GitHub or npm; `showroom` checks it, previews it while you write, and builds it for static hosting such as GitHub Pages.

See this repository's own showroom, built by `showroom` itself: [ofzza.github.io/showroom](https://ofzza.github.io/showroom/).

---

Jump to section:

- [Get `showroom`](#get-showroom)
- [Quick start](#quick-start)
- [Usage](#usage)
  - [How it works](#how-it-works)
  - [Trust](#trust)
  - [Configuration: `showroom.json`](#configuration-showroomjson)
    - [`project`](#project)
  - [Patterns](#patterns)
  - [Documentation files](#documentation-files)
  - [Navigation](#navigation)
  - [Stack adapters](#stack-adapters)
    - [Without a stack adapter](#without-a-stack-adapter)
  - [Showcases](#showcases)
    - [Built-in showcase adapters](#built-in-showcase-adapters): [`html`](#html-showcases), [`ts`](#ts-showcases), [`react`](#react-showcases), [`angular`](#angular-showcases), [`cs`](#cs-showcases), [`jsonschema`](#jsonschema-showcases)
  - [Custom showcase adapters (experimental)](#custom-showcase-adapters-experimental)
  - [Linked files](#linked-files)
  - [The showroom](#the-showroom)
  - [`showroom check`](#showroom-check)
  - [`showroom serve`](#showroom-serve)
  - [`showroom build`](#showroom-build)
  - [Publishing to GitHub Pages](#publishing-to-github-pages)
  - [Troubleshooting](#troubleshooting)
  - [API](#api)
- [Development](#development)
- [Contributing](#contributing)

# Get `showroom`

`showroom` is published as an NPM package. It needs Node.js 22 or 24, the versions it is tested on. Install it in the host repository, and run it through `npx`:

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

A host repository with no `package.json` of its own (e.g. a .NET one) can run it the same way, with Node installed: `npx --package @ofzza/showroom showroom build`. It uses the stack adapter for its kind of repository, `typescript`, or `dotnet` for a .NET one; a repository whose stack has none (e.g. a Java one) gives its project information in `showroom.json` instead (see [Stack adapters](#stack-adapters)).

# Quick start

In a TypeScript or JavaScript repository with a `package.json`:

1. Install `showroom` as a devDependency:

   ```sh
   $ npm install --save-dev @ofzza/showroom
   ```

2. Add a `showroom.json` to the repository's root:

   ```json
   { "stack": "typescript" }
   ```

   The `typescript` stack adapter reads the project information from `package.json`, whose `name` is required unless `showroom.json`'s `project` gives one, and looks for code under `src/`: if your code isn't in `src/`, set `project`'s `sourceRoot` too (e.g. `{ "stack": "typescript", "project": { "sourceRoot": "lib" } }`), as a missing source root is an error.

3. Add a first showcase to your `README.md`: a code block whose language, `html`, is followed by `showcase`:

   ````md
   ```html showcase
   <button onclick="this.textContent = 'Clicked!'">Click me</button>
   ```
   ````

   On GitHub or npm, it is still an ordinary, highlighted code block; in the showroom, the button runs in its showcase frame, its code a click away.

4. Preview the showroom, and keep it open while you write: it updates as you edit. `--trust` lets `showroom` run your repository's code, its showcases included; without it, `showroom` asks in a terminal, and if you don't say yes, every showcase shows its source (see [Trust](#trust)).

   ```sh
   $ npx showroom serve --trust
   ```

5. Build it, as static files, into `./showroom/` (add that folder to your `.gitignore`), and publish it, e.g. [to GitHub Pages](#publishing-to-github-pages):

   ```sh
   $ npx showroom build --trust
   ```

Then read on: [Showcases](#showcases) for what else a showcase can be (TypeScript, React, Angular, or your own), and [Configuration](#configuration-showroomjson) for what `showroom.json` can set.

# Usage

## How it works

```text
showroom.json + documentation files (README.md, CONTRIBUTE.md, LICENSE.md, ...)
        |
        v
showroom check
        |-- stack adapter (or showroom.json's project): the project information, and the code file index
        |-- Markdown scan: showcases, virtual files, links, images, headings
        |-- showcase adapters: each showcase validated, and their host checks
        v
host information
        |-- showcase adapters: each showcase built into its showcase frame (check --showcases, serve, build)
        |
        |--> showroom serve: the showroom, previewed, checked and built again after every change
        '--> showroom build: the showroom, as static files in the output folder
```

`showroom` reads a host repository and collects its host information: the project information, the documentation files, an index of its code files (in `check`'s output and the [API](#api); the showroom doesn't show it yet), the showcases its documentation files embed, and the files they link to. The core terms:

- **Host repository**: the repository that uses `showroom`, and that the showroom presents.
- **Documentation file**: a file in the host repository found by the built-in patterns and the `documentation` patterns, and shown in the showroom, a page each.
- **Showcase**: a component demonstrating the usage of a unit of the host repository (a service, hook, directive, component, …), embedded in a documentation file, built by a showcase adapter, and shown in the showroom by its showcase views.
- **Showcase adapter**: an implementation of the common interface for building showcase frames for one kind of code (HTML, TypeScript, React, Angular, or the host repository's own), chosen per showcase by its marker.
- **Showcase frame**: the page that renders one showcase, in isolation, embedded in the showroom with an iframe.

The command line is `showroom <command> [options]`, with three commands, [`check`](#showroom-check), [`serve`](#showroom-serve) and [`build`](#showroom-build). `showroom --help` writes its usage to `stdout`. A missing or unknown command, an unknown option, an option the command doesn't take (e.g. `--port` with `check`), a `--port` that isn't a whole number from 1 to 65535, a `--pass-env` name that is empty or holds `=`, or `--trust` with `--no-trust` writes what is wrong, and the usage, to `stderr`, and exits with `1`. Ctrl-C at the [trust](#trust) prompt ends the command, with `130`.

## Trust

A host repository's showcases, its custom showcase adapters and the tools its showcases are built with are its code: building its showroom runs that code on your machine, with your rights, and its showcases run in your browser. `showroom` runs none of it unless **you trust the repository**: pass `--trust` to any command, or answer yes when it asks (in a terminal, naming what would run; `--no-trust` runs without trust, without asking). Without trust, `showroom` still checks the documentation, and every showcase shows only its source.

Trust protects you only while `showroom` comes from outside the repository, as one the repository installs is its code already. To read a repository you don't trust, don't install its dependencies, and run `showroom` from elsewhere:

```sh
$ cd ~ && npx --yes @ofzza/showroom serve --root ./path/to/their-repository
```

In CI, a trusted `showroom` runs the repository's code with the job's access: keep secrets out of its step's environment, check out with `actions/checkout`'s `persist-credentials: false`, and never pass `--trust` in a `pull_request_target` workflow or for pull requests from forks ([Publishing to GitHub Pages](#publishing-to-github-pages) shows a workflow that builds in a job that can only read the repository).

## Configuration: `showroom.json`

Every host repository needs a `showroom.json` file in its root. Without it, `showroom` stops with an error.

```json
{
  "stack": "typescript",
  "project": {
    "sourceRoot": "src",
    "ignore": ["examples"],
    "code": ["!*.test.ts"],
    "documentation": ["docs/*.md"]
  }
}
```

| Key                      | Required | Default             | Meaning                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stack`                  | no       | `custom`            | Name of the host repository's stack. A [stack adapter](#stack-adapters)'s name, exactly as written (`typescript`, `dotnet`), runs that stack adapter; any other name runs none, [without a stack adapter](#without-a-stack-adapter), and only names the stack for showcase adapters. A stack adapter's name in another case (e.g. `TypeScript`) is an error. |
| `project`                | no       | the stack adapter's | The project: the project file, the project information, the source root and the patterns, each overriding what the stack adapter gives (see [`project`](#project)). Without a stack adapter, it must give the project's `name`.                                                                                                                              |
| `outDir`                 | no       | `./showroom`        | Output folder of `showroom build`, relative to the host repository's root. It must be inside the host repository, and isn't its root. Nothing in it is ever collected.                                                                                                                                                                                       |
| `customShowcaseAdapters` | no       | `{}`                | Experimental: [custom showcase adapters](#custom-showcase-adapters-experimental), as `{ "<name>": "<path>" }`.                                                                                                                                                                                                                                               |
| `showcaseViews`          | no       | `{}`                | Default [showcase views](#showcase-views) by showcase adapter, in place of the showcase adapter's own, as `{ "<adapter>": "<view>" }` or `{ "<adapter>": ["<view>", "<view>"] }`. A name that is neither a built-in showcase adapter's nor one of `customShowcaseAdapters` is an error.                                                                      |
| `navigation`             | no       | the default one     | The showroom's [navigation](#navigation): its pages and groups, in their order, in place of the default one.                                                                                                                                                                                                                                                 |

Any other key is an error, which catches typos.

### `project`

`project` is an object; every key is optional. Each one overrides what the stack adapter gives, and `null` unsets it: the stack adapter's value is dropped, as if it gave none. Without a stack adapter, `null` is the same as leaving a key out.

| Key                                                                             | Default             | Meaning                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`                                                                          | the stack adapter's | File the stack adapter reads the project information from, relative to the host repository's root, and inside it (`package.json` for `typescript`; the `dotnet` stack adapter requires it). Without a stack adapter, nothing reads it, so it is an error. |
| `name`, `version`, `description`, `license`, `author`, `homepage`, `repository` | the stack adapter's | The project information, each a string, in place of what the stack adapter reads. The project must end up with a `name`: `name: null`, or a project file without one and no `name` here, is an error.                                                     |
| `sourceRoot`                                                                    | the stack adapter's | Source root directory, relative to the host repository's root. Code files are only looked for under it. It must exist. With `null`, or with no stack adapter, the root.                                                                                   |
| `ignore`                                                                        | `[]`                | [Patterns](#patterns) of files to ignore, appended to the stack adapter's; `null` drops the stack adapter's.                                                                                                                                              |
| `code`                                                                          | `[]`                | [Patterns](#patterns) of code files, relative to the source root, appended to the stack adapter's; `null` drops the stack adapter's. The code file index is in `check`'s output and the [API](#api); the showroom doesn't show it yet.                    |
| `documentation`                                                                 | `[]`                | [Patterns](#patterns) of documentation files, appended to the built-in ones and the stack adapter's; `null` drops the stack adapter's, never the built-in ones.                                                                                           |

E.g. a TypeScript library whose `package.json` has no `name`, whose code is in `lib/`, and which ignores nothing the stack adapter would:

```json
{ "stack": "typescript", "project": { "name": "my-library", "sourceRoot": "lib", "ignore": null } }
```

## Patterns

`project`'s `ignore`, `code` and `documentation` are each a list of patterns that work like a `.gitignore` file:

- The stack adapter's patterns come first, and the configuration's are appended to them; a list given as `null` drops the stack adapter's (an empty list keeps them).
- They're applied in order, and the last pattern matching a file wins. A pattern starting with `!` re-includes what an earlier one matched, e.g. `!dist` in `ignore` stops ignoring `dist`, or `!*.test.ts` in `code` drops test files from the code file index. As in `.gitignore`, a file can't be re-included if a folder it's in is ignored: ignore `vendor/*` and re-include `!vendor/keep`, rather than ignoring `vendor`.
- A pattern with a `/` at its start or in its middle is anchored to the host repository's root (to the source root, for `code`). One without a `/`, or with a `/` only at its end, matches at any depth; a trailing `/` makes it match folders only (e.g. `build/` ignores every `build` folder, but no file named `build`).
- Matching is case-insensitive.

Ignored files are left out of everything: the documentation files and the code file index. Symbolic links are not followed.

## Documentation files

`showroom` collects these documentation files, matching their names regardless of case, in UK or US spelling, and with the `.md` or `.txt` extension or none:

- `README` files anywhere in the host repository;
- `LICENSE` (or `LICENCE`) and `CONTRIBUTE` (or `CONTRIBUTING`) in the host repository's root.

The stack adapter's and the configuration's `documentation` patterns can add more files, or remove these with `!` (e.g. `!README.txt`). If one folder holds several files of the same kind (e.g. `README.md` and `README.txt`), `showroom` keeps one of them, preferring `.md`, then no extension, then `.txt`, and reports a warning.

Any other Markdown file (e.g. `docs/guide.md`) isn't a documentation file until a `documentation` pattern adds it (e.g. `"project": { "documentation": ["docs/*.md"] }`): until then, it has no page, and a link to it opens its source in the [showcase sidebar](#the-showcase-sidebar), as a [linked file](#linked-files).

## Navigation

The showroom's navigation lists its pages. Without `navigation` in `showroom.json`, it is the default one: `README` (the home page), `CONTRIBUTING` and `LICENSE` first, whatever the root files' actual names (e.g. `CONTRIBUTE.md`, `LICENCE.txt`), then every other documentation file, in path order, labelled by its first heading (of any level, as plain text), or by its path when it has none, or when another item has the same label. Each item shows its documentation file's path as its tooltip.

With `navigation`, the showroom shows yours instead: a list of items, each a page or a group of items. Every page it lists must be a documentation file, so this one adds `docs/*.md` to the documentation files first:

```json
{
  "stack": "typescript",
  "project": { "documentation": ["docs/*.md"] },
  "navigation": [
    { "path": "/" },
    { "title": "Guide", "items": [{ "path": "docs/guide.md" }, { "title": "Installing", "path": "docs/guide.md#install" }] },
    { "title": "Examples", "items": [{ "title": "The first one", "path": "examples/first/README.md" }, { "path": "examples/*/README.md" }] },
    { "title": "npm", "path": "https://www.npmjs.com/package/my-library" },
    { "title": "License", "path": "LICENSE.md" }
  ]
}
```

- A **page** has a `path`, and an optional `title`, its label; without one, it is labelled by its documentation file's first heading, or its path when it has none. Its `path` is one of:
  - a documentation file's path, relative to the host repository's root, matched as the showroom's addresses are (regardless of case, a leading `./` dropped), optionally followed by `#<heading id>` to open the page at that heading (the ids are the ones GitHub gives headings);
  - `/`, the home page, as is the root `README`'s path, also with a `#<heading id>` (e.g. `/#install`); without a `title`, it is labelled by the root `README`'s first heading, or else the project's name;
  - an absolute URL, `http:`, `https:` or `mailto:` (e.g. `https://…`), or protocol-relative (`//…`), opened in a new tab; it needs a `title`;
  - a [pattern](#patterns), e.g. `examples/*/README.md` (a path holding `*`, `?` or `[`), standing for a page per documentation file it matches, in path order, each labelled by its first heading (a pattern takes no `title`). It skips the files the navigation lists anywhere else by their path, and the files an earlier pattern took, so it means "the rest of these". A `#<heading id>` after a pattern applies to every page it matches.

  A `path` can't start with `!`: unlike the other patterns, the navigation's only add pages.

- A **group** has a `title`, its caption, and `items`, a non-empty list of items, groups included, to any depth. Each group starts expanded, and its caption collapses and expands it; the group holding the current item expands again whenever the current item changes. A group whose items all lead nowhere (e.g. a pattern that matches nothing) is left out.

A documentation file can be listed more than once, under different anchors: e.g. `README.md` as the home page, `/`, and again as `/#install`. The navigation highlights one item as the current one: of the items of the page shown, the one whose anchor the address names, else the first without an anchor, else the first. A documentation file the navigation doesn't list is left out of it, but its page still opens from a link or by its address, with no item highlighted as the current one.

`showroom check` reports the navigation's issues:

| Case                                                                                                                                                                                                                                                        | Issue                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| An invalid item: e.g. an unknown key, both a `path` and `items`, a group with no `title` or no `items`, an empty `title` or `path`, a URL without a `title` or of another scheme (e.g. `javascript:`), a pattern with a `title`, a `path` starting with `!` | error, naming its position, e.g. `"navigation" item 2.1` for the first item of the second |
| A path that leads to no documentation file                                                                                                                                                                                                                  | error                                                                                     |
| A documentation file the navigation doesn't list                                                                                                                                                                                                            | warning, about that file                                                                  |
| A pattern that matches no documentation file the navigation doesn't already list                                                                                                                                                                            | warning                                                                                   |
| The same page listed twice with the same anchor, or twice without one                                                                                                                                                                                       | warning                                                                                   |
| An anchor that leads to no heading of its file                                                                                                                                                                                                              | warning                                                                                   |

## Stack adapters

A stack adapter handles one kind of host repository: it reads the project information and sets the default source root and patterns, which `showroom.json`'s [`project`](#project) can override. The `stack` key selects one by its name, exactly as written.

| Stack adapter | Project information       | Source root | Code (`code`)                                                            | Ignored (`ignore`)                                      | Documentation (`documentation`) |
| ------------- | ------------------------- | ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------- |
| `typescript`  | `package.json`            | `src`       | `*.ts`, `*.tsx`, `*.mts`, `*.cts`, `*.js`, `*.jsx`, `*.mjs`, `*.cjs`     | `.git`, `node_modules`, `dist`, `coverage`              | none beyond the built-in ones   |
| `dotnet`      | `project.path` (required) | `src`       | `*.cs`, `*.csx`, `*.fs`, `*.fsi`, `*.fsx`, `*.vb`, `*.razor`, `*.cshtml` | `.git`, `.vs`, `bin`, `obj`, `artifacts`, `TestResults` | none beyond the built-in ones   |

The `typescript` stack adapter reads the `name`, `version`, `description`, `license`, `author`, `homepage` and `repository` fields of `package.json`, or of the file `project.path` names.

The `dotnet` stack adapter reads the project file `project.path` names (a `.csproj`, `.fsproj` or `.vbproj`; a repository can hold many, so it never picks one itself), for .NET host repositories in C#, F# or VB:

```json
{ "stack": "dotnet", "project": { "path": "src/MyLibrary/MyLibrary.csproj" } }
```

It reads the file as XML, with no .NET SDK, after the nearest `Directory.Build.props` (in the project file's folder, or the first folder above it, up to the host repository's root), whose properties the project file's override:

| Project information | MSBuild property                                                         |
| ------------------- | ------------------------------------------------------------------------ |
| name                | `PackageId`, else `AssemblyName`, else the project file's name           |
| version             | `Version`, else `VersionPrefix` (with `-` and `VersionSuffix`, when set) |
| description         | `Description`                                                            |
| license             | `PackageLicenseExpression`                                               |
| author              | `Authors`                                                                |
| homepage            | `PackageProjectUrl`                                                      |
| repository          | `RepositoryUrl`                                                          |

Only properties of `<PropertyGroup>`s directly in `<Project>` count, and only where neither the group nor the property has a `Condition`. A `$(Name)` reference is replaced by that property's value, as set so far in these two files (or the project file's name, for `$(MSBuildProjectName)`), and a value with a reference it can't replace (another property, or a property function such as `$([System.DateTime]::Now.Year)`) is left out. So what MSBuild only works out when it builds (conditions, other imported files, the SDK's defaults, a version computed from git) isn't shown: set such a value unconditionally in the project file or its `Directory.Build.props` for the showroom to show it.

In a .NET host repository:

- The source root is `src` by default, and must exist: set `project`'s `sourceRoot` where the code isn't under `src/` (e.g. `"project": { "path": "MyLibrary.csproj", "sourceRoot": "." }`).
- `html` showcases need nothing from it, and [custom showcase adapters](#custom-showcase-adapters-experimental) need what they need.
- `ts` showcases need the packages they import installed in its `node_modules`, and TypeScript to type check (a `package.json` with `typescript` in its `devDependencies`, installed), or `typeCheck: false`; `react` and `angular` showcases need their packages installed the same way (see [Showcases](#showcases)).
- `cs` showcases need the .NET SDK 10 or later on the `PATH` (see [`cs` showcases](#cs-showcases)); reading the project information never does.

### Without a stack adapter

A host repository whose stack has no stack adapter (e.g. a Java one) names its stack otherwise, or leaves `stack` out, and gives its project information in `showroom.json`'s [`project`](#project): `name` (required), `version`, `description`, `license`, `author`, `homepage` and `repository`. No stack adapter runs, and nothing is read for the project information:

```json
{
  "stack": "java",
  "project": {
    "name": "my-library",
    "version": "1.2.0",
    "description": "A Java library",
    "license": "MIT",
    "ignore": [".git", "node_modules", "target"],
    "code": ["*.java"]
  }
}
```

- `stack` is optional, and names the stack for [custom showcase adapters](#custom-showcase-adapters-experimental), which get it in their host check's `context` and build's request (`custom` if left out). A mistyped stack adapter's name runs no stack adapter either: the missing `name`'s error, or `path`'s, then says that `stack` names no stack adapter.
- `project` can't give a `path`, as nothing reads it.
- There are no defaults: the source root is the host repository's root, nothing counts as code unless `code` says so, and nothing is ignored unless `ignore` says so, not even `.git` or `node_modules`. Set `ignore` as above: otherwise `.git` is walked, and every `README` under `node_modules` (e.g. a custom showcase adapter's dependencies) or a build's output (`target`) is a documentation file.
- Showcases work as in any host repository: `html` showcases need nothing from it, custom showcase adapters bring what they need (e.g. one building and running Java), and the other built-in ones need what they always need (see [Showcases](#showcases)).

## Showcases

A showcase demonstrates a unit of the host repository (a component, a service, ...) live, in the showroom, right where its documentation describes it. Showcases are embedded in Markdown documentation files (`.md`), so the documentation still reads as plain Markdown anywhere else, e.g. on GitHub. A showcase adapter, which the showcase's marker names, builds each showcase into a showcase frame.

> Showcases are shown by `showroom build` and `showroom serve`, each in its [showcase frame](#showcase-frames). `showroom serve` also updates them as you edit them.

The **showcase marker** is `showcase`, `showcase=<adapter>`, or `showcase=<adapter>(<options>)`, followed by space-separated keys:

- `<adapter>` names the showcase adapter: lower-case letters, digits and `-`, starting with a letter. A naked `showcase` means `showcase=html`, except with `file=` (below).
- `<options>` are [JSON5](https://json5.org/) (parsed, never evaluated), for the showcase adapter to validate. Empty options (`()`) are an error.
- The keys:
  - `file=<name>` names a code block's virtual file (below): a code block showcase's, with the extension its language gives (e.g. `ts showcase=ts file=units.ts`), or, on a naked marker (`showcase file=<name>`), a virtual file with no showcase adapter, which is never built and takes no other key but `view=` (`source`, `markdown` or `none`, below). A linked showcase can't have it: its entry point is a real file already.
  - `inline` or `block` says how a linked showcase is shown: inline, the default (a link opening it in the showcase sidebar), or as a block, in place of the paragraph holding its link, which must be its paragraph's only content (in a list item or a blockquote too, never in a footnote). A code block showcase is always a block, so neither key goes on a code block.
  - `include=<path>,<path>` lists a showcase's **included files**, shown with it as more tabs of its [code pane](#the-code-pane):
    - They can be real files, documentation files, or virtual files (by the name `file=` gives, or a code block showcase's generated name, which changes when a showcase is added above it), in any folder.
    - Paths are relative to the documentation file's folder, comma-separated, with no spaces, commas, `?` or `#` in them, URL-decoded as link targets are, and matched exactly, case included, on every OS.
    - `check` reports an included file that doesn't exist, is a folder, is the showcase's own entry point, is listed twice, is in the output folder, or leads outside the host repository.
    - Including a file only adds it: it is always available to the showcase's build (see each showcase adapter below), and a showcase still uses whatever else it uses, included or not.
    - Two bare words are tabs rather than files, placed where they are listed: `source`, the entry point's own tab (where `include=` doesn't list it, before the first included file, or last, so `include=markdown` puts the Markdown tab first), and `markdown`, a tab showing the showcase as written in its documentation file (as the `markdown` view does), e.g. `include=markdown,./theme.css`. A file of either name is written as a path (`./source`), and each may be listed once.
  - `view=<view>,<view>` lists a showcase's [showcase views](#showcase-views), how the showroom shows it: one or more of `markdown`, `source`, `demo` and `console`, in the order shown, or `none`. A repeated view, an empty one, an unknown one, and `none` with any other are errors, as is `include=` on a showcase shown as a block whose views are `none` (nothing would show its tabs). On a linked showcase shown inline, it names the views its showcase sidebar shows (none by default).
  - `overlays` draws a showcase's [overlays over the page](#overlays-over-the-page) around its showcase frame, instead of growing it. It needs a `demo` view (a linked showcase shown inline's own `view=demo` too), so `check` reports it on a showcase without one, and on a virtual file with no showcase adapter.
  - `anchor=<name>` is reserved for later, and any other key is an error. Keys are case-sensitive, and a repeated key is an error.

A **code block showcase** is a fenced code block with the marker right after its language, which stays first so that the block is still highlighted everywhere. Its code is the showcase's entry point. Here is one, live in this repository's showroom (on GitHub or npm, an ordinary code block): there, the button in its header bar shows its code, and the code pane's first tab, **Markdown**, shows the code block as written, marker included, as its marker lists it (`html showcase include=markdown`; the showcases below show theirs the same way, see [included files](#showcases)):

```html showcase include=markdown
<style>
  .n {
    font: 1.5em monospace;
    color: #0f6cbd;
  }
  .n b {
    font-weight: normal;
    color: #242424;
    background: #fde300;
  }
  .n i {
    font-style: normal;
    color: #c50f1f;
  }
</style>
<span class="n">1<b>,</b>234<b>,</b>567<b>.</b><i>89</i></span>
```

A code block marked `showcase file=<name>`, with no showcase adapter, is a **virtual file** and nothing more: a file the showcases of its folder can use, never built. Here, the same styles as a stylesheet, and a code block showcase using it:

```css showcase file=figures.css
.figure {
  font: 1.5em monospace;
  color: #0f6cbd;
}
.figure b {
  font-weight: normal;
  color: #242424;
  background: #fde300;
}
.figure i {
  font-style: normal;
  color: #c50f1f;
}
```

```html showcase include=markdown
<link rel="stylesheet" href="./figures.css" /> <span class="figure">3<b>.</b><i>14159</i></span>
```

The code blocks of code block showcases, and those marked `showcase file=<name>`, are **virtual files**: they resolve like real files in their documentation file's folder, so every documentation file in that folder, and other folders through relative paths, can use them.

- **Named** by `file=`: a plain file name. A code block showcase's name must end in the extension its language gives (below), so it is built and type checked as its language says, and other showcases can import or include it by a name that doesn't change when a showcase is added above it (the [`ts` example](./examples/ts/README.md#a-shared-helper) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md#a-shared-helper)) imports one).
- **Generated**, for a code block showcase without `file=`: `<documentation file's name>.showcase-<n>.<extension>`, where the name is the documentation file's without its extension, `<n>` is the showcase's position among the showcases in its documentation file, named or not, and `<extension>` comes from the code block's language, lower-cased: `typescript` gives `ts`, `javascript` gives `js`, `htm` gives `html`, `csharp` and `c#` give `cs`, and any other language is used as is (one that can't be part of a file name, holding a `/` or `\`, is an error). The first showcase in `README.md`, the number above, is `README.showcase-1.html`.
- A named showcase imported by another one runs its own code in each showcase frame that imports it, as a module does.
- A virtual file's name may not collide, ignoring case, with another virtual file or a real file or folder in the same folder.

A **linked showcase** is a link to its entry point's file, with the marker as the link's title. The link stays an ordinary link anywhere else. Here it is as written, then live (in the showroom; on GitHub or npm, a plain link):

```md
[Formatted figures](./examples/figures.html 'showcase view=demo')
```

[Formatted figures](./examples/figures.html 'showcase view=demo')

- The link must be an inline link (not a reference, nor an image) with a relative path, without a query or fragment, naming a file inside the host repository that isn't a virtual file.
- The files the entry point uses are ordinary files too, which a showcase adapter building from disk follows; the `html` showcase adapter follows none (see below).
- A title is a marker when its first word is `showcase`, or starts with `showcase=`, and must then be a valid marker.

A linked showcase is shown in one of two ways:

- **Inline**, the default (or with the `inline` key): its link, marked with a "play" icon, opens it in the [showcase sidebar](#the-showcase-sidebar), as its showcase block:
  - its [header bar](#status-marks-and-issues), with a close button, and its issue list;
  - the [showcase views](#showcase-views) its marker's `view=` names: none by default, as neither `showroom.json`'s `showcaseViews` nor its showcase adapter's default apply (the one above, `view=demo`, shows its page running);
  - its [code pane](#the-code-pane), with its included files as more tabs.

  Its showcase frame loads when the showcase sidebar opens, and is unloaded when it closes, so reopening it starts the page afresh.

- **As a block**, with the `block` key, as a code block showcase is: its showcase block (its header bar, issue list, showcase views and [code pane](#the-code-pane)) takes the place of the paragraph holding the link, whose text isn't shown in the showroom (it is only there for the Markdown read anywhere else, where the link stays a link). The link must be alone in its paragraph.

Here is the same page, as a block:

[Formatted figures](./examples/figures.html 'showcase block include=markdown')

**Included files** (`include=`) are shown with their showcase, as more tabs of its code pane, in the showcase sidebar too for a linked showcase shown inline. Here, the code block showcase using the stylesheet above lists it, so the stylesheet is a tab of its code pane. Like every live showcase shown as a block in this repository, it also lists `markdown`, first, so that its first tab shows it as written:

```html showcase include=markdown,figures.css
<link rel="stylesheet" href="./figures.css" /> <span class="figure">2<b>.</b><i>71828</i></span>
```

Tabs show only the entry point and the included files, never what a showcase also uses or imports without listing it.

### Cheat-sheet

| Syntax                                                                        | What it produces                                                                                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| ` ```html showcase ` + code                                                   | An `html` showcase: its showcase frame, its code a click away; its folder's named virtual files copied next to it |
| ` ```ts showcase=ts({ typeCheck: false }) ` + code                            | A `ts` showcase with options                                                                                      |
| ` ```tsx showcase=react ` + code                                              | A `react` showcase: the rendered component, its code a click away                                                 |
| ` ```ts showcase=angular({ zone: true }) ` + code                             | An `angular` showcase, with zone.js: the created component, its code a click away                                 |
| ` ```cs showcase=cs ` + code                                                  | A `cs` showcase: built and run as a C# file-based app, its code then its recorded output                          |
| ` ```json showcase=jsonschema ` + code                                        | A `jsonschema` showcase: a JSON Schema's definitions drawn as a diagram, its code a click away                    |
| ` ```html showcase include=./figures.css,theme.css ` + code                   | The same `html` showcase, with two more tabs; a real `figures.css` is copied next to its page too                 |
| ` ```ts showcase=ts include=./src/units.ts ` + code                           | A `ts` showcase with `units.ts` as another tab; it imports whatever it imports, listed or not                     |
| ` ```ts showcase=ts include=markdown ` + code                                 | A `ts` showcase whose first tab shows it as written, marker included, then its code's tab                         |
| ` ```ts showcase=ts include=./src/units.ts,source ` + code                    | The same `units.ts` tab, first, before the showcase's own code's                                                  |
| ` ```css showcase file=theme.css ` + code                                     | A virtual file `theme.css`: a code block, usable by showcases as if on disk, never built                          |
| ` ```ts showcase=ts file=units.ts ` + code                                    | A `ts` showcase whose virtual file is `units.ts`, which other showcases can import or include by that name        |
| ` ```ts showcase=ts view=demo ` + code                                        | A `ts` showcase shown by its showcase frame, instead of its default code and console                              |
| ` ```ts showcase=ts view=source ` + code                                      | A `ts` showcase shown as an ordinary code block, still built and checked; its page is never loaded                |
| ` ```html showcase view=markdown,demo,console ` + code                        | An `html` showcase shown by its Markdown, its showcase frame, then its console                                    |
| ` ```css showcase file=theme.css view=none ` + code                           | A virtual file hidden in the showroom, still usable by showcases                                                  |
| ` ```html showcase overlays ` + code                                          | An `html` showcase whose dropdowns and menus open over the page around it, instead of growing it                  |
| `"showcaseViews": { "ts": "demo" }` in `showroom.json`                        | Every `ts` showcase without `view=` shown by its `demo` view                                                      |
| `[Clock](./clock.html 'showcase')` within text                                | Shown inline (the default): a link opening the showcase sidebar, with its code pane alone                         |
| `[Clock](./clock.html 'showcase inline')` within text                         | The same, said explicitly                                                                                         |
| `[Clock](./clock.html 'showcase inline include=./clock.css')` within text     | Shown inline, with `clock.css` copied next to the page, and as a second tab in the showcase sidebar               |
| `[Clock](./clock.html 'showcase view=demo')` within text                      | Shown inline, its showcase sidebar showing the page running above its code pane                                   |
| `[Clock](./clock.html 'showcase block')` alone in a paragraph                 | Replaced by its showcase block: its showcase frame, its code (the file) a click away; elsewhere, the link         |
| `[Clock](./clock.html 'showcase block include=./clock.css')` alone            | The same, with `clock.css` as a second tab, copied next to the page                                               |
| `[Counter](./Counter.tsx 'showcase=react block include=./Counter.css')` alone | A `react` showcase block from a real file, with its CSS as a second tab                                           |
| `[clock.css](./clock.css)`                                                    | A linked file: a link with a "code" icon, opening the showcase sidebar                                            |
| ` ```ts ` + code (no marker)                                                  | An ordinary code block, highlighted, with line numbers                                                            |

### Showcase views

A **showcase block**, what a code block showcase or a linked showcase shown as a block is rendered as, shows its **showcase views**, stacked one below the other under its **header bar** (which holds its [status marks](#status-marks-and-issues) and the [code pane](#the-code-pane)'s button), in the order its marker's `view=` gives:

- `markdown`: the showcase as written in its documentation file, marker included: a code block showcase's fence, its lines highlighted as Markdown and its inside as its language; a linked showcase's link.
- `source`: its entry point's code, highlighted, as an ordinary code block (a linked entry point that isn't text, or isn't copied into the showroom, says so).
- `demo`: its [showcase frame](#showcase-frames), with the [console panel](#the-console-panel) over it, unless `console` is one of its views too.
- `console`: its console panel alone, always shown, 8 lines high, with "No output" while nothing is logged. Without `demo`, the showcase frame still runs, hidden, at its real width, so its page behaves as when it is shown.
- `none`: nothing; the showcase is still built and checked. A showcase shown as a block whose views are `none` can't have `include=`, as nothing would show its tabs.

A `markdown` or `source` view is at most 20 lines high, or the viewport's height where that's less, and scrolls beyond. A showcase whose views are only `markdown` and `source` (or `none`) is built and checked like any other, so its code is verified, but its page is never loaded: `showroom build` leaves its showcase frame out. A showcase's views come from its marker's `view=`, or else from `showroom.json`'s `showcaseViews` for its showcase adapter, or else from its showcase adapter's own default: `demo` for `html`, `react`, `angular`, `jsonschema` and a custom showcase adapter that declares none; `source,console` for `ts`, as plain TypeScript is more often logic than UI, and for `cs`, whose recording is what it shows (a [recorded showcase](#recorded-showcases) can't have `demo`). A linked showcase shown inline has no defaults: its showcase sidebar shows the views its marker's `view=` names, or none (its code pane alone).

Here is a `ts` showcase with its default views, its code then its console; its marker is `ts showcase=ts include=markdown`:

```ts showcase=ts include=markdown
const total = [3, 1, 4, 1, 5].reduce((sum, value) => sum + value, 0);
console.log('total', total);
console.warn('a warning stands out');
```

And one shown by its Markdown, then its showcase frame, with its console as a view of its own below; its marker is `html showcase view=markdown,demo,console include=markdown`:

```html showcase view=markdown,demo,console include=markdown
<button onclick="console.log('clicked at', new Date().toLocaleTimeString())">Click to log</button>
```

#### Status marks and issues

A showcase's header bar starts with its **status marks**: `build` (left out for an `html` showcase, which nothing builds, unless its build has issues), one per check its showcase adapter ran (e.g. the `ts` showcase adapter's `type check`), and `runtime`, wherever its page runs (it builds, and a `demo` or `console` view loads it). Each reads ✓, ⚠ with its number of warnings, or ✗ with its number of errors (e.g. `type check ✗ 2`). `runtime` reads `runtime …` until the page has loaded, then counts what the page wrote to its console since it loaded: its warnings (`console.warn`), and its errors (`console.error`, uncaught errors and rejected promises), lines the [console panel](#the-console-panel) dropped included.

Below the header bar, the **issue list** shows each issue of the build and the checks: its check (`build` for the build's own), where it is (its file, labelled as its tab is, and its line) and its message. It starts expanded; clicking a ⚠ or ✗ mark of the build or a check collapses or expands it, and it expands again when a showcase with no issues gets some. Clicking `runtime` opens the console panel, or, with a `console` view, shows that view's first error (or else its first warning). The lines the issues are at are marked in the `source` and `markdown` views and in the code pane's tabs: the line's number in the issue's colour, and a faint band across the line, its messages as the band's tooltip; a tab whose file has issues has a small ✗ or ⚠ before its label.

A showcase that doesn't build (e.g. a syntax error) shows "Not built" in place of its showcase frame and its console, keeping the height its showcase frame last had on the page; one whose check finds errors (e.g. a type error) still runs, beside its errors. In `showroom serve`, the marks and the issue list follow every rebuild without reloading the page. A published showroom only ever shows warnings, as `showroom build` fails on errors. A linked showcase shown inline gets the same header bar, with no code pane button, and its issue list, above its showcase frame.

A virtual file with no showcase adapter takes `view=` too: `source`, the default (an ordinary code block), `markdown` (its fence as written), or `none`, hiding it in the showroom while showcases still use it (it still shows anywhere else, e.g. on GitHub). It has no header bar or code pane.

A broken showcase is an error `showroom check` reports, with its documentation file and line: a broken marker, a marker anywhere else than after a code block's language or in an inline link's title, an unknown showcase adapter, options or an entry point the showcase adapter rejects, a virtual file's name that collides, a linked file that doesn't exist, an included file `check` rejects, `include=` with the view `none` on a showcase shown as a block, and a showcase adapter's missing host requirements (reported once per run by its host check, with no documentation file or line; a host check can also warn about the host repository).

### Built-in showcase adapters

`showroom` comes with these showcase adapters; a host repository can add its own ([custom showcase adapters](#custom-showcase-adapters-experimental)):

| Showcase adapter | Entry point                                                                                                       | Options                | Needs from the host repository                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `html`           | an `html` or `htm` code block, or an `.html` or `.htm` file                                                       | none                   | nothing                                                                                                                               |
| `ts`             | a `ts`, `js`, `mts` or `mjs` code block (or `typescript`, `javascript`), or a `.ts`, `.mts`, `.js` or `.mjs` file | `typeCheck`, `allowJs` | the packages its showcases import, and `typescript` (5.x or 6.x) where they type check                                                |
| `react`          | a `tsx` or `jsx` code block, or a `.tsx` or `.jsx` file                                                           | `typeCheck`, `allowJs` | `ts`'s, and `react` and `react-dom` 18 or later, with `@types/react` where they type check                                            |
| `angular`        | a `ts` code block (or `typescript`), or a `.ts` file                                                              | `typeCheck`, `zone`    | the packages its showcases import, Angular 20 or later, its compiler's `typescript` (5.x or 6.x), and `zone.js` where they set `zone` |
| `cs`             | a `cs` code block (or `csharp`, `c#`), or a `.cs` file                                                            | none                   | the .NET SDK 10 or later on the `PATH`, and the projects and packages its showcases reference                                         |
| `jsonschema`     | a `json` code block, or a `.json` file                                                                            | none                   | nothing                                                                                                                               |

#### `html` showcases

An `html` showcase's showcase frame holds:

- **its entry point**, as the page. An entry point that starts (after whitespace and comments) with `<!doctype`, `<html`, `<head` or `<?xml` is a complete page, used as it is; anything else is a fragment, wrapped into a page of its own. Pages are UTF-8.
- **every virtual file of its documentation file's folder named by `file=`** (named showcases included), next to the page under its name, whether the page uses it or not;
- **its included files**, next to the page as they sit next to the entry point (so they must be inside the entry point's folder).

Nothing else is followed or copied: the page isn't read for its relative references (`<script src>`, `<link href>`, `<img src>`), so they only reach the files copied next to it, and resolve as written for a code block showcase, or a linked page in its documentation file's folder. Keep other styles and scripts inline, or use absolute URLs. (A script needs its closing tag, `<script src="./demo.js"></script>`: HTML has no self-closing `<script />`.)

Files that would land on each other fail:

- a virtual file named `index.html` (a named `html` showcase too) would replace the page, and fails the build;
- so does an included file landing where a named virtual file of the documentation file's folder does (including that file itself is fine);
- `check` reports an included file named `index.html`, in any case.

The [`html` example](./examples/html/README.md) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md)) documents `numerals`, a made-up CSS library, on its own showcases. Its first showcase is a page of its own, [`clock.html`](./examples/html/clock.html), linked as a showcase shown as a block, its code a click away:

[A 7-segment clock](./examples/html/clock.html 'showcase block include=markdown')

See the rest in the example, each following the showroom's theme:

- its stylesheet as a [virtual file](./examples/html/README.md#the-stylesheet) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md#the-stylesheet));
- [tabular figures](./examples/html/README.md#tabular-figures) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md#tabular-figures));
- [grouped digits](./examples/html/README.md#grouped-digits) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md#grouped-digits));
- [comic digits](./examples/html/README.md#comic-digits) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md#comic-digits));
- [large figures](./examples/html/README.md#large-figures-and-displays) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md#large-figures-and-displays)).

#### `ts` showcases

A `ts` showcase's entry point is a TypeScript or JavaScript module, which `showroom` bundles with its own Vite (no Vite, PostCSS or bundler configuration of the host repository is read) and runs in its showcase frame's page. The page holds an empty `<div id="root">`, the **showcase frame root**, for the showcase to write to, then the showcase's module, and no other content and no styles of its own beyond the browser's. What the showcase writes to the browser's console shows in its [console panel](#the-console-panel). A `ts` showcase is shown by its code and its console by default (its [showcase views](#showcase-views) `source,console`): one that renders into the page asks for a `demo` view.

The [`ts` example](./examples/ts/README.md) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md)) documents `tempo`, a made-up TypeScript library of durations, relative times and rounding, typed throughout. Its first showcase is [`countdown.ts`](./examples/ts/demo/countdown.ts), a module importing the library, linked as a showcase shown as a block, shown by its `demo` view (`view=demo`), its code a click away (what it logs fades in at the bottom of its showcase frame, and the console panel's counter opens it):

[A countdown to the new year](./examples/ts/demo/countdown.ts 'showcase=ts block view=demo include=markdown')

See the rest in the example, each type checked with the example's own `tsconfig.json`:

- [code block showcases importing the library](./examples/ts/README.md#durations) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md#durations));
- [a virtual TypeScript file](./examples/ts/README.md#a-shared-helper) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md#a-shared-helper)) two showcases import;
- [relative times](./examples/ts/README.md#relative-times) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md#relative-times));
- [rounding with an `enum`](./examples/ts/README.md#rounding) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md#rounding));
- [a `js` showcase](./examples/ts/README.md#from-javascript) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md#from-javascript)) importing TypeScript.

What a `ts` showcase can import:

- relative paths, to real files and to virtual files anywhere in the host repository, as if the virtual files were on disk: without an extension, by a `.js` specifier naming a `.ts` file, or by a folder holding an `index` file;
- packages installed in the host repository's `node_modules`, and the host's own package by its name, through its `package.json`'s `exports` (so build it first, when they point at its `dist/`);
- what Vite handles out of the box: CSS, JSON and assets (e.g. images). A virtual CSS file must be imported from TypeScript or JavaScript (`import './demo.css'`), as a CSS `@import` only reaches real files. Any other virtual file is imported as a `data:` URL of its text, typed by its extension (e.g. `image/svg+xml` for an `svg` virtual file, which an `<img>` can show; `text/plain` for an unknown one).

Not supported for now: tsconfig `paths` aliases, and anything needing the host repository's own bundler configuration (e.g. SCSS without `sass` installed, environment variables). The host's PostCSS configuration is ignored; the settings Vite's TypeScript transform reads from the nearest `tsconfig.json` (e.g. `experimentalDecorators`, `useDefineForClassFields`) apply. There is no setup shared by a host repository's showcases: a showcase imports what it needs (global styles, polyfills) itself.

`showroom serve` builds showcases in development mode (unminified, with inline source maps), and `build` and `check --showcases` in production mode (minified); `process.env.NODE_ENV`, `import.meta.env.MODE`, `import.meta.env.DEV` and `import.meta.env.PROD` follow the mode, as do packages' `development` and `production` conditions. Its options are `typeCheck` and `allowJs`, both booleans (see [Type checking](#type-checking)). A `tsx` or `jsx` entry point is the [`react` showcase adapter](#react-showcases)'s.

##### Type checking

Unless its `typeCheck` option is `false` (`showcase=ts({ typeCheck: false })`), a `ts` showcase is type checked once it bundles. Its type errors fail `check --showcases` and `build` as build errors do, and in `serve` they show in its status marks and issue list, beside its running showcase frame; each is at its file and line, as `type check: TS<code>: <message>` (in a code block, at its line in the documentation file). Unlike a build error, a type error leaves the built showcase frame usable:

- **With the host repository's own TypeScript**, 5.x or 6.x, found as Node finds `typescript` from the documentation file's folder. `showroom check` reports an error where the showcases that type check find none, or one older than 5.0; TypeScript 7 and later aren't supported yet: their type checking is skipped, with a warning. TypeScript is loaded once per process: restart `showroom serve` after upgrading it.
- **With the nearest `tsconfig.json`**, from the documentation file's folder up to the host repository's root, applied whole, as `tsc -p` applies it (its `extends` followed, and its `files`, `include` and `exclude` in the program, so its declarations and globals apply to the showcase too; its `references` aren't built), with `noEmit`, and without the options that can't apply to a file outside the project: `rootDir`, `composite`, `incremental`, `tsBuildInfoFile`, `outDir`, `outFile`, `declaration`, `declarationMap`, `declarationDir`, `emitDeclarationOnly`, `isolatedDeclarations`, `sourceMap`, `inlineSourceMap`, `inlineSources`, `mapRoot` and `sourceRoot`. Its own errors (e.g. an unknown option) are reported in it. Without one, TypeScript's own defaults apply, as `tsc` without a tsconfig applies them: on TypeScript 5.x, whose defaults don't resolve packages' `exports`, add a `tsconfig.json`. A solution-style `tsconfig.json` (`files: []` with `references`) is used as it is: put a `tsconfig.json` with the right options next to the documentation, or turn `typeCheck` off.
- **Reporting the errors of every file the showcase reaches**: its entry point and, transitively, every file it imports or references (virtual files, the host's own files, its own package's declarations), except in `node_modules` and TypeScript's library files, with the errors of the compiler options. An error in a host file is reported by each showcase reaching it; host files no showcase reaches are left to the host's own checks. Host files are checked with the compiler options nearest the documentation, which may differ from the ones the host builds them with.
- **What Vite bundles and TypeScript doesn't know of** (CSS, assets, `?raw` imports, a virtual file imported as a URL, `import.meta.env`) must be declared by the host repository, or type checking fails (e.g. TS2307, or TS2882 for a CSS import on TypeScript 6): add `/// <reference types="vite/client" />` to a `.d.ts` file the tsconfig includes, where `vite` is installed, or declarations of your own (e.g. `declare module '*.css';`), or turn `typeCheck` off.
- **Two differences from the bundle**: type checking follows the host's own module resolution (e.g. under `node16` or `nodenext`, an extensionless import, which Vite bundles, is an error, TS2835), and applies the documentation folder's tsconfig to every file, where Vite's transform looks one up per file.
- **JavaScript**: a `js` or `mjs` entry point is type checked with `allowJs`, so its TypeScript imports are checked (the entry point itself only with the tsconfig's `checkJs`). Importing a `.js` file without declarations is an error under `strict` (TS7016), as it is in the host's own code: the `allowJs` option (`showcase=ts({ allowJs: true })`) type checks that showcase with `allowJs`, leaving the tsconfig as it is.

#### `react` showcases

A `react` showcase's entry point is a TSX or JSX module whose **default export is a component**, which `showroom` renders into the showcase frame root with the host repository's own React (`react-dom/client`'s `createRoot`), without `StrictMode`:

```tsx
import { useState } from 'react';

export default function Demo() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>;
}
```

It builds on the [`ts` showcase adapter](#ts-showcases): it is bundled the same way, can import the same things, runs on the same page, in the showcase frame root (its [console panel](#the-console-panel) also shows React's warnings and render errors), and is [type checked](#type-checking) the same way, with the same options, `typeCheck` and `allowJs`. Beyond that:

- **React comes from the host repository**: `react` and `react-dom`, 18 or later, found as Node finds them from the documentation file's folder, which `showroom check` reports when missing or older; and where the showcases type check, React's types (`@types/react`, unless `react` ships its own). Each showcase frame bundles its own copy of React.
- **The default export** can be any component React renders: a function, a class, or what `memo()`, `forwardRef()` or `lazy()` return. A module without one fails the build, at the entry point; named exports are allowed, and ignored. A default export React can't render fails in the showcase frame, as React's own error in the console panel.
- **JSX always uses the automatic runtime** (no `import React` needed), whatever the tsconfig's `jsx` says; its `jsxImportSource` applies. Type checking uses `jsx: react-jsx` where the nearest tsconfig (or its absence) leaves `jsx` unset, and the tsconfig's own `jsx` otherwise. A `jsx` entry point is type checked with `allowJs`, as a `js` one is.
- **No setup shared by the showcases**: a showcase that needs providers (a theme, a router, a store), global styles or `StrictMode` wraps itself in them, in its own code.
- **The theme**: like any page in a showcase frame, a showcase reads the showroom's theme from `<html>`'s `data-showroom-theme` attribute and `color-scheme` (see [Showcase frames](#showcase-frames)); a hook can follow it with a `MutationObserver`, as the example's [`useShowroomTheme()`](./examples/react/src/useShowroomTheme.ts) does.

The [`react` example](./examples/react/README.md) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md)) documents `ticker`, a made-up React component library of a stopwatch, counters and a theme hook. Its first showcase is [`Stopwatch.tsx`](./examples/react/demo/Stopwatch.tsx), a module whose default export renders the library's stopwatch, linked as a showcase shown as a block, its code a click away:

[A stopwatch](./examples/react/demo/Stopwatch.tsx 'showcase=react block include=markdown')

See the rest in the example, each type checked with the example's own `tsconfig.json`:

- [counters with props](./examples/react/README.md#counters) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#counters)) logging to the console panel;
- [following the theme](./examples/react/README.md#following-the-theme) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#following-the-theme));
- [a virtual TSX file](./examples/react/README.md#a-shared-component) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#a-shared-component)) the [next showcase](./examples/react/README.md#composing) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#composing)) imports;
- [a memoized component](./examples/react/README.md#memoized-components) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#memoized-components));
- [a `jsx` showcase](./examples/react/README.md#from-jsx) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#from-jsx)).

#### `angular` showcases

An `angular` showcase's entry point is a TypeScript module whose **default export is a standalone component**, which `showroom` compiles ahead of time with the host repository's own Angular compiler, and creates in the showcase frame root:

```ts
import { Component, signal } from '@angular/core';

@Component({
  template: `<button type="button" (click)="count.set(count() + 1)">Clicked {{ count() }} times</button>`,
})
export default class Demo {
  readonly count = signal(0);
}
```

It builds on the [`ts` showcase adapter](#ts-showcases): once compiled, it is bundled the same way, can import the same things, and runs on the same page, in the showcase frame root (its [console panel](#the-console-panel) also shows Angular's warnings and errors). Beyond that:

- **Compiled by the host's own Angular compiler**, `@angular/compiler-cli`, in memory, before `showroom`'s Vite bundles what it emits: decorators and templates are compiled ahead of time, and no Angular compiler reaches the browser. A component's template and styles may be inline, or files named by `templateUrl` and `styleUrl` (or `styleUrls`): real files, or virtual ones (e.g. a ` ```html showcase file=demo.html ` virtual file); styles are CSS only. Angular's own packages, and libraries published partially compiled (the host's own built library imported by its name included), are completed by the Angular Linker, run with the compiler's own Babel.
- **Angular comes from the host repository**: `@angular/core`, `@angular/common`, `@angular/compiler`, `@angular/compiler-cli` and `@angular/platform-browser`, 20 or later, all of one major, found as Node finds them from the documentation file's folder; and the `typescript` that `@angular/compiler-cli` finds from its own folder, 5.x or 6.x. `showroom check` reports them missing, older, of mixed majors, or a TypeScript 7 and later (which has no compiler API for Angular's compiler); a TypeScript the Angular version doesn't accept fails each showcase's build with Angular's own message. They are needed whether or not the showcases type check, as compiling needs them, and they are loaded once per process: restart `showroom serve` after upgrading Angular or TypeScript.
- **The default export** must be a standalone component: a class decorated with `@angular/core`'s `Component` (by any local name), whose metadata doesn't set `standalone: false`. Anything else fails the build at the entry point's default export, whatever `typeCheck` says, and a module without one fails it at the entry point; named exports are allowed, and ignored. Its `selector` is ignored. It is created with `createApplication()` and `createComponent()`, and uses the host's components, directives, pipes and NgModules through its `imports`, and services through its `providers` (or theirs, e.g. `providedIn: 'root'`).
- **No application setup**: a showcase provides what it needs through its component's own `providers`; environment providers that only an application's configuration takes (e.g. `provideHttpClient()`, `provideRouter()`, `provideAnimations()`) aren't supported yet.
- **Zoneless by default**: a showcase runs without zone.js (`provideZonelessChangeDetection()`), as Angular's own default since 21. The `zone` option (`showcase=angular({ zone: true })`) loads `zone.js` before Angular and uses zone-based change detection (`provideZoneChangeDetection()`), for host code that relies on it; `zone.js` must then be installed in the host repository, which `showroom check` reports. Zone-based change detection only refreshes components it checks: from Angular 22, components are `OnPush` unless they set `changeDetection: ChangeDetectionStrategy.Eager`.
- **Type checking is Angular's compiler's**: with the nearest `tsconfig.json`, as for [`ts`](#type-checking), applied whole, its `angularCompilerOptions` included (e.g. `strictTemplates`), so templates are checked as strictly as the host checks its own; its files and the entry point make the program. The errors of the files the showcase reaches, and of their components' templates and styles, are reported at their file and line, `TS<code>: <message>` or `NG<code>: <message>` as `ng build` shows them (a template's at its line in the inline template, or in its `templateUrl` file); Angular's extended diagnostics (e.g. `NG8107`) are warnings. Its type errors and warnings belong to the `type check`, as `ts`'s do, and are reported only when the compile and the bundle succeed. The `typeCheck` option (`showcase=angular({ typeCheck: false })`) leaves out the type errors and warnings, but the compile runs either way: syntax errors, errors in Angular's metadata, and the default export check still fail the build. There is no `allowJs` option, and the `ts` showcase adapter's own type check doesn't run on them as well. The tsconfig's emit options are overridden (no `noEmit`, declarations, `outDir` or the other options `ts` drops; source maps on), and `compilationMode` is always `full`.
- **The modes**: `showroom serve` builds with Angular's development checks (`ngDevMode`), and `build` and `check --showcases` without them, defining `ngDevMode`, `ngJitMode`, `ngI18nClosureMode`, `ngServerMode` and `ngHmrMode` as `false`.
- **The theme**: like any page in a showcase frame, a showcase reads the showroom's theme from `<html>`'s `data-showroom-theme` attribute and `color-scheme` (see [Showcase frames](#showcase-frames)); a root service can follow it with a signal, as the example's [`ThemeService`](./examples/angular/src/theme.service.ts) does.

The [`angular` example](./examples/angular/README.md) ([live](https://ofzza.github.io/showroom/#/examples/angular/README.md)) documents `tock`, a made-up Angular component library of a stopwatch, counters and a theme service, the `react` example's `ticker` the Angular way. Its first showcase is [`stopwatch.ts`](./examples/angular/demo/stopwatch.ts), a module whose default export is a standalone component showing the library's stopwatch, linked as a showcase shown as a block, its code a click away. The stopwatch keeps its template and styles in files of their own, which its marker, `showcase=angular block include=markdown,./examples/angular/src/stopwatch.component.html,./examples/angular/src/stopwatch.component.css`, includes, so its code pane shows them as tabs:

[A stopwatch](./examples/angular/demo/stopwatch.ts 'showcase=angular block include=markdown,./examples/angular/src/stopwatch.component.html,./examples/angular/src/stopwatch.component.css')

See the rest in the example, each type checked with the example's own `tsconfig.json`, its templates strictly:

- [counters with signal inputs and an output](./examples/angular/README.md#counters) ([live](https://ofzza.github.io/showroom/#/examples/angular/README.md#counters)) logging to the console panel;
- [following the theme](./examples/angular/README.md#following-the-theme) ([live](https://ofzza.github.io/showroom/#/examples/angular/README.md#following-the-theme)) through a root service;
- [a virtual template](./examples/angular/README.md#a-shared-template) ([live](https://ofzza.github.io/showroom/#/examples/angular/README.md#a-shared-template)) the [next showcase](./examples/angular/README.md#composing) ([live](https://ofzza.github.io/showroom/#/examples/angular/README.md#composing)) names as its `templateUrl`;
- [the `zone` option](./examples/angular/README.md#with-zonejs) ([live](https://ofzza.github.io/showroom/#/examples/angular/README.md#with-zonejs)).

#### `cs` showcases

A `cs` showcase is one C# file, built and run with the host's .NET SDK (10 or later, from the `PATH`) as a **file-based app**: a `.cs` file with top-level statements and no project of its own, whose references are `#:` directives at its top (`#:project <path>`, `#:package <name>@<version>`, `#:sdk`, `#:property <name>=<value>`). It is a [recorded showcase](#recorded-showcases): built and run in the host copy when the showcase is built, its output recorded, and shown by its code and its recorded output by default (its [showcase views](#showcase-views) `source,console`). A showcase uses the host's own code through a `#:project` directive naming its project file, or the folder holding it, relative to the showcase's file:

```cs
#:project ../src/Numbers/Numbers.csproj
Console.WriteLine(Numbers.Format.Thousands(1234567));
```

What is shown is exactly what is built, so a linked `cs` showcase also runs as is with `dotnet run <file>` in the host repository (a code block's showcase is a virtual file, which only exists in the host copy). It works in any host repository, whatever its stack adapter: C# examples in a TypeScript library's documentation too. Beyond that:

- **One file.** A showcase's included files are shown as tabs only, never compiled in: other code comes through `#:project` or `#:package`. It takes no options.
- **The build.** `dotnet build <file> --artifacts-path <folder>`, from the showcase's file's folder in the host copy, into a folder of the showcase's own in the run folder (kept across `serve`'s runs, so a rebuild takes about a second, against about 5 s cold), then `dotnet <its .dll>`, from the documentation file's folder (in the build's output as the .NET SDK 10 or 11 lays it out: `bin/debug/`, or `bin/<file>.cs/debug/`). The host copy leaves out `bin/`, `obj/`, `node_modules/`, `.vs/` and `.git`. MSBuild's node reuse and build server, and the compiler server, are turned off, so nothing outlives a build; telemetry is off. A code block's virtual file is kept out of any project whose folder holds it (a project compiles every `.cs` file under its folder by default). Packages are restored into your own NuGet cache (`~/.nuget/packages`), as `dotnet run` in the host repository would.
- **Its issues.** The compiler's errors are the build's, at their file and line (a code block's at its line in the documentation file), wherever they are, a referenced project's included; its warnings only in the showcase's own file, so a project's warnings don't repeat on every showcase referencing it. A showcase that doesn't build has no recording. Its status marks are `build` and `runtime`: an unhandled exception (which ends it with `SIGABRT` on Linux and macOS), a non-zero exit code or anything written to standard error fails its `runtime` check.
- **The host check** runs nothing of the host repository: it lists the installed SDKs with the `dotnet` on the `PATH`, outside the host repository, and reads the host's `global.json` without running it. It is an error when `dotnet` isn't found, when no SDK is 10 or later, or when `global.json` pins an older one that its `rollForward` can't roll past (only `latestMajor` can); SDK folders its `sdk.paths` names inside the host repository are warned of, as the builds may use them.
- **Watching.** `serve` rebuilds after a change to a showcase's file, or to a project file it references; a change to a file `.gitignore` ignores inside a referenced project (e.g. generated code) isn't seen: save another file, or restart `serve`.
- **Its limits.** On macOS and Windows, `dotnet` may still keep a file-based app's build cache in your own folders, outside the run folder.

The [`cs` example](./examples/cs/README.md) ([live](https://ofzza.github.io/showroom/#/examples/cs/README.md)) documents `chrono`, made-up C# programs about time and numbers, each a file-based app of its own. Its first showcase is [`countdown.cs`](./examples/cs/countdown.cs), a program counting down to the new year from a fixed moment (so that its recording is the same on every build), linked as a showcase shown as a block (`showcase=cs block include=markdown`):

[A countdown to the new year](./examples/cs/countdown.cs 'showcase=cs block include=markdown')

See the rest in the example:

- [durations](./examples/cs/README.md#durations) ([live](https://ofzza.github.io/showroom/#/examples/cs/README.md#durations)), a code block showcase;
- [rounding](./examples/cs/README.md#rounding) ([live](https://ofzza.github.io/showroom/#/examples/cs/README.md#rounding)), with a record and a `switch` expression.

#### `jsonschema` showcases

A `jsonschema` showcase is one JSON Schema, drawn as a class diagram of its definitions and how they reference one another. `showroom` reads the schema with [`@ofzza/tsschema`](https://www.npmjs.com/package/@ofzza/tsschema) when the showcase is built, writes the diagram's [Mermaid](https://mermaid.js.org/) source, and its showcase frame only draws it, in the showroom's light or dark theme, at its natural size: never larger, and shrunk to fit the frame's width, down to half its size, beyond which the frame scrolls sideways; a smaller diagram is centred. Both come with `showroom`, so it needs nothing from the host repository, and runs nothing of it (it is still only built with [trust](#trust), as every showcase is). Its showcase frames share one copy of Mermaid, which `build` writes into the output folder's `mermaid/` folder (about 3.85 MB) only when it builds one.

- **What it shows.** Each definition of the schema's `$defs` is a node: a model (`"type": "object"` with `properties`) lists its properties with their types (`?` marks an optional one, `[]` an array, `| null` a nullable one), an enum (`«enumeration»`) its values, and any other definition its kind (`«alias»` for one that is only a `$ref`, `«oneOf»`, `«anyOf»`, `«primitive»`, `«record»`, …). A property referencing other definitions starts with `→`, and an arrow labelled with its name points to each; a definition whose `allOf` holds a reference inherits from it (merging its models' properties), and an `anyOf` or `oneOf` of references points to each, labelled by its kind. The root is a node, `«root»`, when it is a model, named by its `title`, else by a named showcase's name (`file=<name>.json`), else `root`; a root that is only a `$ref` marks the definition it names `«root»`; a root holding only `$defs` isn't drawn. Names show exactly as written, whatever their characters.
- **Strict JSON.** Its entry point is a `json` code block (a named one is `<name>.json`), or a linked `.json` file; a byte order mark is accepted, comments are an error. It takes no options. Included files are shown as tabs only, never read for references.
- **Its issues** are its build's, under its `build` status mark, at its entry point. Errors, which leave it not built: a syntax error (at its line: a code block's in the documentation file), a schema that isn't an object (a boolean schema only warns that nothing shows), and a diagram over Mermaid's limits (50,000 characters of source, or 500 edges). Warnings, for what isn't read yet: `definitions` without `$defs` (draft-04 to draft-07), every `$ref` that doesn't resolve (into another file, a virtual file of the same documentation file included, or inside the file but not a definition of its own `$defs`, e.g. `#/definitions/X`), each definition, or root, with `properties` but no `"type": "object"`, and an empty diagram. Its `runtime` status mark shows Mermaid's failures to draw.
- **Its limits**, until `tsschema` reads more: only `$defs` is read, so a `definitions` schema shows nothing; a `$ref` into another file shows as `unknown`; `properties` without `"type": "object"` aren't a model (in an `allOf`'s member too, where nothing warns of it); `additionalProperties` beside `properties` isn't shown, a record's values (`additionalProperties` alone) are `unknown`, and a tuple (`prefixItems`) is an array of `unknown`.

The [`jsonschema` example](./examples/jsonschema/README.md) ([live](https://ofzza.github.io/showroom/#/examples/jsonschema/README.md)) documents `headway`, the made-up data models of a city transport timetable. Its first showcase is [`timetable.schema.json`](./examples/jsonschema/timetable.schema.json), the whole timetable, linked as a showcase shown as a block (`showcase=jsonschema block include=markdown`):

[The timetable](./examples/jsonschema/timetable.schema.json 'showcase=jsonschema block include=markdown')

See the rest in the example:

- [a departure board](./examples/jsonschema/README.md#a-departure-board) ([live](https://ofzza.github.io/showroom/#/examples/jsonschema/README.md#a-departure-board)), a code block whose root is a model, with an enum and an alias;
- [fares](./examples/jsonschema/README.md#fares) ([live](https://ofzza.github.io/showroom/#/examples/jsonschema/README.md#fares)), a named showcase, with a record;
- [a trip](./examples/jsonschema/README.md#a-trip) ([live](https://ofzza.github.io/showroom/#/examples/jsonschema/README.md#a-trip)), a root that is only a `$ref`;
- [a clock, with its schema](./examples/jsonschema/README.md#a-clock-with-its-schema) ([live](https://ofzza.github.io/showroom/#/examples/jsonschema/README.md#a-clock-with-its-schema)), shown by its diagram and its source (`view=demo,source`).

### Showcase frames

Each showcase is shown in its own iframe, a showcase frame. A code block showcase, and a linked showcase shown as a block, take their entry point's place: the code block, or the paragraph holding the link, is replaced by its showcase block. A linked showcase shown inline stays a link, opening it in the showcase sidebar, where its views (and so its showcase frame) are shown as a showcase block shows them. A showcase that doesn't build shows "Not built" in its showcase frame's place. A showcase frame is as wide as the text, and as high as its content, which `showroom` measures with a small script it adds to every showcase frame page: down to the bottom margin of `<body>`, or of its lowest element if that reaches further, and down to the lowest absolutely positioned element, so an open dropdown, popover or menu (in a portal, or in a fixed layer such as Angular CDK's overlay container) grows the showcase frame while it is open, and the showcase frame shrinks back when it closes. A fixed element's own box never counts, nor does anything hidden, visually hidden (`clip`), empty, or clipped by an ancestor's `overflow`. Don't size a showcase to its viewport (`100vh`, or `height: 100%` on `html` and `body`): it would grow with its own iframe, which `showroom` stops after a few steps. An overlay that keeps itself within the window (MUI's `Popover` limits its paper to `max-height: calc(100% - 32px)`, scrolling the rest) never needs more room, so it never grows the showcase frame, and is cut down to a short showcase's height: lift that limit in the showcase's theme to show it whole.

The showroom loads a showcase frame's page by a URL whose query carries a hash of the showcase frame's content (`index.html?hash=<hash>&theme=<theme>`), so a changed showcase frame gets a new URL, and a browser never shows a cached earlier page. Its other files keep their names: a static host may still serve a cached earlier version of one of them after a new build.

The showcase frame follows the showroom's light or dark theme: the script sets it as the `data-showroom-theme` attribute (`light` or `dark`) and the `color-scheme` of the page's `<html>`, from the first paint on, and whenever the theme changes. A showcase can follow it with `[data-showroom-theme='dark']` selectors, or with CSS's `light-dark()`; switch the showroom's theme to see this one change:

```html showcase include=markdown
<style>
  .themed {
    font: 1.5em monospace;
    color: light-dark(#0f6cbd, #479ef5);
  }
  .themed b {
    font-weight: normal;
    color: light-dark(#242424, #ffffff);
    background: light-dark(#fde300, #8a3707);
  }
  .themed i {
    font-style: normal;
    color: light-dark(#c50f1f, #f1707b);
  }
</style>
<span class="themed">2<b>.</b><i>71828</i></span>
```

#### Overlays over the page

An overlay is a showcase's content placed outside its page's flow: absolutely positioned, and showing, as a dropdown, a menu, a popover or a dialog's pane usually is. By default, an open overlay grows its showcase frame, pushing the page below it down until it closes. With the `overlays` key on its marker, a showcase's overlays are drawn over the page around its showcase frame instead, below it or above it, and the page never moves. Only the overlays cover the page: the text beside them stays visible, clickable and selectable. A press anywhere outside the showcase frame, on the showroom or in another showcase frame, is replayed in it as a press outside its overlays, so they close as they would on a press outside them: on its page, or on a backdrop (as Angular Material's menus close), never on its content; Escape pressed outside isn't passed on.

Open the menu below, its marker `html showcase include=markdown overlays`, and see it cover this text; then press anywhere else:

```html showcase include=markdown overlays
<style>
  .menu-host {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5em;
    font:
      0.9em system-ui,
      sans-serif;
  }
  .menu {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 1;
    margin: 4px 0 0;
    padding: 4px 0;
    list-style: none;
    background: Canvas;
    border: 1px solid GrayText;
    border-radius: 4px;
    box-shadow: 0 4px 16px #0004;
  }
  .menu li {
    padding: 6px 16px;
  }
  .menu[hidden] {
    display: none;
  }
</style>
<div class="menu-host">
  <button id="units">Units ▾</button>
  <span>Distances are shown in <b id="unit">kilometres</b>.</span>
  <ul class="menu" hidden>
    <li>kilometres</li>
    <li>miles</li>
    <li>nautical miles</li>
    <li>light years</li>
    <li>parsecs</li>
  </ul>
</div>
<script>
  const menu = document.querySelector('.menu');
  document.getElementById('units').addEventListener('click', (event) => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  menu.addEventListener('click', (event) => {
    document.getElementById('unit').textContent = event.target.textContent;
    menu.hidden = true;
  });
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target)) menu.hidden = true;
  });
</script>
```

Its limits:

- overlays are let out below and above the showcase frame only: one reaching past its left or right edge is still cut off there;
- an overlay positioned `fixed` (e.g. floating-ui's `strategy: 'fixed'`) is never measured, so it is cut off at the showcase frame's edges;
- while an overlay is out, an element fixed at the showcase frame's top or bottom edge (a toast) is hidden, as only the content and the overlays show;
- an overlay of a page's last showcase may reach past the page's end, where the page scrolls further to show it;
- it is checked in Chrome, Edge and Firefox, not yet in Safari.

### The console panel

What a showcase writes to the browser's console (`console.log`, `info`, `warn`, `error` and `debug`, styled by level), its uncaught errors and its rejected promises show in the showroom's **console panel**, over its showcase frame, whatever its showcase adapter (`html` included). The script `showroom` adds to every showcase frame page captures them from its start, before any of the page's own scripts run, and every call still reaches the browser's console. Values are shown readably, as they were when logged: strings as they are, errors as their stack, objects and arrays as indented JSON; a line longer than 10,000 characters is cut, saying how many characters were left out. The panel keeps the newest 128 lines, its first line saying how many earlier ones were dropped, and follows the showroom's theme. It starts afresh each time its showcase frame loads (when `serve` rebuilds it, or when the page reloads itself).

Each new line shows briefly at the bottom of the showcase frame, then fades, and a counter in the bottom-right corner (`>_ 12`) says how many lines were logged. Nothing shows while nothing is logged; once anything is, the showcase frame takes at least the counter's row (32 px). The counter turns red, with the number of errors, while errors are unseen. Clicking it opens the whole console panel over the showcase, 8 lines high, scrolling beyond them, and growing a shorter showcase frame's room to fit it; its close button, or Escape, closes it. The first uncaught error or rejected promise of each load opens it by itself, so a crash that empties the page is seen. A showcase that only logs is best shown with a `console` view (the `ts` showcase adapter's default), which shows every line, always; with a `demo` view too, the console panel is only that view, never over the showcase frame.

Only the showcase frame's own page is captured: an iframe inside it, or a window it opens, keeps its console to itself. In a showcase frame taller than the screen, the counter and the console panel sit at its bottom, possibly out of view.

### Recorded showcases

Some code can't run in a browser. A showcase adapter can instead **record** its showcases: build and run each one as a program on the machine running `showroom`, when the showcase is built, and record what it prints and how it ended. The showroom then shows the recording in place of a showcase frame's console: the [`cs` showcase adapter](#cs-showcases) records C#, and a [custom showcase adapter](#custom-showcase-adapters-experimental) can record too.

- **How it shows.** A recorded showcase has no showcase frame, so it can't have a `demo` view (`view=demo` on one, or `showroom.json`'s `showcaseViews` giving its showcase adapter `demo`, is an error of `check`). Its `console` view shows the recording under the title "Recorded output": standard output's lines as `log` lines, standard error's as `error` lines, in the order they came (across the two, roughly), then the showroom's own last line, how the run ended ("Exited with code 0", "Exited with code 134", "Stopped after the 30 s time limit", "Ended by signal SIGABRT"). It has the `console` view's limits: the newest 128 lines, each cut at 10,000 characters. Its `runtime` [status mark](#status-marks-and-issues) is the recording's, whatever its views, labelled "recorded when built". A recording is made once, when the showcase is built (by `build`, `check --showcases`, and each of `serve`'s runs): times, random values and anything the machine decides are frozen in it.
- **When it fails.** A recording fails when its exit code isn't 0, the time limit or a signal ended it, or it wrote anything to standard error, as a `console.error` makes a showcase frame's `runtime` ✗. That is an error of its `runtime` check, failing `check --showcases` and `build`, which quotes the first line it wrote to standard error (the first of those kept, when there were more than 128 lines), unlike a showcase frame's run-time errors, which only a reader's browser sees.
- **The host copy.** Recorded showcases are built and run in the **host copy**, `showroom`'s own copy of the host repository, with each showcase's virtual files written beside its documentation file, so everything around them resolves as in the host repository itself; the host repository is never written to by `showroom`. It is made only with [trust](#trust), and only when a showcase adapter that uses it has showcases to build, in a run folder of your cache folder (`$XDG_CACHE_HOME/showroom/`, else `~/.cache/showroom/` on Linux, `~/Library/Caches/showroom/` on macOS, `%LOCALAPPDATA%\showroom\` on Windows), removed when the command ends, on Ctrl-C too; a crash can leave one behind there. Each showcase adapter that uses it says what it leaves out; the output folder is always left out. It holds everything else, files your `.gitignore` ignores included (secrets in a local `.env`, say), so keep those out with the showcase adapter's `exclude`. Symbolic links are kept, an absolute one into the host repository made relative, and one leading outside the host repository left out. `serve` keeps the host copy in step at the start of each run, copying what changed on either side and removing what the host repository no longer has; a change of the same size within your file system's time resolution can be missed. Recorded showcases only work in **self-contained** host repositories: a file reaching outside the host repository (e.g. a `Directory.Build.props` importing `../../shared.props`) doesn't resolve in the host copy.
- **Its limits.** Each program runs in a session of its own (with no terminal: its standard input closed), with a time limit (30 s for a run, 300 s for a build step, such as restoring packages or compiling), after which its whole process group is killed, as is anything it leaves running when it exits; and its output is capped at 1 MB, the rest left out. Its environment is cleaned: only `PATH`, `HOME`, `LANG`, `LC_ALL` and `TZ` (and on Windows the system's own variables) are passed on, with `TMPDIR` and `XDG_DATA_HOME` pointing into the run folder, shared by the command's showcases. `--pass-env <name>`, repeatable, on `check`, `serve` and `build`, passes another variable on (e.g. a private package feed's credentials), but only to build steps, never to a recorded run, whose output the showroom publishes. Paths into the host copy are shown relative to the host repository's root, the run folder's as `<run>`, and your home folder as `~`; terminal escape sequences are removed.
- **It isn't a sandbox.** These limits are best effort: a program can leave its process group, and Windows has no process group to kill (its process tree is killed at the time limit only). The cleaned environment only reaches the programs `showroom` starts: a custom showcase adapter, or a compiler running inside `showroom`'s process, sees all of it, and every program can read whatever files you can (e.g. `~/.npmrc`) and write to your terminal device. A recording publishes whatever the program prints. Tools keep caches of their own in your home folder too (e.g. packages restored from the host repository's feeds), shared with your other projects.

### The code pane

A showcase block shows its **code pane**: its files' code, a tab per file, in the order `include=` lists them, with its `source` and `markdown` tabs where it lists those:

- the entry point's tab, labelled by its language for a code block showcase (e.g. `HTML`), placed before the first included file where `include=` doesn't list `source`. The code pane always has it, even when a `source` view shows the same code;
- the [included files](#showcases)' tabs, each labelled by its path relative to the documentation file.

Each tab is highlighted with line numbers, with a copy button beside the tabs copying the selected tab's code. A file that isn't text (or is over 1 MB) says so in its tab, with a link opening it; a linked showcase's entry point that isn't copied into the showroom (see [Linked files](#linked-files)) says so too.

The code pane has three states, switched in turn by its button, at the right end of the block's header bar:

| State       | What shows                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **hidden**  | The [showcase views](#showcase-views) alone. Every code pane starts hidden, each time a page is shown.                                                                                                                                      |
| **half**    | The code pane beside the views (on their right), or below them when the block is narrower than 720 px (a block in a list item or a blockquote is narrower than the text). A second button, right of the first, hides the code pane at once. |
| **sidebar** | The views alone again, with the code pane's tabs in the [showcase sidebar](#the-showcase-sidebar), from the tab that was selected. The button is hidden while the showcase sidebar is open, and closing it leaves the code pane hidden.     |

The views keep their own height (a `demo` view at least 32 px, a console panel's counter's row), and a showcase frame never reloads when the state changes. The code pane shows at least 6 lines of code (or all of them, when there are fewer), so a short showcase with longer code sits in a block at least that tall; below the showcase frame, it is as tall as its code, up to 20 lines; beyond that, it scrolls.

In the showcase sidebar (a [linked showcase shown inline](#showcases)), the code pane has no three states:

- it is always shown, below the views, whatever the width;
- a button in the header bar **collapses** the views (they keep running, hidden, and the code pane fills the showcase sidebar) and **expands** them again; with no views, the code pane fills the showcase sidebar, with no button;
- a linked file's tab has a link opening it in a new tab, beside the copy button.

## Custom showcase adapters (experimental)

> Experimental: the showcase adapter interface may change in any release until it is declared stable. [`CHANGELOG.md`](./CHANGELOG.md) lists its changes between published versions.

A host repository can bring its own showcase adapter: a JavaScript ES module (a `.mjs` file, or a `.js` file under a `package.json` with `"type": "module"`) whose default export is a function, which may be async, returning an object that implements the `ShowcaseAdapter` interface, listed in `showroom.json` under the name showcases use it by:

```json
{
  "stack": "typescript",
  "customShowcaseAdapters": { "my-frames": "./tools/my-frames.js" }
}
```

```md
[My widget](./src/widget.js 'showcase=my-frames({ "size": 2 })')
```

Names follow the marker's rules, and can't be a built-in showcase adapter's. Paths are relative to the host repository's root, inside it, to a `.js` or `.mjs` file. Under [trust](#trust), every listed module is loaded by every `showroom check`, used or not, so each listed module runs the host repository's code; one that doesn't load, or doesn't implement the interface, is an error. Without trust, none is loaded: its showcases aren't validated, and are shown as their source. Each module is loaded once per process, and once more whenever its content changes (in `serve`; the modules it imports are not loaded again), and its default export is called once per run (a `check`, then the showcases' build in `build`, `serve` or `check --showcases`; `serve` runs both again after every change), so every run gets a fresh showcase adapter object, closed at the end of that run.

The sample below is TypeScript, for its types; `showroom` loads JavaScript, so compile such a module first, or write it in JavaScript with JSDoc types, as the `number-table` example's [module](./examples/number-table/number-table.js) does (`/** @import { ShowcaseAdapter } from '@ofzza/showroom' */`):

```ts
import type { ShowcaseAdapter } from '@ofzza/showroom';

// Creates a showcase adapter object; called once per run
export default (): ShowcaseAdapter => ({
  // Optional: its default showcase views; ['demo'] if left out
  defaultViews: ['demo'],
  // Checks one showcase statically, returning the options to use, or errors
  validate: (showcase) =>
    showcase.entry.endsWith('.js') ? { options: showcase.options ?? {}, errors: [] } : { errors: ['my-frames needs a .js entry point'] },
  // Optional: what the host repository is missing (errors), and warnings, checked once per run if any showcase uses the adapter
  check: async (root, showcases) => ({ errors: [], warnings: [] }),
  // Builds one showcase frame in memory: its page and assets, the checks it ran, and its issues (errors and warnings)
  build: async ({ showcase }) => ({
    page: 'index.html',
    files: [
      { path: 'index.html', content: '<!doctype html><html><head><script type="module" src="widget.js"></script></head><body></body></html>' },
      { path: 'widget.js', content: `document.body.textContent = ${JSON.stringify(showcase.id)};` },
    ],
    reads: [showcase.entry],
  }),
  // Optional: cleans up at the end of a run
  close: async () => {},
});
```

A showcase adapter that [records](#recorded-showcases) its showcases runs them in the host copy instead, e.g. Python scripts:

```ts
import type { ShowcaseAdapter } from '@ofzza/showroom';

export default (): ShowcaseAdapter => ({
  // Its showcases have no showcase frame: no demo view
  recorded: true,
  defaultViews: ['source', 'console'],
  // It runs them in the host copy, which leaves out these paths and .git
  hostCopy: { exclude: ['.venv/', '__pycache__/'], git: false },
  validate: (showcase) => (showcase.entry.endsWith('.py') ? { errors: [] } : { errors: ['python needs a .py entry point'] }),
  build: async ({ showcase, hostCopy }) => {
    // Runs it from its documentation file's folder (the default cwd), by its path relative to the root
    const run = await hostCopy!.run('python3', ['-X', 'utf8', `${'../'.repeat(showcase.documentation.split('/').length - 1)}${showcase.entry}`], {
      phase: 'run',
    });
    return { reads: [showcase.entry], recording: run.recording };
  },
});
```

- Every method gets the `Showcase` with its `display` (`inline` or `block`), its `include`d files (paths relative to the root), which a custom showcase adapter may use as it sees fit (e.g. to copy them, as the `html` showcase adapter does), and its `views` (its [showcase views](#showcase-views), after the defaults).
- `defaultViews?` declares the adapter's default showcase views, e.g. `defaultViews: ['source', 'console']`: at least one view, none repeated, `none` alone; `['demo']` if left out. `showroom.json`'s `showcaseViews` overrides it, and a marker's `view=` overrides both. An invalid one fails loading the adapter.
- `recorded?: true` says that the adapter [records](#recorded-showcases) its showcases: its results carry a `recording` in place of `page` and `files`, its `defaultViews` must be given, without `demo`, and `view=demo` is an error on its showcases.
- `hostCopy?: { exclude, git }` says that the adapter uses the [host copy](#recorded-showcases): what it leaves out (`exclude`, patterns in `.gitignore` syntax matched against paths relative to the root, e.g. `['bin/', 'obj/']`), and whether it copies `.git` (`git`). A file is copied when any adapter using the host copy copies it. `recorded` and `hostCopy` are independent: an adapter may build a showcase frame in the host copy, or record without it. Either one invalid fails loading the adapter.
- `validate(showcase)` gets the `Showcase` with its options as the marker gives them, and returns, or resolves to, `{ options, errors: [] }` (the options as the adapter will use them) or `{ errors: [...] }`.
- The `project` a showcase adapter gets (`ShowcaseProject`, a copy) is the merged one, whichever of the stack adapter and `showroom.json`'s [`project`](#project) gave each value: the project information (`name` and the rest), `path` (the project file a stack adapter read, absent without one), `sourceRoot`, and `ignore`, `code` and `documentation`, every pattern that applies (the built-in documentation patterns among them, the output folder not). Paths are relative to the root, `.` for the root. A host check never runs when the check has no project (its project file can't be read, or it has no name).
- `check?(root, showcases, context)`, its **host check**, checks the host repository for what the adapter needs (e.g. a package installed), once per run when some showcase uses the adapter. It gets the `showcases` using the adapter whose validation passed, with their validated options, and the `context` (`ShowcaseCheckContext`: the `project`, a `ShowcaseProject`, and the `stack`, the name `showroom.json` gives, `custom` by default), and returns, or resolves to, a `ShowcaseHostCheck`: `{ errors, warnings }`, two lists of messages, either of them empty. Errors (the host requirements that are missing) fail the check, warnings don't; `showroom` prefixes both with the adapter's name. Any other result, or a `check?()` that throws, is an error of the adapter.
- `build(request)` builds one showcase, called by `showroom build`, `showroom serve` and `showroom check --showcases`, one showcase at a time. It gets a `ShowcaseBuildRequest`:
  - `root`: the host repository's absolute path;
  - `showcase`, and its validated `options`;
  - `virtualFiles`: the virtual files of its documentation file's folder, each saying whether `file=` named it (`named`) and whose entry point it is (`showcase`, a showcase's `id`; left out for a virtual file with no showcase adapter). They are in memory, not on disk, so put them before your tooling yourself;
  - `hostVirtualFiles`: every virtual file of the host repository, for imports reaching other folders;
  - `mode`: the mode to build in, `development` in `serve`, `production` in `build` and `check --showcases`;
  - `scratchFolder`: an empty folder for tools that must write to disk, removed after the build;
  - `project` and `stack`: as the host check's `context` has them;
  - `hostCopy`, for an adapter declaring `hostCopy` (a `ShowcaseHostCopy`): its `root`, the host copy's absolute path, and `run(command, args, options)`, which runs a command there under the [limits](#recorded-showcases) and resolves to a `ShowcaseRun`: its `recording`, and its `stdout` and `stderr` as text (within the output's cap, paths into the host copy made relative to the root), for a build step's diagnostics. `command` is a name, resolved from the `PATH` outside the host repository and the host copy (never a path; `node` is the Node.js running `showroom`); not found, it rejects. `options` (`ShowcaseRunOptions`): `phase`, `build` (a build step: its time limit 300 s, and `--pass-env`'s variables) or `run` (the recorded run: 30 s); `cwd`, relative to the host copy's root, never outside it (the documentation file's folder by default); `timeLimit`, in milliseconds, no longer than its phase's; and `env`, variables of the adapter's own, under the ones `showroom` sets;
  - `showcaseFolder`, for an adapter declaring `hostCopy` or `recorded`: a folder of the showcase's own, kept across `serve`'s runs (e.g. for its build's output).

  It returns a `ShowcaseBuildResult`:
  - `reads`: the files it read (paths relative to the root);
  - `checks`: the checks it ran to completion, if any (distinct names, e.g. `type check`; never `runtime`, which `showroom` adds for a recording);
  - `issues`, if any, each a `ShowcaseBuildIssue`: a `severity`, `error` (failing `showroom build` and `check --showcases`) or `warning` (failing nothing), a `message`, the `path` (relative to the root) and `line` it concerns, if any, and the `check` it belongs to, if any, one of `checks` (`showroom` checks that). An issue in a virtual file is reported in its documentation file, at its code block's line plus the issue's; one without a path, at the showcase's entry point. An error naming no check is the build's own: the result then has no `page` or `files`. Errors that all name a check (e.g. a type check's) leave the showcase frame usable, so the result has its files too;
  - `files` and `page`: the showcase frame, unless an error of the build itself prevented building it. Each file has a `path` relative to the showcase frame's folder (POSIX-style, with no `.`, `..` or empty segments, unique ignoring case) and its `content` (a string, or bytes as a `Uint8Array`); the `page` is one of them (an `.html` or `.htm` file, UTF-8 if given as bytes). `showroom` adds its frame script to the page (which also captures its [console](#the-console-panel)), and writes the files into the showcase frame's folder (`showcases/<documentation file's path>/<n>/` in the output folder), so relative references between them work.

  - `recording`, from a `recorded` adapter, in place of `files` and `page` (left out, with a warning, when it returns them too), unless an error of the build itself prevented building it: a `ShowcaseRecording`, as `run()` resolves to it, or of the adapter's own making: its `lines` (each a `ShowcaseConsoleLine`: a `level`, `log` or `error` for standard output and error, and a `text`), the number of earlier lines `dropped` (and how many of those were `droppedWarnings` and `droppedErrors`), whether the output was `cut` at its cap, and how it ended, exactly one of `exitCode`, `signal` and `timedOut` (with its `timeLimit`). `showroom` adds the `runtime` check, failing it as [Recorded showcases](#recorded-showcases) says. Another adapter's `recording` is left out, with a warning.

  A `build()` that throws, or returns anything else, fails the showcase too.

- `close?()` is called once at the end of a run, so an adapter can share work between its showcases.

The [`number-table` example](./examples/number-table/README.md) ([live](https://ofzza.github.io/showroom/#/examples/number-table/README.md)) is a custom showcase adapter of this repository's own, listed in its `showroom.json`: a JSON array of rows, shown as a table with its numbers formatted. Its first showcase is [`planets.json`](./examples/number-table/planets.json), linked as a showcase shown as a block, its code a click away:

[The planets](./examples/number-table/planets.json 'showcase=number-table({ caption: "The planets" }) block include=markdown')

See the rest in the example:

- [its options](./examples/number-table/README.md#options) ([live](https://ofzza.github.io/showroom/#/examples/number-table/README.md#options)), checked by `validate()`;
- its [errors and warnings](./examples/number-table/README.md#errors-and-warnings) ([live](https://ofzza.github.io/showroom/#/examples/number-table/README.md#errors-and-warnings));
- [the module](./examples/number-table/README.md#the-module) ([live](https://ofzza.github.io/showroom/#/examples/number-table/README.md#the-module)).

### Developing a custom showcase adapter

- **Try it in `serve`**: `npx showroom serve` loads the module, and loads it again whenever its content changes, then checks the host repository and builds every showcase again, so an edit to the module shows at once. The modules it imports aren't loaded again: restart `serve` after changing them. Changes to `showroom.json`, its `customShowcaseAdapters` included, apply without a restart.
- **Check it as CI does**: `npx showroom check --showcases --quiet --trust` builds every showcase in production mode, as `build` does, and fails on any error (e.g. `error: README.md:16: Showcase README.md#2 (README.md:14): <message>`); `serve` builds in development mode, and keeps serving whatever fails. Every `showroom check --trust`, `--showcases` or not, loads every listed module, used or not, and runs `validate()` and the host check.
- **The loader's errors**, reported against `showroom.json` as `Custom showcase adapter "<name>": <problem>`, where `<problem>` is one of:
  - `invalid name: use lower-case letters, digits and "-", starting with a letter`, or `the name is taken by a built-in showcase adapter`;
  - `"<path>" is outside the host repository`, `"<path>" must be a .js or .mjs file`, `"<path>" is not a file`, or `"<path>" not found`;
  - `"<path>" failed to load: <the error>` (e.g. a syntax error);
  - `"<path>" must have a default export: a function returning an object implementing the showcase adapter interface`;
  - `"<path>" failed to create its showcase adapter: <the error>`, when the default export throws (or its promise rejects);
  - `"<path>"'s default export must return an object implementing the showcase adapter interface`, followed by `; check "validate", "build"` naming the methods missing, or `check` and `close` when they aren't functions;
  - `"<path>"'s showcase adapter has invalid "defaultViews": <problem>`;
  - `"<path>"'s showcase adapter records its showcases, so it must declare "defaultViews", without "demo" (its showcases have no showcase frame)`, or `has invalid "recorded"` or `has invalid "hostCopy"` and what they must be.
- **Once loaded**, its own failures name it: `Showcase adapter "<name>" failed to validate the showcase: <the error>` (at the showcase), `… returned an invalid host check: <problem>`, `… failed to check the host repository: <the error>`, `… failed to close: <the error>`, and, for a showcase, `… failed to build the showcase: <the error>` or `… returned an invalid build result: <problem>`.

## Linked files

A file that a Markdown documentation file links to by a relative path, and that isn't a documentation file, is a **linked file**: a code file, an image, any other file in the host repository. Links to linked files work in the showroom, which copies each of them, and only them, never whole folders:

- a link to a linked file is marked with a "code" icon before its text;
- a text file up to 1 MB opens in the [showcase sidebar](#the-showcase-sidebar);
- any other file (a binary file, or a text file over 1 MB) opens in a new tab;
- a relative image (`![logo](./docs/logo.png)`) is shown from its linked file;
- a linked showcase's entry point is a linked file too: shown inline, its link, marked with a "play" icon instead, opens the showcase in the showcase sidebar, its source in its code pane; shown as a block, its code pane shows it;
- a showcase's included real files (`include=`) are linked files too, copied whether a link names them or not.

Whether a file is text is decided from its content (UTF-8 with no NUL byte), whatever its name. A link's fragment (e.g. `#L10`) is ignored. A linked file is copied even when the `ignore` patterns skip it (e.g. a file in `dist/`): the link states the intent, but a file missing where `showroom` runs (e.g. a build output not built in CI) is a broken link. It isn't copied when it is in the output folder, which `build` empties first, or when its real path leads outside the host repository through a symbolic link; `check` warns about both, and reports them as errors for an included file. A link to a folder with no `README` stays plain text.

`serve` and `build` hand out the linked files at `files/<path>`, next to the showroom's page: `build` copies them into the output folder, and `serve` answers only them there, from the host repository, so what you preview is what gets published.

### The showcase sidebar

The **showcase sidebar** is a panel sliding in from the right over the page (66% of the window's width, between 400 and 1200 px, and the whole width of a narrower window). It shows:

- a text linked file: its content syntax highlighted (by its extension, or its name when it has none, e.g. `Makefile`; plain text for a language highlight.js doesn't know) with line numbers and a copy button, as code blocks are, scrolling when needed, under a header with the file's name (cut short with "…" when it doesn't fit; its path in a tooltip), a link opening the file in a new tab, and a close button;
- a [code pane](#the-code-pane)'s tabs, in its sidebar state;
- a [linked showcase shown inline](#showcases), as its showcase block.

Escape, the close button, or a click on the dimmed page beside it closes it.

## The showroom

The showroom is the same in `showroom serve` and in what `showroom build` builds:

- **Pages and addresses**: a page per documentation file, its address in the URL's hash (e.g. `#/docs/guide.md`), and a home page (`#/`) with the project information and the root `README` (when the `README` opens with a level-1 heading, that heading is the home page's title, and the project information follows it). A heading's address is its page's, then `#` and its id (e.g. `#/docs/guide.md#install`), the ids GitHub gives headings. The header holds the project's name and version, and the theme toggle.
- **The navigation**: the [navigation](#navigation) lists the pages, the default one or the one `showroom.json` configures, and stays in view as a page scrolls.
- **The theme**: the header's toggle switches between light and dark. It starts from the browser's preference (`prefers-color-scheme`), and remembers your choice in that browser. Showcase frames follow it (see [Showcase frames](#showcase-frames)).
- **Markdown**: `.md` files are rendered as GitHub-flavoured Markdown, with the same heading ids as on GitHub; other documentation files are shown as plain text. In Markdown:
  - every code block is syntax highlighted with line numbers (which are never copied with the code), whatever its length, and has a copy button (shown only where the browser allows writing to the clipboard: over HTTPS, or on `localhost`);
  - raw HTML tags are left out, keeping the Markdown between them.
- **Links and images**:
  - relative links to documentation files (or to folders whose `README` is one) open their page, at a heading when they have a fragment (`./guide.md#install`); a fragment alone (`#install`) leads to a heading of the same page. `check` doesn't check fragments;
  - relative links to [linked files](#linked-files), marked with a "code" icon before their text, open them in the showcase sidebar, or in a new tab;
  - links to [linked showcases shown inline](#showcases), marked with a "play" icon, open them in the showcase sidebar;
  - absolute URLs open in a new tab;
  - other relative links (e.g. to a folder with no `README`, or a missing file) are shown as plain text;
  - relative images are shown from their linked files, or as their alt text when they're missing; absolute image URLs work.
- **The narrow layout**: on a narrow (phone) viewport, below 768 px, the navigation opens from the header's menu button instead of staying in view.

## `showroom check`

Checks the host repository in the current directory (or the one `--root` names):

```sh
$ npx showroom check [--root <dir>] [--out-dir <dir>] [--showcases] [--quiet] [--trust | --no-trust] [--pass-env <name>]...
```

- Every issue found goes to `stderr`, one per line, as `error: <path>: <message>` or `warning: <path>: <message>`, with the line (`<path>:<line>:`) when the issue concerns one, or as `error: <message>` when it concerns no file.
- If the check passes, the host information goes to `stdout`, as indented JSON, unless `--quiet` is given (e.g. in CI, where only the issues matter). If it fails, `stdout` stays empty.
- The exit code is `0` if the check passes, and `1` if it finds any error, or the arguments are wrong. Warnings alone don't fail it.

`--out-dir` overrides `showroom.json`'s `outDir`, relative to the current directory (as `--root` is); `check` takes it so it skips the same files `build` would.

`--trust` lets the host repository's code run, and `--no-trust` runs without it, without asking or warning about it; with neither, `check` asks in a terminal (see [Trust](#trust)): without trust, `check` loads no custom showcase adapter, runs no host check, and builds no showcase, even with `--showcases`.

`--pass-env <name>`, repeatable, passes the environment variable of that name on to [recorded showcases](#recorded-showcases)' build steps, never to their recorded run; `serve` and `build` take it too.

`--showcases` also builds every showcase, as `showroom build` does, and throws the result away, once the rest of the check finds no errors. A showcase that doesn't build, or whose checks find errors, is an error, naming the showcase and its entry point, then the check, if it belongs to one (e.g. `error: README.md:16: Showcase README.md#2 (README.md:14): type check: <message>`), placed where the issue is. A build's warnings are reported the same way, as warnings. Without it, `check` builds nothing, so it stays fast; under trust, it still runs each showcase adapter's host check (e.g. that React is installed for `react` showcases), so the packages the showcases need must be installed for it to pass. Run `check --showcases --trust` in CI to catch showcases that no longer build.

Errors are:

- a missing or invalid `showroom.json` (an unknown key, a value of the wrong type, `showcaseViews` naming no showcase adapter, an invalid [navigation](#navigation) item, a `project` that isn't an object, a stack adapter's name in another case as `stack`, or, without a stack adapter, a `project` with no `name` or with a `path`);
- project information that can't be read, a project with no name, or a `project.path` outside the host repository;
- a source root that doesn't exist or is outside the host repository, and an output folder that is the host repository's root or outside it;
- a [navigation](#navigation) path that leads to no documentation file;
- a [broken showcase](#status-marks-and-issues), a failed [recording](#recorded-showcases) (with `--showcases`), `view=demo` on a recorded showcase (or `showcaseViews` giving its showcase adapter `demo`), an [included file](#showcases) that doesn't exist or isn't copied (in the output folder, or outside the host repository through a symbolic link), and a showcase adapter's missing host requirements;
- a [custom showcase adapter](#custom-showcase-adapters-experimental) that doesn't load.

Warnings are:

- several documentation files of the same kind in one folder;
- documentation files the [navigation](#navigation) leaves out, and its other warnings;
- broken links and images;
- [linked files](#linked-files) that aren't copied (in the output folder, or outside the host repository through a symbolic link);
- a host check's warnings (e.g. a TypeScript 7, whose type checking is skipped);
- without [trust](#trust), the custom showcase adapters not loaded, the host checks not run, or the showcases not built.

A link (or reference definition, or image) in a Markdown documentation file is broken when its relative target, URL-decoded and without its query and fragment, leads outside the host repository, or to nothing on disk; links to fragments only, and absolute URLs, are not checked.

The host information has this shape (types `HostInformation`, `ProjectInformation`, `DocumentationFile`, `Showcase`, `VirtualFile`, `LinkedFile` and `NavigationItem`):

````json
{
  "project": { "name": "my-library", "version": "1.0.0" },
  "documentation": [
    { "path": "README.md", "kind": "readme", "extension": ".md", "content": "# My library\n\n```html showcase\n<p>Hi</p>\n```\n", "heading": "My library" }
  ],
  "code": ["src/index.ts"],
  "showcases": [
    {
      "id": "README.md#1",
      "documentation": "README.md",
      "line": 3,
      "offset": 14,
      "kind": "code-block",
      "display": "block",
      "adapter": "html",
      "entry": "README.showcase-1.html",
      "include": [],
      "tabs": [{ "kind": "source" }],
      "views": ["demo"]
    }
  ],
  "virtualFiles": [
    {
      "path": "README.showcase-1.html",
      "named": false,
      "showcase": "README.md#1",
      "content": "<p>Hi</p>",
      "documentation": "README.md",
      "line": 3,
      "offset": 14
    }
  ],
  "linkedFiles": [{ "path": "src/index.ts", "size": 1024, "text": true }],
  "navigation": [{ "kind": "page", "label": "My library", "path": "" }]
}
````

- **Documentation files** have a `kind` of `readme`, `contribute`, `license`, or `other` for the files the `documentation` patterns add, and a Markdown one its first `heading` (left out when it has none).
- **A showcase** has an `id` (its documentation file and its position there), the `line` and character `offset` of its entry point (the code block, or the link), its `kind` (`code-block` or `link`), how it is shown (`display`: `block`, or `inline` for a linked showcase without the `block` key), its showcase `adapter`, its `options` as the showcase adapter validated them (left out when there are none), the path of its `entry` point (a virtual file, or the linked file), the paths of its included files (`include`, in the marker's order, without its keywords; empty when it has none), its `tabs` in their order (`{ "kind": "source" }`, `{ "kind": "markdown" }`, or `{ "kind": "file", "path": … }` for an included file), its showcase `views`, after the defaults (`none` for a linked showcase shown inline without `view=`), and `overlays: true` when its marker has the `overlays` key (left out otherwise).
- **A virtual file** has its `path`, whether `file=` `named` it (or its name was generated), the `showcase` whose entry point it is (its `id`; left out for a virtual file with no showcase adapter), its `views` (only for a virtual file with no showcase adapter: `source`, `markdown` or `none`), its `content`, and the `documentation` file, `line` and character `offset` of its code block.
- **A linked file** has its `path`, its `size` in bytes, and whether it is `text` (UTF-8 with no NUL byte, and no larger than 1 MB, so the showroom shows it in the showcase sidebar).
- **`navigation`** is there only when `showroom.json` configures one, resolved: each item a `page` (its `label`, its documentation file's `path`, empty for the home page, and its `anchor`, if any), a `url` (its `label` and `url`), or a `group` (its `label` and `items`), with patterns expanded.

Paths are POSIX-style and relative to the host repository's root. Documentation files and linked files are sorted by path, showcases and virtual files by documentation file and line.

## `showroom serve`

Serves the showroom of the host repository in the current directory (or the one `--root` names), for previewing it while writing its documentation:

```sh
$ npx showroom serve [--root <dir>] [--port <port>] [--out-dir <dir>] [--trust | --no-trust] [--pass-env <name>]...
```

- It checks the host repository first, as `showroom check` does, deciding [trust](#trust) for its whole session. If the check fails, it writes the issues to `stderr` and exits with `1` without serving. Without trust, it builds no showcase, and serves every showcase's source.
- It then builds every showcase, in development mode, and writes the check's issues and the showcases' build errors and warnings to `stderr`. A showcase that doesn't build doesn't stop it: it shows "Not built", with its errors in its [status marks and issue list](#status-marks-and-issues), and every other showcase is shown as usual; one whose check finds errors (e.g. a type error) is served as built, beside its errors.
- It then serves [the showroom](#the-showroom) with Vite's dev server on `--port` (default: `5173`, or the next free port), on `localhost` only, writing its URL to `stdout`, until you stop it with Ctrl+C. To look at the showroom from another device, `build` it, and serve its output folder over HTTP. The showcase frames are served from memory, and the [linked files](#linked-files) from the host repository, at the same paths `build` writes them to; nothing is written into the host repository.
- It watches the host repository, skipping the files the `ignore` patterns skip, and the output folder (`--out-dir`, as for `check`). After any change it checks the host repository again and, when the check passes, builds every showcase again, then updates the page as the table below says. A failed check keeps showing the last good data.
- The current issues (the check's errors and warnings, and the showcases' build errors and warnings) are shown in the **issues bar** at the top of the page, which you can collapse, and are written to `stderr` whenever they change. The issues bar is gone once there are none.
- Files the `ignore` patterns skip (e.g. under `dist/`) aren't watched, except the files the latest showcase builds read (e.g. the host's own package's `dist/`, which a `ts` showcase imports by the package's name), the custom showcase adapter modules, and the linked files: a change to one checks and builds again, as any change does, so `tsc --watch` running alongside `serve` updates the showcases. While a showcase doesn't build, the files earlier builds read stay watched too, so it recovers once they're back (e.g. after `dist/` is deleted and built again). They never become documentation or code files, and files under `node_modules`, `.git` or `test-results` are never watched.

| A change to …                                                                                                                                     | What `serve` does                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| The project information, or a documentation file (a code block showcase's code, and any other virtual file, are part of their documentation file) | Reloads the page                                                      |
| The showcases: one added, removed or moved                                                                                                        | Reloads the page                                                      |
| The linked files: one added or removed, or changing its size                                                                                      | Reloads the page                                                      |
| Only showcase frames (e.g. a linked showcase's page, or another file a build reads)                                                               | Reloads only their iframes; the page stays where it is                |
| Only a showcase's status marks and issues (including a showcase that stops building, or builds again)                                             | Updates them; the page stays where it is                              |
| A text file a code pane or showcase sidebar tab shows (e.g. an included file no build reads)                                                      | Only that tab fetches it again                                        |
| `showroom.json`, its `customShowcaseAdapters` included                                                                                            | Applies it, with no restart                                           |
| A [custom showcase adapter](#custom-showcase-adapters-experimental) module                                                                        | Loads it again; restart `serve` after changing the modules it imports |

Each run keeps Vite's cache in a fresh folder in the system's temporary folder, and removes it on exit; starting takes a few seconds while Vite prepares the dependencies.

## `showroom build`

Builds the showroom of the host repository in the current directory (or the one `--root` names) into its output folder, as static files:

```sh
$ npx showroom build [--root <dir>] [--out-dir <dir>] [--trust | --no-trust] [--pass-env <name>]...
```

- It checks the host repository first, as `showroom check` does, writing the issues to `stderr`. If the check fails, it exits with `1` without building. Without [trust](#trust), it builds no showcase, and the showroom it publishes shows every showcase's source.
- It then builds every showcase. If any doesn't build, it writes every build error to `stderr` (as `check --showcases` does), and exits with `1`, leaving the output folder untouched. The builds' warnings are written to `stderr` too, and don't fail it.
- The output folder is `outDir` from `showroom.json` (default: `./showroom`), or `--out-dir`, relative to the current directory. It must be inside the host repository, and can't be its root; `build` refuses one that is a symbolic link, or that leads outside the host repository through one.
- **The output folder is emptied before every build.** To keep a mistyped `outDir` from deleting your files, every build writes a `.showroom` marker file into it, and `build` refuses (exiting with `1`) to empty a folder that isn't empty and holds no `.showroom` marker. A missing or empty folder, or one an earlier build marked, is fine.
- It writes the output folder's path to `stdout` once built, and exits with `0`. Warnings from the check don't fail it.

The output is an `index.html`, its `assets/`, the showcase frames in `showcases/` (one folder per showcase, `showcases/<documentation file's path>/<n>/`), the [linked files](#linked-files) in `files/` (each at `files/<path>`), the shared Mermaid bundle in `mermaid/` (only when a [`jsonschema` showcase](#jsonschema-showcases) is built) and the `.showroom` marker, with relative paths throughout, so it works wherever it's hosted, under any path (e.g. GitHub Pages' `https://<user>.github.io/<repo>/`). Pages are addressed in the URL's hash, so the host needs no rewrite rules. It needs to be served over HTTP: browsers won't run it from `file://`. Add the output folder to your `.gitignore`, unless you mean to commit it.

## Publishing to GitHub Pages

`showroom` only builds; publishing is up to the host repository. With `showroom` in its `devDependencies`, a GitHub Actions workflow like this one (e.g. `.github/workflows/showroom.yml`) builds and publishes the showroom on every push to `master`, once the repository's Settings › Pages › Source is set to "GitHub Actions". It builds with `--trust`, in a job that can only read the repository, and deploys from another (see [Trust](#trust)):

```yaml
name: Showroom

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build --if-present
      - run: npx showroom build --trust
      - uses: actions/upload-pages-artifact@v5
        with:
          path: showroom

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

- Publishing this way skips Jekyll, so no `.nojekyll` file is needed.
- If you configured another `outDir`, change the artifact's `path` to match.
- `npm run build --if-present` builds the host's own package first, for showcases that import it by its name (through its `package.json`'s `exports`, pointing at its `dist/`); drop it if none does.
- Without a lockfile (`package-lock.json`), drop `cache: npm`, and run `npm install` instead of `npm ci`.
- Without `showroom` in `devDependencies`, run `npx --yes @ofzza/showroom build --trust` instead of `npx showroom build --trust`.
- Run `npx showroom check --showcases --quiet --trust` in your CI workflow too, so a showcase that no longer builds is caught before a push to `master` publishes; check out with `persist-credentials: false` there too, and never with `--trust` for pull requests from forks (see [Trust](#trust)).

This repository publishes its own showroom with [`.github/workflows/showroom.yml`](./.github/workflows/showroom.yml), this workflow but for two steps: its `npm ci` builds `showroom` already (its `prepare` script), so it has no build step, and it runs `node dist/cli/bin.js build --trust`, as a package's own `bin` isn't linked into its own `node_modules`.

## Troubleshooting

- **Every showcase shows its source, "Source only: not trusted"**: `showroom` ran without [trust](#trust), so it ran none of the host repository's code. Pass `--trust`, or answer yes when `showroom` asks, if you trust the repository; restart `serve` to do so.
- **A showcase shows "Not built"**: it didn't build (e.g. a syntax error, or an import that doesn't resolve). Its issue list says why, and so do `serve`'s `stderr` and `npx showroom check --showcases`. See [Status marks and issues](#status-marks-and-issues).
- **TS2307, or TS2882, on a CSS or asset import**: TypeScript doesn't know what Vite bundles. Add `/// <reference types="vite/client" />` to a `.d.ts` file the tsconfig includes, or declarations of your own (e.g. `declare module '*.css';`), or turn `typeCheck` off. See [Type checking](#type-checking).
- **TS7016 on a `.js` import**: a `.js` file without declarations, under `strict`. Give the showcase the `allowJs` option (`showcase=ts({ allowJs: true })`). See [Type checking](#type-checking).
- **"no TypeScript is installed where it can be found"**, or **"type checking skipped"**: the showcases that type check need TypeScript 5.x or 6.x, found as Node finds `typescript` from the documentation file's folder; TypeScript 7 isn't supported yet. Install `typescript`, or set `typeCheck: false`. See [Type checking](#type-checking).
- **The host's own package doesn't resolve**: a showcase imports it by its name through its `package.json`'s `exports`, which usually point at its `dist/`: build it first (in CI too). See [`ts` showcases](#ts-showcases).
- **A `Broken link` warning**: a relative link (or image) leads outside the host repository, or to nothing on disk, e.g. a build output not built where `showroom` runs. See [`showroom check`](#showroom-check) and [Linked files](#linked-files).
- **`build` refuses to empty the output folder**: `error: Output folder "<path>" is not empty, and holds no .showroom file from an earlier build; empty or delete it, or choose another output folder`. `build` only empties a folder it built before; check `outDir`, then empty or delete the folder yourself. See [`showroom build`](#showroom-build).
- **`Source root "src" is not a directory`**: the stack adapter looks for code under `src/` by default. Set `project`'s `sourceRoot` to where your code is (e.g. `"project": { "sourceRoot": "lib" }`, or `"."`). See [Configuration](#configuration-showroomjson).
- **`check --showcases` fails in CI, while `serve` worked**: `serve` keeps serving a showcase that fails, showing its issues, where `check --showcases` and `build` fail on them; they also build in production mode, where `serve` builds in development mode. And CI may lack what your machine has: the dependencies installed, or the host's own package built. See [`showroom check`](#showroom-check) and [`ts` showcases](#ts-showcases).

## API

Everything the command line does is also exported, except serving and building, which are only available through the command line and `main()`:

```ts
import { check, main, readConfiguration, getStackAdapter, getStackAdapterNames, type CheckResult, type CliInput, type TrustRequest } from '@ofzza/showroom';

// Checks a host repository, and collects its host information if the check passes
const result: CheckResult = await check('./path/to/host');
// The output folder can be overridden, as with --out-dir; showcases: true also builds every showcase, as with --showcases; trust: true lets the
// host repository's code run, as with --trust
await check('./path/to/host', { outDir: './path/to/host/site', showcases: true, trust: true });
// passEnv passes environment variables on to recorded showcases' build steps, as with --pass-env
await check('./path/to/host', { showcases: true, trust: true, passEnv: ['NUGET_AUTH_TOKEN'] });
// Or decide it once the check knows what would run
const decided = await check('./path/to/host', {
  trust: async (request: TrustRequest) => {
    console.log(request.customShowcaseAdapters, request.tools, request.executables, request.showcases, request.recorded);
    return false;
  },
});
console.log(decided.trusted);
if (result.passed) {
  console.log(result.host?.code);
}
for (const issue of result.issues) {
  console.error(issue.severity, issue.path, issue.line, issue.check, issue.message);
}
for (const showcase of result.host?.showcases ?? []) {
  console.log(showcase.id, showcase.adapter, showcase.entry);
}

// Reads and validates a host repository's showroom.json
const { configuration, errors } = await readConfiguration('./path/to/host');

// Looks up a built-in stack adapter by name, and reads the project information from the project file, which showroom.json's project overrides
const adapter = getStackAdapter(configuration?.stack ?? 'typescript');
const read = await adapter?.readProject('./path/to/host', configuration?.project?.path ?? adapter.defaultProject);
console.log(getStackAdapterNames(), read?.name ?? configuration?.project?.name, errors);

// Runs the command line, with its output and its trust prompt's input given
const code = await main(
  ['check', '--quiet', '--root', './path/to/host'],
  { stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text) },
  { isTerminal: true, ask: async (question) => (console.log(question), 'n') } satisfies CliInput,
);
console.log(code);
```

- `check(root, options?)`: checks a host repository and collects its host information; resolves to a `CheckResult` (`passed`, `host` when it passed, `issues`, each with its `severity`, `message`, the `path` and `line` it concerns, if any, and the `check` a showcase's issue belongs to, if any, e.g. `type check`, and `trusted`, whether the host repository's code was allowed to run). `options` (`CheckOptions`) overrides the configuration: `outDir`, absolute or relative to the current directory; `showcases: true` also builds every showcase, failing the check on any that doesn't build, or whose checks find errors; `trust` decides whether the host repository's code runs (see [Trust](#trust)): `false` by default, `true`, or a function called at most once, only when the host repository has something to trust, after `showroom.json` is read and the documentation files scanned and before any of its code runs, with a `TrustRequest` (the custom showcase adapter modules, by name and real path; the tools a build would load, by package name and real path, including TypeScript, Angular's compiler and the CSS preprocessors resolvable from the host repository, as the bundler and its plugins may load more; the `executables` the built-in showcase adapters would start, by name and real path; the number of showcases; and how many of them would be `recorded` by a built-in showcase adapter), resolving to the decision (a rejection means no trust); and `passEnv` names environment variables passed on to [recorded showcases](#recorded-showcases)' build steps, as `--pass-env` does.
- `readConfiguration(root)` / `validateConfiguration(value)`: read and validate a `showroom.json`, resolving to either a `configuration` or `errors`. Its `stack` is optional, and its `project` an object (`ProjectConfiguration`, see [`project`](#project)), each key a value or `null`.
- `getStackAdapter(name)` / `getStackAdapterNames()`: look up the built-in stack adapters, which implement the `StackAdapter` interface; `TypeScriptStackAdapter` is the `typescript` one, and `DotNetStackAdapter` the `dotnet` one. `readProject(root, project?)` reads the project information, from the file `project` names (relative to `root`) or the stack adapter's default (`defaultProject`, none for `dotnet`), as far as it gives it: its `name` too may be missing (`Partial<ProjectInformation>`), as `showroom.json`'s `project` can give it.
- `main(args, output?, input?)`: runs the command line with the given arguments, resolving to its exit code; `USAGE` is its help text. `output` (`CliOutput`: `stdout` and `stderr` functions) defaults to the process's streams. `input` (`CliInput`) is what the [trust](#trust) prompt asks through: `isTerminal`, whether it may ask at all, and `ask(question)`, resolving to the line typed, `''` at the end of the input, or `null` on Ctrl-C (which ends the command with `130`); it defaults to the terminal on the process's standard input, never a pipe.
- Constants: `CONFIGURATION_FILE_NAME` (`showroom.json`), `DEFAULT_OUT_DIR` (`./showroom`), and `BUILT_IN_DOCUMENTATION` (the built-in documentation patterns).
- Types: `HostInformation`, `ProjectInformation`, `DocumentationFile`, `DocumentationKind`, `Showcase` (with its `views`, `tabs` and `overlays`), `ShowcaseTab` (`source`, `markdown`, or an included `file`), `ShowcaseKind`, `ShowcaseDisplay`, `ShowcaseView` (`markdown`, `source`, `demo`, `console` or `none`), `VirtualFile` (with its fence's `offset`, and its `views` when it has no showcase adapter), `LinkedFile`, `NavigationItem` (the resolved navigation, `HostInformation.navigation`), `Configuration`, `ProjectConfiguration` (its `project`), `NavigationEntry` (an item of its `navigation`), `ConfigurationResult`, `StackAdapter`, `CheckOptions`, `CheckResult`, `CheckIssue`, `CheckIssueSeverity`, `TrustRequest`, `CliOutput` and `CliInput`.
- Experimental types, for [custom showcase adapters](#custom-showcase-adapters-experimental): `ShowcaseAdapter`, `ShowcaseValidation`, `ShowcaseHostCheck`, `ShowcaseCheckContext`, `ShowcaseProject`, `ShowcaseBuildRequest`, `ShowcaseBuildResult`, `ShowcaseBuildFile`, `ShowcaseBuildIssue`, and for [recorded showcases](#recorded-showcases) `ShowcaseHostCopyContent`, `ShowcaseHostCopy`, `ShowcaseRunOptions`, `ShowcaseRun`, `ShowcaseRecording` and `ShowcaseConsoleLine`.

# Development

Developing `showroom` needs Node.js 22.13 or later, or 24, and the .NET SDK 10 or later on the `PATH`, for the `cs` showcase adapter's tests and example. Setting up, the test tiers, and trying a change in the showroom are in [CONTRIBUTE.md](./CONTRIBUTE.md).

- `npm run build` - cleans `dist/`, compiles `src/` into it with declarations, copies the showroom's `index.html`, and builds the shared Mermaid bundle into `dist/mermaid/`; also run on `prepare`, so a local `npm install` builds too.
- `npm run dev` - the same, in watch mode (restart it after changing `src/app/index.html`); the Mermaid bundle is only built again when Mermaid's version or its build changed.
- `npm run build-mermaid` - builds only the shared Mermaid bundle (`build/mermaid/`) into `dist/mermaid/`, which showcase frames drawing diagrams load.
- `npm start` - runs the built command line; pass it arguments after `--`, e.g. `npm start -- check --root test/fixtures/minimal`.
- `npm test` - runs every `test:*` script:
  - `npm run test:unit` - the unit tests, executed and type checked.
  - `npm run test:integration` - the showcase adapters' real builds, on the fixture host repositories.
  - `npm run test:e2e` - the command line and `build()`, on copies of the fixture host repositories.
  - `npm run test:serve` - `serve()` and its dev server, on copies of the fixture host repositories.
- `npm run ci` - runs every `ci:*` script: build, `showroom check --showcases --quiet` on this repository itself, ESLint, Prettier, and every test tier; what GitHub Actions runs, against Node 22 and 24, and what `prepublishOnly` runs before `npm publish`.

# Contributing

For reporting issues, contribution workflow and branching, see [CONTRIBUTE.md](./CONTRIBUTE.md).
For releasing a version, see [PUBLISH.md](./PUBLISH.md).

MIT - see [LICENSE.md](./LICENSE.md).
