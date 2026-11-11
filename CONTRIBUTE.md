# Contributing

## Reporting Issues

When reporting issues, please keep to the provided issue templates, if any.

Before reporting issues, please read: [GitHub Work-Flow](https://github.com/ofzza/onboarding/blob/master/CONTRIBUTING/github.md)

## Contributing Code

For work-flow and general etiquette when contributing, please see:

- [Git Source-Control Work-Flow](https://github.com/ofzza/onboarding/blob/master/CONTRIBUTING/git.md)
- [GitHub Work-Flow](https://github.com/ofzza/onboarding/blob/master/CONTRIBUTING/github.md)

This repository uses two long-lived branches:

- `develop` - the work-in-progress trunk.
- `master` - always contains the latest stable released version. It is never committed to directly, and only ever gets merged into from `develop`, when a stable version is released.

Small changes are committed directly to the branch you are working on, usually `develop`. Larger work, or any work you want reviewed, goes in its own feature branch, created from `develop` and named after the work (see [Git Source-Control Work-Flow](https://github.com/ofzza/onboarding/blob/master/CONTRIBUTING/git.md) for branch naming conventions). Once it is pushed, request a merge into `develop` with a pull request. Ideally, accompany such work with its own issue.

Before committing or requesting a merge, make sure `npm run ci` passes locally (build, ESLint, Prettier and tests), and that `README.md`, `CONTRIBUTE.md` and `AGENTS.md` reflect the change.

## Architecture and glossary

### Project structure

```
src/
  index.ts              Entry point and public API
  index.test.ts         Tests, colocated with the code they test
  host/                 Host information types
  configuration/        Reading and validating tsshowcase.json
  adapters/stack/       The StackAdapter interface and the built-in stack adapters
    typescript/         The TypeScript stack adapter
  cli/                  The tsshowcase command line (bin.ts is its executable entry point)
    check/              check(): collecting the host information from a host repository
      internal/         The output folder, the ignore matcher and issue formatting, shared with serve and build
    serve/              tsshowcase serve: Vite's dev server, reloading on changes
    build/              tsshowcase build: Vite's build, into the output folder
  vite/                 The showcase application's Vite configuration
  app/                  The showcase application: React/FluentUI browser code, compiled to dist/app/ and bundled by Vite
    host/               The shown host information, and finding documentation files in it
    routing/            The hash router
    links/              Resolving links in Markdown
    navigation/         The navigation items
    theme/              The light/dark theme
    markdown/           Rendering Markdown
    pages/              The home, documentation and not-found pages
    layout/             The header and the navigation
test/fixtures/          Fixture host repositories the tests run against
```

Every module lives in `src/`, as an `index.ts` + `index.test.ts` pair, and is re-exported from `src/index.ts`, except the showcase application's modules in `src/app/`, which are browser code.

`tsshowcase check` (and `check()`) reads the host repository's `tsshowcase.json`, picks the stack adapter it names, has it read the project information, then walks the host repository once, skipping ignored files and the output folder, to collect the documentation files and the code file index. Each list of patterns (`ignore`, `code`, `documentation`) works like a `.gitignore` file, matched by the `ignore` package: the built-in patterns (for documentation), then the stack adapter's, then the configuration's.

The showcase application (`src/app/`) presents the shown host information: the host information without the code file index. `tsc` compiles it to `dist/app/`, next to its static `index.html`, and Vite bundles it from there, with the data served as the `virtual:tsshowcase-host` module, which `main.ts` passes to `mount()`. It routes through the URL's hash (`#/` for the home page, `#/<path>` for any other documentation file, then `#<heading id>`), so it works on static hosting under any path. Markdown is rendered by `react-markdown` with `remark-gfm`, `rehype-slug` (GitHub-compatible heading ids) and `rehype-highlight`; relative links to documentation files become routes, and other relative links plain text. Styles are Griffel's `makeStyles` with FluentUI tokens, so everything, highlighted code included, follows the light or dark theme.

`tsshowcase serve` runs the check, then starts Vite's dev server with the configuration in `src/vite/`: Vite's root is the package's `dist/app/`, its cache a fresh temporary folder, the shown host information is served by a plugin as the virtual module, and React is aliased to tsshowcase's own copy. The server's watcher also watches the host repository, skipping what the `ignore` patterns skip; after a change, the host watcher reruns the check (debounced), and when the shown host information changed it invalidates the virtual module and fully reloads the page. `main()` imports `serve` and `build` dynamically, so only they ever load Vite.

`tsshowcase build` runs the check, then Vite's `build()` with the same configuration, into the output folder, which must be inside the host repository and isn't its root. Vite empties the output folder first, so `build` only lets it when the folder is missing, empty, or holds the `.tsshowcase` marker file every build writes; anything else is refused, so a mistyped `outDir` never deletes the host repository's files. The bundler's warnings about the showcase application's own dependencies (FluentUI's `'use client'` directives, and its single large chunk) are left out, as the host repository can't act on them.

### Glossary

Terms used across code, comments and documentation. Use them as defined here. A new concept is added to this list in the change that introduces it (an agent proposes it first, see [WORKFLOW.md](./WORKFLOW.md) › "Glossary").

| Term                   | Meaning                                                                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host repository        | The repository that uses tsshowcase, and that the showcase application presents.                                                                                                                                              |
| Host information       | The data tsshowcase collects from a host repository (project information, documentation files, code file index), which the showcase application presents.                                                                     |
| Shown host information | The part of the host information the showcase application presents: the project information and the documentation files, without the code file index.                                                                         |
| Showcase application   | The static React/FluentUI SPA that tsshowcase builds (or serves, for previewing) for a host repository.                                                                                                                       |
| Project information    | The host repository's name, version, description, license, author, homepage and repository URL, read by its stack adapter.                                                                                                    |
| Documentation file     | A file in the host repository found by documentation discovery and the `documentation` patterns, and shown in the showcase application.                                                                                       |
| Code file index        | The sorted paths of the code files under the source root.                                                                                                                                                                     |
| Source root            | The folder under which the code file index is collected.                                                                                                                                                                      |
| Output folder          | The folder `tsshowcase build` builds the showcase application into (`outDir`, `./showcase` by default), emptied on every build.                                                                                               |
| Stack adapter          | An implementation of the common interface for one kind of host repository (language or framework). It supplies the project information and which files count as code, and, for React and Angular, builds the showcase frames. |
| SCM adapter            | An adapter for the service where the host repository's code is kept (GitHub, GitLab, Bitbucket, …), used to link to, read or show the host repository's files from there. SCM stands for source code management.              |
| Showcase               | A component demonstrating the usage of a unit of the host repository (a service, hook, directive, component, …), built by tsshowcase and embedded in the showcase application through a showcase frame.                       |
| Showcase frame         | The page that renders one showcase, in isolation, embedded in the showcase application with an iframe.                                                                                                                        |

<!-- <@ofzza/repo-skill:contribute> Managed by the repo skill: this tag marks where its Workflow section starts. -->

## Workflow

Work in this repository is done together with an AI agent (e.g. Claude Code), following the rules in [WORKFLOW.md](./WORKFLOW.md). This section explains them for you, the person working with the agent. Where the text above and this section differ, this section applies; where this section and `WORKFLOW.md` differ, `WORKFLOW.md` applies. Words in **bold** are defined in [Terminology](#terminology) below.

### How it works

- **Stages**: the work moves through three **stages**:
  1. **Specification**: you and the agent agree on what to build, in `./.workflow/SPEC.md`. If there's none yet, the agent starts here, asking for the idea, what the project must do or have (and which items are must-haves), and how much time and complexity you're willing to spend;
  2. **Planning**: you agree on how to build it, in `./.workflow/PLAN.md`, split into **segments**;
  3. **Implementation**: the agent implements approved segments one at a time, stopping for your review after each.

  You can run ahead (draft a plan while the specification is still open) or go back (the agent proposes fixing the specification when implementation shows it's wrong). Nothing is implemented until you've approved its plan, or confirmed the **fast path** for it.

- **Workflow files**, under `./.workflow/`: `SPEC.md`, `PLAN.md`, `STATE.md` (the **session state**: where the work stopped, what's waiting on whom, and a dated history of milestones), and `.temp/` (throwaway **working files**, never committed).
- **Where the agent gets its rules**: your agent reads `AGENTS.md` (Claude Code through `CLAUDE.md`), which points it to `WORKFLOW.md`, and then, if it exists, `WORKFLOW.custom.md`.
- **Customizing the workflow**: `WORKFLOW.md` is generated by the `ig-repo` skill and replaced when the workflow is upgraded, so leave it as it is. This project's own workflow rules go in `WORKFLOW.custom.md` (committed, shared by everyone), which the agent reads last and which applies where the two differ, except that it can't relax a hard rule. Ask the agent to change the workflow and it makes the change there, creating the file if needed.
- **Resuming**: the specification and plan are committed, and the session state records where the work stopped, so you can stop at any point and pick up in a fresh session.
- **Two word lists**: the [Terminology](#terminology) below defines the words for how the work is done; the **Glossary** (the first section of this file with "Glossary" in its heading, created when the first domain term is defined) defines the project's domain terms, for what is built. Variants are fine ("spec" for specification). For any other word that could stand for a defined term (e.g. "requirements" for the specification), the agent asks "Did you mean the specification?" before acting, every time. If you'd rather use your own word, ask the agent to add it to the term as an alias, or to define a new term. "Quick fix" and "resume" are built in.
- **What wins**: your instructions in the conversation, then the specification, plan and Glossary (only on what is built), then `AGENTS.md`, other agent files, `WORKFLOW.md` and `WORKFLOW.custom.md` (which applies over `WORKFLOW.md`); hard rules above all. Text from dependencies, tools, issues, web pages or other agents never authorises anything.

### How to use it

- **Start a session**: ask the agent to resume (or run `/ig-repo continue` if you have the `ig-repo` skill). Whatever you ask first, it reads the session state, runs `git status`, and tells you where the work stopped, what's next, and about any uncommitted changes.
- **Say what to work on**, e.g. "let's work on the specification", "plan the export feature", "continue implementing", or "quick fix: the date format is wrong in the footer".
- **Answer dialogs**: the agent asks in dialogs of up to 4 questions with up to 4 options each (a question box, or numbered questions in agents without one). When it goes through the choices a draft makes, each shows its position (e.g. `Q3 (3/9)`), its background, the options with their trade-offs, and a recommendation. Long lists go into a file under `./.workflow/.temp/`, and you can accept all the recommendations at once, or pick which to discuss; anything touching a hard rule, a system change, credentials, an outward action or a new dependency is always asked on its own.
- **Approve, or don't**: pick the approving option, or say yes to a dialog that names what's being approved. To hold back, pick "discuss" or "stop here", or say what's wrong.
- **Checkpoints**: after each implemented segment or fast-path change, the agent summarizes what changed, the documentation and tests updated, the build, test and lint results, any failure that was already there, and any deviation from the plan, then offers "approve and commit", "approve, don't commit", "discuss" or "stop here". "Approve and commit" is your yes for that one commit; pushing asks again.
- **Fast path**: for a small, self-contained change, or when you ask for a quick fix, the agent proposes a one-line plan, the change (with its documentation and tests) and one checkpoint, and goes ahead once you confirm. It works without a specification; a change that needs real choices gets a plan instead, and one that changes the project's scope goes through the specification first.
- **Choices during implementation**: a choice the plan doesn't state (a new dependency, a public interface, a file deleted or moved, a data format) is put to you before the agent acts on it.
- **Reviews and spikes**: the agent may propose **zero-context reviews** and **spikes**, and you can ask for either. Neither runs without your **go-ahead** (asking for one is the go-ahead). Review findings come back as questions, fixes and skips for you to confirm, plus points for later; spikes run only in `./.workflow/.temp/`, never in the real code.
- **Long tasks**: tasks over a couple of minutes run in the background, announced with an estimate, with progress at least every 5 minutes; every subagent's start and finish is reported.
- **Quick checks by you**: when you can check something faster yourself (look at a screen, try a button), the agent asks you to, with exact paths and what to look for.

### What you need to do

- **Give approvals explicitly**: only a clear yes, in answer to a dialog naming what's being approved, counts. Silence, a comment on wording or an answer about something else approves nothing.
- **Answer "Did you mean …?" questions**: the agent won't act on a request with an undefined word until you do.
- **Resume after a stop**: when the agent stops and reports a problem, it waits until you tell it to continue.
- **Grant hard-rule exceptions yourself**: the agent never offers one; only you can, by naming the rule, and each exception covers one action.
- **Keep credentials out of files**: never ask the agent to write one into a file; if you paste one into the conversation, rotate it once the task is done.
- **Commit the workflow files** when the agent proposes it after an approval, so that others, and your future sessions, see the same state.
- **Your own agent instructions still apply** alongside this workflow; where they conflict, the agent asks you.

### What the agent always does

- **Asks before any commit or outward action**: every commit, amend, rebase, tag, push, pull-request action, publish, deploy or post to an external service needs your yes for that one action.
- **Stops and reports**: if it, or a subagent, breaks a rule or changes something you didn't ask for, it stops, reports what ran, what changed and how to undo it, records the stop in the session state, and doesn't clean up on its own.
- **Follows the hard rules**: yours, kept as HARD RULES in `./.workflow/SPEC.md`, and the workflow's own (stop and report, system changes, credentials, no AI attribution, working files, subagents, plus those of any additional workflow below). Nothing relaxes them.
- **Asks before system changes**: no `sudo`, system packages, global tools or toolchains, containers, or global git or tool configuration, and nothing outside the repository and its session scratch directory, without your yes for that one action.
- **Protects credentials**: it never writes them into files, never reads ones it wasn't given, and never commits a file that contains one. Tools like git may use their own stored credentials for actions you've approved, but the agent never looks at them.
- **Credits no AI**: commits, pull requests and documentation never credit the agent.
- **Keeps documentation and tests current**: whenever it adds or changes code, it updates the affected documentation (READMEs, this file and its Glossary, the project facts in `AGENTS.md`, code comments) and adds or updates tests. It never deletes, skips or weakens a test to make the suite pass without your yes. If there's no way to test a change, it asks you once whether to set one up.
- **Keeps every commit green**: before each commit it builds the project and runs the full test suite, the linters and the formatters. It fixes failures its change causes; a failure that was already there is reported and recorded as an open point. Committing with a failure of its own needs your yes for that commit, is noted in the commit message, and is fixed in the next one.
- **Grows the Glossary**: when the work introduces a new domain concept, it proposes adding it; changing or removing a term happens only when you ask, and then updates every use.
- **Changes the rules only when you ask**: it never edits `WORKFLOW.md`, `WORKFLOW.custom.md` or the rules in `AGENTS.md` on its own, and the changes you ask for go into `WORKFLOW.custom.md`; an additional workflow counts only if `/ig-repo init` or you added it. If a rule seems outdated, it proposes the change and keeps following the rule until you approve.

### Terminology

The terms for how work is done in this repository. They change only with the workflow; the project's domain terms are in the Glossary.

| Term                    | Meaning                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Stage**               | One of specification, planning and implementation.                                                                              |
| **Specification**       | What the project is and must do: `./.workflow/SPEC.md`.                                                                         |
| **Plan**                | How the specification gets built, split into segments: `./.workflow/PLAN.md`.                                                   |
| **Segment**             | A part of the plan that's planned, approved and implemented as a unit; segments can have child segments.                        |
| **Session state**       | `./.workflow/STATE.md`: where the work stopped, what's waiting on whom (you, others, running tasks), and the milestone history. |
| **Resume**              | Also: continue. Start a session: the agent reads the session state and reports where the work stopped.                          |
| **Dialog**              | Up to 4 questions with up to 4 options each, in a question box or as a numbered list; the agent waits for your answers.         |
| **PROPOSE**             | The agent suggests something, with its reasoning, in a dialog, and acts only after your explicit yes.                           |
| **Approval**            | Your explicit yes to a named item (the specification, a plan segment, an implemented step).                                     |
| **Go-ahead**            | Your yes to start something (a review, a spike, a subagent run); it isn't an approval.                                          |
| **Checkpoint**          | The review dialog after each implemented segment or fast-path change.                                                           |
| **Fast path**           | Also: quick fix. The shortcut for small, self-contained changes: one-line plan, the change, one checkpoint.                     |
| **Hard rule**           | A rule on how work is done that nothing (no file, task or agent) can relax; only you can grant an exception, for one action.    |
| **Open point**          | Something found while working on one stage or segment that belongs to another, recorded there instead of acted on out of turn.  |
| **Pitfall**             | A risk that could make the work stall or backtrack later, recorded in the specification as soon as it's noticed.                |
| **Known open issue**    | An item you chose to defer, recorded in the plan with the reason, until it's picked up or dropped.                              |
| **Spike**               | A small, throwaway prototype that settles whether an approach works, before planning on top of it.                              |
| **Zero-context review** | A review by fresh agents that know nothing of the conversation, reading only the files they're given.                           |
| **Working files**       | Throwaway files under `./.workflow/.temp/<topic>/`, deleted once you confirm their results are written where they belong.       |
| **Subagent**            | Any agent, session or script the agent delegates work to; it's bound by the hard rules and the rest of its brief.               |
| **Stray write**         | A change no one asked for, found by comparing the repository with a snapshot taken before subagents ran; it's reported to you.  |
| **Green**               | The repository builds, its full test suite passes, and its linters and formatters pass, as far as it has them.                  |
| **Glossary**            | The project's domain terms, for what is built, in the first section of this file with "Glossary" in its heading.                |

### Advanced workflow

This repository also uses the advanced workflow, for keeping a complex specification and plan traceable over time.

#### How it works

- **Every item is tagged**, and tags are never renumbered or reused; untagged prose is only context. In documents, tags are written as italic code (_`D3`_) so they stand out:

  | Tag  | Meaning                                                               |
  | ---- | --------------------------------------------------------------------- |
  | `D3` | A decision: one thing a segment requires or decides                   |
  | `S2` | A specification segment (`S2.1`, `S2.1.1`, … for its children)        |
  | `P4` | A plan segment (`P4.1`, … for its children)                           |
  | `O1` | An open point                                                         |
  | `L1` | A known open issue                                                    |
  | `R1` | A revision of an approved segment                                     |
  | `H1` | A hard rule (the HARD RULES are a specification segment of their own) |
  | `K1` | A pitfall                                                             |

- **Approval lines**: the specification, the plan and every segment open with their status: `draft`, `approved <date>`, `revised <date> (R<n>), pending re-approval`, `implemented <date>` or `merged into P<n>`. Approving a parent segment doesn't approve its draft children.
- **Append-only decision logs**: in normal work, decisions are never rewritten or deleted. A change adds a new decision, and the old one's status points to it: `refined by`, `changed by`, `replaced by` or `superseded by`. Only statuses, approval lines, ticks and noted wording fixes change in place. Reading the statuses tells you what's currently in force.
- **Extracted files**: parts of the specification or plan can move into their own files when that helps, e.g. `./.workflow/PLAN-P2-uploads.md`, linked from `SPEC.md` or `PLAN.md`. Pitfalls live in `./.workflow/SPEC-pitfalls.md`.
- **Drift and re-approval**: wording fixes to an approved segment need no re-approval, but any change in scope does. When work on a child segment changes its parent, the parent is marked `revised` and re-approved together with the child.
- **Compaction**: once a log grows long, the agent may propose compacting it down to the decisions in force, on your go-ahead, as a commit of its own; the full history stays in git, and **stubs** keep dropped tags that are still referenced.

#### Terminology (advanced)

| Term                | Meaning                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Tag**             | An item's permanent identifier (e.g. `D3`, `S2.1`), never renumbered or reused.                                   |
| **Decision**        | A tagged bullet (`D<n>`) recording one thing a segment requires or decides.                                       |
| **Decision log**    | An append-only document of decisions: the specification, the plan and their extracted files.                      |
| **Decision status** | Whether a decision is in force: `live`, `refined by`, `changed by`, `replaced by` or `superseded by`.             |
| **Approval line**   | The status line a document or segment opens with: `draft`, `approved`, `revised`, `implemented` or `merged into`. |
| **Revision**        | A tagged note (`R<n>`) on an approved segment that a later decision changed.                                      |
| **Drift**           | A decision in a child segment that changes its parent segment or the specification.                               |
| **Compaction**      | Rewriting a decision log down to the decisions in force.                                                          |
| **Stub**            | The one line left in place of a tag dropped by compaction while it's still referenced.                            |
| **Extracted file**  | A part of the specification or plan moved into its own `SPEC-…` or `PLAN-…` file.                                 |
| **Evidence**        | The note under a decision recording a spike's conclusions.                                                        |
| **Next free**       | The session state's line with the next free number of each tag type.                                              |

#### What to watch out for

- Don't edit decisions or tags by hand; ask the agent for the change, so that it's recorded as a new decision with its relations.
- Refer to items by their tag when asking for changes (e.g. "replace D12", "resolve O3"); tags are how the agent finds and links them.

<!-- </@ofzza/repo-skill:contribute> -->
