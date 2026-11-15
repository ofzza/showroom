# _`P15`_ Showcase views

approved 2026-11-15, for its split and order (_`D541`_), after its zero-context review (option chosen: "Approve and commit (Rec.)")

## Goals

_`S12`_ (SPEC-S12-showcase-views.md), without _`S12.1`_ (planned as _`P16`_, _`D542`_): named virtual files and the retired "Showcase resource" (_`D517`_, _`D518`_, _`D521`_, _`D522`_, _`D532`_, _`D533`_); the showcase adapters' checks and issues (_`D508`_, _`D527`_, _`D537`_); the console and the issues out of the showcase frame (_`D504`_–_`D506`_, _`D530`_, _`D531`_); the showcase views and their defaults (_`D495`_–_`D503`_, _`D519`_, _`D520`_, _`D534`_, _`D540`_); the draft's settled choices (_`D523`_); the block's header bar, status marks and issue list (_`D506`_, _`D507`_, _`D509`_, _`D525`_, _`D526`_, _`D528`_, _`D529`_, _`D539`_); the `include=` keywords (_`D510`_, _`D511`_, _`D535`_); the still-`live` decisions it changes (_`D538`_); the Glossary changes (_`D522`_, _`D524`_, _`D536`_) and this repository's documentation and examples (_`D512`_).

Facts found while planning (2026-11-15):

- "resource" appears 118 times in 23 files of `src/`, `examples/`, `README.md`, `CONTRIBUTE.md` and `AGENTS.md`; `VirtualFileKind` (`src/host/`) is `'resource' | 'entry'`.
- The _`O81`_ spike (`./.workflow/.temp/spike-hidden-frame/FINDINGS.md`, kept until _`P15.4`_ records it as evidence): in Chromium, same-origin showcase frames are never throttled, however hidden; `display: none` and a 1 px frame change what the page sees (sizes, media queries, CSS animations); `opacity: 0` at the real size, in a 0-high container that clips, runs as a shown frame scrolled out of view.

## Child segments

Each is planned, approved, implemented and checkpointed on its own, in this order (_`D541`_; their parts after the review, _`D545`_–_`D548`_):

