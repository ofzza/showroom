# _`P10.2`_ Code blocks and links

implemented 2026-11-13, and re-approved with _`R26`_ (SPEC-S10-presentation.md: no resource captions, _`D390`_) (option chosen: "Approve and commit"); approved 2026-11-13 (option chosen: "Approve and commit (Rec.)"), without a zero-context review

## Goals

_`D366`_, _`D367`_, _`D368`_ and _`D379`_ (SPEC-S10-presentation.md), in the showroom only (`src/app/`): every code block highlighted as the modal highlights, with line numbers in a gutter that can't be selected, whatever its length; a copy button on every code block (and, through the shared component, on the code pane's tabs in _`P10.4`_); a resource's name as its code block's caption; a "code" icon after every link to a linked file. Takes _`O64`_'s `pre` override and copy button parts, and _`O65`_ for this segment.

Not in _`P10.2`_: the code pane and the modal's tabs (_`P10.4`_); code block showcases keep their fence, shown after their showcase frame as today, now with a gutter and a copy button, until _`P10.4`_ replaces it.

Facts found while planning (2026-11-13):

- Markdown's code blocks are rendered by `react-markdown` with `rehype-highlight` (`src/app/markdown/`), styled through `& pre`, with no gutter; the modal's `HighlightedCode` (`src/app/code/`) builds a fence around a file's text and renders it through the same plugins, with a gutter (`getFence()` counts its lines).
- The hast `code` element `react-markdown` hands to a `pre` override carries the fence's info string after the language as `data.meta` (`mdast-util-to-hast`), so a resource's marker (`showcase file=<name>`) can be read there with `parseShowcaseMarker()` (`src/markdown/`, Node-free), without re-parsing the block.
- `@fluentui/react-icons` is already a dependency (`src/app/layout/` uses it): no new dependency.
- `navigator.clipboard` exists only in secure contexts (HTTPS, `localhost`); `serve` on a LAN address, or a build served over plain HTTP, isn't one.

## Steps

1. **A shared code block** (`src/app/code/`): one component holding the gutter, the highlighted code, an optional caption and the copy button, used by Markdown's `pre` override and by `HighlightedCode` (the modal; later the code pane's tabs). The gutter can't be selected (`user-select: none`, `aria-hidden`), so copying a selection never takes line numbers.
2. **Markdown's code blocks** (`src/app/markdown/`): a `pre` override rendering the shared code block around `rehype-highlight`'s output, counting the lines of the code element's text (one line break ending it dropped, as `getFence()` does); `& pre`'s own styles moved into the shared component.
3. **Resource captions** (_`D379`_; dropped by _`D390`_ (SPEC-S10-presentation.md), after being implemented and checked in a browser): the `pre` override reads the code element's `data.meta`; a valid resource marker gives the caption, its name.
4. **The copy button** (_`D367`_, _`D387`_): copies the code's text (never the line numbers) with `navigator.clipboard`, from a click handler only; hidden after mounting where `navigator.clipboard` is missing.
5. **The "code" icon** (_`D368`_): after the text of every link `resolveLink()` resolves to a linked file (opening in the modal or a new tab), including a linked showcase's link; never on an image, a page or an external link; hidden from screen readers, as the link's own text names it.
6. **Tests**: `src/app/code/` (the shared code block: gutter, caption, copy button rendered; the line count; the copy function with a stubbed `navigator`), `src/app/markdown/` (code blocks with gutters, a one-line block, a resource with its caption, a code block showcase's fence, a fence with a non-resource marker; the icon on linked file links and not on others), `src/app/files/` (the modal's code block still rendered). Purpose comments kept current.
7. **Documentation**: `README.md` (where the showroom's code blocks and linked files are described: line numbers, the copy button, resource captions, the icon), `AGENTS.md` (Layout's `code/` line, Testing's linked files and code paragraphs; a gotcha: the copy button is hidden outside secure contexts), `CONTRIBUTE.md` (project structure, if it names `code/`'s contents). Markdown formatted.

## Decisions

- _`D386`_ (`live`, changed by _`D390`_ (SPEC-S10-presentation.md): no caption; resolves _`O64`_'s gutter part; Q1, option chosen: "pre override (Rec.)"): **One shared code block, fed by a `pre` override**: `src/app/code/` holds one component (the gutter, the highlighted code, an optional caption, the copy button); Markdown's `pre` override wraps `rehype-highlight`'s output in it, counting the lines of the code's text; `HighlightedCode` (the modal, later the code pane's tabs) renders through it too. Nothing is parsed twice. Rejected: re-rendering every Markdown code block through `HighlightedCode` (two parses per block).
- _`D387`_ (`live`; changes _`D367`_ (SPEC-S10-presentation.md), _`R25`_; resolves _`O64`_'s copy button part; Q2, option chosen: "API only, hide"): **The copy button uses `navigator.clipboard` only, and is hidden where it is missing** (outside secure contexts: plain HTTP, other than `localhost`). It is rendered by default (so the server-side rendering in the tests shows it), and hidden after mounting when `navigator.clipboard` is missing; it copies from its click handler, showing "Copied" briefly, or "Copy failed" if the write is refused. Rejected: falling back to `document.execCommand('copy')` (deprecated).
- _`D388`_ (`live`, changed by _`D390`_ (SPEC-S10-presentation.md): its caption dropped; changed by _`D415`_ (PLAN-P10.4-code-pane.md) for the code pane; Q3, option chosen: "As recommended (Rec.)"): **The code block's look**: the copy button a small subtle FluentUI icon button (a copy icon) in the block's top-right corner, always visible (touch, keyboard); a resource's caption a header strip above the code, its name in monospace, like a file's tab; the gutter sticky, staying in place while long lines scroll sideways. Rejected: the button only on hover or focus, and the caption below the block.
- _`D389`_ (`live`; refines _`D368`_ (SPEC-S10-presentation.md); Q4, option chosen: "One code icon (Rec.)"): **One icon, FluentUI's `Code16Regular`**, inline after the link's text and inside the link (part of what is clicked), `aria-hidden`, on every link to a linked file, opening in the modal or in a new tab. Rejected: a second icon for files opening in a new tab.
- _`D391`_ (`live`; from _`P10.2`_'s checkpoint, option chosen: "Approve and commit"): **_`P10.2`_'s deviations from its steps, approved**: the copy button is exported as `CopyButton` (`src/app/code/`), as ESLint's `react-hooks` rules don't take a `_`-prefixed function for a component; and it reads whether the clipboard exists with `useSyncExternalStore` (`true` on the server), so it is hidden from the first render in the browser rather than after mounting (_`D387`_), as ESLint forbids setting state directly in an effect. Resource captions were implemented, then dropped (_`D390`_ (SPEC-S10-presentation.md)).

## Open points

- [x] _`O64`_ (SPEC-S10-presentation.md; this segment's parts resolved by _`D386`_, _`D387`_) The `pre` override with a gutter, and the copy button outside secure contexts (steps 1, 2 and 4); the modal's tabs are _`P10.4`_'s.
- [x] _`O65`_ (SPEC-S10-presentation.md; this segment's part done by steps 6 and 7) The tests and documentation of this segment.
