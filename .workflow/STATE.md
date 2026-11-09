# Session state

## Next session: start here

- **Stage:** planning: S1 is implemented; S2 Showcase application is approved (child segments S2.1 and S2.2); S3 Build command is not planned yet.
- **Working on:** nothing in progress.
- **Next step:** the user chooses between implementing S2.1 Showcase application and planning S3. `./.workflow/.temp/review-s2-plan/` and `questions-s2-plan/` await the user's confirmation before deletion.

## Open questions

- None. Open pitfalls are in `./.workflow/SPEC.md` › Pitfalls.

## Waiting on me

- Confirmation that `./.workflow/.temp/review-s2-plan/` and `questions-s2-plan/` can be deleted (their results are in the plan, the specification and `CONTRIBUTE.md`).
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
