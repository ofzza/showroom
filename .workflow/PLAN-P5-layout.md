# _`P5`_ Showroom layout fixes

approved 2026-11-12; implemented 2026-11-12

Planned 2026-11-12, after _`P4.3`_ (_`D177`_ (PLAN.md)). Takes the known open issues _`L4`_–_`L9`_ (PLAN.md), found dogfooding `showroom` on its own repository. All of it is browser code in `src/app/` (and `src/app/index.html`); nothing in the CLI, the host information or the showcases changes.

## Goals

- The showroom is usable on a narrow (phone) viewport: the navigation can be opened (_`L4`_), and the page doesn't scroll sideways (_`L5`_).
- The navigation stays in view on long pages, with its divider the full height (_`L6`_).
- The home page doesn't show the project's name twice (_`L7`_).
- No favicon 404, and every highlighted code block is coloured (_`L8`_); the "Dark theme" label doesn't wrap (_`L9`_).

Not in _`P5`_: a host-configurable favicon or logo; a table of contents of a page's headings; other layout changes not listed in _`L4`_–_`L9`_.

## Decisions

### Narrow viewports (_`L4`_, _`L5`_)

- _`D207`_ (`live`; Q2 "Accept all (Rec.)"): **Below a breakpoint, the navigation is an overlay drawer opened by a menu button.** The header gets a menu button (first, before the project's name), shown only below the breakpoint; it opens a FluentUI `OverlayDrawer` holding the same navigation, which closes when an item is chosen, on its dismiss (Escape, the backdrop), and when the route changes. Above the breakpoint, the `InlineDrawer` stays as it is, and the menu button is hidden. Both are switched by CSS media queries in `makeStyles`, not by JavaScript, so the server-side rendering in the tests and the first paint agree (the `OverlayDrawer` renders nothing while closed). Rejected: a `matchMedia` hook rendering one drawer or the other (a flash of the wrong one on load, and a hook with no DOM in the tests); FluentUI's `Nav` components (a larger change than the issue needs).
- _`D208`_ (`live`; Q3 "Accept all (Rec.)"): **The breakpoint is `768px`** (one constant in `src/app/layout/`, used by every media query of the showroom). Rejected: `640px` (a small tablet would get the inline drawer, squeezing the page); `1024px` (a laptop window half a screen wide would lose the inline drawer).
- _`D209`_ (`live`; Q1, a new dependency: "react-icons (Rec.)"): **The menu button's icon is FluentUI's `Navigation24Regular`**, from `@fluentui/react-icons`, added to `dependencies` (already installed by `@fluentui/react-components`, `2.0.345`; adding it changes no install size). Rejected: an inline SVG of our own; a text-only "Menu" button.
- _`D210`_ (`live`): **Long values wrap instead of widening the page**: the project information's values (`dd`) wrap anywhere (`overflowWrap: 'anywhere'`, e.g. long URLs), and below the breakpoint the page's horizontal padding shrinks from `XXL` to `M`. Code blocks and tables keep scrolling inside themselves (`overflowX: 'auto'`, already so).

### The navigation in view (_`L6`_)

- _`D211`_ (`live`; Q4 "Accept all (Rec.)"): **The inline navigation drawer is sticky**: `position: sticky`, `top: 0`, at most the viewport's height (`100dvh`), scrolling inside itself when its items don't fit, so it and its divider stay in view while the page scrolls. The header scrolls away with the page. Rejected: a sticky header too (it would cover headings that a link scrolls to, needing `scroll-margin-top` on every heading, and takes height from the page on small screens); an application shell where only the page scrolls (the window no longer scrolls, which changes how heading links and showcase frames' resizing behave).

### The home page (_`L7`_)

- _`D212`_ (`live`; Q5 "Accept all (Rec.)"): **When the README opens with a level-1 heading, that heading is the home page's title**, and the project information (description, version, license, author, homepage, repository) follows it, before the rest of the README; the showroom's own `Title1` with the project's name is left out. The Markdown is still rendered whole (no splitting, so showcases' offsets still match; see the gotcha on placing showcase frames by offsets in `AGENTS.md`): the `h1` component inserts the project information after the README's first node when that node is a level-1 heading (by its position's start offset). A README that doesn't open with one, and no README, keep today's page: the project's name as `Title1`, then the project information, then the README. Rejected: dropping the showroom's title but keeping the project information above the README's heading (the details would sit above the page's title); moving the project information after the README (it gets lost under a long README); dropping the README's heading (changes the host's document).

