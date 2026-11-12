# _`P4`_ Showcases: the showcase adapter interface, `html` and "bring your own build"

draft; segmentation, testing strategy and _`D105`_–_`D113`_ approved 2026-11-12

## Goals

The first showcases work, in the order _`D100`_ (SPEC-S6-showcases.md) sets: the showcase adapter interface, the `html` showcase adapter and "bring your own build", with _`D102`_'s checks (SPEC-S6-showcases.md) and _`S7`_'s documentation checks (_`D104`_, SPEC.md) placed in it. The `ts`, `react` and `angular` showcase adapters are planned later, in segments of their own.

## Child segments

Each is planned, approved, implemented and checkpointed on its own, in this order (_`D112`_):

- **_`P4.1`_ Showcase markers and documentation checks** (draft, not yet planned): static, building nothing. Markdown parsing in `check` (a new parser dependency); the showcase marker (_`D88`_) in fences and links (_`D89`_, _`D90`_), with JSON5 options; virtual files and name collisions (_`D91`_); the naked marker's rules (_`D92`_); the whole showcase adapter interface (_`D111`_), with the static half implemented; loading host-provided showcase adapters from `tsshowcase.json` (_`D99`_); the showcases in the host information; the broken-link warnings (_`D104`_, _`D110`_); the four Vitest projects and the scratch folder helper (_`D113`_).
- **_`P4.2`_ Showcase frames in `build`** (draft, not yet planned): the build half of the showcase adapter interface; the frame script and its `postMessage` contract (_`D77`_); the `html` showcase adapter (_`D97`_); showcase frames built into the output folder, and placed before their entry points in the showcase application (_`D93`_), sized and themed; `build` failing on a showcase that doesn't build; `check --showcases` (_`D102`_).
- **_`P4.3`_ Showcases in `serve`** (draft, not yet planned): showcase frames served by `serve`, updated when their files change (_`D82`_, _`K13`_), with build errors shown in the showcase frame (_`D102`_).

## Decisions

### Segmentation

- _`D110`_ (`live`): **_`S7`_'s broken-link warnings (_`D104`_) are part of _`P4.1`_**, sharing its Markdown parsing in `check`, so the parser is added and tested once. Rejected: a segment of their own, before or after _`P4`_.
- _`D111`_ (`live`): **_`P4.1`_ designs the whole showcase adapter interface**: the static half (validating options, stating host requirements) implemented, the build half (_`D105`_) typed and documented, implemented in _`P4.2`_. Host-provided showcase adapters (_`D99`_) are loaded in _`P4.1`_, as the static checks call them. Rejected: designing the build half only in _`P4.2`_; loading host-provided showcase adapters only from _`P4.2`_.
- _`D112`_ (`live`): **Order: _`P4.1`_, _`P4.2`_ (`build`), then _`P4.3`_ (`serve`).** With _`D105`_'s in-memory output, `serve` can hand out showcase frames from memory, so it is unlikely to reshape the interface. Rejected: `serve` before `build`; one segment for both.
- _`D113`_ (`live`; resolves _`O21`_): **_`P4.1`_ sets up the four Vitest projects (_`D109`_) and the scratch folder helper (_`D106`_)**, so _`P4.1`_ already gets end-to-end tests of `check`. Rejected: setting them up in _`P4.2`_; a fast-path change of their own before _`P4.1`_.

### Testing strategy

Settled before segmenting _`P4`_, so that every child segment inherits it (_`K12`_, SPEC-pitfalls.md, as far as _`P4`_ goes).

- _`D105`_ (`live`): **Showcase adapters return their built files in memory** (the showcase frame page and its assets, by path), and tsshowcase adds its frame script and does all the writing. tsshowcase also passes each build a scratch folder it creates and removes, for tools that must write to disk (e.g. Vite's build, the Angular CLI). Tests of showcase adapters then need no folder of their own. Rejected: in memory, with adapters making their own temporary folders; writing into an output folder tsshowcase passes.
- _`D106`_ (`live`): **Tests may use a scratch folder**: each test that needs one creates its own sub-folder of `node_modules/.cache/tsshowcase-tests/` (with `mkdtemp`) and removes it afterwards. It is already ignored by git, ESLint and Prettier, is wiped by `npm ci`, and stays inside the repository. This replaces the testing rule that tests never create temporary folders (`AGENTS.md` › Testing, updated when it is implemented); fixtures are still never written to. Rejected: allowing it only in a separate Vitest project; a gitignored `.scratch/` at the repository root; the OS temp folder (agents may not write there outside their session scratch directory).
- _`D107`_ (`live`): **Fixtures never carry `node_modules`, and resolve tsshowcase's own.** The frameworks fixture host repositories need become tsshowcase's devDependencies (React already is a dependency). End-to-end tests copy only a fixture's own files into their scratch folder (_`D106`_), from where module resolution still reaches this repository's `node_modules` (Node and Vite skip ancestor folders named `node_modules`), and run tsshowcase there. _`D63`_ (PLAN.md) stays: the output folder is inside the copy. Rejected: relaxing _`D63`_ so fixtures are built in place with `--out-dir` pointing outside them; a test-only override of _`D63`_. Fixtures needing another version of a framework than tsshowcase's (e.g. React 18, _`K10`_) are left to the framework spikes (_`O20`_).
- _`D108`_ (`live`): **Broad end-to-end tests**, `serve` included: the command line's `check --showcases`, `build` and `serve` run on fixture copies, covering the passing cases and every showcase error case; `serve`'s tests start Vite's dev server on a free port, fetch pages and showcase frames, and change files in the copy to check that the changes are picked up. The user's browser checks stay. Rejected: a few end-to-end tests only; integration tests calling showcase adapters directly, never Vite's build of the showcase application.
- _`D109`_ (`live`): **Four Vitest projects**, one per test tier, each with its own `test:<name>` and `ci:test-<name>` scripts (so `npm test` and CI run them all), told apart by file name suffix:
  - `unit`: `*.test.ts(x)`, as today, executed and type checked;
  - `integration`: `*.integration.test.ts`: real showcase adapter builds and `check --showcases`, with scratch folders;
  - `e2e`: `*.e2e.test.ts`: the command line's `check` and `build` on fixture copies, including Vite's build of the showcase application;
  - `serve`: `*.serve.test.ts`: the dev server tests.

  Only `unit` type checks, and its glob leaves out the other suffixes; `tsconfig.build.json`'s `*.test.ts` exclude already covers them. Rejected: three projects (`serve` tests inside `e2e`); two (`unit`, and one project for every test that builds or serves).

## Open points

- [ ] _`O20`_ From _`K12`_ (SPEC-pitfalls.md), _`D107`_. Testing the framework showcase adapters with framework versions other than tsshowcase's own (e.g. React 18, _`K10`_): npm aliases (`react18: npm:react@18`), a cached install step, or something else. For the `react` and `angular` segments and their spikes.
- [x] _`O21`_ (resolved by _`D113`_) From _`D109`_. Which child segment sets up the Vitest projects and the scratch folder helper (the first one whose tests need them).
