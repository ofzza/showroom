# Session state

## Next session: start here

- **Stage:** planning (_`P4`_). Specification: _`S6`_ Showcases (with _`S6.5`_ Showcases in Markdown and _`S6.6`_ Showcase adapters) and _`S7`_ Documentation checks approved; _`P1`_–_`P3`_ and _`P4.1`_ are implemented and committed.
- **Next free:** _`D134`_, _`S8`_, _`P5`_, _`O23`_, _`L3`_, _`R6`_, _`H1`_, _`K15`_
- **Working on:** _`P4`_ Showcases (`./.workflow/PLAN-P4-showcases.md`): _`P4.1`_ Showcase markers and documentation checks implemented (`./.workflow/PLAN-P4.1-markers-and-checks.md`); _`P4.2`_ and _`P4.3`_ are not yet planned.
- **Next step:** plan _`P4.2`_ Showcase frames in `build` (`./.workflow/PLAN-P4-showcases.md`), starting with its open points (_`K14`_, from _`P4.1`_), possibly in a fresh session.

## Open questions

- See _`S6`_'s open points _`O16`_–_`O19`_. Open pitfalls are in `./.workflow/SPEC-pitfalls.md`.

## Waiting on me

- `./.workflow/.temp/spike-vite-deps/` is kept at the user's request; ask again before deleting it.
- `./.workflow/.temp/showcases-ideas/NOTES.md` holds proposals for planning (not decided; its format ideas are superseded by _`S6.5`_ and _`S6.6`_); read it when planning starts, and ask before deleting it.

## Running

- Nothing.

## History

