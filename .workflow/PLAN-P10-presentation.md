# _`P10`_ Presenting showcases

re-approved 2026-11-13 with _`R27`_, _`R28`_ (option chosen: "Approve and commit (Rec.)"); approved 2026-11-13, for its split and order (_`D384`_) (option chosen: "Approve and commit (Rec.)"), without a zero-context review

## Goals

_`S10`_ (SPEC-S10-presentation.md), whole: the code pane beside code block showcases and linked showcases shown as blocks (_`D352`_–_`D356`_, _`D372`_, _`D373`_, _`D376`_); the `inline`, `block` and `include=` keys, in `check`, the host information and the `html` build (_`D357`_–_`D365`_, _`D374`_, _`D375`_, _`D378`_, _`D380`_); every code block highlighted with line numbers, a copy button and, for a resource, its name, and links to linked files marked with a "code" icon (_`D366`_–_`D368`_, _`D379`_); the console apart from what a showcase renders (_`D369`_, _`D377`_); the rename to "Code block showcase" and the `ShowcaseKind` values `code-block` and `link` (_`D371`_); the cheat-sheet and this repository's own documentation following the new presentation (_`D370`_, _`D381`_).

Facts found while planning (2026-11-13):

- `ShowcaseKind` (`src/host/`) is `'inline' | 'linked'`; the rename touches about 100 places in about 25 files (sources, tests, `README.md`, the examples, the `number-table` custom showcase adapter), and `check --json`'s output.
- `scanMarkdown()` (`src/markdown/`) visits the syntax tree without parents, so "alone in its paragraph" (_`D360`_) needs the visit to carry its ancestors, as the showroom's `remarkShowcaseFrames()` (`src/app/showcases/`) already does.
- The showroom renders code blocks through `rehype-highlight` with no gutter; the modal's `HighlightedCode` (`src/app/code/`) re-renders a fence it builds around the text, with a gutter. Showcase frames are placed before the nearest flow block holding their entry point (`remarkShowcaseFrames()`), by offset.
- `ShownShowcase` (`src/app/host/`) carries only `id`, `documentation`, `offset` and `url`: no kind, no entry point, no included files. The shown host information already ships every documentation file's content (so a code block showcase's code), but not the virtual files.
- The `html` showcase adapter copies every resource of its documentation file's folder next to its page (`index.html`), and reads a linked showcase's entry point from disk.
- The console panel (`src/adapters/showcase/ts/console/`) grows the showcase frame with each line, up to `CONSOLE_PANEL_MAX_LINES` (12), announcing its own growth with `CONSOLE_GROWTH_EVENT` so the frame script's guard (`MAX_REPEATED_GROWTHS`) doesn't count it.

## Revisions

- _`R28`_ 2026-11-13: `README.md`'s sections on `block` and `include=`, with their live showcases, move from _`P10.3`_ to _`P10.4`_, caused by _`D398`_ (PLAN-P10.3-keys.md).
- _`R27`_ 2026-11-13: what the shown host information gains moves from _`P10.3`_ to _`P10.4`_, with the code pane that uses it, caused by _`D394`_ (PLAN-P10.3-keys.md).

## Child segments

Each is planned, approved, implemented and checkpointed on its own, in this order (_`D382`_, _`D383`_, _`D384`_):

- **_`P10.1`_ The rename** (implemented 2026-11-13; [See The rename](./PLAN-P10.1-rename.md)) (_`D371`_): "Inline showcase" becomes "Code block showcase" in every identifier, comment, message and document; `ShowcaseKind`'s values become `code-block` and `link`. No behaviour changes; a commit of its own (_`O66`_).
- **_`P10.2`_ Code blocks and links** (implemented 2026-11-13; [See Code blocks and links](./PLAN-P10.2-code-blocks.md)) (_`D366`_–_`D368`_, _`D379`_): every code block in the showroom highlighted with line numbers in a gutter that isn't selected, and a copy button; a resource's name as its caption; the "code" icon after links to linked files. The showroom only.
- **_`P10.3`_ The new keys** (approved 2026-11-13; [See The new keys](./PLAN-P10.3-keys.md)) (_`D357`_–_`D365`_, _`D374`_, _`D375`_, _`D378`_, _`D380`_): `inline`, `block` and `include=` in the marker grammar and `check`'s errors; `Showcase` gaining its included files and how a linked showcase is shown; included real files collected as linked files (copied, served, watched); the `html` build copying included files next to its page (_`O62`_'s part on included files; the shown host information moved to _`P10.4`_ by _`D394`_ (PLAN-P10.3-keys.md)). The showroom still shows a linked showcase shown as a block as it shows one shown inline, until _`P10.4`_.
- **_`P10.4`_ The code pane** (_`D352`_–_`D356`_, _`D362`_, _`D372`_, _`D373`_, _`D376`_): the code pane and its three states, side by side or stacked by a container query, its tabs; blocks replacing their fence or paragraph; what the shown host information gains (_`O62`_, _`D394`_ (PLAN-P10.3-keys.md)); the modal's tabs for a linked showcase shown inline; its sizes (_`O63`_); _`K17`_ and _`K18`_. Then `README.md`'s sections on `block` and `include=` (_`D398`_ (PLAN-P10.3-keys.md)), the cheat-sheet (_`D370`_) and this repository's own documentation (_`D381`_).
- **_`P10.5`_ The console** (_`D369`_, _`D377`_): the console's two modes, the fading lines, the counter, errors, the switch at run time (_`O60`_).

