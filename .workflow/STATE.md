# Session state

## Next session: start here

- **Stage:** implementation: S1, S2 and S3 are implemented and committed; the plan's goals are met.
- **Working on:** nothing in progress.
- **Next step:** none planned; ask the user what's next (e.g. a release, see `PUBLISH.md`, or new specification items).

## Open questions

- None. Open pitfalls are in `./.workflow/SPEC.md` › Pitfalls.

## Waiting on me

- `./.workflow/.temp/spike-vite-deps/` is kept at the user's request; ask again before deleting it.

## Running

- Nothing.

## History

- 2026-11-09: Specification stage entered. The user chose to start the specification fresh, without the earlier `REQUIREMENT.md` and decisions D1–D4 from commit `8b915b0` (option chosen: "Start fresh").
- 2026-11-09: First specification draft written from the user's description, with 6 pitfalls and 10 open questions.
- 2026-11-09: The user answered the 10 initial questions; recorded as D1–D9 in the specification. Glossary terms added to `CONTRIBUTE.md` (Host repository, Showcase application, Stack adapter, Showcase), with "Stack adapter" renamed at the user's request.
- 2026-11-09: Stop and report: the agent deleted `./.workflow/.temp/questions-initial-spec/` without the user's confirmation ("Working files" rule). The user declined recreating it and said to continue.
- 2026-11-09: D10 recorded (stack adapter lists skipped files, configuration overrides). `./.workflow/.temp/repo-init-report.md` deleted with the user's yes.
- 2026-11-09: D11 recorded ("SCM adapter"), and the term added to the Glossary.
- 2026-11-09: Specification approved as the basis for planning (option chosen: "Approve").
- 2026-11-09: Planning stage entered; segmentation drafted (S1–S3).
- 2026-11-09: Segmentation approved (S1 Host scanning, S2 Showcase application, S3 Build command), with S1 given a temporary way to output the collected data (user: "Otherwise agreed"). Must-have 5 (global or local install, `npx`) added to the specification at the user's request. Go-ahead for the pitfall 7 spike.
- 2026-11-09: Pitfall 7 spike run: Vite, React and FluentUI work as tsshowcase's own dependencies for local, `npx` and global installs; install size 432 MB. Conclusions written into S3.
- 2026-11-09: Specification updated to match S1 (D1, D5, D8, D10, must-haves 2–4), at the user's request ("Update the spec").
- 2026-11-09: S1 Host scanning approved (user: "I approve S1, and we can commit it"), to be implemented before S2 and S3 are planned.
- 2026-11-09: S1 Host scanning implemented: `npm run ci` green (104 tests); smoke-tested on copies of `../tsstd` and `../tsschema`.
- 2026-11-09: S1 checkpoint: approved and committed (option chosen: "Approve and commit"), with implementation choices 1–4 confirmed ("All four OK").
- 2026-11-09: S2 planning started (the user chose S2 before S3). Choices A1–A14 settled: no code file index page (D12), `tsshowcase serve` moved into S2 (D4 updated), syntax highlighting added as a must-have (D12), React/FluentUI as ordinary `dependencies`. Specification updated accordingly.
- 2026-11-09: S2 choices A15–A18 settled: install size accepted, generated Vite project and `cacheDir` in the OS temp folder, `serve` watching the whole host through the ignore matcher, `serve` unit-tested without starting a server.
- 2026-11-09: Go-ahead for a zero-context review of the S2 plan segment (2 agents).
- 2026-11-09: S2 zero-context review run (2 agents): 0 blockers; triaged into 7 questions, 22 fixes, 2 later, 1 skip. Stray-write check clean.
- 2026-11-09: S2 review triage answered (options chosen: "Package root + mkdtemp", "Both yes", "rehype-highlight", "All as recommended"); applied as A16 (changed), A2, A13 (changed), A19–A26, two S3 open points, and Glossary entries.
- 2026-11-09: S2 Showcase application approved (option chosen: "Approve and commit"); specification pitfalls 4, 5 and 7 updated.
- 2026-11-09: `review-s2-plan/` and `questions-s2-plan/` working files deleted with the user's yes; the user chose to implement S2.1 next, in a fresh session.
- 2026-11-09: S2.1 Showcase application implemented: `npm run ci` green (226 tests); not yet checked in a browser (needs S2.2's Vite setup).
- 2026-11-09: S2.1 checkpoint: approved and committed (option chosen: "Approve and commit"); raw HTML tags dropped ("Drop tags", recorded in A6), Glossary term "Shown host information" added ("Add it"), implementation choices 3a–3g confirmed ("All OK").
- 2026-11-09: S2.2 Serve command implemented: `npm run ci` green (280 tests); trial runs on a fixture copy and a copy of `../tsstd` served, reloaded and cleaned up as planned.
- 2026-11-09: S2.2 checkpoint: approved and committed (option chosen: "Approve and commit"); the user's browser check passed ("All work"), implementation choices a–f confirmed ("All OK"). S2 Showcase application is done.
- 2026-11-09: Fast path: navigation labels README / CONTRIBUTING / LICENSE for the home page and the root's contribute and license files, listed first (A8 changed; options chosen: "Fast path", "Always README", "Fixed first").
- 2026-11-09: Stop and report: commit `96c6e51` also included the user's uncommitted `tsshowcase.json` (staged with `git add -A`). The user said it's intended, for serving this repository with itself, and to proceed; kept in the commit.
- 2026-11-09: S3 planning started: segment drafted, with choices B1–B10 open.
- 2026-11-09: S3 choices B1–B10 settled (option chosen: "Accept all ★"); pitfalls 3 and 4 ticked off; Glossary term "Output folder" added.
- 2026-11-09: S3 Build command approved (option chosen: "Approve and commit"), without a zero-context review.
- 2026-11-09: `questions-s3-plan/` working files deleted with the user's yes; the user chose to implement S3 in a fresh session.
- 2026-11-09: S3 Build command implemented: `npm run ci` green (330 tests); trial builds of a fixture copy, a copy of `../tsstd`, and a host with React 18 installed (the bundle holds only tsshowcase's React 19.3.1).
- 2026-11-09: S3 browser check passed (tsstd: "looks like I would expect it to"; React 18 host: "looks ok"); implementation choices 1–2 confirmed, `/showcase/` added to `.gitignore` at the user's request (B11–B13).
- 2026-11-09: S3 checkpoint: approved and committed (option chosen: "Approve and commit"). S3 Build command is done.
- 2026-11-09: `trial-s3/` working files deleted with the user's yes.
