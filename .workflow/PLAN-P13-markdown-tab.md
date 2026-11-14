# _`P13`_ The Markdown tab, on request

approved 2026-11-14 (option chosen: "Approve and commit (Rec.)"), without a zero-context review

## Goals

_`D484`_ (SPEC-S10-presentation.md): a showcase shown as a block has its Markdown tab only when `showroom.json` sets `exposeShowcaseMarkdownSyntax: true`, and then as its first tab, selected by default; this repository's own showroom sets it.

No child segments.

## Decisions

- _`D485`_ (`live`): **The setting travels with the build, not the host information**: `Configuration` gains `exposeShowcaseMarkdownSyntax?: boolean` (validated as a boolean, its JSDoc saying it is meant for `showroom`'s own repository); `getShownHostInformation()` (`src/vite/`) takes it as an option, and puts the Markdown tab first only then (none otherwise); `build()` and `serve` pass the value from the configuration they already read (`serve` on each run, so a change to `showroom.json` applies on its next run). `HostInformation` and `check`'s output don't change. The code pane needs no change: it selects the first tab, and the code sidebar opens at the selected one (_`D479`_ (PLAN-P12-code-sidebar.md)).

## Steps

1. **The setting**: `src/configuration/` (the key, its check); `src/vite/` (`getShownHostInformation()`'s option, the Markdown tab first, `getMarkdownTab()`'s JSDoc); `src/cli/build/` and `src/cli/serve/` passing it; this repository's `showroom.json` setting it.
2. **Tests**: `src/configuration/` (the key accepted, a non-boolean rejected); `src/vite/` (no Markdown tab without the setting; first with it; never on an inline linked showcase); `src/cli/serve/` and `src/cli/build/` tests where they pass the shown host information.
3. **Documentation**: `README.md` (the code pane's paragraph no longer lists a Markdown tab; the code block showcase demonstration says this repository's showroom shows the Markdown first, without documenting the setting); `AGENTS.md` (Exports' `Configuration`, the live markers gotcha, Testing's code pane paragraph); `CONTRIBUTE.md` (the Code pane Glossary entry: the Markdown tab only on request).
4. **Verification**: `npm run ci` green; the dogfood `serve` restarted, for the user's browser check: every block in this repository's showroom shows Markdown as its first, selected tab, in the code pane and in the code sidebar opened from it.

## Open points

- None yet.
