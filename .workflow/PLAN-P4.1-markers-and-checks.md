# _`P4.1`_ Showcase markers and documentation checks

approved 2026-11-12

Child of _`P4`_ (PLAN-P4-showcases.md). Static: it builds nothing. Its choices were settled 2026-11-12 (QD1, QD2 and Q1–Q18 of the planning discussion; each decision names its question).

## Goals

- `check` finds every showcase in the Markdown documentation files (_`D87`_–_`D92`_, SPEC-S6-showcases.md), and reports every broken showcase as an error, with its documentation file and line (_`D94`_, _`D102`_'s static tier).
- The whole showcase adapter interface (_`D111`_): its static half implemented (validating a showcase, stating host requirements), its build half typed and documented, for _`P4.2`_ (_`D105`_).
- The `html` showcase adapter's static half, and custom showcase adapters (_`D99`_, _`D133`_ (SPEC-S6-showcases.md)) loaded from `showroom.json`.
- The showcases and their virtual files (_`D91`_) in the host information.
- `check` warns about broken relative links (_`D104`_, SPEC.md; _`D110`_).
- The four Vitest projects (_`D109`_) and the scratch folder helper (_`D106`_), with end-to-end tests of `check` (_`D113`_).

Not in _`P4.1`_: building anything, `check --showcases`, and any change to the showroom's pages (_`P4.2`_); `serve` (_`P4.3`_).

## Decisions

### Dependencies

- _`D114`_ (`live`; QD1): **Markdown is parsed with `unified` and `remark-parse`, with `remark-gfm`**, the parser and versions `react-markdown` already uses in the showroom, so `check` and the showroom agree on what is a code block or a link. Both become direct `dependencies`; they are already installed (through `react-markdown`), so nothing new is downloaded.
- _`D115`_ (`live`; QD2): **`json5` parses showcase options** (_`D88`_): a new direct dependency (no dependencies of its own; already installed as a devDependency's dependency).

### Modules

- _`D116`_ (`live`; Q1): **Two new internal modules, not re-exported**:
  - `src/markdown/`: Node-free, so `check` and the showroom (in _`P4.2`_, to find the showcases it renders) can both use it: parsing a documentation file's Markdown, the showcase marker's grammar, extracting showcases and virtual files from the syntax tree, and resolving relative links (moved from `src/app/links/`, which then uses it);
  - `src/adapters/showcase/`: the showcase adapter interface, the registry of built-in showcase adapters, loading custom ones, and `html/` (the `html` showcase adapter).

### Showcase markers

- _`D117`_ (`live`; Q2): **Only Markdown documentation files are parsed** (the `.md` extension, as the showroom renders them, _`isMarkdown()`_), for showcases and for links alike; documentation files shown as plain text never hold showcases.
- _`D118`_ (`live`; Q3): **In a fence, the marker is the first word after the language**; the rest of the info string belongs to the marker (its keys). A word starting with `showcase` anywhere else in the info string isn't a marker. A fence whose first word is the marker (no language) is an error: _`D89`_ keeps the language first.
- _`D119`_ (`live`; Q4): **A link's title is a marker when its first word is `showcase`, or starts with `showcase=`**; it must then parse in full, or it is an error. A human title starting with the word "showcase" (e.g. `'showcase of buttons'`) is reported as a broken marker.
- _`D120`_ (`live`; Q5): **Only inline links are linked showcases.** A marker in a reference definition's title, or in an image's title, is an error.
- _`D121`_ (`live`; Q6): **A linked entry point** is a relative path (no query or fragment), resolved against the documentation file's folder (or the root, for `/…`), naming an existing file inside the host repository; whether that file is ignored doesn't matter. An absolute URL, a missing file, a folder, a path outside the host repository, or a virtual file is an error.
- _`D122`_ (`live`; Q7): **Marker keys**: `file=<name>` only on a resource (a naked marker with a `file` key, no adapter, no options); `file=` on an entry point is an error. `anchor=` is an error ("reserved for later", _`D88`_). An unknown or repeated key, and empty options (`showcase=x()`), are errors. Adapter names match `[a-z][a-z0-9-]*`.

### Virtual files

- _`D123`_ (`live`; Q8): **A resource's name is a plain file name**: no `/` or `\`, not `.` or `..`, no leading or trailing spaces. It collides, case-insensitively, with any other virtual file in the same folder (from any documentation file there) and with any real file or folder on disk in that folder, ignored or not.
- _`D124`_ (`live`; Q9): **An inline entry point's generated name** is `<documentation file's name without extension>.showcase-<n>.<extension>`, e.g. `README.showcase-2.html`, where `<n>` is the showcase's position in its documentation file (from 1), and `<extension>` comes from the fence's language (lower-cased; `typescript` → `ts`, `javascript` → `js`, `htm` → `html`; any other language as is). Generated names are checked for collisions like resources.

### Host information and issues

- _`D125`_ (`live`; Q10): **`HostInformation` gains `showcases` and `virtualFiles`**, both sorted by documentation file and line:
  - `Showcase`: `id` (`<documentation file's path>#<n>`), `documentation` (its path), `line` and `offset` of the entry point (the fence or the link), `kind` (`inline` or `linked`), `adapter`, `options` (as the showcase adapter validated them, or undefined), and `entry` (the entry point's path relative to the root: the virtual file, or the linked file);
  - `VirtualFile`: `path` (relative to the root), `content`, `documentation`, `line`.

  `ShownHostInformation` is unchanged until _`P4.2`_.

- _`D126`_ (`live`; Q11): **`CheckIssue` gains an optional `line`**, and issues are formatted `<severity>: <path>:<line>: <message>`.

### Showcase adapter interface

- _`D127`_ (`live`; Q12): **The showcase adapter interface** (a showcase adapter object lives for one run of `check`, `build` or `serve`):
  - `validate(showcase)`: static, per showcase: checks its options and entry point (e.g. its extension), returning the validated options or error messages;
  - `check?(root)`: static, once per run (the showcase adapter's part of `check`, where `validate` is per showcase), only for showcase adapters some showcase uses: returns the host requirements that are missing (e.g. "react is not installed", _`D80`_);
  - `build(request)`: per showcase (_`P4.2`_): takes the root, the showcase, its validated options, the virtual files of its folder and a scratch folder (_`D105`_); returns the showcase frame page's path and its files in memory, plus the files it read (for _`P4.3`_'s watching), or build errors with their paths and lines;
  - `close?()`: called once at the end of a run, so an adapter can share work between its showcases (e.g. one Vite instance) and clean it up.

  Rejected: one `build` call per showcase adapter with all its showcases (shared assets complicate the output; sharing work is still possible through the long-lived object and `close()`).

- _`D128`_ (`live`; Q13): **The `html` showcase adapter's static half**: it takes no options (any are an error), and its entry point must be an `html` or `htm` fence, or a linked `.html` or `.htm` file (_`D92`_'s rule, applied to `showcase=html` too); it has no host requirements. Its `build` comes in _`P4.2`_.
- _`D129`_ (`live`; Q14): **Custom showcase adapters** are listed in `showroom.json` as `"customShowcaseAdapters": { "<name>": "<path>" }`: the path is relative to the root, inside the host repository, to a `.js` or `.mjs` file whose default export is an object implementing the interface (`validate` and `build` are checked to be functions). Names follow _`D122`_ and may not be a built-in showcase adapter's name, nor a planned one (`ts`, `react`, `angular`). Every listed adapter is loaded and validated by every `check`, used or not; loading runs the host repository's code.
- _`D130`_ (`live`; Q15): **Exports and documentation**: `Showcase` and `VirtualFile` are exported (they are part of `HostInformation`), and so are the showcase adapter interface and its request and result types (_`D133`_ (SPEC-S6-showcases.md)); `src/markdown/` and the registry are not. `README.md` documents the showcase markers and what `check` reports, saying that showcases are not shown until `build` and `serve` support them, and documents custom showcase adapters (`customShowcaseAdapters`, the interface) in a section marked experimental: the interface may change in any release until it is declared stable (_`D133`_). Its build half is documented as it is implemented, in _`P4.2`_.

