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
- _`D14`_ (was must-have 2; `live`, refined by _`D487`_): **Information taken from the host repository:**
  1.  **Project information.** How it's detected (`package.json`, `.sln`, …) is either a configuration item or part of the selected stack adapter.
  2.  **Documentation files (_`D6`_)**, mostly but not only Markdown:
      - by default, `README`, `CONTRIBUTE` and `LICENSE` in the host repository's root, and `README` files anywhere in the host repository, except what is ignored (_`D10`_);
      - the stack adapter's and the configuration's documentation patterns add files to these defaults, or remove them (`.gitignore`-style, see _`D10`_).

      Finding and reading them is case-insensitive, accepts both UK and US spelling, and accepts the `.md` extension, `.txt`, or none.

  3.  **An index of the code files** under a specified source root directory: their paths only, not their contents (_`D3`_). Which files count as code is set by patterns (e.g. `*.ts`, `*.cs`), from the selected stack adapter and the configuration (_`D10`_).
- _`D15`_ (was must-have 3; `live`, refined and changed by _`D96`_ (SPEC-S6-showcases.md)): **Stack adapters.** Where different kinds of host repository (React, Angular, other languages and frameworks) need their own implementation, each one is a separate stack adapter implementing a common interface. The interface must leave room for the others. The first stack adapter is a **TypeScript stack adapter**: it reads `package.json` and treats TypeScript and JavaScript files as code, so it covers plain TypeScript and React libraries alike; a React-specific stack adapter comes with showcases (_`D1`_).
- _`D16`_ (was must-have 4; `live`, changed by _`D865`_, _`D867`_): **Configuration:** a mandatory JSON config file at the host repository's root, `showroom.json`, naming the stack adapter, plus a few CLI flags that override it (_`D5`_).
- _`D17`_ (was must-have 5; `live`): **Installation:** `showroom` can be installed with NPM globally, or locally in the host repository and run through `npx` (added by the user after approval, 2026-11-09).

### Ideas and later

