# _`P15.1`_ Named virtual files

implemented 2026-11-15 (option chosen: "Approve and commit (Rec.)"), after the user's and the agent's browser checks; approved 2026-11-15 (option chosen: "Approve and commit (Rec.)"), without a zero-context review

## Goals

_`S12`_'s named virtual files (SPEC-S12-showcase-views.md): _`D517`_, _`D518`_, _`D521`_, _`D522`_, _`D532`_, _`D533`_, and _`D538`_'s part on _`D361`_ and _`D363`_; resolves _`O86`_. A child of _`P15`_ (PLAN-P15-showcase-views.md), the first of six (_`D541`_).

Facts found while planning (2026-11-15):

- Only the `html` showcase adapter reads `VirtualFile.kind` (`src/adapters/showcase/html/index.ts`); the showroom places a showcase by its entry point's offset (_`D173`_'s placement, `src/app/showcases/`), so a named showcase is placed as any code block showcase is, with no change there.
- "resource" in `src/adapters/showcase/angular/compile/` is Angular's own term (a component's template and styles, `resourceNameToFileName`), a third-party identifier: it stays.
- The `ts` example's `list.ts` is a virtual file with no adapter today; once it is a named showcase it counts among the showcases (_`D533`_), so the generated names of the showcases after it in `examples/ts/README.md` shift by one.

## Decisions

- _`D549`_ (`live`; resolves _`O86`_ (SPEC-S12-showcase-views.md); replaces _`D170`_ (PLAN-P4.4-html-resources.md); option chosen: "named + showcase (Rec.)"): **`VirtualFile` loses `kind`, and gains `named` and `showcase`**: `named: boolean`, true when `file=` gave its name; `showcase?: string`, the id of the showcase whose entry point it is, absent for a virtual file with no showcase adapter. The exported `VirtualFileKind` is removed (a breaking change, _`D512`_). The `html` showcase adapter copies the virtual files with `named` set (_`D521`_). Rejected: `named` and `adapter` (it says whether a file is a showcase, not which one); a three-valued `kind` (`'file' | 'named-entry' | 'entry'`, two facts in one value).
- _`D550`_ (`live`; option chosen: "Convert ts example"): **The `ts` example's `list.ts` becomes a named `ts` showcase** (` ```ts showcase=ts file=list.ts `), the live demonstration of a named showcase: until _`P15.4`_'s views, it shows as a block whose showcase frame renders nothing. Rejected: documentation only until _`P15.4`_ (the agent's recommendation).
- _`D551`_ (`live`; changes _`D172`_ (PLAN-P4.4-html-resources.md); option chosen: "Error, as today (Rec.)"): **A named virtual file called `index.html` (ignoring case)** fails the build of every `html` showcase of its folder, as _`D172`_'s resource did, a named `html` showcase (`showcase=html file=index.html`) included, its own build too. Rejected: letting it pass its own build (a special case, and the folder's other `html` showcases still fail).
- _`D552`_ (`live`; changes _`D122`_ (PLAN-P4.1-markers-and-checks.md), refines _`D123`_ (PLAN-P4.1-markers-and-checks.md)): **The marker grammar and `check`'s errors for `file=`**:
  - on a fence with a showcase adapter, `file=<name>` goes with every other key a code block showcase takes, and names its virtual file; its name is a plain file name (_`D123`_), ending in the extension the fence's language gives (_`D532`_: `.<extension>`, matched exactly, as the generated name is), or it is an error naming the extension expected; the showcase adapter's `validate()` then judges it as for a generated name (_`D518`_);
  - on a fence with no showcase adapter (`showcase file=<name>`), it is a virtual file with no showcase adapter, never built; `include=` on it stays an error (_`D361`_, _`D538`_), and options can't be written without an adapter;
  - on a link, `file=` stays an error, its message saying that a linked showcase's entry point is a real file already;
  - a named showcase's name collides as any virtual file's does (_`D123`_), the generated names of its folder's other showcases included; a generated name keeps counting every showcase, named or not (_`D533`_).
- _`D553`_ (`live`): **"Resource" is retired everywhere it meant a virtual file** (_`D522`_): identifiers, comments, messages, test names and their purpose comments in `src/`; `README.md`, `AGENTS.md`, `CONTRIBUTE.md` (its architecture text, and the Glossary: **Showcase resource** removed, **Virtual file**, **Code block showcase** and **Showcase marker** reworded as _`D522`_ words them) and the examples' prose. Angular's own "resource" stays. The workflow files' history keeps the word.

## Steps

1. **`src/host/`**: `VirtualFile`'s `named` and `showcase` (_`D549`_); `VirtualFileKind` removed, from `src/index.ts`'s exports and `src/index.test.ts`'s export list too.
2. **`src/markdown/`**: `scanMarkdown()` takes `file=` on a fence with an adapter (_`D552`_): the named showcase's virtual file, the extension check, the count kept; the virtual file with no adapter; the errors reworded. Tests in `src/markdown/index.test.ts`.
3. **`src/adapters/showcase/html/`**: copies every named virtual file of the folder (_`D521`_), named showcases included, and fails on one named `index.html` (_`D551`_); "resource" renamed in its identifiers and messages. Tests: its unit tests, and the `showcase-frames` fixture's integration test with a named `html` and a named `ts` showcase copied into an `html` showcase frame.
4. **The rest of `src/`** (_`D553`_): `check`'s messages, `src/showcases/`, `src/vite/`, `src/cli/`, the tests and their purpose comments. Tests: `check` on the `showcase-keys` fixture (a named showcase of each kind, imported and included by another showcase; a named showcase colliding with a generated name; a wrong extension; `file=` on a link) and on `showcase-errors`; a `ts` integration test on the `showcase-ts` fixture where one showcase imports a named `ts` showcase.
5. **Documentation and examples** (_`D512`_, _`D553`_): `README.md` (the keys, the virtual files paragraph, the cheat-sheet's rows, the `html` showcase adapter's copying, the host information's `VirtualFile`), `examples/ts/README.md`'s `list.ts` as a named showcase (_`D550`_), with any reference to the shifted generated names updated, the other examples' prose, `CONTRIBUTE.md`'s Glossary and architecture, `AGENTS.md` (Exports, Layout, Testing).
6. **The workflow files**: _`O86`_ ticked off; _`D170`_ replaced, _`D172`_ and _`D122`_ changed, _`D123`_ refined, with their statuses pointing back (_`O84`_).
7. **Green**: `npm run ci`; `check --showcases` on this repository; the dogfood `serve` started for the user's look at the `ts` example's named showcase and the `html` example.

## Open points

- None yet.