- **_`P15.1`_ Named virtual files** (_`D517`_, _`D518`_, _`D521`_, _`D522`_, _`D532`_, _`D533`_, _`D538`_'s part on _`D361`_ and _`D363`_): `file=` with or without a showcase adapter in the marker grammar and `check` (`include=` on a virtual file with no adapter an error, as on a resource today); "Showcase resource" retired in every identifier, comment, message and document; `VirtualFileKind`'s replacement (_`O86`_); the `html` showcase frame holding every named virtual file of its folder.
- **_`P15.2`_ Checks and issues in the adapter result** (_`D508`_ but its default views, _`D527`_, _`D537`_, _`D538`_'s part on _`D96`_ but its default views): the experimental showcase adapter interface's `checks`, each issue's `check`, warnings as issues, files and issues in one result; every built-in showcase adapter and the `number-table` example follow; `check --showcases` and `build` fail as before. The showroom doesn't change yet: `serve` shows its error frame on any issue, files or not, until _`P15.5`_ (_`D547`_).
- **_`P15.3`_ The console out of the showcase frame** (_`D503`_ (_`D545`_), _`D504`_, _`D505`_, _`D523`_'s 128 lines, _`D530`_'s clearing of the overlay, _`D531`_ on the showcase frame's box): the frame script captures the console and formats its values (_`K22`_); the frame contract's new messages (_`O82`_, _`O88`_); the showroom's console panel over the showcase frame, as today's hidden console panel, with no detecting what a showcase renders (until _`P15.4`_, a showcase that only logs shows an empty showcase frame under it); the `ts` showcase adapter's console script removed.
- **_`P15.4`_ Showcase views** (_`D495`_–_`D502`_, _`D508`_'s default views, _`D509`_'s layout (_`D546`_), _`D519`_, _`D520`_, _`D523`_'s `showcaseViews` name, custom default and 8 lines, _`D526`_'s `check` error, _`D530`_'s clearing of the `console` view, _`D534`_, _`D540`_, _`D538`_'s parts on _`D96`_'s default views and _`D354`_): `view=` in the marker grammar and `check`; `showroom.json`'s `showcaseViews`; the defaults' layers, a showcase adapter's own default among them; `Showcase` gaining its views; the Markdown source of every showcase in the shown host information (today read only with `exposeShowcaseMarkdownSyntax`); the block's header bar with the code pane's cycling button, and the `markdown`, `source`, `demo`, `console` and `none` views stacked under it; the showcase frame loaded only for `demo` or `console`, and hidden for `console` alone as the spike found (_`O81`_, _`K21`_). Until _`P15.5`_, a block with no visible showcase frame shows its issues only in the terminal and the issues bar (_`D547`_). Its own planning decides whether it is split further (_`D548`_).
- **_`P15.5`_ Status marks and issue list** (_`D506`_, _`D507`_, _`D509`_'s status marks and issue list, _`D523`_'s warning and error marks and expanded list, _`D525`_, _`D526`_'s interim header bar, _`D528`_, _`D529`_, _`D530`_'s `runtime` reset and pending state, _`D539`_, _`D538`_'s part on _`D102`_): the status marks in the header bar; the issue list, and the issues' markers in the views and tabs; `serve`'s error frame removed; the interim header bar of a linked showcase shown inline; their look checked by the user in a browser (_`O83`_).
- **_`P15.6`_ Included keywords** (_`D510`_, _`D511`_, _`D535`_): `include=source` and `include=markdown`; `exposeShowcaseMarkdownSyntax` removed, and this repository's `README.md` listing `markdown` where it relied on it; the `markdown` tab keeps _`D539`_'s markers.

## Decisions

- _`D541`_ (`live`, refined by _`D545`_–_`D548`_; option chosen: "Six children (Rec.)"): **_`P15`_ is split into six child segments**, _`P15.1`_–_`P15.6`_ as listed above, in that order, so that each one's dependencies land first: the adapter interface before the status marks, the showroom's console panel before the `console` view, the issue list before `serve`'s error frame goes. Rejected: _`P15.4`_ and _`P15.5`_ joined (one large showroom change, harder to review).
- _`D542`_ (`live`; option chosen: "Six children (Rec.)"): **_`S12.1`_ is planned as _`P16`_**, a plan segment of its own, once _`P15`_ is implemented (the user, for _`S12.1`_: "keep this as a separate planning and implementation step"). Rejected: _`P15.7`_.
- _`D543`_ (`live`, changed by _`D548`_; option chosen: "Accept all (Rec.)"): **_`S12`_'s open points and pitfalls are taken as follows**: _`O81`_ and _`K21`_ by _`P15.4`_, resolved by the spike's evidence recorded there; _`O82`_, _`O88`_ and _`K22`_ by _`P15.3`_; _`O83`_ by _`P15.5`_; _`O86`_ by _`P15.1`_, as a choice there; _`O84`_ by each child, for the plan decisions it changes (_`D544`_); _`O85`_ and _`K23`_ resolved by _`D541`_; _`O87`_ by _`P16`_.
- _`D544`_ (`live`; option chosen: "Six children (Rec.)", as proposed with the split): **Each child carries its own part of the documentation, tests and Glossary**: its tests; `README.md` (its showcases, the cheat-sheet), `AGENTS.md`, `CONTRIBUTE.md` and the examples for what it changes (_`D512`_); its part of the Glossary changes (_`D522`_, _`D524`_, _`D536`_); and it marks the plan decisions it changes (_`O84`_) when it is written.
- _`D545`_ (`live`; refines _`D541`_; review 2026-11-15 #3, option chosen: "Drop it early (Rec.)"): **_`D503`_ moves to _`P15.3`_**: removing the `ts` showcase adapter's console script ends detecting what a showcase renders; the showroom's console panel is the hidden one over the showcase frame for every showcase until _`P15.4`_'s views say otherwise. Rejected: a temporary message reporting the showcase frame root's content, removed by _`P15.4`_ (code written to be deleted).
- _`D546`_ (`live`; refines _`D541`_; review 2026-11-15 #4, option chosen: "Header bar in P15.4 (Rec.)"): **_`P15.4`_ brings the block's header bar** (_`D509`_'s layout: the bar with the code pane's cycling button, the views stacked under it), as a block may have no showcase frame for the button to sit on; _`P15.5`_ adds the status marks and the issue list to it. Rejected: an interim place for the button over the first view.
- _`D547`_ (`live`; refines _`D541`_; review 2026-11-15 #5, #6, option chosen: "Accept both (Rec.)"): **Two interim states are accepted until _`P15.5`_**: `serve` shows its error frame on any issue, even when a build result holds files too (from _`P15.2`_); a block with no visible showcase frame shows its issues only in the terminal and the issues bar (from _`P15.4`_). Rejected: a minimal issue display in _`P15.4`_.
- _`D548`_ (`live`; refines _`D541`_, changes _`D543`_ (_`O85`_ resolved by _`D541`_ and _`D542`_, not _`D541`_ alone); review 2026-11-15 #1, #2, #7–#12, option chosen: "Apply all, skip #13 (Rec.)"): **The children's parts after the review**, as the child segments above list them: _`D523`_'s choices to _`P15.3`_, _`P15.4`_ and _`P15.5`_; _`D519`_ and _`D520`_ to _`P15.4`_ alone; _`D508`_'s and _`D538`_'s default views to _`P15.4`_; _`D526`_'s `check` error to _`P15.4`_ and its header bar to _`P15.5`_; _`D530`_ and _`D531`_ by part; the Markdown source of every showcase in _`P15.4`_, and _`D539`_'s markers kept on _`P15.6`_'s `markdown` tab. _`P15.4`_, the largest child, decides in its own planning whether to split further.

## Review notes

- Review 2026-11-15 #13 (skipped): references to _`S12`_'s decisions don't each name `SPEC-S12-showcase-views.md`; the Goals name it first, as _`P10`_ does for _`S10`_.

## Open points

Taken from _`S12`_ (SPEC-S12-showcase-views.md) by _`D543`_; each child raises its own when it is planned:

- _`P15.1`_: _`O86`_.
- _`P15.3`_: _`O82`_, _`O88`_; _`K22`_ (SPEC-pitfalls.md).
- _`P15.4`_: _`O81`_; _`K21`_ (SPEC-pitfalls.md).
- _`P15.5`_: _`O83`_.
- Every child: _`O84`_.