### Documentation checks

- _`D131`_ (`live`; Q16): **Broken links** (_`D104`_): every link and reference definition in a Markdown documentation file with a relative target (not images; checking images is an idea for later), URL-decoded, its query and fragment dropped, resolved like _`D121`_; a warning, with its line, when nothing exists on disk at the target, or the target is outside the host repository. Fragment-only links are skipped (_`S7`_'s "Ideas and later"). A linked showcase's link is checked by _`D121`_ only, as an error.

### Testing

- _`D132`_ (`live`; Q17): **Test setup**:
  - the `integration`, `e2e` and `serve` Vitest projects and their `test:*` and `ci:test-*` scripts (_`D109`_), each with `--passWithNoTests` until it has tests;
  - the scratch folder helper (_`D106`_) in a new `src/testing/` folder, excluded from the build in `tsconfig.build.json`, never re-exported, but type checked and linted like the rest of `src/`;
  - end-to-end tests call `main()` in-process, from `src/`, on fixture copies (_`D107`_); how _`P4.2`_'s end-to-end tests reach the compiled showroom (`dist/app/`) is left to _`P4.2`_;
  - new fixtures, grouped by area rather than one per error, as `check` reports every issue at once: `showcases` (inline, linked, resources, a custom showcase adapter), `showcase-errors` (one documentation file per error), `showcase-adapters` (`customShowcaseAdapters` errors), `links` (broken and working links).

## Steps

1. Dependencies (_`D114`_, _`D115`_); the Vitest projects, scripts and `src/testing/` (_`D132`_).
2. `src/markdown/`: parsing, the marker grammar, showcases and virtual files from the syntax tree, link resolution; `src/app/links/` moved onto it. Unit tests.
3. `src/adapters/showcase/`: the interface, the registry, `html`'s static half, loading custom showcase adapters; `showroom.json`'s `customShowcaseAdapters`. Unit tests.
4. `check`: showcases, virtual files, collisions, adapter validation and host requirements, broken links; `CheckIssue.line`; the host information. Fixtures, unit tests, end-to-end tests of `main()`'s `check`.
5. Documentation: `README.md` (`# Usage`: markers, `check`'s new errors and warnings, `HostInformation`; `# Development`: the test projects), `AGENTS.md` (Layout, Commands, Testing (incl. _`D106`_ replacing "never create temporary folders"), Exports, Gotchas), `CONTRIBUTE.md` (project structure, Glossary).

## Open points

- _`K14`_ (SPEC-pitfalls.md) belongs to _`P4.2`_: the build half receives virtual files in memory (_`D127`_); how each showcase adapter puts them in front of its tooling is planned there.