## Decisions

- _`D382`_ (`live`, changed by _`D394`_, _`D398`_ (PLAN-P10.3-keys.md); resolves _`O66`_ (SPEC-S10-presentation.md) and _`K19`_ (SPEC-pitfalls.md); Q1, option chosen: "Five children (Rec.)"): **Five child segments**, _`P10.1`_ to _`P10.5`_ as listed above. Rejected: folding the rename into _`P10.3`_ (a rename mixed with behaviour changes); three children (rename and code blocks; keys and code pane; console); one segment.
- _`D383`_ (`live`; resolves _`O61`_ (SPEC-S10-presentation.md); Q2, option chosen: "As listed (Rec.)"): **In the order listed**: the rename, code blocks and links, the new keys, the code pane, the console. The rename first, so later changes use the new terms; code blocks before the code pane, whose tabs reuse the highlighted code block; the keys before the code pane, which needs `block` and `include=`; the console, independent, last. Rejected: the console first; the code pane before the keys (touching it twice).
- _`D384`_ (`live`; Q3, option chosen: "One at a time (Rec.)"): **Each child is planned just before its turn**: approving _`P10`_ approves its split and order only; each child is then planned, approved, implemented and checkpointed before the next is planned, as _`P7`_'s were. Rejected: planning every child now.
- _`D385`_ (`live`; takes _`K17`_, _`K18`_ (SPEC-pitfalls.md) for _`P10.4`_; Q4, option chosen: "Spike before P10.4 (Rec.)"): **A spike before planning _`P10.4`_**: a throwaway static page in `./.workflow/.temp/spike-code-pane/` (a container query switching side by side and stacked, the three states toggled, an iframe counting its loads and reporting its height), which the user opens in a browser; its conclusions go into _`P10.4`_ as evidence. Rejected: settling the layout while implementing _`P10.4`_.

## Open points

Handed to the child segments (_`D382`_):

- _`P10.1`_: _`O65`_.
- _`P10.2`_: _`O64`_ (the `pre` override with a gutter, the copy button), _`O65`_.
- _`P10.3`_: _`O62`_ (what `Showcase` and the shown host information gain; how included files reach the showroom), _`O65`_.
- _`P10.4`_: _`O67`_; _`O62`_ (the code pane's tabs' content), _`O63`_, _`O64`_ (the modal's tabs), _`O65`_, _`K17`_, _`K18`_ (_`D385`_).
- _`P10.5`_: _`O60`_, _`O65`_.

Taken from _`S10`_ (SPEC-S10-presentation.md):

- [ ] _`O60`_ (SPEC-S10-presentation.md) The console's details.
- [x] _`O61`_ (SPEC-S10-presentation.md; resolved by _`D383`_) The order of work and the segments.
- [ ] _`O62`_ (SPEC-S10-presentation.md) What the shown host information gains for the code pane, and how included files reach the showroom.
- [ ] _`O63`_ (SPEC-S10-presentation.md) The code pane's minimum and maximum number of lines, and the width at which it stacks.
- [ ] _`O64`_ (SPEC-S10-presentation.md) Implementation notes: the `pre` override with a gutter, the copy button outside secure contexts, the modal's tabs.
- [ ] _`O65`_ (SPEC-S10-presentation.md) The tests and documentation of each plan segment.
- [x] _`O66`_ (SPEC-S10-presentation.md; resolved by _`D382`_) A split to consider with _`O61`_.

- [ ] _`O67`_ From review 2026-11-13 #13 (of _`P10.3`_): for _`P10.4`_: in `serve`, a changed included file that no showcase frame uses (e.g. a `ts` include it doesn't import) changes no frame's hash, so `serve` sends nothing and its tab goes stale: `serve` signals the change, or the tabs refetch.

Pitfalls taken (SPEC-pitfalls.md): _`K17`_ and _`K18`_ (the code pane's layout and the showcase frame beside it), _`K19`_ (the size of _`S10`_; resolved by _`D382`_).
