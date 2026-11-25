# _`P28`_ The console in the header bar

approved 2026-11-25 (option chosen: "Approve and commit (Rec.)")

_`S12`_ (SPEC-S12-showcase-views.md) as revised by _`R69`_: the console panel's counter dropped, the `runtime` mark counting the lines with a `>_` prefix, the fading lines in the header bar, no opening by itself, and overlays over the header bar (_`D939`_–_`D943`_ (SPEC-S12-showcase-views.md)). One segment, with no child segments; its choices were settled 2026-11-25 (Q1–Q4, all as recommended, and the `>_` prefix at the user's word).

## Decisions

- _`D944`_ (`live`; supersedes _`D565`_ (PLAN-P15.3-console.md)): **Where it changes**: `src/app/console/`: the console's state keeps its counts (lines, warnings, errors, dropped) and its open flag, and loses opening by itself and the unseen errors that turned the counter red; the newest line and its fading are judged by the state's time, as the fading lines are today, but one line; `ConsolePanel` keeps only the open panel (its header bar, close button, Escape), and `ConsoleHeaderLine` (new) renders the newest line for the header bar, a button opening the panel. `src/app/code-pane/`: `getStatusMarkText()` and `getStatusMarkLabel()` gain the line count and the `>_` prefix; the header bar places `ConsoleHeaderLine` after the status marks, before the buttons, taking the room between them (`min-width: 0`, cut with an ellipsis). `src/app/showcases/`: `ShowcaseFrame` no longer reserves a box height for the counter (_`D565`_'s minimum goes, the 64 px block minimum of _`D437`_ (PLAN-P10.5-console.md) stays); in the showcase sidebar, a raised box's level is above the sticky header bar's (_`D943`_ (SPEC-S12-showcase-views.md)).
- _`D945`_ (`live`): **Tests and documentation**: `src/app/console/` (the state without opening by itself or unseen errors; the newest line and when it fades; `ConsoleHeaderLine` rendered on the server: its text, level, ellipsis style and button; the panel without the counter), `src/app/code-pane/` (the mark's text and label with and without lines, ⚠ and ✗, pending, recorded; the header bar's order: marks, the line, the buttons; no line with a `console` view; the raised box's level in the showcase sidebar), `src/app/showcases/` (no counter, no box minimum for it); `README.md` (the console panel and the `runtime` mark's paragraphs, and every place naming the counter or the fading lines over a showcase), `CHANGELOG.md` (`## Unreleased` › Changed), `AGENTS.md` (Testing's console panel and code pane paragraphs, the gotchas naming the counter: the open console panel's room, the overlays over the page's levels), `CONTRIBUTE.md`'s Glossary entry **Console panel** if it names the counter. The user checks it in a browser: the line fading in the header bar, clicking it and the mark, a showcase's overlays covering the header bar on the page and in the showcase sidebar, both themes.

## Steps

1. **The console's state and components** (`src/app/console/`): _`D939`_, _`D941`_, _`D942`_ (SPEC-S12-showcase-views.md), _`D944`_. Unit tests.
2. **The header bar and the status mark** (`src/app/code-pane/`), and the showcase frame's box and levels (`src/app/showcases/`): _`D939`_–_`D941`_, _`D943`_ (SPEC-S12-showcase-views.md). Unit tests.
3. **Documentation** (_`D945`_).
4. **Green**: `npm run ci`; the servers restarted; the user checks it in a browser at the checkpoint.

## Open points

- None yet.
