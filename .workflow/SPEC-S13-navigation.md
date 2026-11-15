# _`S13`_ The navigation

approved 2026-11-16 (option chosen: "Approve and commit (Rec.)"); the Glossary term "Navigation" accepted ("Add as proposed (Rec.)"), added with the implementation

Customizing the showroom's navigation from `showroom.json`: titles, grouping, order, and which documentation files it lists. From the user's proposal of 2026-11-16 (a `menu` property of `{ title, path?, subs? }` items: "If not present, will render the menu exactly as it is now"), discussed as a critique (Q1–Q13). Picks up _`L13`_ (PLAN.md).

## Decisions

### The `navigation` property

- _`D630`_ (`live`; Q1, option chosen: "navigation (Recommended)"; rejected: `menu`, the user's proposal, and `nav`; the code and documentation already call it the navigation (_`D42`_, PLAN.md)): **`showroom.json`'s optional `navigation`** configures the showroom's navigation: a list of items, shown in their order. Without it, the showroom shows the default navigation (_`D639`_).
- _`D631`_ (`live`; Q2, option chosen: "Page or group (Recommended)"; rejected: a group whose caption is also a page, and the draft's single root object with optional `path` and `subs`): **An item is a page or a group**: a page has a `path` (and an optional `title`, _`D633`_); a group has a `title` and `items`, a non-empty list of items. An item with both `path` and `items`, with neither, or with an empty `items`, is invalid (`validateConfiguration()`).
- _`D632`_ (`live`; Q4, options chosen: "Heading anchors", "Absolute URLs", "Glob patterns"): **A page's `path`** is one of:
  - a documentation file's path, relative to the host repository's root, optionally followed by `#<heading id>` (opening the page at that heading);
  - an absolute URL (e.g. the package's npm page), opened in a new tab, and never checked;
  - a glob pattern (e.g. `examples/*/README.md`), standing for one page per documentation file it matches, in path order (_`D634`_).
- _`D633`_ (`live`; Q5, option chosen: "First heading (Recommended)"; Q9, option chosen: "Optional everywhere", the user: "I would even go further and say that if there is no `navigation` property, the auto-generated menu should use the same principle in naming links to MD files" (_`D639`_)): **Titles**: a page's `title` is optional, its label defaulting to its documentation file's first heading, or its path when it has none; a glob's pages are always labelled that way, and a glob given a `title` is invalid; an absolute URL and a group require a `title`.
- _`D634`_ (`live`; Q10, option chosen: "Explicit wins (Rec.)"): **A glob stands for the rest of what it matches**: it skips the documentation files the navigation lists explicitly anywhere, and of two globs matching one file, the first one in the navigation keeps it.
- _`D635`_ (`live`; Q6, option chosen: "Ordinary entry (Recommended)"; rejected: always first, fixed or titled): **The home page is an ordinary page**: listed, and titled, where the navigation puts it, by the root `README`'s path; left out, it isn't in the navigation, and the header still leads to it. How to list it when the host repository has no root `README` is _`O90`_.

### What the navigation leaves out, and `check`

- _`D636`_ (`live`; Q3, option chosen: "Hidden, warned"; rejected: a placeable "rest" entry (the agent's recommendation), always appending them, and hiding them silently): **A documentation file the navigation doesn't list is hidden from it**, and never added to it; its page still opens when a link (from another documentation file) or its URL leads to it, with no item of the navigation highlighted (the user, on the draft: "Page opens, never listed"); `check` warns about each one.
- _`D637`_ (`live`; Q8, option chosen: "Error / warnings (Rec.)"; rejected: all warnings, all errors): **`check` judges the navigation**: a `path` (with or without an anchor) leading to no documentation file is an error; a glob matching no documentation file (or only ones listed explicitly, _`D634`_), a documentation file listed twice (allowed: the first is highlighted as the current page), and an anchor leading to no heading of its file are warnings.

### In the showroom

- _`D638`_ (`live`; Q7, option chosen: "Any depth, collapsible (Rec.)"; rejected: two levels at most, static captions): **Groups nest to any depth**, each level indented; a group is collapsible, expanded at first, and the group holding the current page is kept expanded; the same in the narrow layout's overlay drawer.
- _`D639`_ (`live`; changes _`D42`_ (PLAN.md), departing from the user's proposal ("exactly as it is now") at the user's own request (Q9); Q12, option chosen: "Keep fixed labels (Rec.)"; Q13, option chosen: "Heading, path on clash (Rec.)"; rejected: the first heading for every item, the first heading always, with or without the path as a tooltip): **The default navigation** (no `navigation` property) keeps _`D42`_'s items and order, but labels each documentation file other than the home page, CONTRIBUTING and LICENSE (whose labels stay fixed) by its first heading, or its path when it has none; an item whose label another item also has is labelled by its path instead; every documentation file's item shows its path as its tooltip.
- _`D640`_ (`live`; the agent's draft, following `README.md` › `showroom serve`): **A change to `navigation` applies in `serve` without a restart**, as any change to `showroom.json` does.

## Open points

- [ ] _`O90`_ (From _`D635`_) How the navigation lists the home page when the host repository has no root `README` (e.g. a reserved `path`), and the home page's label when no `title` is given.
- [ ] _`O91`_ (From _`D632`_) A glob's syntax: the `documentation` patterns' `.gitignore` style, or plain globs; and whether a glob matches hidden or ignored files (it only ever matches documentation files).
- [ ] _`O92`_ (From _`D633`_) Which heading counts as the first: the first of any level, or the first `#` heading; and how its Markdown (code spans, emphasis, links) is turned into a label.
