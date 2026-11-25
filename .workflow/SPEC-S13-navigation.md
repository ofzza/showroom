# _`S13`_ The navigation

implemented 2026-11-16 (_`P17`_); approved 2026-11-16 (option chosen: "Approve and commit (Rec.)"); the Glossary term "Navigation" accepted ("Add as proposed (Rec.)"), added with the implementation; revised 2026-11-16 (_`R49`_), re-approved 2026-11-16 with _`P18`_ (option chosen: "Approve and commit (Rec.)"); revised 2026-11-17 (_`R56`_), re-approved 2026-11-17 with _`P19`_ (option chosen: "Approve and commit (Rec.)"); revised 2026-11-24 (_`R67`_); re-approved 2026-11-24, with _`P26`_; revised 2026-11-25 (_`R68`_); re-approved 2026-11-25, with _`P27`_ (option chosen: "Approve and commit (Rec.)")

- _`R68`_ 2026-11-25: a group with no `collapsed` of its own starts as its parent group does, and an explicit `collapsed` passes down to its descendants (_`D929`_ refined), caused by _`D934`_.
- _`R67`_ 2026-11-24: a group may start collapsed (`"collapsed": true`), expanding when the current page is one of its items (_`D638`_ changed), caused by _`D929`_, _`D930`_.
- _`R56`_ 2026-11-17: an absolute URL item's scheme must be `http:`, `https:` or `mailto:`, caused by _`D758`_ (PLAN-P19-trust.md).
- _`R49`_ 2026-11-16: a documentation file listed again under another anchor is no longer warned about, and the item whose anchor the route names is the current one, caused by _`D668`_.

Customizing the showroom's navigation from `showroom.json`: titles, grouping, order, and which documentation files it lists. From the user's proposal of 2026-11-16 (a `menu` property of `{ title, path?, subs? }` items: "If not present, will render the menu exactly as it is now"), discussed as a critique (Q1–Q13). Picks up _`L13`_ (PLAN.md).

## Decisions

### The `navigation` property

