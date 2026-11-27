# _`P29`_ Reloading a showcase frame

approved 2026-11-27 (option chosen: "Approve and commit (Rec.)"); implemented 2026-11-27 (option chosen: "Approve and commit"); its choices (_`D948`_'s mechanism, icon and label) accepted (option chosen: "Accept all (Rec.)")

_`S12`_ (SPEC-S12-showcase-views.md) as revised by _`R70`_: a block's header bar gets a reload button, at its right end, where a showcase frame is loaded (_`D947`_ (SPEC-S12-showcase-views.md)). One segment, with no child segments; its choices were settled 2026-11-27 (Q1 at the user's word, Q2 and Q3 as recommended).

## Decisions

- _`D948`_ (`live`): **How it reloads**: from the showroom's side, never by asking the frame script (a page that hangs couldn't answer): `ShowcaseFrame` (`src/app/showcases/`) takes a `reload` count, and each time it grows sets its iframe's `src` again, imperatively, to `getThemedFrameUrl()` of its URL in the current theme (and `overlays=1` where opted in), keeping its `loaded` state in step. Setting `src` navigates even to the same URL (it has no fragment), and the iframe isn't remounted. The frame script's `start` already clears the console and the overhang (_`D559`_ (PLAN-P15.3-console.md)), and the iframe keeps its height until the new page reports one, so the frame script and its message contract don't change. `ShowcaseBlock` (`src/app/code-pane/`) holds the count, and renders the button (`ArrowClockwise16Regular`, `appearance="subtle"`, `size="small"`, `RELOAD_LABEL` as `title` and `aria-label`) first in the header bar's right end, where `canReloadShowcase()` (a built showcase with a `url`, `isLoadedShowcase()`, and a view loading its showcase frame, `getFrameView()`) holds and with trust.
- _`D949`_ (`live`): **Tests and documentation**: `src/app/code-pane/` (`canReloadShowcase()`; rendered on the server: the button with a `demo` view, and with a `console` view and no `demo` view, on the page and in the showcase sidebar, first at the right end, its `title` and `aria-label`; none on a recorded showcase, one that doesn't build, one with no view loading its showcase frame, or without trust); `src/app/showcases/` (`ShowcaseFrame`'s first `src` unchanged with a `reload` count given). `README.md` (where the header bar's buttons are described), `CHANGELOG.md` (`## Unreleased` › Added), `AGENTS.md` (Testing's code pane paragraph), the JSDoc and file headers of `src/app/code-pane/` and `src/app/showcases/`. The user checks the click in a browser (the tests' server-side rendering runs no effects): the console cleared and filled again, the block not moving, the theme kept, an open overlay closing (and the page's push reset), on the page and in the showcase sidebar, and no button on the `cs` example's recorded showcases.

## Steps

1. **The reload** (`src/app/showcases/`): _`D948`_. Unit tests.
2. **The button** (`src/app/code-pane/`): _`D947`_ (SPEC-S12-showcase-views.md), _`D948`_. Unit tests.
3. **Documentation** (_`D949`_).
4. **Green**: `npm run ci`; `showroom serve` on this repository restarted; the user checks it in a browser at the checkpoint.

## Open points

- [x] _`O146`_ (resolved 2026-11-27 at the user's word, "Remove and rerun (Rec.)": the untracked `bin/` and `obj/` files removed, `project.assets.json` restored, and `npm run ci:test-e2e` green, `./.workflow/.temp/ci-p29-e2e.log`) From _`P29`_'s `npm run ci`, 2026-11-27: `src/cli/build/index.e2e.test.ts` › "Builds cs showcases with the .NET SDK, their recordings in the shown host information" fails, as the `showcase-cs` fixture holds untracked `bin/` and `obj/` folders (a .NET build's output, written 2026-11-26 19:51 into five fixtures by something outside the test suite), which the test's copy carries; the change itself doesn't touch it, and the run added nothing to the fixtures.
