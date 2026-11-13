# _`P9`_ Linked files

approved 2026-11-13

## Goals

_`S9`_ (SPEC.md): files that documentation files link to by a relative path (linked files) are copied into the showroom; a text file up to 1 MB opens in a modal, syntax highlighted, its content fetched on click; any other opens directly, in a new tab; relative images are shown (_`D323`_–_`D330`_). Picks up _`L1`_ (PLAN.md).

Not in _`P9`_: line fragments (`#L10`, _`S9`_'s "Ideas and later"); the code file index (_`D12`_).

Facts found while planning (2026-11-13):

- `scanMarkdown()` (`src/markdown/`) collects relative links and reference definitions, but neither images nor linked showcases' links; `check()`'s `_checkLinks()` warns about broken ones (_`D104`_), so a missing image is never warned about today.
- `createShowcaseFramesPlugin()` (`src/vite/`) already emits files into the build (`generateBundle`, `emitFile`) and serves them in `serve` (a middleware ahead of Vite's); the output folder holds `index.html`, `assets/` and `showcases/`.
- The showroom loads with `base: './'` and hash routes, so a URL relative to the page (`files/<path>`) works under any path, in `serve` and on static hosting.
- `serve` watches ignored files that showcases read (`watched`, `getWatchTargets()`), and any change to the shown host information reloads the page (`getShownChange()`).
- This repository's own documentation links 11 such files (8 of them linked showcases' entry points, e.g. `./examples/ts/demo/countdown.ts`; and `./examples/ts/tsconfig.json`, `./examples/ts/src/units.ts`), so its own showroom shows the feature.

## Decisions

- _`D331`_ (`live`; Q1, option chosen: "One segment (Rec.)"): **_`P9`_ is one segment**, with one checkpoint. Rejected: _`P9.1`_ (collecting, copying, serving) and _`P9.2`_ (the modal, images).
- _`D332`_ (`live`; Q2, option chosen: "{ path, size, text } (Rec.)"): **The host information gets `linkedFiles: LinkedFile[]`, sorted by path; `LinkedFile` is `{ path, size, text }`, exported**: `path` POSIX-style, relative to the root, as the link resolves it; `size` in bytes; `text` decided (_`D325`_ (SPEC.md)) only for files up to the modal's limit, 1 MB (_`D326`_ (SPEC.md)), and `false` above it, so `check` never reads a large file whole. The shown host information carries them too. Rejected: `kind: 'text' | 'binary' | 'large'`.
- _`D333`_ (`live`; Q3, option chosen: "Yes, open source (Rec.)"): **A linked showcase's entry point is a linked file too**: its link opens the entry point's source in the modal, below its showcase frame, as on GitHub. The showroom still only embeds the showcase frame (_`D101`_ (SPEC-S6-showcases.md)): the source shows only when the link is clicked. Rejected: keeping them plain text.
- _`D334`_ (`live`; changes _`D324`_ (SPEC.md); Q4, option chosen: "Skip + warning (Rec.)"): **A link into the output folder is not copied**: it stays plain text, and `check` warns about it, as `build` empties that folder first. Rejected: copying it.
- _`D335`_ (`live`; refines _`D104`_ (SPEC.md)): **`check` warns about broken relative images too**, as images are now copied (_`D323`_ (SPEC.md)); and about a linked file whose real path (following symbolic links) is outside the host repository, which is then not copied. Both follow from _`D323`_ and _`D104`_, with no choice to make.
- _`D336`_ (`live`; Q5, option chosen: "Watch them (Rec.)"): **`serve` watches the linked files the host repository ignores**, along with the showcases' reads (`getWatchTargets()`), so a change of their size or text-ness reloads the page. Rejected: not watching them (the modal fetches with `Cache-Control: no-store` on every open anyway).
- _`D337`_ (`live`; Q6, option chosen: "Same as code blocks (Rec.)"): **The modal highlights through the same `react-markdown` and `rehype-highlight` as code blocks**, from a fence built around the content (longer than any backtick run in it), with the same colours (`COLOURED_TOKEN_CLASSES`); the language is the extension, or the lowercased file name when it has none (`Makefile`, `Dockerfile`), plain text when highlight.js doesn't know it; line numbers in a gutter beside it. Rejected: `lowlight` directly (a new direct dependency).
- _`D338`_ (`live`): **Linked files are copied to, and served at, `files/<path>`** in the output folder, so they never collide with `index.html`, `assets/` or `showcases/`; their URLs encode each path segment. `serve` answers every request under `files/`: a linked file from disk (`Cache-Control: no-store`), anything else a 404 (_`D328`_ (SPEC.md)). A link resolves to a linked file by its exact path, as `check` found it.

## Steps

1. **Linked files, collected** (`src/host/`, `src/markdown/`, `src/cli/check/`, and a new internal, Node-free `src/linked-files/`: the folder name `files`, the 1 MB limit, `getLinkedFileUrl()`, `isText()`, `getLanguage()`; never re-exported): `LinkedFile` and `HostInformation.linkedFiles` (_`D332`_); `scanMarkdown()` also returns relative images; `check()` resolves links, images and linked showcases' entry points (_`D333`_), skips documentation files, folders (_`D327`_ (SPEC.md)), missing files (already warned about), the output folder (_`D334`_) and real paths outside the root (_`D335`_), copies ignored files (_`D324`_ (SPEC.md)), and reads up to 1 MB to decide `text`.
2. **Copying and serving** (`src/vite/`, `src/cli/build/`, `src/cli/serve/`): `getShownHostInformation()` adds `linkedFiles`; a linked files plugin (the host root, and the linked files to serve or emit) with its `serve` middleware and its `build` emission (_`D338`_); `serve` adds the linked files to its files to watch (_`D336`_).
3. **Links and images in the showroom** (`src/app/links/`, `src/app/markdown/`, `src/app/pages/`): `resolveLink()` gets a `file` kind; relative images resolve to their linked files' URLs, or their alt text as before; a text file up to 1 MB opens the modal, any other opens in a new tab (_`D326`_ (SPEC.md)).
4. **The modal** (a new `src/app/files/`): a FluentUI `Dialog` with the path as its title, the content fetched on open (a spinner, then the content or an error), highlighted with line numbers (_`D337`_), a link opening the file in a new tab, and close (_`D329`_ (SPEC.md)); the highlighted code block shared with `src/app/markdown/`.
5. **Tests** (beside each changed file): the scan's images; the collection on a new fixture, `test/fixtures/linked-files/` (a text file, a code file, a file without an extension, a binary file linked and shown as an image, an ignored file, a linked showcase, a folder without a `README`, a missing file, a link into the output folder; nothing over 1 MB: the limit is tested on hand-written values); `isText()` and `getLanguage()`; the plugin's middleware and emission; the watcher's files to watch; `resolveLink()`'s `file` kind and images; the modal rendered on the server with given content (effects don't run); `build()` (`e2e`) copying exactly the linked files; `serve()` (`serve` tier) serving a linked file and a 404.
6. **Documentation**: `README.md` (links and images in the showroom, linked files and what gets published, `linkedFiles` in the host information, `LinkedFile` in the exports); `AGENTS.md` (Layout: `src/linked-files/`, `src/app/files/`; Testing; Exports; a gotcha on `files/` and the copy of ignored files); `CONTRIBUTE.md` (project structure); _`L1`_ marked resolved.
7. **Verification**: `npm run ci` green; this repository built from a copy in the working files and served over HTTP, for the user's browser check of the modal, a linked showcase's source, and new-tab links at the checkpoint.

## Open points

- None yet.
