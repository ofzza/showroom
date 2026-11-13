# Specification

approved 2026-11-09

## What this project is

`@ofzza/showroom` is a Node/TypeScript tool published to NPM. A host repository (TypeScript, React, Angular, …) includes it to build a showroom, and keep it up to date. The showroom presents the host repository, and is fit to be published as static files (e.g. to GitHub Pages).

Example host repositories it will be used with: `../tsstd`, `../tsschema`, `../dotnetschema`.

## _`S4`_ HARD RULES

approved 2026-11-09

- None yet.

## _`S5`_ Project and first version

approved 2026-11-09

### Must-haves

- _`D13`_ (was must-have 1; `live`, refined by _`D82`_ (SPEC-S6-showcases.md)): **Build a showroom** from a host repository: a React/FluentUI web SPA, deployable as static files (e.g. GitHub Pages).
  - It's a one-shot CLI command, `showroom build`, run locally or in CI (_`D4`_). Keeping the showroom up to date means rerunning it.
  - `showroom serve` serves the showroom locally, with Vite's dev server, and reloads it when a documentation file changes, for previewing it while writing the host repository's documentation (_`D4`_).
  - It generates a Vite project and builds it against the host repository (_`D2`_).
  - It only builds, into an output folder: `./showroom` by default, configurable. Deploying it is the host repository's job; the README documents an example GitHub Pages workflow (_`D7`_).
  - Theming: FluentUI's built-in light and dark themes, with a toggle (_`D9`_).
  - It presents the project information and the documentation files; code blocks in rendered Markdown are syntax highlighted (_`D12`_).
- _`D14`_ (was must-have 2; `live`): **Information taken from the host repository:**
  1.  **Project information.** How it's detected (`package.json`, `.sln`, …) is either a configuration item or part of the selected stack adapter.
  2.  **Documentation files (_`D6`_)**, mostly but not only Markdown:
      - by default, `README`, `CONTRIBUTE` and `LICENSE` in the host repository's root, and `README` files anywhere in the host repository, except what is ignored (_`D10`_);
      - the stack adapter's and the configuration's documentation patterns add files to these defaults, or remove them (`.gitignore`-style, see _`D10`_).

      Finding and reading them is case-insensitive, accepts both UK and US spelling, and accepts the `.md` extension, `.txt`, or none.

  3.  **An index of the code files** under a specified source root directory: their paths only, not their contents (_`D3`_). Which files count as code is set by patterns (e.g. `*.ts`, `*.cs`), from the selected stack adapter and the configuration (_`D10`_).
- _`D15`_ (was must-have 3; `live`, refined and changed by _`D96`_ (SPEC-S6-showcases.md)): **Stack adapters.** Where different kinds of host repository (React, Angular, other languages and frameworks) need their own implementation, each one is a separate stack adapter implementing a common interface. The interface must leave room for the others. The first stack adapter is a **TypeScript stack adapter**: it reads `package.json` and treats TypeScript and JavaScript files as code, so it covers plain TypeScript and React libraries alike; a React-specific stack adapter comes with showcases (_`D1`_).
- _`D16`_ (was must-have 4; `live`): **Configuration:** a mandatory JSON config file at the host repository's root, `showroom.json`, naming the stack adapter, plus a few CLI flags that override it (_`D5`_).
- _`D17`_ (was must-have 5; `live`): **Installation:** `showroom` can be installed with NPM globally, or locally in the host repository and run through `npx` (added by the user after approval, 2026-11-09).

### Ideas and later

- **Showcases:** demoable, renderable, possibly editable code examples, embedded into the showroom alongside the documentation. They come later.
- Stack adapters for other languages and frameworks (Angular, .NET, …).
- **SCM adapters** (GitHub, GitLab, Bitbucket, …), to link to, read or show each indexed file's contents from there (_`D3`_).
- A typed config file, `showroom.{js,ts}`, as many NPM CLI tools have (_`D5`_).
- **Code browsing:** showing the code file index, and later the files' contents, in the showroom (_`D3`_, _`D12`_).