- **Showcases:** demoable, renderable, possibly editable code examples, embedded into the showroom alongside the documentation. They come later.
- Stack adapters for other languages and frameworks (Angular, .NET, …). The .NET one is taken by _`S11`_; Angular hosts use the TypeScript stack adapter (_`D96`_, SPEC-S6-showcases.md).
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
- _`D3`_ (`live`, changed by _`D323`_): Code files: only an index of their paths for now, no contents. Showing contents can come later, through SCM adapters. Rejected: a source browser, and API docs extracted from the code.
- _`D4`_ (`live`): A one-shot `showroom build` CLI command, plus `showroom serve`, a dev server reloading on documentation changes (updated 2026-11-09: the user asked for `serve`, replacing a development-only preview script; originally no watch mode or dev server).
- _`D5`_ (`live`): Configuration: a JSON config file at the host root, `showroom.json`, plus CLI flags overriding it. The file is mandatory, and `stack` is required in it (updated 2026-11-09, from _`P1`_'s _`D27`_). A typed `showroom.{js,ts}` may come later.
- _`D6`_ (`live`): Markdown: root `README`/`CONTRIBUTE`/`LICENSE`, `README` anywhere, plus files the stack adapter or the configuration adds. Rejected: root only; source root only.
- _`D7`_ (`live`): `showroom` only builds, into `./showroom` by default; deploying is the host's job. Rejected: a `deploy` command.
- _`D8`_ (`live`): No enforcement (`check`) action: the user chose to start fresh, without the earlier brief. The `showroom check` command planned in _`P1`_ (_`D30`_) is a different thing: it only reports problems with reading the host repository.
- _`D9`_ (`live`): Theming: FluentUI's built-in light and dark themes, with a toggle; no custom theming for now.
- _`D10`_ (`live`): Which files are ignored, which count as code, and which are documentation are each set by a list of `.gitignore`-style patterns: the stack adapter's (e.g. ignoring `node_modules` for TypeScript, `bin` and `obj` for .NET) come first, and the configuration's extend them, re-including files with `!` (updated 2026-11-09, from _`P1`_'s _`D28`_ and _`D34`_). Rejected: the host's `.gitignore`; only git-tracked files; configuration-only exclusions.
- _`D11`_ (`live`): The adapters for where the host repository's code is kept are called SCM adapters (source code management). Rejected: "SVC adapter" (not an established abbreviation), "Hosting adapter" (confusable with where the showroom is published), "Repository adapter" (confusable with the host repository).
- _`D12`_ (`live`, changed by _`D323`_; supersedes _`D43`_ (PLAN.md)): The showroom shows the project information and the documentation files only; the code file index is collected but not shown yet (code browsing comes later). Code blocks in rendered Markdown are syntax highlighted (a must-have the user added, 2026-11-09).

## _`S6`_ Showcases

approved 2026-11-11; revised 2026-11-12 (_`R3`_); re-approved 2026-11-12; revised 2026-11-17 (_`R53`_, SPEC-S6-showcases.md), re-approved 2026-11-17 with _`S14`_–_`S16`_ (option chosen: "Approve and commit (Rec.)")

[See Showcases](./SPEC-S6-showcases.md)

## _`S7`_ Documentation checks

approved 2026-11-12

Keeping the documentation itself from drifting, alongside its showcases (_`D102`_, SPEC-S6-showcases.md).

- _`D104`_ (`live`, refined by _`D335`_ (PLAN-P9-linked-files.md)): **`check` warns about broken relative links in documentation files**: a link whose target file or folder doesn't exist in the host repository. They stay shown as plain text (_`D38`_, PLAN.md); the warning makes them visible in CI. Checking a link's heading fragment against the target's heading ids is in "Ideas and later".

### Ideas and later

- Checking links' heading fragments (`#<heading id>`) against the target documentation file's headings.

## _`S8`_ Showcase adapter examples

approved 2026-11-13, re-approved 2026-11-13 (_`R18`_, _`R19`_); revised 2026-11-14 (_`R36`_), re-approved 2026-11-14 (recorded 2026-11-13 from the user's proposal, to be implemented before _`P7.2`_); revised 2026-11-17 (_`R51`_), re-approved 2026-11-17 with _`S14`_–_`S16`_ (option chosen: "Approve and commit (Rec.)")

- _`R18`_ 2026-11-13: what the examples are (one theme, mock projects) and how `README.md` uses them, caused by _`D312`_–_`D315`_.
- _`R19`_ 2026-11-13: the `html` example's library stylesheet is a resource, not a real file, as the `html` showcase adapter follows none, caused by _`D320`_ (PLAN-P8-examples.md).
- _`R36`_ 2026-11-14: the `angular` example mirrors the `react` example's `ticker` (a stopwatch, counters, the theme) instead of number pickers, caused by _`D469`_ (PLAN-P11.2-angular-example.md).
- _`R51`_ 2026-11-17: the `cs` showcase adapter example needs the .NET SDK, beyond this repository's own npm dependencies, caused by _`D718`_ (SPEC-S16-csharp.md).

Demonstrating and documenting each showcase adapter through an example of its own, shown live in this repository's own showroom.

- _`D302`_ (`live`, refined by _`D312`_, _`D313`_; the user: "I would like to add per showcase adapter `./examples/<adapter type>/README.md`s which will show up in the main `showroom`. Each would be a mock README or a mock/example project, showing in more detail the abilities of that showcase adapters"): **Each showcase adapter gets an example**, `examples/<adapter>/README.md`: a mock README, or a mock or example project, showing that showcase adapter's abilities in more detail than `README.md` does, with live showcases. It shows up in this repository's showroom as a documentation file (`README` anywhere is built-in documentation), so `check --showcases` (`ci:showroom`, and the integration test running `check()` on this repository) builds and type checks it.
- _`D303`_ (`live`, refined by _`D305`_, _`D306`_, _`D309`_, _`D314`_; the user: "The root README could reference these examples instead of having to go in depth for each adapter type"; how much reference stays in `README.md` is _`O46`_): **`README.md` refers to each showcase adapter's example** instead of demonstrating it in depth.
- _`D304`_ (`live`; the user: "Starting now and going forward", and "Let's proceed with the examples before react adapter"): **The examples come before _`P7.2`_**, for the existing showcase adapters (`html`, `ts`, and a custom showcase adapter); from then on, every new showcase adapter comes with its example, as part of its own segment.

- _`D305`_ (`live`, refined by _`D314`_; refines _`D303`_, resolves _`O46`_; option chosen: "Keep, shortened (Rec.)"): **`README.md` keeps each showcase adapter's reference, shortened**: its options, what a showcase can import, type checking's rules and the interface stay, without in-depth demonstrations, as npm and GitHub show `README.md` without showcases; the showcase adapter example shows the rules rather than restating them. Rejected: keeping the reference as it is (`README.md` stays long), and moving it into the examples (one click away on npm, and the examples doing two jobs).
- _`D306`_ (`live`; refines _`D303`_, resolves _`O47`_; option chosen: "Both (Rec.)"): **`README.md` links each example twice**: relative (`./examples/<adapter>/README.md`, working in the showroom, on GitHub and offline) and live, in the published GitHub Pages showroom.
- _`D307`_ (`live`, refined by _`D451`_ (PLAN-P11-angular.md), within what it allows, changed by _`D718`_ (SPEC-S16-csharp.md); resolves _`O48`_; option chosen: "Repo deps + own tsconfig (Rec.)"): **An example depends only on this repository's own dependencies** (devDependencies included), with no install of its own, and has a `tsconfig.json` of its own where its showcases are type checked. A future showcase adapter needing another toolchain (e.g. Angular) adds it as a devDependency, decided in its own segment. Rejected: self-contained example projects (an install of their own, _`K12`_).
- _`D308`_ (`live`; resolves _`O49`_; option chosen: "Accept it (Rec.)"): **The custom showcase adapter's example is live**: its small, dependency-free module is listed under `customShowcaseAdapters` in this repository's `showroom.json`, so every `check` on this repository loads it.
- _`D309`_ (`live`, refined by _`D314`_, _`D315`_; refines _`D303`_, resolves _`O50`_; the user: "Move to `examples/html/` if it is also being used by the `examples/html/README.md`. Ideally, let's make all the adapter specific links in the root README.md link to particular example showcases from the broader example README.md files ..."): **`README.md`'s showcase adapter specific links point at particular showcases in the examples** (their headings, e.g. `./examples/ts/README.md#<heading id>`; the showroom's routes take a heading id), rather than only at an example as a whole. `examples/button.html` moves to `examples/html/` if `examples/html/README.md` uses it too (settled when planning), with `README.md`'s link and `AGENTS.md`'s gotcha "Markers in this repository's own documentation files are live" updated.
- _`D310`_ (`live`; resolves _`O51`_; option chosen: "You check a served copy (Rec.)"): **The navigation with several examples is checked by the user when planning**: the agent serves a copy of this repository, in a working-files folder, with placeholder `examples/html/`, `ts/` and `custom/` `README.md` files, and the user checks the showroom's navigation in a browser; any change it needs goes into the plan.
  - Evidence: the user's check, 2026-11-13, of a served copy of this repository with placeholder `examples/html/`, `ts/` and `custom/` `README.md` files: "Fine as is for now. We'll need to address the ability to customize the menu at some later point ..." (_`L13`_, PLAN.md).
- _`D311`_ (`live`; resolves _`O52`_; option chosen: "Add it (Rec.)"): **"Showcase adapter example" is a Glossary term** (`CONTRIBUTE.md`).
- _`D312`_ (`live`, changed by _`D469`_ (PLAN-P11.2-angular-example.md); refines _`D302`_; the user proposed a made-up use case per example, numbers as "just a random pull"; the agent's suggestion of one theme, "Agreed across the board"): **Every showcase adapter example demonstrates a made-up use case, on one theme across all of them: numbers (and time)**, so readers can compare showcase adapters on the same subject: `html`, making numbers readable and fun (grouped digits, tabular figures, a colourful counter, a 7-segment display in CSS, following the showroom's theme); `ts`, a typed numbers and time utility (enums of units, durations, relative times, `Math`'s rounding), shown through the console panel; `react` (with _`P7.2`_), unusual number pickers (a digit wheel like an old clock's, an odometer, a dial); `angular`, the same pickers in Angular; the custom showcase adapter, something in the same theme (e.g. a JSON code block of numbers shown as a formatted table).
- _`D313`_ (`live`, changed by _`D320`_ (PLAN-P8-examples.md); refines _`D302`_; "Agreed across the board"): **Each showcase adapter example is a mock project**: a tiny fictional library with real files (e.g. `examples/ts/src/duration.ts`, its `tsconfig.json`; `examples/html/numbers.css`) and a `README.md` documenting it, whose showcases use the library's own files, as a real host repository's documentation would.
- _`D314`_ (`live`; refines _`D303`_, _`D305`_, _`D309`_; the user: "The root README.md file should first discuss showcases in general and adapters generically, and demonstrate them using its own, minimal examples. Later, when getting into individual adapters, the root README.md should show the first showcase from that adapter's example and link to the example showcase to see the rest ..."): **`README.md` first presents showcases and showcase adapters in general, with its own minimal demonstrations** (adapter-neutral, of the marker grammar: inline, resource, linked); **then, for each showcase adapter, it shows its example's first showcase, and links to the example for the rest** (and to particular showcases in it, _`D309`_).
- _`D315`_ (`live`; refines _`D309`_; "Agreed across the board"): **A showcase adapter example's first showcase is a linked showcase of a real file**, which `README.md` links as a showcase too: one source, shown in both. On npm and GitHub, `README.md` shows only the link there, leading to the example, where the code is visible.

### Open points

From the discussion of 2026-11-13 (the agent's assessment), raised when specifying _`S8`_:

- [x] _`O46`_ (resolved by _`D305`_) How much of each showcase adapter's reference stays in `README.md` (the options, what a showcase can import, type checking's rules, the interface). Recommended: keep the reference there, shortened, with a link to the example ("See it live"), the example showing rather than restating the rules: npm and GitHub show `README.md` without showcases.
- [x] _`O47`_ (resolved by _`D306`_) Links to the examples outside the showroom: on npmjs.com and GitHub, `./examples/<adapter>/README.md` opens as plain Markdown, with code blocks and no showcases; consider also linking the published GitHub Pages showroom, where they are live.
- [x] _`O48`_ (resolved by _`D307`_) What an example may depend on. `html` and `ts` examples resolve this repository's own `node_modules` and its root `tsconfig.json` (which only includes `src/`, but applies as the nearest one), so an example may want a `tsconfig.json` of its own. A `react` example could use React as one of `showroom`'s own dependencies, against the host's own React (_`K10`_); an Angular one needs Angular's toolchain as devDependencies of this repository; a self-contained example project with its own `package.json` needs an install of its own (workspaces, or a CI step), as _`K12`_ (SPEC-pitfalls.md) and _`O41`_ (PLAN-P7-ts-react.md) have it.
- [x] _`O49`_ (resolved by _`D308`_) A custom showcase adapter's example lists its module under `customShowcaseAdapters` in this repository's `showroom.json`, so every `check` on this repository loads (runs) it.
- [x] _`O50`_ (resolved by _`D309`_) The existing `examples/` folder holds `button.html`, the real file behind `README.md`'s linked showcase: it moves to `examples/html/`, with `AGENTS.md`'s gotcha "Markers in this repository's own documentation files are live" and its rule keeping the button the first showcase in `README.md` (named `README.showcase-1.html` in the virtual files paragraph) updated.
- [x] _`O51`_ (resolved by _`D310`_) How nested `README.md` files show in the showroom's navigation (titles, grouping) with several examples: check it in a browser (e.g. on a copy, with one example dropped in) before writing them all.
- [x] _`O52`_ (resolved by _`D311`_) Whether an example is a domain concept for the Glossary (e.g. "Showcase adapter example").

## _`S9`_ Linked files

approved 2026-11-13; revised 2026-11-13 (_`R20`_); re-approved 2026-11-13; implemented 2026-11-13; revised 2026-11-13 (_`R24`_); re-approved 2026-11-13; revised 2026-11-14 (_`R38`_), re-approved 2026-11-14

- _`R20`_ 2026-11-13: a link into the output folder isn't copied, an exception to _`D324`_, caused by _`D334`_ (PLAN-P9-linked-files.md).
- _`R24`_ 2026-11-13: a linked showcase's modal shows its included files as tabs (_`D329`_ changed), caused by _`D362`_ (SPEC-S10-presentation.md).
- _`R38`_ 2026-11-14: linked files open in the code sidebar instead of the modal, its header showing the file's name (_`D323`_, _`D329`_ changed), caused by _`D474`_, _`D475`_ (SPEC-S10-presentation.md).

Keeping a documentation file's relative links to files that aren't documentation files (code files, images, any other file in the host repository) working in the showroom, instead of showing them as plain text (_`D38`_, _`D39`_, PLAN.md).

- _`D323`_ (`live`, changed by _`D474`_ (SPEC-S10-presentation.md), refined by _`D324`_–_`D330`_; changes _`D38`_, _`D39`_ (PLAN.md), _`D3`_, _`D12`_; picks up _`L1`_ (PLAN.md); from the agent's assessment of 2026-11-13, the user: "Alternatively, instead of linking them, in the showroom page, we make the links clickable, on click load the file content and display it syntax-highlighted in a modal?", then option chosen: "Modal + link fallback (Rec.)"): **Files that documentation files link to by a relative path are copied into the showroom**, and their links work there: a text file opens in a modal, syntax highlighted, its content loaded when the link is clicked; any other file (binary) opens directly, as the copied file. Relative images in Markdown are shown, from the copied files. Only linked files are copied, never whole folders. This is the first part of code browsing (_`D3`_, _`D12`_): showing a linked file's content, not the code file index. Rejected: embedding the files' content in the shown host information (every page load carries every linked file); a plain link to every copied file (static hosts send code files with content types browsers download or misread, e.g. `.ts` as `video/mp2t` on GitHub Pages).

- _`D324`_ (`live`, changed by _`D334`_ (PLAN-P9-linked-files.md); refines _`D323`_, resolves _`O53`_; the user: "If someone wants to use `showroom` only locally it should still work. If it doesn't work in CI env due to `.gitignore` configuration that is a user-error, same as trying to run it in a env with no `node` installed."): **A linked file is copied even when the host repository ignores it** (_`D10`_): the link states the intent. A file that is missing where `showroom` runs (e.g. a build output not built in CI) is a broken link, warned about by `check` (_`D104`_). Rejected: not copying ignored files, with a warning; a `check` error.
- _`D325`_ (`live`; refines _`D323`_, resolves _`O54`_; "Agreed on rest"): **Text or binary is decided by `check`, from the content**: valid UTF-8 with no NUL byte is text, whatever the file's name, and recorded in the host information. The highlighting language comes from the extension (or the file name), plain text when highlight.js doesn't know it. Rejected: a list of text extensions (misses `LICENSE`, `Makefile`, `.env.example`, and needs upkeep).
- _`D326`_ (`live`; refines _`D323`_, resolves _`O55`_; the user: "Agreed, but 'open directly' should open in new tab - with the 'open in modal' being the default behavior, user won't expect to navigate away"): **Every linked file is copied, whatever its size; a text file over 1 MB opens directly instead of in the modal**, as highlighting it would freeze the page. **Opening a linked file directly (a binary file, a text file over 1 MB, or the modal's own link) opens it in a new tab**, so the reader never leaves the showroom. Rejected: a `check` warning above a size; no limit on the modal.
- _`D327`_ (`live`; refines _`D323`_, resolves _`O56`_; "Agreed on rest"): **A link to a folder with no `README` stays plain text**, as before (_`D38`_, PLAN.md). Rejected: a listing of the folder (nothing linked its files).
- _`D328`_ (`live`; refines _`D323`_, resolves _`O57`_; "Agreed on rest"): **`serve` hands out only the linked files, at the paths `build` writes them to**, so it shows what `build` publishes. Rejected: any file in the host repository.
- _`D329`_ (`live`, changed by _`D362`_, _`D474`_, _`D475`_ (SPEC-S10-presentation.md); refines _`D323`_, resolves _`O58`_; "Agreed on rest"): **The modal shows the linked file's path as its title, its content highlighted with line numbers, a link opening the file directly (_`D326`_), and a close button.** A link's fragment is ignored for now; GitHub-style line fragments (`#L10`, `#L10-L20`) are in "Ideas and later". Rejected: handling line fragments now.
- _`D330`_ (`live`; refines _`D323`_, resolves _`O59`_; "Agreed on rest"): **"Linked file" is a Glossary term** (`CONTRIBUTE.md`).

### Ideas and later

- GitHub-style line fragments in links to linked files (`#L10`, `#L10-L20`): scrolling to and marking the lines in the modal (_`D329`_).

### Open points

From the specification of _`S9`_ (2026-11-13), discussed in `./.workflow/.temp/questions-s9-linked-files/QUESTIONS.md`:

- [x] _`O53`_ (resolved by _`D324`_) Linked files the host repository ignores (_`D10`_), e.g. `.env` or `dist/`.
- [x] _`O54`_ (resolved by _`D325`_) How a text file is told apart from a binary one.
- [x] _`O55`_ (resolved by _`D326`_) Large files: a size limit, a warning, or the modal only up to a size.
- [x] _`O56`_ (resolved by _`D327`_) Links to folders with no `README`.
- [x] _`O57`_ (resolved by _`D328`_) What `serve` hands out: only the linked files, or any file in the host repository.
- [x] _`O58`_ (resolved by _`D329`_) What the modal holds besides the highlighted content, and a link's fragment (e.g. `#L10`).
- [x] _`O59`_ (resolved by _`D330`_) Whether "Linked file" is a Glossary term.

## _`S10`_ Presenting showcases

approved 2026-11-13

[See Presenting showcases](./SPEC-S10-presentation.md)

## _`S11`_ The .NET stack adapter

approved 2026-11-15

A stack adapter for .NET host repositories (e.g. `../dotnetschema`), which _`K3`_ (SPEC-pitfalls.md) and _`D69`_ (PLAN.md) left for later. Such a host runs `showroom` through `npx --package` (_`D69`_).

- _`D486`_ (`live`; the user: "let plan out .NET/C# stack adapter next"; option chosen: "Accept all (Rec.)"): **A built-in `dotnet` stack adapter** for .NET host repositories, C#, F# and VB alike. Its name matches `../dotnetschema`'s existing configuration. Rejected: `csharp` (leaves F# and VB out).
- _`D487`_ (`live`, changed by _`D865`_; refines _`D14`_; option chosen: "Always require it"): **`showroom.json` gets an optional, stack-neutral `project` key**: the path, relative to the host repository's root and inside it, of the file the stack adapter reads the project information from. The `typescript` stack adapter defaults it to `package.json`. The `dotnet` stack adapter requires it, naming a `.csproj`, `.fsproj` or `.vbproj`, and finds no project by itself: without it, the project information can't be read, with an error naming the key. Rejected: finding the project through the root's solution (`.slnx`/`.sln`) by its name, which guesses; and the solution's name with a root `Directory.Build.props`, which misses metadata kept in a project file (as `../dotnetschema` keeps it).
- _`D488`_ (`live`; option chosen: "Static XML (Rec.)"): **The `dotnet` stack adapter reads MSBuild files statically, as XML**, needing only Node, as `showroom` does (no .NET SDK):
  - only properties in `<PropertyGroup>`s, with no `Condition` on either, count;
  - the nearest `Directory.Build.props`, walking up from the project file's folder to the host repository's root (as MSBuild picks it), is read first, and the project file's properties override it;
  - `$(Name)` references are resolved against those properties; a value still holding an unresolved reference is dropped;
  - the project information is: `name` from `PackageId`, else `AssemblyName`, else the project file's name without its extension; `version` from `Version`, else `VersionPrefix` (with `-` and `VersionSuffix`, when set); `description` from `Description`; `license` from `PackageLicenseExpression`; `author` from `Authors`; `homepage` from `PackageProjectUrl`; `repository` from `RepositoryUrl`.

  Rejected: `dotnet msbuild -getProperty` (exact, but needs the .NET SDK wherever `showroom` runs, and in this repository's CI). What static reading can't see is _`K20`_ (SPEC-pitfalls.md).

- _`D489`_ (`live`; option chosen: "All .NET languages (Rec.)"): **The `dotnet` stack adapter's code files** are `*.cs`, `*.csx`, `*.fs`, `*.fsi`, `*.fsx`, `*.vb`, `*.razor` and `*.cshtml`. Rejected: C# only.
- _`D490`_ (`live`; option chosen: "Accept all (Rec.)"): **The `dotnet` stack adapter's defaults**: source root `src`; ignored: `.git`, `.vs`, `bin`, `obj`, `artifacts`, `TestResults`; no documentation patterns beyond the built-in ones (`README` anywhere already finds each project's own).

### Ideas and later

- A showcase adapter running .NET code (e.g. C# through Blazor WebAssembly). Until then, a .NET host's documentation can use `html` showcases, which need nothing from the host. Taken by _`S16`_, as a recorded showcase (_`S15`_), built and recorded on the machine running `showroom`, rather than run in the browser.

## _`S12`_ Showcase views

approved 2026-11-15 (option chosen: "Approve and commit (Rec.)"); revised 2026-11-17 (_`R50`_, _`R52`_, SPEC-S12-showcase-views.md), re-approved 2026-11-17 with _`S14`_–_`S16`_ (option chosen: "Approve and commit (Rec.)")

[See Showcase views](./SPEC-S12-showcase-views.md)

## _`S13`_ The navigation

approved 2026-11-16 (option chosen: "Approve and commit (Rec.)"); revised 2026-11-16 (_`R49`_, SPEC-S13-navigation.md), re-approved 2026-11-16 with _`P18`_ (PLAN-P18-documentation.md) (option chosen: "Approve and commit (Rec.)")

[See The navigation](./SPEC-S13-navigation.md)

## _`S14`_ Trust

approved 2026-11-17 (option chosen: "Approve and commit (Rec.)")

[See Trust](./SPEC-S14-trust.md)

## _`S15`_ Recorded showcases

approved 2026-11-17 (option chosen: "Approve and commit (Rec.)")

[See Recorded showcases](./SPEC-S15-recorded-showcases.md)

## _`S16`_ The C# showcase adapter

approved 2026-11-17 (option chosen: "Approve and commit (Rec.)")

[See The C# showcase adapter](./SPEC-S16-csharp.md)

## _`S17`_ The JSON Schema showcase adapter

approved 2026-11-17 (option chosen: "Approve and commit (Rec.)")

[See The JSON Schema showcase adapter](./SPEC-S17-json-schema.md)

## _`S18`_ Host repositories without a stack adapter

approved 2026-11-18 (option chosen: "Approve and commit (Rec.)"); revised 2026-11-18 (_`R63`_), re-approved 2026-11-18 with _`P22`_ (PLAN-P22-stackless.md) (option chosen: "Approve and commit (Rec.)")

- _`R63`_ 2026-11-18: a built-in stack adapter's name is refused with an object `project` whatever its case, caused by _`D874`_ (PLAN-P22-stackless.md).

A host repository whose stack has no built-in stack adapter (e.g. Java) can't be checked: `stack` must name one (_`D16`_), so its custom showcase adapters, however capable, never run. `showroom.json` lets such a host give what a stack adapter would supply itself.

- _`D865`_ (`live`; changes _`D16`_, _`D487`_; the user: "an optional namespace in `showroo.json` which, if present: Provides all the information a stack adapter would; Causes the `showroom` to completely skip the StackAdapter step", then "I was thinking separate `project` property"; option chosen: "String or object (Rec.)"): **`showroom.json`'s `project` may be an object: the project information itself.** A string keeps _`D487`_'s meaning (the project file's path). With an object, no stack adapter is used at all: none is looked up, and nothing is read for the project information. Rejected: `stack` taking an object; a new top-level key; renaming the path key (breaks existing configurations).
- _`D866`_ (`live`, refined by _`D875`_ (PLAN-P22-stackless.md); option chosen: "Project info only (Rec.)"): **The object holds the project information only**: `name`, a required non-empty string; `version`, `description`, `license`, `author`, `homepage` and `repository`, optional strings; any other key is an error, as everywhere in `showroom.json`. `sourceRoot`, `ignore`, `code` and `documentation` stay top-level keys; with no stack adapter, the defaults they add to are empty: source root `.`, no ignored or code patterns, and no documentation patterns beyond the built-in ones, so the code file index is empty unless `code` is configured. Rejected: those keys inside the object too (two places for one setting).
- _`D867`_ (`live`, refined by _`D874`_ (PLAN-P22-stackless.md); changes _`D16`_; options chosen: "Optional name, given (Rec.)", "In `stack` (Rec.)"): **With an object `project`, `stack` is optional, and names the stack**: any non-empty name that isn't a built-in stack adapter's (e.g. `java`), which showcase adapters get as their request's and check context's `stack`; `custom` when it's left out. A built-in stack adapter's name together with an object `project` is an error. With a string `project`, or none, `stack` is still required and must name a built-in stack adapter, and the error for an unknown one mentions the object `project`. Rejected: a fixed name; the name inside the object.
- _`D868`_ (`live`; changes _`D22`_ (PLAN.md); option chosen: "Supersede it"): **Stack adapters stay built-in**: the object `project` replaces _`D22`_'s custom stack adapters loaded by path, which aren't planned. Rejected: keeping them for later.

## Pitfalls

[See Pitfalls](./SPEC-pitfalls.md)

## Open points

- None yet.

## Known open issues

- _`L16`_ (`open`; from _`D805`_ (SPEC-S17-json-schema.md)) **The JSON Schema showcase adapter shows no definitions of a draft-04/07 schema**: `tsschema` reads only `$defs`, not `definitions`. Deferred until `tsschema` reads `definitions` (the user: "Once `tsschema` has been upgraded we will follow along."); picked up by a future segment bumping `@ofzza/tsschema`.
- _`L17`_ (`open`; from _`D805`_ (SPEC-S17-json-schema.md)) **The JSON Schema showcase adapter resolves no `$ref` into another file**: `tsschema` reads one schema, and resolves only `#/$defs/<name>`. Deferred until `tsschema` resolves references into other files (and `$id`, `$anchor`, JSON Pointers); picked up by a future segment bumping `@ofzza/tsschema`.
- _`L18`_ (`open`, narrowed by _`D837`_ (PLAN-P21-jsonschema.md): `additionalProperties` beside `properties` is dropped, a record's values are `unknown`, and a tuple is an array of `unknown`; from _`D805`_ (SPEC-S17-json-schema.md)) **The JSON Schema showcase adapter shows `additionalProperties` and tuples as `unknown`**, so a map of a definition (`additionalProperties: { $ref }`) gives no edge. Deferred until `tsschema` describes them (on its "Coming next" list); picked up by a future segment bumping `@ofzza/tsschema`.
- _`L19`_ (`open`, narrowed by _`D847`_ (PLAN-P21-jsonschema.md): warned of only in a definition's or the root's own keywords, never in an `allOf`/`anyOf`/`oneOf` member; reading them is `tsschema`'s to decide, on its roadmap or issues; from _`D822`_ (SPEC-S17-json-schema.md)) **The JSON Schema showcase adapter shows no properties of a fragment with `properties` but no `type: "object"`**: `tsschema` describes only `type: "object"` with `properties` as a model, and such fragments (common in `allOf` members) as `unknown`; warned of. Deferred until `tsschema` reads them; picked up by a future segment bumping `@ofzza/tsschema`.
