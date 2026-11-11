# Specification

approved 2026-11-09

## What this project is

`@ofzza/tsshowcase` is a Node/TypeScript tool published to NPM. A host repository (TypeScript, React, Angular, …) includes it to build a showcase application, and keep it up to date. The showcase application presents the host repository, and is fit to be published as static files (e.g. to GitHub Pages).

Example host repositories it will be used with: `../tsstd`, `../tsschema`, `../dotnetschema`.

## _`S4`_ HARD RULES

approved 2026-11-09

- None yet.

## _`S5`_ Project and first version

approved 2026-11-09

### Must-haves

- _`D13`_ (was must-have 1; `live`): **Build a showcase application** from a host repository: a React/FluentUI web SPA, deployable as static files (e.g. GitHub Pages).
  - It's a one-shot CLI command, `tsshowcase build`, run locally or in CI (_`D4`_). Keeping the showcase application up to date means rerunning it.
  - `tsshowcase serve` serves the showcase application locally, with Vite's dev server, and reloads it when a documentation file changes, for previewing it while writing the host repository's documentation (_`D4`_).
  - It generates a Vite project and builds it against the host repository (_`D2`_).
  - It only builds, into an output folder: `./showcase` by default, configurable. Deploying it is the host repository's job; the README documents an example GitHub Pages workflow (_`D7`_).
  - Theming: FluentUI's built-in light and dark themes, with a toggle (_`D9`_).
  - It presents the project information and the documentation files; code blocks in rendered Markdown are syntax highlighted (_`D12`_).
- _`D14`_ (was must-have 2; `live`): **Information taken from the host repository:**
  1.  **Project information.** How it's detected (`package.json`, `.sln`, …) is either a configuration item or part of the selected stack adapter.
  2.  **Documentation files (_`D6`_)**, mostly but not only Markdown:
      - by default, `README`, `CONTRIBUTE` and `LICENSE` in the host repository's root, and `README` files anywhere in the host repository, except what is ignored (_`D10`_);
      - the stack adapter's and the configuration's documentation patterns add files to these defaults, or remove them (`.gitignore`-style, see _`D10`_).

      Finding and reading them is case-insensitive, accepts both UK and US spelling, and accepts the `.md` extension, `.txt`, or none.

  3.  **An index of the code files** under a specified source root directory: their paths only, not their contents (_`D3`_). Which files count as code is set by patterns (e.g. `*.ts`, `*.cs`), from the selected stack adapter and the configuration (_`D10`_).
- _`D15`_ (was must-have 3; `live`): **Stack adapters.** Where different kinds of host repository (React, Angular, other languages and frameworks) need their own implementation, each one is a separate stack adapter implementing a common interface. The interface must leave room for the others. The first stack adapter is a **TypeScript stack adapter**: it reads `package.json` and treats TypeScript and JavaScript files as code, so it covers plain TypeScript and React libraries alike; a React-specific stack adapter comes with showcases (_`D1`_).
- _`D16`_ (was must-have 4; `live`): **Configuration:** a mandatory JSON config file at the host repository's root, `tsshowcase.json`, naming the stack adapter, plus a few CLI flags that override it (_`D5`_).
- _`D17`_ (was must-have 5; `live`): **Installation:** tsshowcase can be installed with NPM globally, or locally in the host repository and run through `npx` (added by the user after approval, 2026-11-09).

### Ideas and later

- **Showcases:** demoable, renderable, possibly editable code examples, embedded into the showcase application alongside the documentation. They come later.
- Stack adapters for other languages and frameworks (Angular, .NET, …).
- **SCM adapters** (GitHub, GitLab, Bitbucket, …), to link to, read or show each indexed file's contents from there (_`D3`_).
- A typed config file, `tsshowcase.{js,ts}`, as many NPM CLI tools have (_`D5`_).
- **Code browsing:** showing the code file index, and later the files' contents, in the showcase application (_`D3`_, _`D12`_).

### Time and complexity budget

- _`D18`_ (`live`): Relatively small and simple.
- _`D19`_ (`live`): Push complexity onto the host repository owner whenever possible, instead of trying to guess what the host repository needs. It's fine to require the host repository to follow a prescribed structure and/or provide configuration.
- _`D20`_ (`live`): Iterate quickly: a working version as soon as possible. Everything that can be done or decided later is left for later.

### Decisions

- _`D1`_ (`live`): First stack adapter: a TypeScript stack adapter (`package.json`; TypeScript and JavaScript files as code). Rejected: a React-only adapter (nothing React-specific to do yet), and no adapter (postpones the interface).
- _`D2`_ (`live`): The showcase application is a generated Vite project, built against the host repository. Rejected: a prebuilt SPA shipped in the package with a data file (simpler now, but showcases would need a bundler anyway; see _`K1`_).
- _`D3`_ (`live`): Code files: only an index of their paths for now, no contents. Showing contents can come later, through SCM adapters. Rejected: a source browser, and API docs extracted from the code.
- _`D4`_ (`live`): A one-shot `tsshowcase build` CLI command, plus `tsshowcase serve`, a dev server reloading on documentation changes (updated 2026-11-09: the user asked for `serve`, replacing a development-only preview script; originally no watch mode or dev server).
- _`D5`_ (`live`): Configuration: a JSON config file at the host root, `tsshowcase.json`, plus CLI flags overriding it. The file is mandatory, and `stack` is required in it (updated 2026-11-09, from _`P1`_'s _`D27`_). A typed `tsshowcase.{js,ts}` may come later.
- _`D6`_ (`live`): Markdown: root `README`/`CONTRIBUTE`/`LICENSE`, `README` anywhere, plus files the stack adapter or the configuration adds. Rejected: root only; source root only.
- _`D7`_ (`live`): tsshowcase only builds, into `./showcase` by default; deploying is the host's job. Rejected: a `deploy` command.
- _`D8`_ (`live`): No enforcement (`check`) action: the user chose to start fresh, without the earlier brief. The `tsshowcase check` command planned in _`P1`_ (_`D30`_) is a different thing: it only reports problems with reading the host repository.
- _`D9`_ (`live`): Theming: FluentUI's built-in light and dark themes, with a toggle; no custom theming for now.
- _`D10`_ (`live`): Which files are ignored, which count as code, and which are documentation are each set by a list of `.gitignore`-style patterns: the stack adapter's (e.g. ignoring `node_modules` for TypeScript, `bin` and `obj` for .NET) come first, and the configuration's extend them, re-including files with `!` (updated 2026-11-09, from _`P1`_'s _`D28`_ and _`D34`_). Rejected: the host's `.gitignore`; only git-tracked files; configuration-only exclusions.
- _`D11`_ (`live`): The adapters for where the host repository's code is kept are called SCM adapters (source code management). Rejected: "SVC adapter" (not an established abbreviation), "Hosting adapter" (confusable with where the showcase application is published), "Repository adapter" (confusable with the host repository).
- _`D12`_ (`live`; supersedes _`D43`_ (PLAN.md)): The showcase application shows the project information and the documentation files only; the code file index is collected but not shown yet (code browsing comes later). Code blocks in rendered Markdown are syntax highlighted (a must-have the user added, 2026-11-09).

## Pitfalls

[See Pitfalls](./SPEC-pitfalls.md)

## Open points

- None yet.