- 2026-11-09: Specification stage entered. The user chose to start the specification fresh, without the earlier `REQUIREMENT.md` and decisions D1–D4 from commit `8b915b0` (option chosen: "Start fresh").
- 2026-11-09: First specification draft written from the user's description, with 6 pitfalls and 10 open questions.
- 2026-11-09: The user answered the 10 initial questions; recorded as D1–D9 in the specification. Glossary terms added to `CONTRIBUTE.md` (Host repository, Showroom, Stack adapter, Showcase), with "Stack adapter" renamed at the user's request.
- 2026-11-09: Stop and report: the agent deleted `./.workflow/.temp/questions-initial-spec/` without the user's confirmation ("Working files" rule). The user declined recreating it and said to continue.
- 2026-11-09: D10 recorded (stack adapter lists skipped files, configuration overrides). `./.workflow/.temp/repo-init-report.md` deleted with the user's yes.
- 2026-11-09: D11 recorded ("SCM adapter"), and the term added to the Glossary.
- 2026-11-09: Specification approved as the basis for planning (option chosen: "Approve").
- 2026-11-09: Planning stage entered; segmentation drafted (S1–S3).
- 2026-11-09: Segmentation approved (S1 Host scanning, S2 Showroom, S3 Build command), with S1 given a temporary way to output the collected data (user: "Otherwise agreed"). Must-have 5 (global or local install, `npx`) added to the specification at the user's request. Go-ahead for the pitfall 7 spike.
- 2026-11-09: Pitfall 7 spike run: Vite, React and FluentUI work as `showroom`'s own dependencies for local, `npx` and global installs; install size 432 MB. Conclusions written into S3.
- 2026-11-09: Specification updated to match S1 (D1, D5, D8, D10, must-haves 2–4), at the user's request ("Update the spec").
- 2026-11-09: S1 Host scanning approved (user: "I approve S1, and we can commit it"), to be implemented before S2 and S3 are planned.
- 2026-11-09: S1 Host scanning implemented: `npm run ci` green (104 tests); smoke-tested on copies of `../tsstd` and `../tsschema`.
- 2026-11-09: S1 checkpoint: approved and committed (option chosen: "Approve and commit"), with implementation choices 1–4 confirmed ("All four OK").
- 2026-11-09: S2 planning started (the user chose S2 before S3). Choices A1–A14 settled: no code file index page (D12), `showroom serve` moved into S2 (D4 updated), syntax highlighting added as a must-have (D12), React/FluentUI as ordinary `dependencies`. Specification updated accordingly.
- 2026-11-09: S2 choices A15–A18 settled: install size accepted, generated Vite project and `cacheDir` in the OS temp folder, `serve` watching the whole host through the ignore matcher, `serve` unit-tested without starting a server.
- 2026-11-09: Go-ahead for a zero-context review of the S2 plan segment (2 agents).
- 2026-11-09: S2 zero-context review run (2 agents): 0 blockers; triaged into 7 questions, 22 fixes, 2 later, 1 skip. Stray-write check clean.
- 2026-11-09: S2 review triage answered (options chosen: "Package root + mkdtemp", "Both yes", "rehype-highlight", "All as recommended"); applied as A16 (changed), A2, A13 (changed), A19–A26, two S3 open points, and Glossary entries.
- 2026-11-09: S2 Showroom approved (option chosen: "Approve and commit"); specification pitfalls 4, 5 and 7 updated.
- 2026-11-09: `review-s2-plan/` and `questions-s2-plan/` working files deleted with the user's yes; the user chose to implement S2.1 next, in a fresh session.
- 2026-11-09: S2.1 Showroom implemented: `npm run ci` green (226 tests); not yet checked in a browser (needs S2.2's Vite setup).
- 2026-11-09: S2.1 checkpoint: approved and committed (option chosen: "Approve and commit"); raw HTML tags dropped ("Drop tags", recorded in A6), Glossary term "Shown host information" added ("Add it"), implementation choices 3a–3g confirmed ("All OK").
- 2026-11-09: S2.2 Serve command implemented: `npm run ci` green (280 tests); trial runs on a fixture copy and a copy of `../tsstd` served, reloaded and cleaned up as planned.
- 2026-11-09: S2.2 checkpoint: approved and committed (option chosen: "Approve and commit"); the user's browser check passed ("All work"), implementation choices a–f confirmed ("All OK"). S2 Showroom is done.
- 2026-11-09: Fast path: navigation labels README / CONTRIBUTING / LICENSE for the home page and the root's contribute and license files, listed first (A8 changed; options chosen: "Fast path", "Always README", "Fixed first").
- 2026-11-09: Stop and report: commit `96c6e51` also included the user's uncommitted `showroom.json` (staged with `git add -A`). The user said it's intended, for serving this repository with itself, and to proceed; kept in the commit.
- 2026-11-09: S3 planning started: segment drafted, with choices B1–B10 open.
- 2026-11-09: S3 choices B1–B10 settled (option chosen: "Accept all ★"); pitfalls 3 and 4 ticked off; Glossary term "Output folder" added.
- 2026-11-09: S3 Build command approved (option chosen: "Approve and commit"), without a zero-context review.
- 2026-11-09: `questions-s3-plan/` working files deleted with the user's yes; the user chose to implement S3 in a fresh session.
- 2026-11-09: S3 Build command implemented: `npm run ci` green (330 tests); trial builds of a fixture copy, a copy of `../tsstd`, and a host with React 18 installed (the bundle holds only `showroom`'s React 19.3.1).
- 2026-11-09: S3 browser check passed (tsstd: "looks like I would expect it to"; React 18 host: "looks ok"); implementation choices 1–2 confirmed, `/showroom/` added to `.gitignore` at the user's request (B11–B13).
- 2026-11-09: S3 checkpoint: approved and committed (option chosen: "Approve and commit"). S3 Build command is done.
- 2026-11-09: `trial-s3/` working files found deleted at session start (the uncommitted session state had already dropped the wait for confirmation).
- 2026-11-11: Showcases discussion started (no specification draft yet). The user settled: showcases render in iframes; `showroom`'s own strict showcase format per supported framework, no third-party format (e.g. Storybook's CSF), format to be discussed in detail later; editable showcases not in the first version but on the roadmap, and the format must be designed with them in mind; requiring `angular.json`, an installed host (`npm install`) and similar host requirements is acceptable, to keep complexity down.
- 2026-11-11: Showcases: the showcase frame contract is an internal boundary; "bring your own build" frames will be implemented and tested like the React and Angular builds, but not documented as a feature until the interface is stable (user: "A approve of your recomendation").
- 2026-11-11: Showcases: no metadata in code files and no static extraction from them (metadata from a JSON file, Markdown embeds, or both, still open); React and Angular stack adapters extend the TypeScript one, one showcase framework per host ("I don't think we need to worry about several frameworks per host"), with the frame building a self-contained part the stack adapter supplies.
- 2026-11-11: Stop and report: during `/ig-repo upgrade`'s reconcile step, the agent's conversion script emptied `./.workflow/PLAN.md` (opened for writing before reading). The user said to restore it and proceed ("Restore PLAN.md and proceed"); restored with `git restore`.
- 2026-11-11: `/ig-repo upgrade`: the Advanced workflow added (user chose "Advanced workflow", "Upgrade the bases"), and the workflow files migrated to it ("Accept all the fixes"): plan segments S1, S2, S2.1, S2.2, S3 became _`P1`_, _`P2`_, _`P2.1`_, _`P2.2`_, _`P3`_; the specification became _`S4`_ (HARD RULES) and _`S5`_ (project and first version); must-haves _`D13`_–_`D17`_, budget _`D18`_–_`D20`_; plan decisions C… → _`D21`_–_`D34`_, A… → _`D35`_–_`D60`_, B… → _`D61`_–_`D73`_ (each noting its old label); pitfalls → _`K1`_–_`K8`_ in `SPEC-pitfalls.md`; open points _`O1`_–_`O13`_; known open issues _`L1`_, _`L2`_. History lines above keep the old labels.
- 2026-11-11: _`S6`_ Showcases specification drafted (`SPEC-S6-showcases.md`: _`S6`_–_`S6.4`_, _`D74`_–_`D86`_, _`O14`_–_`O18`_), with pitfalls _`K9`_–_`K13`_; 9 choices open.
- 2026-11-11: _`S6`_ draft choices settled: 1 and 2 "As recomended", 3 "A: serve + build, mechanism open", 4–9 accepted as recommended; Glossary updated (Showcase frame added; Showcase and Stack adapter reworded).
- 2026-11-11: _`S6`_ Showcases approved (option chosen: "Approve and commit"); _`K2`_ and _`K7`_ resolved, _`D13`_, _`D15`_, _`D19`_ refined by _`D82`_, _`D79`_, _`D80`_.
- 2026-11-11: `questions-s6-spec/`, `showcases-discussion/` and `repo-upgrade-report.md` working files found deleted at session start (the uncommitted session state had already dropped the wait for confirmation).
- 2026-11-11: Showcase format discussion started (user chose "Format discussion"); 11 choices listed.
- 2026-11-11: The user chose a free-form discussion instead of answering the format choices one by one, and an order: first the broadest showcase interface, implemented as "bring your own build" frames; then React and Angular variants.
- 2026-11-12: Showcase format discussion settled the broadest interface (embeds in documentation files, showcase markers, showcase adapters; user approved the showcase adapter concept, the link-title marker, a naked marker as html, and its non-HTML use as an error). Drafted as _`S6.5`_, _`S6.6`_ (_`D87`_–_`D100`_, _`O19`_), _`K14`_, revisions _`R1`_–_`R3`_ (_`D79`_ replaced by _`D96`_), and Glossary changes.
- 2026-11-12: Draft choices answered: no source added or removed for now, a playground later (_`D101`_ replaces _`D95`_; user: "For now I would only want to embed the iframe with the showcase and not add or remove source in either (code-block, or link) scenario"); "bring your own build" modules JS only ("JS only"); Glossary changes accepted ("Accept all"); the remaining additions accepted ("Accept all").
- 2026-11-12: Re-approval checkpoint: the user chose "Keep iterating". `questions-s6-format/` and `showcases-format-discussion/` working files deleted with the user's yes ("Delete the two").
- 2026-11-12: `check` as a drift guard agreed ("Agreed on everything"): static checks always, building showcases with a flag (_`D102`_), type checking on by default in `ts`-based showcase adapters (_`D103`_), warnings for broken documentation links (_`D104`_, new _`S7`_); a headless third tier is an idea for later.
- 2026-11-12: _`S6`_, _`S6.1`_, _`S6.2`_ re-approved, and _`S6.5`_, _`S6.6`_, _`S7`_ approved, with _`K14`_ and the Glossary changes (option chosen: "Approve and commit").
- 2026-11-12: _`P4`_ Showcases planning started (go-ahead: "Lets proceed"); segmentation proposed (_`P4.1`_–_`P4.3`_), the user chose "Discuss". Testing strategy settled first ("Now, design parts"): _`D105`_ ("In memory + scratch"), _`D106`_ (scratch folder for all tests, "node_modules/.cache"), _`D107`_ ("Copy, shared deps"), _`D108`_ (broad E2E, serve included), _`D109`_ ("Four projects"); _`K12`_ taken by _`P4`_, _`O20`_, _`O21`_ added.
- 2026-11-12: _`P4`_ segmentation choices answered as recommended ("Inside P4.1", "Whole in P4.1", "build, then serve", "P4.1"): _`D110`_–_`D113`_, _`O21`_ resolved.
- 2026-11-12: _`P4`_'s segmentation (_`P4.1`_–_`P4.3`_), testing strategy and _`D105`_–_`D113`_ approved (option chosen: "Approve and commit").
- 2026-11-12: Fast path: renamed the tool from `tsshowcase` to `showroom` (option chosen: "Yes, fast path"): the Glossary term "Showcase application" became "Showroom" (the user: "The tool is `showroom` and it builds a \"`showroom`\" (application) featuring documentation about the host repository enriched by individual \"`showcase`s\""), the Markdown marker keyword became `showcase` (the user: "I would still go with `showcase=react`"), the default output folder `./showroom` ("./showroom (Rec.)"). One-off exception to the append-only rule for the workflow files, granted for this rename (the user: "Yes, I will list it for the rename"); the user's quoted words were kept as they were. A rename note was added to `AGENTS.md` at the user's request.
- 2026-11-12: Rename checkpoint: the user reviewed it after "Stop here" ("Reviewed and looking good - proceed"); approved and committed (option chosen: "Approve and commit").
- 2026-11-12: The user renamed the GitHub repository (`ofzza/showroom`), `git remote`, the project folder (`~/projects/ofzza/showroom`) and the agent's memory folder.
- 2026-11-12: _`P4.1`_ planning started (option chosen: "Start planning P4.1"); draft written with _`D114`_–_`D132`_ and 20 choices.
- 2026-11-12: _`P4.1`_ dependencies answered: QD1 "unified + remark-parse (Rec.)" (_`D114`_); QD2, after discussing JSON vs JSON5, "Ok, JSON5 it is" (_`D115`_, _`D88`_ unchanged).
- 2026-11-12: _`P4.1`_ choices Q1–Q18 answered: all as recommended, except Q12 (`checkHost?` renamed `check?`), Q14 (`showcaseAdapters` renamed `customShowcaseAdapters`), Q15 ("Export, as experimental (Rec.)": _`D133`_ added to _`S6.6`_, changing _`D78`_ and _`D99`_; revisions _`R4`_, _`R5`_) and Q18 ("Custom showcase adapter (Rec.)" as the Glossary term).
- 2026-11-12: New global rule added to `~/.claude/CLAUDE.md` at the user's request: show a file's list of choices in the conversation before asking about them.
- 2026-11-12: _`P4.1`_ approved, and _`S6.1`_ and _`S6.6`_ re-approved with _`D133`_ and the Glossary changes, without a zero-context review (option chosen: "Approve and commit").
- 2026-11-12: `questions-p4.1-plan/` working files deleted with the user's yes ("Delete it"); the user chose to implement _`P4.1`_ next, in a fresh session.
- 2026-11-12: _`P4.1`_ implementation started (user: "Please proceed").
- 2026-11-12: _`P4.1`_ implemented (steps 1–5): `npm run ci` green (408 unit tests, 5 end-to-end tests); _`O22`_ added to _`P4`_ for _`P4.3`_.
- 2026-11-12: _`P4.1`_ checkpoint: approved and committed (option chosen: "Approve and commit"); implementation choices 2a–2e kept ("All OK (Rec.)"); Glossary "Host information" extended with showcases and virtual files ("Add them (Rec.)"); `trial-p4.1/` working files deleted ("Delete it (Rec.)").
