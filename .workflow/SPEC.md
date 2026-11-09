# Specification

## What this project is

`@ofzza/tsshowcase` is a Node/TypeScript tool published to NPM. A host repository (TypeScript, React, Angular, …) includes it to build a showcase application, and keep it up to date. The showcase application presents the host repository, and is fit to be published as static files (e.g. to GitHub Pages).

Example host repositories it will be used with: `../tsstd`, `../tsschema`, `../dotnetschema`.

## Must-haves

1. **Build a showcase application** from a host repository: a React/FluentUI web SPA, deployable as static files (e.g. GitHub Pages).
   - It's a one-shot CLI command, `tsshowcase build`, run locally or in CI (D4). Keeping the showcase application up to date means rerunning it.
   - `tsshowcase serve` serves the showcase application locally, with Vite's dev server, and reloads it when a documentation file changes, for previewing it while writing the host repository's documentation (D4).
   - It generates a Vite project and builds it against the host repository (D2).
   - It only builds, into an output folder: `./showcase` by default, configurable. Deploying it is the host repository's job; the README documents an example GitHub Pages workflow (D7).
   - Theming: FluentUI's built-in light and dark themes, with a toggle (D9).
   - It presents the project information and the documentation files; code blocks in rendered Markdown are syntax highlighted (D12).
2. **Information taken from the host repository:**
   1. **Project information.** How it's detected (`package.json`, `.sln`, …) is either a configuration item or part of the selected stack adapter.
   2. **Documentation files (D6)**, mostly but not only Markdown:
      - by default, `README`, `CONTRIBUTE` and `LICENSE` in the host repository's root, and `README` files anywhere in the host repository, except what is ignored (D10);
      - the stack adapter's and the configuration's documentation patterns add files to these defaults, or remove them (`.gitignore`-style, see D10).

      Finding and reading them is case-insensitive, accepts both UK and US spelling, and accepts the `.md` extension, `.txt`, or none.

   3. **An index of the code files** under a specified source root directory: their paths only, not their contents (D3). Which files count as code is set by patterns (e.g. `*.ts`, `*.cs`), from the selected stack adapter and the configuration (D10).
3. **Stack adapters.** Where different kinds of host repository (React, Angular, other languages and frameworks) need their own implementation, each one is a separate stack adapter implementing a common interface. The interface must leave room for the others. The first stack adapter is a **TypeScript stack adapter**: it reads `package.json` and treats TypeScript and JavaScript files as code, so it covers plain TypeScript and React libraries alike; a React-specific stack adapter comes with showcases (D1).
4. **Configuration:** a mandatory JSON config file at the host repository's root, `tsshowcase.json`, naming the stack adapter, plus a few CLI flags that override it (D5).
5. **Installation:** tsshowcase can be installed with NPM globally, or locally in the host repository and run through `npx` (added by the user after approval, 2026-11-09).

## Ideas and later

- **Showcases:** demoable, renderable, possibly editable code examples, embedded into the showcase application alongside the documentation. They come later.
- Stack adapters for other languages and frameworks (Angular, .NET, …).
- **SCM adapters** (GitHub, GitLab, Bitbucket, …), to link to, read or show each indexed file's contents from there (D3).
- A typed config file, `tsshowcase.{js,ts}`, as many NPM CLI tools have (D5).
- **Code browsing:** showing the code file index, and later the files' contents, in the showcase application (D3, D12).

## Time and complexity budget

- Relatively small and simple.
- Push complexity onto the host repository owner whenever possible, instead of trying to guess what the host repository needs. It's fine to require the host repository to follow a prescribed structure and/or provide configuration.
- Iterate quickly: a working version as soon as possible. Everything that can be done or decided later is left for later.

## HARD RULES

- None yet.

## Decisions

