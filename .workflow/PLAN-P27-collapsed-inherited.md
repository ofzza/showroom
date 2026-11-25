# _`P27`_ Navigation groups' `collapsed` passed down

approved 2026-11-25 (option chosen: "Approve and commit (Rec.)")

_`S13`_ (SPEC-S13-navigation.md) as revised by _`R68`_: a group with no `collapsed` of its own starts as its parent group does (_`D934`_ (SPEC-S13-navigation.md)). One segment, with no child segments; its choices were settled 2026-11-25 (Q1, option chosen: "In resolveNavigation (Rec.)"; Q2, option chosen: "S13 decision + P27 (Rec.)").

## Decisions

- _`D935`_ (`live`; changes _`D931`_ (PLAN-P26-collapsed-groups.md); Q1, option chosen: "In resolveNavigation (Rec.)"): **`resolveNavigation()` resolves the inheritance**: it walks the groups with their parent's state (expanded at the top level), and gives each resolved group (`NavigationItem`) `collapsed: true` when it starts collapsed, by its own `collapsed` or its parent's, left out otherwise; the type keeps its shape (`collapsed?: true`), now meaning the state the group starts in, and the showroom (`ShownNavigationItem`, the layout) is unchanged. Rejected: carrying `collapsed` as written (`true` or `false`) and resolving it in the showroom, which changes the exported type and leaves every consumer to repeat the inheritance.
- _`D936`_ (`live`): **Tests and documentation**: `src/navigation/` (a group without `collapsed` under a collapsed group starts collapsed, an explicit `false` under it starts expanded and passes that down, an explicit `true` under that again, at three levels; the test carrying `collapsed` only when `true` adjusted to the new meaning), `src/cli/check/` (the `navigation` fixture's groups as resolved), and `src/app/layout/` (rendered on the server: a nested group inheriting `collapsed` shows `aria-expanded="false"` once its parent is expanded by holding the current page); `README.md` (`navigation`'s group items, the `NavigationItem` type's `collapsed`), `CHANGELOG.md` (`## Unreleased` › Changed: a nested group now starts as its parent does), `AGENTS.md` (Testing's navigation paragraph).

## Steps

1. **Resolution** (`src/navigation/`, `src/host/`'s and `src/configuration/`'s JSDoc): _`D934`_ (SPEC-S13-navigation.md), _`D935`_. Unit tests.
2. **Tests elsewhere and documentation** (_`D936`_).
3. **Green**: `npm run ci`; the user checks it in a browser at the checkpoint, with the dogfooding serve, on a scratch copy of the `navigation` fixture.

## Open points

- None yet.
