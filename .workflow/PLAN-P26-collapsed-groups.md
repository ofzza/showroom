# _`P26`_ Navigation groups collapsed at first

approved 2026-11-24 (option chosen: "Approve and commit (Rec.)")

_`S13`_ (SPEC-S13-navigation.md) as revised by _`R67`_: a `navigation` group's optional `collapsed` (_`D929`_, _`D930`_). One segment, with no child segments; its choices were settled 2026-11-24 (Q1–Q4, all as recommended).

## Decisions

- _`D931`_ (`live`): **Where `collapsed` goes**: `NavigationEntry`'s group gets `collapsed?: boolean` (exported, `src/configuration/`), validated by `_checkNavigation()` (_`D930`_ (SPEC-S13-navigation.md)); `resolveNavigation()` (`src/navigation/`) gives the resolved group (`NavigationItem`, exported, `src/host/`) `collapsed: true` when it is `true`, left out otherwise, and the showroom's `ShownNavigationItem` carries it; the layout's group starts with its collapse already made (`collapsedOn` set to `{}`, no page), so `isNavigationGroupExpanded()` expands it once the current page is one of its items, unchanged.
- _`D932`_ (`live`, changed by _`D933`_): **Tests and documentation**: `src/configuration/` (`collapsed` on a group, `true` and `false`; on a page and a URL item, and a non-boolean, each an error by position), `src/navigation/` (carried only when `true`, at any depth), `src/cli/check/` (the `navigation` fixture gets a collapsed group, and `navigation-errors` its misuses), `src/app/navigation/` and `src/app/layout/` (rendered on the server: a collapsed group's `aria-expanded="false"` and no items; expanded when it holds the current page); `README.md` (`navigation`'s group items, the `NavigationItem` type), `CHANGELOG.md`, `AGENTS.md` (Testing's navigation paragraph, Exports); this repository's own `showroom.json` stays as it is. The user checks collapsing in a browser, with the dogfooding serve, on a scratch copy of the `navigation` fixture.

### From the discussion

- _`D933`_ (`live`; changes _`D932`_; the user, 2026-11-24: "To demonstrate this working, let's have this repo's showroom collapse (by default) the "Usage > Showcases" group"): **This repository's own `showroom.json` collapses its "Usage › Showcases" group** (`"collapsed": true`), instead of staying as it is, so its showroom (served, and published on GitHub Pages) demonstrates it, and `ci:showroom` checks it.

## Steps

1. **Configuration and resolution** (`src/configuration/`, `src/navigation/`, `src/host/`): _`D929`_, _`D930`_ (SPEC-S13-navigation.md), _`D931`_. Unit tests, fixtures.
2. **The showroom** (`src/app/navigation/`, `src/app/layout/`). Unit tests.
3. **Documentation** (_`D932`_), and this repository's `showroom.json` (_`D933`_).
4. **Green**: `npm run ci`; the user checks it in a browser at the checkpoint.

## Open points

- None yet.