- **D1** First stack adapter: a TypeScript stack adapter (`package.json`; TypeScript and JavaScript files as code). Rejected: a React-only adapter (nothing React-specific to do yet), and no adapter (postpones the interface).
- **D2** The showcase application is a generated Vite project, built against the host repository. Rejected: a prebuilt SPA shipped in the package with a data file (simpler now, but showcases would need a bundler anyway; see pitfall 1).
- **D3** Code files: only an index of their paths for now, no contents. Showing contents can come later, through SCM adapters. Rejected: a source browser, and API docs extracted from the code.
- **D4** A one-shot `tsshowcase build` CLI command, plus `tsshowcase serve`, a dev server reloading on documentation changes (updated 2026-11-09: the user asked for `serve`, replacing a development-only preview script; originally no watch mode or dev server).
- **D5** Configuration: a JSON config file at the host root, `tsshowcase.json`, plus CLI flags overriding it. The file is mandatory, and `stack` is required in it (updated 2026-11-09, from S1's C9). A typed `tsshowcase.{js,ts}` may come later.
- **D6** Markdown: root `README`/`CONTRIBUTE`/`LICENSE`, `README` anywhere, plus files the stack adapter or the configuration adds. Rejected: root only; source root only.
- **D7** tsshowcase only builds, into `./showcase` by default; deploying is the host's job. Rejected: a `deploy` command.
- **D8** No enforcement (`check`) action: the user chose to start fresh, without the earlier brief. The `tsshowcase check` command planned in S1 (C10) is a different thing: it only reports problems with reading the host repository.
- **D9** Theming: FluentUI's built-in light and dark themes, with a toggle; no custom theming for now.
- **D10** Which files are ignored, which count as code, and which are documentation are each set by a list of `.gitignore`-style patterns: the stack adapter's (e.g. ignoring `node_modules` for TypeScript, `bin` and `obj` for .NET) come first, and the configuration's extend them, re-including files with `!` (updated 2026-11-09, from S1's C9a and C14). Rejected: the host's `.gitignore`; only git-tracked files; configuration-only exclusions.
- **D11** The adapters for where the host repository's code is kept are called SCM adapters (source code management). Rejected: "SVC adapter" (not an established abbreviation), "Hosting adapter" (confusable with where the showcase application is published), "Repository adapter" (confusable with the host repository).
- **D12** The showcase application shows the project information and the documentation files only; the code file index is collected but not shown yet (code browsing comes later). Code blocks in rendered Markdown are syntax highlighted (a must-have the user added, 2026-11-09).

## Pitfalls

1. [x] **Showcases need the host's own code and framework.** A showcase imports host code, so it has to be bundled with the host's own React (two copies of React break hooks), its tsconfig and its dependencies. A showcase application built once and shipped prebuilt can't do this. Why it matters: if the first version's architecture assumes no bundler, showcases could force a rewrite. Resolved by D2: the showcase application is built with Vite against the host repository from the start. Making the host's own dependencies resolve correctly is still part of pitfall 7.
2. [ ] (→ S1) **Other frameworks inside a React/FluentUI SPA.** An Angular (or other) component can't be rendered as a React component. Showcases for those frameworks would need iframes or web components. Why it matters: this shapes the stack adapter interface, even though it only bites later.
3. [x] (→ S3) **Hosts that don't use Node.** `../dotnetschema` has no `package.json`. The tool still needs Node to run (e.g. through `npx`), and its project information would come from `.slnx`/`.csproj`. Why it matters: "included into the host repository" means something different there. Resolved by S3's B9: run through `npx --package`, documented; such hosts still need a stack adapter of their own (later).
4. [x] (→ S2, S3) **Static hosting under a subpath.** GitHub Pages serves a site under `/<repo>/` and doesn't rewrite paths on the server. The SPA needs relative asset paths, and hash routing (or a `404.html` fallback). Why it matters: deep links break otherwise. Hash routing resolved by S2 (A3); relative asset paths by S2.2's Vite configuration (`base: './'`), reused by S3's build (B6).
5. [x] (→ S2) **Links inside Markdown.** Relative links in a README (to other docs, source files or `LICENSE`) must be rewritten to SPA routes or repository URLs. Why it matters: otherwise they break in the showcase application. Resolved by S2's A4: links to documentation files become routes; any other relative link is shown as plain text (no repository URLs, which are the SCM adapters' job).
6. [x] **The example hosts aren't React projects.** `../tsstd` and `../tsschema` are plain TypeScript libraries, and `../dotnetschema` is .NET. Why it matters: a React-only first adapter might not cover any of the example hosts. Resolved by D1: the first stack adapter is a TypeScript one.
7. [ ] (→ S2, S3) **Where the showcase application's own dependencies come from (D2).** Building with Vite needs Vite, React and FluentUI. If they're tsshowcase `dependencies`, every host repository installs them, including hosts without React (`../tsstd`) and without Node (`../dotnetschema`, through `npx`). If the host repository is asked to install them, it carries that setup. Later, showcases must use the host's own React and not a second copy. Why it matters: it decides how heavy and fragile installing and running `tsshowcase build` is. Resolved for the showcase application by S2 (A14, A23: tsshowcase's own `dependencies`, aliased so a host's React never mixes in); using the host's own React remains open for showcases.
8. [x] **"`README` anywhere" needs exclusions (D6).** Taken literally, it includes every README in `node_modules/`, `dist/` and other generated folders. Why it matters: the showcase application would fill up with third-party docs. Resolved by D10: the stack adapter lists what to skip, and the configuration can override it.

## Open points

- None yet.
