# Changelog

All notable changes to `@ofzza/showroom`, by version as published to npm. This project is before its 1.0 release, so any version may change what it does; the showcase adapter interface (`ShowcaseAdapter` and its types) is experimental, and may change in any release until it is declared stable.

## Unreleased

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