- _`D630`_ (`live`; Q1, option chosen: "navigation (Recommended)"; rejected: `menu`, the user's proposal, and `nav`; the code and documentation already call it the navigation (_`D42`_, PLAN.md)): **`showroom.json`'s optional `navigation`** configures the showroom's navigation: a list of items, shown in their order. Without it, the showroom shows the default navigation (_`D639`_).
- _`D631`_ (`live`; Q2, option chosen: "Page or group (Recommended)"; rejected: a group whose caption is also a page, and the draft's single root object with optional `path` and `subs`): **An item is a page or a group**: a page has a `path` (and an optional `title`, _`D633`_); a group has a `title` and `items`, a non-empty list of items. An item with both `path` and `items`, with neither, or with an empty `items`, is invalid (`validateConfiguration()`).
- _`D632`_ (`live`, changed by _`D758`_ (PLAN-P19-trust.md) (an absolute URL's scheme is `http:`, `https:` or `mailto:`, or protocol-relative); Q4, options chosen: "Heading anchors", "Absolute URLs", "Glob patterns"): **A page's `path`** is one of:
  - a documentation file's path, relative to the host repository's root, optionally followed by `#<heading id>` (opening the page at that heading);
  - an absolute URL (e.g. the package's npm page), opened in a new tab, and never checked;
  - a glob pattern (e.g. `examples/*/README.md`), standing for one page per documentation file it matches, in path order (_`D634`_).
- _`D633`_ (`live`; Q5, option chosen: "First heading (Recommended)"; Q9, option chosen: "Optional everywhere", the user: "I would even go further and say that if there is no `navigation` property, the auto-generated menu should use the same principle in naming links to MD files" (_`D639`_)): **Titles**: a page's `title` is optional, its label defaulting to its documentation file's first heading, or its path when it has none; a glob's pages are always labelled that way, and a glob given a `title` is invalid; an absolute URL and a group require a `title`.
- _`D634`_ (`live`; Q10, option chosen: "Explicit wins (Rec.)"): **A glob stands for the rest of what it matches**: it skips the documentation files the navigation lists explicitly anywhere, and of two globs matching one file, the first one in the navigation keeps it.
- _`D635`_ (`live`; Q6, option chosen: "Ordinary entry (Recommended)"; rejected: always first, fixed or titled): **The home page is an ordinary page**: listed, and titled, where the navigation puts it, by the root `README`'s path; left out, it isn't in the navigation, and the header still leads to it. How to list it when the host repository has no root `README` is _`O90`_.

### What the navigation leaves out, and `check`

- _`D636`_ (`live`; Q3, option chosen: "Hidden, warned"; rejected: a placeable "rest" entry (the agent's recommendation), always appending them, and hiding them silently): **A documentation file the navigation doesn't list is hidden from it**, and never added to it; its page still opens when a link (from another documentation file) or its URL leads to it, with no item of the navigation highlighted (the user, on the draft: "Page opens, never listed"); `check` warns about each one.
- _`D637`_ (`live`, changed by _`D668`_; Q8, option chosen: "Error / warnings (Rec.)"; rejected: all warnings, all errors): **`check` judges the navigation**: a `path` (with or without an anchor) leading to no documentation file is an error; a glob matching no documentation file (or only ones listed explicitly, _`D634`_), a documentation file listed twice (allowed: the first is highlighted as the current page), and an anchor leading to no heading of its file are warnings.
- _`D668`_ (`live`; changes _`D637`_; found planning _`P18`_ (PLAN-P18-documentation.md), _`O93`_ there, option chosen: "Change D637"; rejected: a URL item only, an anchor item in place of a page; and, for the current item, option chosen: "Matching anchor (Rec.)"; rejected: the first item staying current): **A documentation file may be listed again under another anchor**: `check` warns only about a page listed twice with the same anchor (or twice without one); the showroom highlights as current the item whose anchor the route names, else the page's first item without an anchor, else its first item.

### In the showroom

- _`D638`_ (`live`, changed by _`D929`_; Q7, option chosen: "Any depth, collapsible (Rec.)"; rejected: two levels at most, static captions): **Groups nest to any depth**, each level indented; a group is collapsible, expanded at first, and the group holding the current page is kept expanded; the same in the narrow layout's overlay drawer.
- _`D639`_ (`live`; changes _`D42`_ (PLAN.md), departing from the user's proposal ("exactly as it is now") at the user's own request (Q9); Q12, option chosen: "Keep fixed labels (Rec.)"; Q13, option chosen: "Heading, path on clash (Rec.)"; rejected: the first heading for every item, the first heading always, with or without the path as a tooltip): **The default navigation** (no `navigation` property) keeps _`D42`_'s items and order, but labels each documentation file other than the home page, CONTRIBUTING and LICENSE (whose labels stay fixed) by its first heading, or its path when it has none; an item whose label another item also has is labelled by its path instead; every documentation file's item shows its path as its tooltip.
- _`D640`_ (`live`; the agent's draft, following `README.md` › `showroom serve`): **A change to `navigation` applies in `serve` without a restart**, as any change to `showroom.json` does.

### Groups collapsed at first

The user, 2026-11-24: "For `showroom.json` `navigation` configuration items that are groups (ones with `items`), I would like to add an additional, optional "`collapsed: boolean`" property that will control the default collapsed/expanded state for that group in the menu."

- _`D929`_ (`live`, refined by _`D934`_; changes _`D638`_; the user's words above; Q1, option chosen: "Expand on its page (Rec.)"; Q3, option chosen: "Allowed (Rec.)"): **A group may start collapsed**: an optional `collapsed` boolean on a group (`items`); with `true`, the group starts collapsed in the navigation (and in the narrow layout's overlay drawer), and expands, as a group the user collapsed does, once the current page is one of its items (on load, or by navigating), so the open page is never hidden; `false`, or no `collapsed`, starts it expanded, as before. Rejected: staying collapsed while one of its pages is open; refusing `false`.
- _`D930`_ (`live`; refines _`D929`_; Q2, option chosen: "An error (Rec.)"): **`collapsed` misused is an error**, named by the item's position as the navigation's other errors: on an item that isn't a group (a page, or a URL), or with a value that isn't a boolean. Rejected: a warning.

The user, 2026-11-25: "When a navigation group is marked as explicitly collapsed, all its children should aslo default to collapsed, unless they have explicitly been set as expanded. An then, if a child has explicitly been set as expanded all its children should default to expanded unless explicitly set to collapsed, and so on ..."

- _`D934`_ (`live`; refines _`D929`_; the user's words above): **A group's `collapsed` passes down**: a group with no `collapsed` of its own starts as its parent group does (collapsed or expanded), and a group's explicit `collapsed` (`true` or `false`) decides it for the group and passes down to its descendants that set none, at any depth; a top-level group with no `collapsed` starts expanded, as before. Each group still expands, on its own, once the current page is one of its items (_`D929`_).

## Open points

- [x] _`O90`_ (resolved by _`D643`_ (PLAN-P17-navigation.md)) (From _`D635`_) How the navigation lists the home page when the host repository has no root `README` (e.g. a reserved `path`), and the home page's label when no `title` is given.
- [x] _`O91`_ (resolved by _`D644`_ (PLAN-P17-navigation.md)) (From _`D632`_) A glob's syntax: the `documentation` patterns' `.gitignore` style, or plain globs; and whether a glob matches hidden or ignored files (it only ever matches documentation files).
- [x] _`O92`_ (resolved by _`D645`_ (PLAN-P17-navigation.md)) (From _`D633`_) Which heading counts as the first: the first of any level, or the first `#` heading; and how its Markdown (code spans, emphasis, links) is turned into a label.
