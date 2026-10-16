# tsshowcase — agent notes

This file is the **single source of truth for project state**. Keep it current. Every Q&A answer, decision, approval and backtrack is recorded here. That way work can stop and resume at any point.

The original assignment is in [REQUIREMENT.md](./REQUIREMENT.md) (verbatim; never edit it).

---

## 1. Assignment (summary)

Extract the showcase/enforcement idea from `~/projects/ofzza/blox-fluentui-react/stdblox-react` into a standalone CLI utility.

**CLI actions**

- **check**: scans a repository and enforces that every publicly exported component, service or utility:
  - lives in its own directory;
  - has a `README.md`;
  - has a test suite;
  - has a showcase page (later possibly an interactive playground).

  It outputs a report of the repository structure (all directories not ignored by `.gitignore`) with the issues found for each directory.
- **build**: builds a static, deploy-anywhere (e.g. GitHub Pages) showcase app from those resources. Output goes to a path argument, defaulting to `./showcase`. It uses the selected rendering module and theme.

**Modularity**

1. **Rendering modules** implement a clearly defined interface.
   - A module's default export is a class implementing the interface. The CLI imports it at runtime.
   - The CLI provides these inputs:
     - package info (`package.json` first; other repo types later);
     - the licence file contents;
     - the root `README.md`;
     - a component hierarchy, with for each unit: its README contents, its tests and their status, and the path to its showcase page;
     - room to extend later.
   - Modules also expose a **verification** method. It receives every non-ignored subdirectory together with its file list and file contents. It decides whether to ignore the directory and, if not, whether the directory meets the module's requirements.
   - The CLI repo ships built-in modules (a React module for TS/React first). The user can pick a built-in module or point to a custom one by path.
   - The interface must be designed **collaboratively and in detail before any code is written**.
2. **Theming**
   - A documented, hierarchical system of CSS variables, where derived variables extend from base ones. For example, override only primary/secondary colours, or the whole palette, or only the base spacing, or the whole spacing scale.
   - Documented CSS class names that modules must use (links, titles, paragraphs, code blocks, …).
   - **Rule:** no styling may ever be implemented unless it uses an exposed variable or class, or is derived directly from an exposed variable.
   - Built-in themes ship in the repo (default light and default dark first). The user can pick a built-in theme or point to a custom one by path.

## 2. Process & current state

Stages (each one is interactive and needs explicit user approval; backtracking is allowed at any time):

| # | Stage | Status |
|---|-------|--------|
| 0 | Bootstrap: REQUIREMENT.md, AGENTS.md, CLAUDE.md, initial commit | ✅ done |
| 1 | Requirements Q&A: until the requirements are clear | 🔄 **in progress** |
| 2 | Super-plan: partition the work into chunks, order them, mark which can be planned in parallel and which sequentially; iterate until approved | ⏳ |
| 3 | Chunk plans: one at a time, in super-plan order; iterate and approve each | ⏳ |
| 4 | Implementation: one chunk at a time; explain each and wait for review before the next | ⏳ |

Rules:
- After every completed stage step (a plan is approved, or a chunk is implemented), save the plan to `.plans/` and **commit all changes**.
- Plan file naming: `.plans/00-bootstrap.md`, `.plans/01-super-plan.md`, `.plans/chunk-NN-<slug>.md`.
- Commit messages carry **no AI attribution** (no Co-Authored-By, no session links). This is the user's global rule.
- Never write credentials anywhere.

## 3. Decisions log

| ID | Decision | Notes |
|----|----------|-------|
| D1 | The repo is `~/projects/ofzza/tsshowcase` | It already existed as an empty git repo; the branch is `master` |
| D2 | `verify` **returns a list of issues** instead of throwing | Return shape is roughly `{ ignored } \| { issues: [{ severity: error\|warning, message, file? }] }`. The report can then show every issue per directory |
| D3 | **The rendering module is responsible for running tests** and returns a test hierarchy plus outcomes, in a shape the interface defines | The CLI repo provides **prepackaged test runners** (Vitest-compatible first) that modules can reuse |
| D4 | Bundler ownership: user leans towards **"CLI owns Vite"**, but this is **not final** | Under sidebar discussion; see open question Q-BUILD |

## 4. Open questions

