# _`P15.2`_ Checks and issues in the adapter result

implemented 2026-11-15 (option chosen: "Approve and commit (Rec.)"); approved 2026-11-15 (option chosen: "Approve and commit (Rec.)"), without a zero-context review

## Goals

_`S12`_'s checks and issues in the showcase adapter's build result (SPEC-S12-showcase-views.md): _`D508`_ but its default views (_`P15.4`_'s), _`D527`_, _`D537`_, and _`D538`_'s part on _`D96`_ but its default views. A child of _`P15`_ (PLAN-P15-showcase-views.md), the second of six (_`D541`_). The showroom doesn't change yet: `serve` shows its error frame on any error, files or not, until _`P15.5`_ (_`D547`_).

Facts found while planning (2026-11-15):

- `ShowcaseBuildResult` is files or `errors`, with an optional `warnings` (_`D270`_ (PLAN-P7.1-ts.md)); `checkBuildResult()` (`src/showcases/`) validates it (_`D136`_ (PLAN-P4.2-showcase-frames.md)); `buildShowcases()` returns `frames`, `errors` and `warnings`, which `check --showcases`, `build` and `serve` read.
- `buildTsShowcase()` (shared by `ts`, `react` and `angular`) type checks after a successful bundle, and returns type errors instead of files (_`D278`_ (PLAN-P7.1-ts.md)); `angular` compiles before Vite, failing on syntax and structural errors and a bad default export, and on type errors once it bundles.
- Custom showcase adapters returning `errors` or `warnings`: the `number-table` example (`examples/number-table/number-table.js`, and its `README.md`) and the fixtures' adapters (`showcase-adapters`, `showcase-errors`, `showcase-frames`, `showcase-build-errors`, `showcases`, `showcase-keys`).

## Decisions

- _`D554`_ (`live`; replaces _`D270`_ (PLAN-P7.1-ts.md); option chosen: "One issues list (Rec.)"): **The build result is one shape**: `{ page?, files?, reads, checks?, issues? }`; an issue is `{ severity: 'error' | 'warning', message, path?, line?, check? }`, the exported `ShowcaseBuildError` renamed `ShowcaseBuildIssue`; `errors` and `warnings` go (a breaking change of the experimental interface, _`D512`_). `page` and `files` come together, present unless an error names no check (the build's own), and absent when one does (_`D508`_). Rejected: keeping `errors` and `warnings`, each with `check` (two lists for what _`D527`_ makes one).
- _`D555`_ (`live`; refines _`D136`_ (PLAN-P4.2-showcase-frames.md); option chosen: "Strict (Rec.)"): **`checks` is validated strictly**: a list of distinct, non-empty strings, the checks that ran to completion (_`D537`_); an issue naming a check missing from it, files with an error naming no check, or no files without one, make the result invalid (`returned an invalid build result: …`, as today). Check names are free; the built-ins use `type check`. Rejected: a check implied by the issues naming it.
- _`D556`_ (`live`; option chosen: "Add check, show it (Rec.)"): **`CheckIssue` gains an optional `check`**, and the command line shows it before the message (`error: README.md:12: Showcase README.md#2 (README.md:10): type check: …`), so a CI log tells a type error from a build error; _`P15.5`_'s issue list reads it there. Rejected: the field without printing it; leaving `CheckIssue` alone until _`P15.5`_.
- _`D557`_ (`live`; changes _`D278`_ (PLAN-P7.1-ts.md); option chosen: "As described (Rec.)"): **The built-in showcase adapters' checks**:
  - `ts` and `react` (through `buildTsShowcase()`): `type check` in `checks` when the type check ran (a successful bundle, `typeCheck` on, a supported TypeScript found); TypeScript's errors name it, and the files are kept beside them; the bundle's errors and warnings name no check;
  - `angular`: `type check` when `typeCheck` is on and the compile and bundle succeed; its template and TypeScript type errors and its extended diagnostics' warnings name it, with the files kept; syntax and structural errors, a default export that isn't a standalone component, and the bundle's errors name no check, and leave no files;
  - `html`: no checks.
- _`D558`_ (`live`, changed by _`D584`_ (PLAN-P15.5-status-marks.md); refines _`D584`_ (PLAN-P15.5-status-marks.md) (in place of _`D547`_ (PLAN-P15-showcase-views.md))): **`buildShowcases()` keeps both**: `frames` holds every showcase whose result has files, issues or not; `errors` every showcase's errors (an error issue, placed as today); `warnings` the warnings; and a new `checks` map, by showcase id, the checks each ran. `check --showcases` and `build` fail on any error, as today; `serve` shows its error frame for a showcase with any error, whether it has files or not, until _`P15.5`_.

## Steps

1. **`src/adapters/showcase/`**: `ShowcaseBuildIssue`, `ShowcaseBuildResult`'s new shape (_`D554`_), documented as experimental; `src/index.test.ts`'s export list.
2. **`src/showcases/`**: `checkBuildResult()` (_`D555`_), `getBuildErrorIssue()` placing an issue with its severity and check (renamed `getBuildIssue()`), `buildShowcases()`'s `frames`, `errors`, `warnings` and `checks` (_`D558`_). Tests: its unit tests (every invalid case), and the `showcase-build-errors` fixture's integration test (an invalid result naming a check it didn't list; files and a check's error together).
3. **`src/cli/`**: `CheckIssue`'s `check`, and the command line's output (_`D556`_); `check --showcases`, `build` and `serve` on the new result (`serve`'s error frame for any error, _`D558`_). Tests: `src/cli/` output, `check`, `build` and `serve`'s unit tests.
4. **The built-in showcase adapters** (_`D557`_): `html`, `buildTsShowcase()` (`ts`, `react`), `angular` and its compile. Tests: their unit tests, and their integration tests (`showcase-ts-types`, `showcase-react-errors`, `showcase-angular-errors`: type errors named `type check`, with files; build errors without; `checks` with `typeCheck: false` and after a failed bundle).
5. **Custom showcase adapters**: the `number-table` example and the fixtures' adapters on the new shape.
6. **Documentation**: `README.md` (the showcase adapter interface's result, `CheckIssue`'s `check`, the command line's output), `AGENTS.md` (Exports, Testing), `CONTRIBUTE.md`'s architecture; the plan decisions this changes marked (_`O84`_): _`D270`_ replaced, _`D278`_ changed, _`D136`_ and _`D547`_ refined.
7. **Green**: `npm run ci`; the dogfood `serve` started for the user's look (nothing visible should change).

## Open points

- None yet.
