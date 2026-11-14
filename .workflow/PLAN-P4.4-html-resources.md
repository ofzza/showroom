# _`P4.4`_ Resources in `html` showcases, and live README examples

approved 2026-11-12; implemented 2026-11-12

Child of _`P4`_ (PLAN-P4-showcases.md). Started 2026-11-12 from the dogfooding check (`showroom` built against its own repository): the user asked that every example in `README.md` showing how a showcase is written be followed by that showcase, live. That surfaced that an `html` showcase can't use a resource (_`D134`_, PLAN-P4.2-showcase-frames.md), which the user reconsidered: not following what a page references stays, but an explicitly declared resource should be usable. Planned before _`P4.3`_.

## Goals

- An `html` showcase can use the resources (code blocks marked `showcase file=<name>`) of its documentation file's folder, without `showroom` reading the page for references.
- Every example in `README.md` of how a showcase is written is followed by that showcase, live in this repository's own showroom.

Not in _`P4.4`_: following real files from disk for `html` (_`D150`_ stays); a live custom showcase adapter in this repository (the user: "No, keep it as text").

## Decisions

### Resources in `html` showcases

- _`D169`_ (`live`, changed by _`D374`_ (SPEC-S10-presentation.md); changes _`D134`_ (PLAN-P4.2-showcase-frames.md), refines _`D150`_ (PLAN-P4.2-showcase-frames.md)): **An `html` showcase frame holds the resources of its documentation file's folder.** The `html` showcase adapter writes every resource among its build request's virtual files (the documentation file's folder, _`D127`_) into the showcase frame's folder, next to its page, under the resource's name, without reading the page: so `<script src="./demo.js"></script>` in an inline `html` showcase loads the `demo.js` resource, as the Markdown suggests. A frame gets every resource of the folder, used or not (a few small duplicated files in the output folder). Resources of other folders aren't included. Rejected: reading the page for its references and copying only those (_`D134`_'s reason, which the user keeps: "I still don't want to do that"); keeping `html` fully self-contained.
- _`D170`_ (`live`; Q1 "A: kind on VirtualFile (Rec.)"): **Telling resources from inline showcases' entry points.** Both are virtual files, and a build request only has its own showcase: a `kind` (`'resource'` or `'entry'`) on `VirtualFile` (`src/host/`), set by the Markdown scan, shown in `check`'s host information and the experimental showcase adapter interface (`README.md` › Usage). Rejected: a separate `resources` list in `ShowcaseBuildRequest`; copying every virtual file of the folder, entry points included.
- _`D171`_ (`live`; Q2 "Yes, same rule (Rec.)"): **Linked `html` showcases** get the resources too, by the same rule; `README.md` says references to resources only resolve as written for a page in the documentation file's folder. Rejected: inline `html` showcases only.
- _`D172`_ (`live`): **A resource named `index.html` (ignoring case)** would replace the `html` showcase frame's page: the `html` showcase adapter's build fails, with the error at the resource's code block. Rejected: renaming the page (its name shows in the showcase frame's URL, and another name could collide just as well).

### README examples

- _`D173`_ (`live`): **Every example of how a showcase is written, in `README.md`, is followed by its live showcase**, introduced by a short line (the first: "Here is that block again, as a live showcase in this repository's own showroom:", shorter for the rest): the inline showcase; the resource, with a live `html` showcase using it; the linked showcase; the themed fragment (Showcase frames). The custom showcase adapter's examples stay text only; the host information JSON (`showroom check`) isn't such an example. The README stays readable on GitHub, where each live showcase reads as a highlighted code block or an ordinary link.
- _`D174`_ (`live`): **Real files behind live showcases go in `./examples/`** at the repository root (the user's choice), outside `src/`, so they are never built, linted or published; the linked example's path becomes `./examples/button.html`, so the example and the live showcase match.
- _`D175`_ (`live`; Q3 "Yes (Rec.)"): **A test keeps this repository's own showroom working**: an `integration` test runs `check()` with `showcases: true` on the repository's root and expects no issues, and at least one showcase of each kind in `README.md`; it fails when an edit breaks a README showcase. Rejected: no test (the user's dogfooding by hand only).

### From the implementation (2026-11-12)

- _`D176`_ (`live`; resolves _`O26`_; the user: "Own temp folder (Rec.)"): **The test that `buildShowcases()` removes its temporary folder runs its build in an OS temp folder of its own** (`TMPDIR`, `TMP` and `TEMP` pointed at a scratch folder for its build), and expects it empty afterwards: the `integration` tier's own temp folder is shared with the other test files, which may be building at the same moment. Rejected: running the `integration` tier's files one after another (slower); moving _`D175`_'s test to the `e2e` tier (leaves the race).

## Steps

1. Already done (the fast path, before this segment): the live inline `html` showcase after the inline example; `AGENTS.md`'s note that `README.md` holds deliberately live showcases; _`L4`_–_`L8`_ (PLAN.md).
2. Resources in `html` (_`D169`_–_`D172`_): the Markdown scan's virtual files get their `kind` (_`D170`_), the `html` showcase adapter's build, and their unit tests (`src/markdown/`, `src/adapters/showcase/html/`); a resource used by an inline `html` showcase in the `showcase-frames` fixture, checked in its `integration` and `e2e` tests (the file in the showcase frame's folder).
3. `README.md` (_`D173`_, _`D174`_): the `html` section (no longer "self-contained": its page alone, plus its folder's resources; the `<script>` needs its closing tag); the resource sentence; the live showcases; `./examples/button.html`; `README.md` › Usage for _`D170`_'s `kind`. `AGENTS.md` (the live-markers gotcha, Layout: `examples/`, Exports, for _`D170`_) and `CONTRIBUTE.md` (project structure).
4. The guard test (_`D175`_), in `src/cli/check/`.
5. `npm run ci`; a dogfood build of a copy of this repository, checked in a browser by the user.

## Open points

- [x] _`O25`_ (resolved by _`D181`_ (PLAN-P4.3-serve.md)) From _`D169`_. For _`P4.3`_: `serve` hands out an `html` showcase frame's resources with its page, and updates them when their code blocks change.
- [x] _`O26`_ (resolved by _`D176`_) From _`P4.4`_'s implementation (_`D175`_). `showcases (integration)` › "Removes its temporary folder" failed now and then (seen before _`P4.4`_ too): it expected no `showroom-showcases-*` folder in the tier's shared OS temp folder while another test file was building; with _`D175`_'s build it failed about 1 run in 6.