### Time and complexity budget

- _`D18`_ (`live`): Relatively small and simple.
- _`D19`_ (`live`, refined by _`D80`_ (SPEC-S6-showcases.md)): Push complexity onto the host repository owner whenever possible, instead of trying to guess what the host repository needs. It's fine to require the host repository to follow a prescribed structure and/or provide configuration.
- _`D20`_ (`live`): Iterate quickly: a working version as soon as possible. Everything that can be done or decided later is left for later.

### Decisions

- _`D1`_ (`live`): First stack adapter: a TypeScript stack adapter (`package.json`; TypeScript and JavaScript files as code). Rejected: a React-only adapter (nothing React-specific to do yet), and no adapter (postpones the interface).
- _`D2`_ (`live`): The showroom is a generated Vite project, built against the host repository. Rejected: a prebuilt SPA shipped in the package with a data file (simpler now, but showcases would need a bundler anyway; see _`K1`_).
- _`D3`_ (`live`): Code files: only an index of their paths for now, no contents. Showing contents can come later, through SCM adapters. Rejected: a source browser, and API docs extracted from the code.
- _`D4`_ (`live`): A one-shot `showroom build` CLI command, plus `showroom serve`, a dev server reloading on documentation changes (updated 2026-11-09: the user asked for `serve`, replacing a development-only preview script; originally no watch mode or dev server).
- _`D5`_ (`live`): Configuration: a JSON config file at the host root, `showroom.json`, plus CLI flags overriding it. The file is mandatory, and `stack` is required in it (updated 2026-11-09, from _`P1`_'s _`D27`_). A typed `showroom.{js,ts}` may come later.
- _`D6`_ (`live`): Markdown: root `README`/`CONTRIBUTE`/`LICENSE`, `README` anywhere, plus files the stack adapter or the configuration adds. Rejected: root only; source root only.
- _`D7`_ (`live`): `showroom` only builds, into `./showroom` by default; deploying is the host's job. Rejected: a `deploy` command.
- _`D8`_ (`live`): No enforcement (`check`) action: the user chose to start fresh, without the earlier brief. The `showroom check` command planned in _`P1`_ (_`D30`_) is a different thing: it only reports problems with reading the host repository.
- _`D9`_ (`live`): Theming: FluentUI's built-in light and dark themes, with a toggle; no custom theming for now.
- _`D10`_ (`live`): Which files are ignored, which count as code, and which are documentation are each set by a list of `.gitignore`-style patterns: the stack adapter's (e.g. ignoring `node_modules` for TypeScript, `bin` and `obj` for .NET) come first, and the configuration's extend them, re-including files with `!` (updated 2026-11-09, from _`P1`_'s _`D28`_ and _`D34`_). Rejected: the host's `.gitignore`; only git-tracked files; configuration-only exclusions.
- _`D11`_ (`live`): The adapters for where the host repository's code is kept are called SCM adapters (source code management). Rejected: "SVC adapter" (not an established abbreviation), "Hosting adapter" (confusable with where the showroom is published), "Repository adapter" (confusable with the host repository).
- _`D12`_ (`live`; supersedes _`D43`_ (PLAN.md)): The showroom shows the project information and the documentation files only; the code file index is collected but not shown yet (code browsing comes later). Code blocks in rendered Markdown are syntax highlighted (a must-have the user added, 2026-11-09).

## _`S6`_ Showcases

approved 2026-11-11; revised 2026-11-12 (_`R3`_); re-approved 2026-11-12

[See Showcases](./SPEC-S6-showcases.md)

## _`S7`_ Documentation checks

approved 2026-11-12

Keeping the documentation itself from drifting, alongside its showcases (_`D102`_, SPEC-S6-showcases.md).

- _`D104`_ (`live`): **`check` warns about broken relative links in documentation files**: a link whose target file or folder doesn't exist in the host repository. They stay shown as plain text (_`D38`_, PLAN.md); the warning makes them visible in CI. Checking a link's heading fragment against the target's heading ids is in "Ideas and later".

### Ideas and later

- Checking links' heading fragments (`#<heading id>`) against the target documentation file's headings.

## _`S8`_ Showcase adapter examples

draft (recorded 2026-11-13 from the user's proposal, to be specified before _`P7.2`_)

Demonstrating and documenting each showcase adapter through an example of its own, shown live in this repository's own showroom.

- _`D302`_ (`live`; the user: "I would like to add per showcase adapter `./examples/<adapter type>/README.md`s which will show up in the main `showroom`. Each would be a mock README or a mock/example project, showing in more detail the abilities of that showcase adapters"): **Each showcase adapter gets an example**, `examples/<adapter>/README.md`: a mock README, or a mock or example project, showing that showcase adapter's abilities in more detail than `README.md` does, with live showcases. It shows up in this repository's showroom as a documentation file (`README` anywhere is built-in documentation), so `check --showcases` (`ci:showroom`, and the integration test running `check()` on this repository) builds and type checks it.
- _`D303`_ (`live`; the user: "The root README could reference these examples instead of having to go in depth for each adapter type"; how much reference stays in `README.md` is _`O46`_): **`README.md` refers to each showcase adapter's example** instead of demonstrating it in depth.
- _`D304`_ (`live`; the user: "Starting now and going forward", and "Let's proceed with the examples before react adapter"): **The examples come before _`P7.2`_**, for the existing showcase adapters (`html`, `ts`, and a custom showcase adapter); from then on, every new showcase adapter comes with its example, as part of its own segment.

### Open points

From the discussion of 2026-11-13 (the agent's assessment), raised when specifying _`S8`_:

- [ ] _`O46`_ How much of each showcase adapter's reference stays in `README.md` (the options, what a showcase can import, type checking's rules, the interface). Recommended: keep the reference there, shortened, with a link to the example ("See it live"), the example showing rather than restating the rules: npm and GitHub show `README.md` without showcases.
- [ ] _`O47`_ Links to the examples outside the showroom: on npmjs.com and GitHub, `./examples/<adapter>/README.md` opens as plain Markdown, with code blocks and no showcases; consider also linking the published GitHub Pages showroom, where they are live.
- [ ] _`O48`_ What an example may depend on. `html` and `ts` examples resolve this repository's own `node_modules` and its root `tsconfig.json` (which only includes `src/`, but applies as the nearest one), so an example may want a `tsconfig.json` of its own. A `react` example could use React as one of `showroom`'s own dependencies, against the host's own React (_`K10`_); an Angular one needs Angular's toolchain as devDependencies of this repository; a self-contained example project with its own `package.json` needs an install of its own (workspaces, or a CI step), as _`K12`_ (SPEC-pitfalls.md) and _`O41`_ (PLAN-P7-ts-react.md) have it.
- [ ] _`O49`_ A custom showcase adapter's example lists its module under `customShowcaseAdapters` in this repository's `showroom.json`, so every `check` on this repository loads (runs) it.
- [ ] _`O50`_ The existing `examples/` folder holds `button.html`, the real file behind `README.md`'s linked showcase: it moves to `examples/html/`, with `AGENTS.md`'s gotcha "Markers in this repository's own documentation files are live" and its rule keeping the button the first showcase in `README.md` (named `README.showcase-1.html` in the virtual files paragraph) updated.
- [ ] _`O51`_ How nested `README.md` files show in the showroom's navigation (titles, grouping) with several examples: check it in a browser (e.g. on a copy, with one example dropped in) before writing them all.
- [ ] _`O52`_ Whether an example is a domain concept for the Glossary (e.g. "Showcase adapter example").

## Pitfalls

[See Pitfalls](./SPEC-pitfalls.md)

## Open points

- None yet.
