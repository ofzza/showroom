# _`P18`_ The documentation review's changes

implemented 2026-11-16 (option chosen: "Approve and commit (Rec.)"); approved 2026-11-16 (option chosen: "Approve and commit (Rec.)"), with _`S13`_'s revision _`R49`_

Applies the outcomes of the zero-context documentation review of 2026-11-16 (four reviewers: coverage, implementor clarity, correctness and consistency, structure and readability) to `README.md`, `CONTRIBUTE.md`, `PUBLISH.md`, `examples/*/README.md` and their files, a new `CHANGELOG.md`, and this repository's `showroom.json`; and implements _`D668`_ (SPEC-S13-navigation.md), the one behaviour change, found planning it (_`O93`_). One segment (_`D669`_). The review's record, with every finding (`F1`–`F34`, `Q1`–`Q14`), is `./.workflow/.temp/review-docs/REVIEW.md` until this segment holds its outcomes.

## Decisions

- _`D653`_ (`live`; review fixes F1–F34, accepted as a batch, the user: "Accept all"): **The review's fixes**, as listed in steps 1–3: the bugs a reader hits (the `number-table` error example's JSON, the `html` example's "never real files", the link icon's side, type errors "in the showcase frame `serve` shows", the host information sample's `views` and `offset`, "beside its code" while every code pane starts hidden, the navigation example failing `check`, `check` "without the host repository's dependencies"); the stale summaries (`PUBLISH.md`, `CONTRIBUTE.md`'s internal modules, the Glossary); and the small gaps (F12–F34).
- _`D654`_ (`live`; Q1, option chosen: "Both (Rec.)"): **A `# Quick start`** after `# Get showroom` (install, `{ "stack": "typescript" }`, a first `html` showcase in a code block, `serve`, `build`), **a "How it works" overview** at the top of `# Usage` (the pipeline from `showroom.json` and the documentation files through `check` to `serve` and `build`, and the core terms in the Glossary's words), and **a shorter pitch**. The Quick start's showcase sits inside a four-backtick fence, as markers in this repository's documentation files are live.
- _`D655`_ (`live`, refined by _`D672`_; Q2, option chosen: "Keep, reorder (Rec.)"; rejected: splitting reference material into `docs/*.md`, as npm shows only `README.md`): **`README.md` stays complete, and is reordered**: the showroom's own features move out of `## showroom serve` into a new `## The showroom` section; `# Development` keeps one line per npm script, its test tiers' details moving to `CONTRIBUTE.md`.
- _`D656`_ (`live`; Q3, option chosen: "All (Rec.)"): **The densest passages are rewritten, keeping their meaning**, the rule first and the edge cases in sub-lists: `include=`, virtual files, linked showcases shown inline and as a block, `html` showcases, the code pane, `build(request)`; `serve`'s reloads and the navigation's issues as tables; the sentences listing an example's sections as bullet lists, each keeping its relative and published links (which `src/cli/check/index.integration.test.ts` checks).
- _`D657`_ (`live`; Q4, option chosen: "Both (Rec.)"): **`CONTRIBUTE.md` › Architecture in subsections** (an overview of the pipeline, the check, showcase builds, the showroom, `serve`, `build`, each built-in showcase adapter), its facts kept, in bullets; and **a "Where to change things" table**.
- _`D658`_ (`live`, refined by _`D670`_; Q5, option chosen: "CHANGELOG.md (Rec.)"; rejected: dropping the notes, keeping them): **A `CHANGELOG.md`** holds the changes between published versions; its first entry, "Unreleased", records `ShowcaseAdapter.build()`'s `issues` and `checks` replacing `errors` and `warnings` (since `0.1.0-alpha.1`); both "This is a breaking change" notes leave `README.md` (the `check?()` one was already true in `0.1.0-alpha.1`), whose custom showcase adapter section links the changelog; `PUBLISH.md` says to update it before each publish.
- _`D659`_ (`live`; Q6, option chosen: "Yes (Rec.)"): **A `## Troubleshooting` section** in `README.md`, one short entry per symptom, each linking its reference section: a showcase "Not built"; TS2307/TS2882 on a CSS or asset import; TS7016 on a `.js` import; TypeScript not found, or 7 skipped; the host's own package not resolving; a broken link warning; `build` refusing to empty the output folder; a missing source root; `check --showcases` failing in CI while `serve` worked.
- _`D660`_ (`live`; Q7, option chosen: "Yes (Rec.)"): **"Developing a custom showcase adapter"**, a subsection of Custom showcase adapters: the `serve` loop (a changed module reloads; restart after changing what it imports), `check --showcases` as CI runs it, and the loader's errors.
- _`D661`_ (`live`; Q8, options chosen: "Included real files (Rec.)", "Relative image (Rec.)", "Inline, no views (Rec.)"; rejected for now: `view=markdown` on a virtual file with no showcase adapter, `typeCheck: false`, importing the host's own package, an NgModule): **New live demonstrations**: the `angular` stopwatch includes its template and style (`include=markdown,…`, in `examples/angular/README.md` and `README.md` alike); a `ts` showcase placing `source` among included real files; a relative image in `examples/html/` (a small SVG); a linked showcase shown inline without `view=` in `examples/ts/`.
- _`D662`_ (`live`, refined by _`D671`_, changed by _`D676`_; Q9, option chosen: "Both (Rec.)"): **This repository's navigation gets a URL item** (the npm page) **and anchor items**, which _`D668`_ (SPEC-S13-navigation.md) makes possible.
- _`D663`_ (`live`; Q10, option chosen: "22 or 24, tested (Rec.)"; rejected: Vite's floor, none): **Node versions**: `README.md` says `showroom` needs Node.js 22 or 24, the versions it is tested on (no `engines` field); contributors need 22.13 or later, or 24.
- _`D664`_ (`live`; Q11, option chosen: "Mark planned (Rec.)"): **The Glossary's "SCM adapter" is marked planned** ("none exists yet").
- _`D665`_ (`live`; Q13, options chosen: all three): **New Glossary terms**: "Showcase block" (what a showcase shown as a block is rendered as: its header bar, issue list, showcase views and code pane, in place of its code block or its link's paragraph; the showcase sidebar shows the same block for a linked showcase shown inline), "Issues bar" (the bar at the top of the showroom, in `showroom serve` only, listing the current issues), "Host check" (a showcase adapter's check of the host repository's requirements, `check?()`, run once per run with the showcases using it).
- _`D666`_ (`live`; Q14, option chosen: "Maintainers only"): **`CONTRIBUTE.md` › Workflow is the maintainers'**: it opens with a line saying so; outside contributors open an issue, then a pull request against `develop`.
- _`D667`_ (`live`; Q12, settled by _`D651`_ (PLAN-P17-navigation.md)): **An anchor after a navigation pattern applies to every page it matches**, and is documented as such (F31).

- _`D669`_ (`live`; option chosen: "One segment"; rejected: four child segments (the agent's recommendation), two): **One segment**, one checkpoint and one commit.
- _`D670`_ (`live`; refines _`D658`_; option chosen: "Documentation file (Rec.)"; rejected: a linked file only): **`CHANGELOG.md` is a documentation file of this repository** (`showroom.json`'s `documentation` lists it) and a navigation item, "Changelog", before "License"; it isn't added to `package.json`'s `files`.
- _`D671`_ (`live`, changed by _`D676`_; refines _`D662`_; option chosen: "Usage group"; rejected: flat anchor items, the agent's recommendation): **This repository's navigation**: a group "Usage" holding "Overview" (`/`), "Quick start" (`/#quick-start`), "Showcases" (`/#showcases`) and "Troubleshooting" (`/#troubleshooting`); the group "Examples" as it is; "Contributing", "Changelog", "License"; and "npm" (`https://www.npmjs.com/package/@ofzza/showroom`).
- _`D672`_ (`live`; refines _`D655`_; option chosen: "This outline (Rec.)"; rejected: the configuration's sections after the showcases'): **`README.md`'s outline**: the title, pitch and published showroom's link; `# Get showroom` (with the Node versions); `# Quick start`; `# Usage`: How it works, Configuration, Patterns, Documentation files, Navigation, Stack adapters, Showcases (`### Cheat-sheet`, then its sections as now), Custom showcase adapters (and Developing one), Linked files (`### The showcase sidebar`), The showroom, `showroom check`, `showroom serve`, `showroom build`, Publishing to GitHub Pages, Troubleshooting, API; `# Development`; `# Contributing`.

- _`D673`_ (`live`; refines _`D658`_; at the checkpoint, option chosen: "Keep all (Rec.)"; rejected: only `build()`'s change): **`CHANGELOG.md`'s Unreleased entry lists every break since `0.1.0-alpha.1`** (`build()`'s result, `VirtualFile`'s `kind`, `exposeShowcaseMarkdownSyntax`, linked showcases shown inline) and the additions since.
- _`D674`_ (`live`; at the checkpoint, option chosen: "Add the row (Rec.)"; rejected: updating it at publish time only): **`AGENTS.md`'s triggers**: a user-visible change adds an entry under `CHANGELOG.md`'s `## Unreleased`.
- _`D675`_ (`live`; refines F20; at the checkpoint, option chosen: "Keep it (Rec.)"; rejected: a bullet only, the sample identical to this repository's workflow): **The GitHub Pages example builds the host first** (`npm run build --if-present`); this repository's workflow doesn't need it (`npm ci`'s `prepare` builds), which `README.md` and `AGENTS.md` say.

- _`D676`_ (`live`; changes _`D662`_, _`D671`_; the user's fast-path request after _`P18`_, 2026-11-16: "There is a `npm` link in the main README.md file already, we don't need it in the main menu and it looks out of place there. [...] let's drop it"): **This repository's navigation has no URL item**: the "npm" item is dropped; the anchor items stay.

### After _`P18`_

- _`D864`_ (`live`; a fast-path change, the user: "Under Showcases, each "language"'s showcase should have a sub header to find it more easily", then options chosen: "Group under a heading (Rec.)", "List in Jump to section (Rec.)", "List in the navigation"): **The built-in showcase adapters' sections are grouped and listed**: `README.md`'s Showcases gets a `### Built-in showcase adapters` heading, holding the built-in showcase adapters' table and each showcase adapter's section a level down (their ids unchanged); "Jump to section" lists them under Showcases; this repository's `showroom.json` navigation makes Usage › Showcases a group, its overview then one item per built-in showcase adapter.

## Open points

- [x] _`O93`_ (resolved by _`D668`_ (SPEC-S13-navigation.md)) (From _`D662`_, found planning) _`D637`_ (SPEC-S13-navigation.md) warns about a documentation file listed twice, anchors or not, and this repository's check must pass without issues; `README.md` is already listed (`/`), and every other documentation file too, so an anchor item would list one twice.

## Steps

0. **Navigation under several anchors** (_`D668`_, SPEC-S13-navigation.md): `resolveNavigation()` (`src/navigation/`) keys its duplicate warning by the page and its anchor; the showroom's current item (`src/app/navigation/`, `src/app/layout/`) takes the route's anchor: the item with that anchor, else the page's first item without one, else its first. Tests: `src/navigation/` (a page under two anchors, no warning; the same anchor twice, and twice without one, warned), the `navigation` fixture and `check()`'s test if it lists a page twice, `src/app/navigation/` (`holdsCurrentItem()` with anchors) and `src/app/layout/` (rendered with a route's anchor). `README.md` › Navigation and `AGENTS.md` › Testing (the navigation) follow.

### Corrections

1. **`README.md`** (F3–F8, F12–F22, F25–F31, _`D667`_): each fix in place, as `REVIEW.md` lists it; the TypeScript samples touched type checked with `tsc` (AGENTS.md); a `--help` and usage paragraph before `## showroom check`; the Node versions in `# Get showroom` (_`D663`_); the two breaking-change notes replaced by a link to `CHANGELOG.md` (_`D658`_).
2. **Examples** (F1, F2, F6, F23, F24): `examples/number-table/README.md`'s error example as two lines with an unquoted key, kept from Prettier's embedded formatting; the `html` example's copying; "a click away" wording; the `src/` links; the console panel's counter.
3. **`CONTRIBUTE.md`, `PUBLISH.md`, `CHANGELOG.md`** (F9–F11, F33, F34, _`D658`_, _`D663`_–_`D666`_): the Glossary's changed and new entries; the internal modules; Reporting Issues; a new "Setting up" section; the Workflow's opening line; `PUBLISH.md`'s `ci` scope, branching link, scoped package names, smoke test `build`, and the changelog step; the new `CHANGELOG.md`.

### `README.md`'s structure

4. **The opening** (_`D654`_): the pitch, `# Quick start`, the "How it works" overview.
5. **The order** (_`D655`_, _`D672`_, F12): `## The showroom` (pages and addresses, the theme, Markdown, links and images, the narrow layout) before `## showroom check`; `### Cheat-sheet` and `### The showcase sidebar`; the table of contents; `# Development` slimmed.
6. **The rewrites and new sections** (_`D656`_, _`D659`_, _`D660`_): the dense passages, the tables, the link lists, `## Troubleshooting` before `## API`, "Developing a custom showcase adapter".

### `CONTRIBUTE.md`'s architecture

7. **Architecture** (_`D657`_): the subsections, the table, and the test tiers' details from `README.md`'s `# Development`.

### Demonstrations and navigation

8. **Live demonstrations** (_`D661`_, F32): the four demonstrations; each example README's line to its published page and how to preview it locally; "live" wording that holds on GitHub and npm.
9. **This repository's `showroom.json`** (_`D670`_, _`D671`_): `CHANGELOG.md` in `documentation`, and the navigation.

### Every step

- **Documentation**: `AGENTS.md`'s project facts kept current (Layout: `CHANGELOG.md`, the new example files; the gotcha on live markers, for the Quick start's fenced showcase; Commands, if `# Development` changes them); Prettier on every `.md` touched (agent-facing files with the layout check).
- **Tests**: step 0's (the only behaviour change); `npm run ci` green, which runs `ci:showroom` (this repository's check with its showcases) and `src/cli/check/index.integration.test.ts` (this repository's live showcases and the examples' links).
- **Checks by hand**: the user looks at the changed pages in the dogfooding `showroom serve`, and on GitHub where rendering differs.