### Smaller gaps (_`L8`_, _`L9`_)

- _`D213`_ (`live`; Q6 "Accept all (Rec.)"): **A favicon of the showroom's own**: a small inline SVG `data:` URI in `src/app/index.html`'s `<link rel="icon">` (a generic, theme-neutral mark), so nothing is fetched and no file has to be copied or emitted. Rejected: an empty `data:,` icon (silences the 404, but shows no icon); the host's own favicon (needs configuration; later, if ever).
- _`D214`_ (`live`): **Every highlight.js token class is coloured.** The dogfood finding was a misdiagnosis: `README.md`'s four-backtick examples are labelled `md`, and highlight.js marks their whole content as `hljs-code`, which `_TOKEN_STYLES` (`src/app/markdown/`) doesn't colour. Add `hljs-code` and the other classes highlight.js emits that are missing (e.g. `hljs-formula`, `hljs-subst`, `hljs-char.escape`, `hljs-selector-attr`, `hljs-selector-pseudo`, `hljs-template-tag`, `hljs-operator`, `hljs-punctuation`), checked against highlight.js's class reference. Code blocks without a language stay unhighlighted, as on GitHub (no language detection).
- _`D215`_ (`live`): **The "Dark theme" label doesn't wrap**: `whiteSpace: 'nowrap'` through the `Switch`'s `label` slot (_`L9`_).

### From the implementation (2026-11-12)

- _`D216`_ (`live`; refines _`D207`_, _`D215`_; the user: "Hide label on phones (Rec.)"): **Below the breakpoint, the theme toggle shows only its switch**: the "Dark theme" label is visually hidden (screen readers still get it), so a long project name (e.g. `@ofzza/showroom`) has room in the header instead of breaking mid-word; the header's padding and gaps also shrink there (`M` and `S`). The overlay drawer also gets a header, "Documentation", with a close button, as its list sat flush against the top edge without one. Rejected: cutting the name off with an ellipsis; keeping the mid-word wrapping.
- _`D217`_ (`live`; refines _`D216`_; the user, at the checkpoint: "When the showroom's title doesn't fit, I would rather it gets `white-space: ellipsies` then have it break into multiple lines and break header layout like it does now", then "Ellipsis only"): **The header's project name stays on one line**, cut off with an ellipsis when it doesn't fit, with the full name as its tooltip; the version badge doesn't shrink. Rejected: shrinking the font to fit, by measuring (a `ResizeObserver`), by a CSS estimate from the name's length, or by the viewport's width.
- _`D218`_ (`live`; the user, at the checkpoint: "Can we make the title link back to `/#/`?"): **The header's project name links to the home page** (`#/`), keeping the header's text colour.

## Steps

1. Narrow viewports and the sticky navigation (_`D207`_–_`D211`_): `src/app/layout/` (the breakpoint constant, the menu button, the `OverlayDrawer` and its open state, closing on route change, the sticky `InlineDrawer`), `src/app/pages/` (wrapping values, the page's padding); `package.json` (`@fluentui/react-icons`). Tests: the layout renders the menu button and the inline navigation (server-side, _`D207`_'s CSS can't be asserted on beyond the classes).
2. The home page (_`D212`_): `src/app/pages/` and `src/app/markdown/` (the `h1` component's insertion point). Tests: a README opening with a level-1 heading (one title, the project information right after it), one opening otherwise, none, and a showcase in the README still placed.
3. Smaller gaps (_`D213`_–_`D215`_): `src/app/index.html`, `src/app/markdown/`, `src/app/layout/`. Tests: `hljs-code` coloured (the rendered class rules), the favicon link in `index.html` (`src/vite/`'s test of the page, or a check of the file).
4. Documentation: `README.md` (what the showroom shows on the home page, if it says), `AGENTS.md` (the breakpoint and the media-query rule as a convention, any new gotcha), `CONTRIBUTE.md` (nothing expected). Known open issues _`L4`_–_`L9`_ marked picked up by _`P5`_.
5. `npm run ci`; a dogfood build of a copy of this repository, checked in Playwright at a phone width (`375px`) and a desktop width, then by the user in a browser.

## Open points

- None yet.
