# Plan: Bootstrap the showcase CLI project (Stage 0)

## Context
The user wants to extract the showcase/enforcement idea from
`~/projects/ofzza/blox-fluentui-react/stdblox-react` into a standalone CLI tool. It would have:
- pluggable rendering modules (React first), each with a verification method and a build/render implementation;
- pluggable CSS themes (light and dark first);
- two actions: `check`, which enforces the per-unit README, tests and showcase, and `build`, which produces a static showcase app.

The process is staged: requirements Q&A → super-plan (approved) → chunk plans (each approved) → implementation chunk by chunk.
- Each stage's result is stored in `.plans/` and committed.
- State is tracked in AGENTS.md.

This plan covers only the first concrete step: bootstrapping the repo with REQUIREMENT.md, AGENTS.md and CLAUDE.md, then making the initial commit.

## Findings from stdblox-react (prior art)
- A unit is a directory containing `index.ts`, located under `src/{components,hooks,utilities}/`.
  - Each unit has `README.md`, `*.test.ts(x)` and `*.showcase.tsx` (default-exported, prop-less).
- Enforcement is a Vitest test (`src/index.test.ts`) that uses fs walking plus `import.meta.glob`.
  - The rules are hardcoded, including a brittle string match on `export * from` lines.
- The showcase is a Vite app in `showcase/`.
  - It discovers content with `import.meta.glob` (READMEs eager, showcases lazy).
  - It renders markdown with react-markdown, remark-gfm and rehype-slug, using a home-made hash router.
  - It uses `base: './'` so it works on GitHub Pages, and has an error boundary per showcase.
  - The menu tree mirrors the directory structure, and README links are rewritten (unit README → route, repo file → GitHub blob URL).
- Styling is about 150 lines of CSS with six variables. Test results are not surfaced anywhere.
- Coupling to remove:
  - hardcoded relative globs and paths;
  - showcase devDeps living in the library;
  - GitHub-only links with `master` hardcoded.
- `~/projects/ofzza/tsshowcase` is an empty git repo, likely the target. `~/projects/ofzza/ngx-showcase` is older Angular prior art.

## Stage 0 steps (after approval)
1. In the target repo (to be confirmed), write `REQUIREMENT.md` containing the user's first message verbatim.
2. Write `AGENTS.md`. Sections:
   - Assignment summary
   - Process and stage tracker (current stage: Requirements Q&A)
   - Understanding and notes
   - Prior-art findings (above)
   - Decisions log, filled in from Q&A answers
   - Open questions
   - Pitfalls to address early
3. Write `CLAUDE.md` containing `@AGENTS.md`.
4. Create the `.plans/` dir, with this bootstrap plan saved as `.plans/00-bootstrap.md`.
5. Make the initial commit, with no AI attribution trailers (per the user's global CLAUDE.md).

## Decisions so far
(filled in as Q&A proceeds)

## Verification
- Run `git log` and confirm there is one commit.
- Run `git show --stat` and confirm it includes REQUIREMENT.md, AGENTS.md, CLAUDE.md and `.plans/00-bootstrap.md`.
- Diff REQUIREMENT.md against the original message.