- **Q-BUILD**: who owns the bundler for `build`? The user leans towards "CLI owns Vite" and asked why that would tie future frameworks to Vite. The distinction under discussion: the *showcased repo* is never tied to a bundler. The question is only whether *rendering modules inside the CLI* (e.g. a future Angular module) must express their build as a Vite configuration.
- Not yet asked: how "publicly exported" is detected; config file vs CLI args; how custom modules and themes are loaded (JS only, or TS too); how themes are packaged and whether light/dark switches at runtime; dev/watch mode; licence filename variants; monorepo support; interface versioning; code style conventions; whether stdblox-react becomes the first consumer/fixture; package name and publishing.

## 5. Prior art — stdblox-react findings

- **Units:** a directory with `index.ts` under `src/{components,hooks,utilities}/` (nesting allowed). Each unit has `README.md`, `*.test.ts(x)` and `*.showcase.tsx`. The showcase file default-exports a prop-less component.
- **Enforcement** is a Vitest test (`src/index.test.ts`) that uses `fs` walking plus `import.meta.glob`. Its rules are hardcoded: the unit roots, component file naming, and a brittle exact-string `export * from` match in `src/index.ts`. A second test renders every showcase as a smoke test.
- **Showcase app** (`showcase/`) is a Vite app:
  - It discovers content with `import.meta.glob` (READMEs eager as `?raw`, showcases lazy).
  - Markdown is rendered with `react-markdown`, `remark-gfm` and `rehype-slug`.
  - Routing is a home-made hash router.
  - `base: './'` keeps it working under any GitHub Pages subpath.
  - Each showcase has its own error boundary plus `Suspense`.
  - The menu tree mirrors the directory structure.
  - README links are rewritten: a unit README becomes a route, any other repo file becomes a GitHub blob URL.
- **Styling:** about 150 lines of CSS with six variables and a `prefers-color-scheme` dark variant. Test results are not surfaced anywhere.
- **Coupling to remove** when generalising:
  - hardcoded relative globs and paths (`../../src`, `../../package.json`);
  - showcase deps (react-markdown, …) living in the library's devDependencies;
  - GitHub-only link rewriting with the `master` branch hardcoded;
  - discovery driven by READMEs (a unit with no README silently disappears).
- **Conventions in stdblox-react's AGENTS.md** (possibly to adopt):
  - Prettier with `printWidth: 160`;
  - British spelling;
  - a file header comment;
  - JSDoc everywhere;
  - a `_` prefix for internal names;
  - `// #region` blocks;
  - a purpose comment at the top of every `describe`.
- **Other prior art:** `~/projects/ofzza/ngx-showcase` is an older Angular showcase library (not explored yet).

## 6. Pitfalls to address early (my notes)

- **Dependency resolution at build time.** Showcase pages import the user's source, so the user's `react`, `react-dom` and their versions must be used, not a copy bundled with the CLI. Two copies of React means broken hooks. The build must resolve framework packages from the showcased repo.
- **TS / path aliases in the showcased repo.** The bundler must respect the user's `tsconfig` paths, JSX settings, etc. Otherwise showcases that work in the repo fail in the showcase build.
- **Verification is per-directory only, but some rules are cross-cutting.** Example: "is this unit re-exported from the package entry?" needs repo-wide context. `verify` likely needs a context object (package info, entry files, the whole tree) and/or a whole-repo verification hook.
- **"Publicly exported" detection.** It needs a defined strategy: directory convention vs. static analysis of entry exports (TS compiler API). This affects both `check` and the hierarchy given to `build`.
- **Passing all file contents** for every directory can be expensive. Consider lazy content accessors.
- **Interface extensibility and versioning.** The interface needs an `apiVersion`, optional capabilities, and input objects that can gain fields without breaking modules.
- **Loading custom modules and themes.** Custom modules are loaded with dynamic `import()` from a path. TS-authored modules need a loader (e.g. jiti/tsx) or must be prebuilt to JS.
- **Theme rule enforcement.** "No styling outside variables/classes" ideally needs tooling to enforce it (e.g. a stylelint rule banning literal values in module CSS), not just discipline.
- **Running tests during `build`.** It is slow and can fail. Decide whether a failing test blocks the build or is just displayed, and whether cached results can be reused.
