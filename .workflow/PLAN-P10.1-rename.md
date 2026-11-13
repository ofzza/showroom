# _`P10.1`_ The rename

approved 2026-11-13 (option chosen: "Approve and commit (Rec.)"), without a zero-context review

## Goals

_`D371`_ (SPEC-S10-presentation.md): "Inline showcase" becomes **Code block showcase** in every identifier, comment, message and document, and `ShowcaseKind`'s values become `code-block` (was `inline`) and `link` (was `linked`), so that "inline" and "block" are left to describe how a linked showcase is shown (_`P10.3`_). The Glossary already has the new terms (applied with _`S10`_'s approval). No behaviour changes, beyond the kind's values in `check --json` and the host information, a breaking change that needs no mitigation (_`D381`_ (SPEC-S10-presentation.md)). Its own commit (_`D382`_ (PLAN-P10-presentation.md)).

Scope found while planning (2026-11-13): about 100 places in about 25 files: `src/host/`, `src/markdown/`, the `html`, `ts` and `react` showcase adapters, `src/cli/check/`, their tests, `README.md`, `AGENTS.md`, `examples/` (`ts/` and `react/` `README.md`s, `number-table/number-table.js` and its `README.md`). No fixture's custom showcase adapter reads `kind`.

## Steps

1. **Types** (`src/host/`): `ShowcaseKind = 'code-block' | 'link'`; the JSDoc of `ShowcaseKind`, `Showcase.entry`, `VirtualFileKind` and `VirtualFile` say "code block showcase".
2. **Sources**: `scanMarkdown()` (`src/markdown/`) gives the new kinds; the `html`, `ts` and `react` showcase adapters and `check()` (`src/cli/check/`) compare against them; their comments and messages say "code block showcase" (e.g. `check`'s "use a code block showcase instead").
3. **Tests**: every `kind` in the tests, the test helpers' arguments, `it()` titles and purpose comments (e.g. "Finds code block showcases and their generated entry points"), and `src/host/`'s `expectTypeOf` of `ShowcaseKind`.
4. **Documentation**: `README.md` (the **code block showcase** paragraph, every "inline showcase", `check --json`'s example `"kind": "code-block"`, and `Showcase`'s `kind` in `# Usage`), `AGENTS.md` (Testing's "inline and linked"), the examples' `README.md`s and `number-table.js`'s comment; Markdown formatted.
5. **Check**: no `'inline'`, `'linked'` or "inline showcase" left where it means a showcase's kind (a grep over `src/`, `examples/`, `test/fixtures/`, `README.md`, `AGENTS.md`, `CONTRIBUTE.md`); `npm run ci` green.

Left as they are: "inline" in its other meanings (FluentUI's `Link inline`, Vite's inline configuration and source maps, `?inline` imports, the inline navigation drawer, inline code); the generated names of entry points' virtual files (`README.showcase-1.html`); `VirtualFileKind`'s `entry`; and the workflow files, which are append-only and keep the old term in their history.

## Decisions

None beyond _`D371`_ and _`D381`_ (SPEC-S10-presentation.md): the rename has no choices left.

## Open points

- [ ] _`O65`_ (SPEC-S10-presentation.md) The tests and documentation of this segment: steps 3 and 4.
