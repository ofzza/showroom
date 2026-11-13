# _`S6`_ Showcases

approved 2026-11-11; revised 2026-11-12 (_`R3`_); re-approved 2026-11-12

- _`R3`_ 2026-11-12: showcases exist only as embeds in documentation files, built by showcase adapters chosen per showcase (_`D74`_, _`D75`_ refined), caused by _`D87`_ and _`D97`_.

Showcases move from _`S5`_'s "Ideas and later" into the specification. This segment holds what is decided about them; the showcase format itself is still to be discussed in detail (_`S6.2`_–_`S6.4`_). Pitfalls _`K9`_–_`K13`_ are in [Pitfalls](./SPEC-pitfalls.md).

## Must-haves

- _`D74`_ (`live`, refined by _`D87`_): **Showcases.** A host repository can provide any number of showcases. A showcase is a component demonstrating the usage of a unit of the host repository (a service, hook, directive, component, …). The host repository provides its code; `showroom` builds it and includes it in the showroom, alongside the documentation files. `showroom` specifies how the code is provided, and what has to or can be provided.
- _`D75`_ (`live`, refined by _`D97`_): **React and Angular first.** Showcases are supported per framework; React and Angular are the first. Other frameworks may follow later.

## _`S6.1`_ Showcase frames and stack adapters

approved 2026-11-11; revised 2026-11-12 (_`R1`_); re-approved 2026-11-12; revised 2026-11-12 (_`R4`_); re-approved 2026-11-12

- _`R1`_ 2026-11-12: showcase frames are built by showcase adapters chosen per showcase, not by stack adapters (_`D79`_ replaced, _`D78`_ refined), caused by _`D96`_ and _`D99`_.
- _`R4`_ 2026-11-12: custom showcase adapters ("bring your own build") are exported and documented as experimental before the interface is stable (_`D78`_ changed), caused by _`D133`_.

- _`D76`_ (`live`): **Every showcase renders in an iframe**, a showcase frame, so it is fully isolated from the showroom: its own framework and version, CSS and globals (e.g. zone.js, polyfills). Syncing the iframe's size with its content is accepted as solvable. Rejected: rendering showcases in the showroom's own bundle (the host's component needs the host's own React, and never works for Angular); mounting a separately built bundle into the page (CSS and globals leak both ways); web components (globals still shared, theming awkward).
- _`D77`_ (`live`): **The showcase frame contract.** A showcase frame is an HTML page that renders one showcase, chosen by its URL, and loads a small, framework-free script `showroom` provides. Through `postMessage`, the frame reports its content's size to the showroom, and the showroom tells it the current theme (light or dark). Everything else (framework, compilation, styles) is the frame's own business: the showroom only knows which URL shows which showcase. The exact messages are left to planning.
- _`D78`_ (`live`, refined by _`D99`_, changed by _`D133`_): **The frame contract is an internal boundary.** "Bring your own build" frames (built by the host repository, any framework, and only embedded by `showroom`) are implemented and tested like the React and Angular showcases, so they stay fully supported, but they are not documented as a feature until the interface is stable; then they are reconsidered.
- _`D79`_ (replaced by _`D96`_; it refined _`D15`_, which now points to _`D96`_): **React and Angular stack adapters** (`stack: "react"`, `stack: "angular"`) extend the TypeScript stack adapter. A host repository has one showcase framework, the one its stack adapter supports. Building showcase frames is a self-contained part a stack adapter supplies, through which "bring your own build" frames (_`D78`_) work with any stack. Rejected: a separate kind of adapter for showcase frameworks (only needed for several frameworks per host, which isn't a concern).
- _`D80`_ (`live`; refines _`D19`_): **Host requirements are acceptable** wherever they keep `showroom` simple, e.g. an Angular host repository having an `angular.json`, and the host repository's dependencies being installed (`npm install`) before showcases are built. `showroom` decides how it's used and what the host repository needs to do; it aims to be easy to use, but never grows in complexity to support every variation of host repository.
- _`D81`_ (`live`): **Showcases are built with the host repository's own framework and tooling**, from its installed dependencies (e.g. its React, its Angular compiler), never with copies of them in `showroom`'s `dependencies`. Rejected: shipping framework tooling with `showroom` (install size, and a version that may not match the host's).
- _`D82`_ (`live`): **Showcases work in `showroom serve` and `showroom build`** alike (refines _`D13`_): `serve` updates a showcase when its code changes, and `build` builds the showcase frames into the output folder with the rest of the showroom.

## _`S6.2`_ Showcase format

approved 2026-11-11; revised 2026-11-12 (_`R2`_); re-approved 2026-11-12

- _`R2`_ 2026-11-12: metadata comes from the documentation file a showcase is embedded in (_`O14`_ resolved, _`D84`_ refined); the common format is settled by _`S6.5`_ (_`O15`_ resolved, its framework-specific remainder moved to _`O19`_); for now, no source is shown beyond the document itself, and later a playground shows and edits it (_`D86`_ changed), caused by _`D87`_–_`D94`_ and _`D101`_.

- _`D83`_ (`live`): **`showroom`'s own, strict showcase format**, per supported framework. It deliberately limits what is supported to what can be implemented (relatively) easily. Rejected: adopting a third-party format (e.g. Storybook's Component Story Format), and supporting everything a third party supports.
- _`D84`_ (`live`, refined by _`D87`_): **No metadata in showcase code files.** A showcase's metadata (e.g. its title, description and grouping) is never written in its code, nor extracted from it. Rejected: an exported metadata object in the code file, read by static analysis.
- _`D85`_ (`live`): **The format is designed for editable showcases**, although they aren't in the first version: a showcase is shaped strictly enough that its fixed part (imports, providers and injections) can stay compiled ahead of time, while a few parts (the template, i.e. JSX or HTML, and the bodies of a few functions) could later be edited in the browser.
- _`D86`_ (`live`, changed by _`D101`_): **A showcase's own source code is shown next to it**, syntax highlighted like code blocks in documentation files (_`D12`_).

### Open points

- [x] _`O14`_ (resolved by _`D87`_) From _`D84`_. Where a showcase's metadata comes from: a JSON file specifying it and linking to the code, embeds in Markdown files (a showcase appears only where a documentation file embeds it), or both. To be settled in the showcase format discussion.
- [x] _`O15`_ (resolved by _`D87`_–_`D93`_; the per-host setup and editable parts moved to _`O19`_) From _`D83`_. The showcase format's details common to every framework (discovery, the per-host setup, e.g. providers and global styles, and how editable parts are marked, _`D85`_), to be discussed in detail.

## _`S6.3`_ Showcase format: React

approved 2026-11-11; revised 2026-11-12 (_`R14`_); re-approved 2026-11-12

- _`R14`_ 2026-11-12: the React showcase format: the entry point's shape, no host-wide setup, a spike on _`K10`_ before planning, the versions, files, default export, StrictMode and theme (_`O16`_ resolved), caused by _`D230`_–_`D232`_, _`D237`_–_`D241`_.

- _`D230`_ (`live`): **A React showcase's entry point is a module whose default export is a component**, e.g. `export default function Demo() { return <Button>Hi</Button>; }`; the `react` showcase adapter renders it in the showcase frame. It is ordinary TSX (or JSX), readable on GitHub and in any editor, and its shape fixes where the editable parts are found later (_`D85`_): the default export's JSX and function bodies, with the imports fixed. Rejected: a bare JSX expression, with its imports in a resource (not valid TSX on its own, and needs a second form for hooks and state); a module that renders itself (no fixed shape to edit, and nowhere to wrap it).
- _`D231`_ (`live`): **No per-host setup for React showcases, for now** (the React part of _`O19`_): a showcase that needs providers (a theme, a router, a query client) or global styles wraps and imports them itself, in its own code; there is no host-wide setup and no option naming a wrapper (the user: "No host-wide setup: each showcase wraps itself. No option to name a wrapper in its options for now!"). Rejected: settings for the built-in showcase adapters in `showroom.json` (a wrapper and global styles); a convention file at a fixed name; a showcase option naming a wrapper.
- _`D232`_ (`live`): **The React format is settled before _`K10`_ is proven**: the format doesn't depend on the toolchain, so the spike on _`K10`_ (a host on React 18, bundled with `showroom`'s Vite from a global-style install, in `serve` and `build`) runs at the start of planning the `react` showcase adapter, before planning builds on it. Rejected: the spike before the format discussion; no spike.
- _`D237`_ (`live`): **React 18 and later**: the host repository has `react` and `react-dom` installed, at 18 or later, which `check` reports when missing or older (_`D96`_); the showcase is rendered with `react-dom/client`'s `createRoot`. Rejected: React 19 only (excludes hosts on 18); also 17 (`ReactDOM.render`, little demand).
- _`D238`_ (`live`): **Entry points are `tsx` or `jsx`**: an inline one is a ` ```tsx ` or ` ```jsx ` fence, a linked one a `.tsx` or `.jsx` file; anything else is a `check` error. Resources may be any language `ts` accepts (_`D236`_). JSX always uses the automatic runtime (no `import React` needed). Rejected: also `ts` and `js` entry points (rarely useful).
- _`D239`_ (`live`; refines _`D230`_): **A missing default export fails the build**: a module without a default export, or whose default export isn't a function, fails at the entry point's line; named exports are allowed, and ignored. Rejected: rendering nothing (silent and confusing).
- _`D240`_ (`live`): **No StrictMode, and no option for it**: the showcase is rendered as an ordinary app renders it; a showcase wanting StrictMode wraps itself in `<StrictMode>`, as with _`D231`_. Rejected: always StrictMode (double-invoked effects surprise readers of a demo); a `strictMode` option.
- _`D241`_ (`live`): **Nothing React-specific for the theme**: a React showcase reads the theme like any page in a showcase frame, from what the frame script sets on `<html>` (its theme attribute and `color-scheme`, _`D77`_), documented in `README.md`. Rejected: a `useShowroomTheme()` hook (`showroom`-specific code in showcases, which then don't run outside it).

### Open points

- [x] _`O16`_ (resolved by _`D230`_–_`D232`_, _`D237`_–_`D241`_; where the editable parts are found in detail is left to the playground, _`D85`_, _`D101`_) From _`D83`_. The React showcase format, to be discussed in detail.

## _`S6.4`_ Showcase format: Angular

approved 2026-11-11

### Open points

- [ ] _`O17`_ From _`D83`_. The Angular showcase format, to be discussed in detail.
- [ ] _`O18`_ From _`D75`_. The Angular versions supported (e.g. standalone components only, zone or zoneless).

## _`S6.5`_ Showcases in Markdown

approved 2026-11-12; revised 2026-11-12 (_`R7`_); re-approved 2026-11-12

- _`R7`_ 2026-11-12: a showcase adapter may follow no files from disk, e.g. `html` (_`D90`_ changed), caused by _`D150`_ (PLAN-P4.2-showcase-frames.md); a showcase frame goes before the nearest flow-content block holding its entry point (_`D93`_ refined), caused by _`D162`_ (PLAN-P4.2-showcase-frames.md).

The common showcase format, independent of any framework (_`O14`_, _`O15`_).

- _`D87`_ (`live`; refines _`D74`_, _`D84`_): **Showcases exist only as embeds in documentation files.** A documentation file reads as complete documentation in any Markdown viewer (e.g. on GitHub); rendered by `showroom`, each showcase it embeds is built and shown in place (later, editable, _`D85`_). A showcase's metadata is the documentation file itself: the surrounding prose, and the file's place in the navigation. Markers in Markdown files that aren't documentation files are ignored. Rejected: a JSON list of showcases (on its own, or referenced by the embeds), and finding showcase files by a naming pattern.
- _`D88`_ (`live`): **The showcase marker.** `showcase`, `showcase=<adapter>` or `showcase=<adapter>(<options>)`, optionally followed by `showroom`'s own space-separated keys (`file=<name>`; `anchor=<name>`, reserved for later). `<options>` is JSON5, parsed and never evaluated, and belongs to the showcase adapter (_`D98`_). The same grammar is used in code fences and links.
- _`D89`_ (`live`): **Inline showcases** are fenced code blocks with the marker in the info string, after the language, which stays the first word so the block is highlighted by its language everywhere (e.g. ` ```ts showcase=ts `). A block whose marker names an adapter (or is naked, _`D92`_) is a showcase's entry point; a block marked `showcase file=<name>` is a resource. Rejected: the marker as a comment on the code's first line (shown on GitHub, in the shown source, and later editable).
- _`D90`_ (`live`, changed by _`D150`_ (PLAN-P4.2-showcase-frames.md)): **Linked showcases** are links to the entry point's file, with the marker in the link's title (e.g. `[caption](./MyComponent.ts 'showcase=angular({ "x": true })')`); the link stays an ordinary link elsewhere. Only the entry point is marked: the files it uses are real files the showcase adapter's build follows from disk. Rejected: the marker in the link's fragment (`#showcase=<adapter>`; options and keys would need a second, URL-like grammar).
- _`D91`_ (`live`): **Inline files are virtual files in their documentation file's folder.** Resources and inline entry points (the latter under a name `showroom` generates) resolve like real files in that folder: shared by every documentation file in it, and reachable from other folders by relative paths, so one resource can serve several showcases. A name that collides with another virtual file or a real file is an error.
- _`D92`_ (`live`): **A naked marker means the html showcase adapter** (`showcase` is `showcase=html`). On a fence whose language isn't HTML, or a link to a file that isn't `.html` or `.htm`, it is an error.
- _`D93`_ (`live`, refined by _`D162`_ (PLAN-P4.2-showcase-frames.md)): **The showcase frame is placed right before its entry point** (the fence, or the paragraph holding the link); fences and links stay as they are. Rejected: right after the entry point (resources that follow it would be split from it).
- _`D94`_ (`live`, refined by _`D102`_): **Broken showcases are errors `check` reports**: an unknown adapter, invalid options, a name collision (_`D91`_), a misplaced naked marker (_`D92`_), a missing linked file. Host repositories are expected to run `showroom` in CI, which also catches showcases that no longer build.
- _`D95`_ (replaced by _`D101`_; it refined _`D86`_, which now points to _`D101`_): **The source shown with a showcase**: an inline showcase's source is its own code blocks, already in the document, so nothing is repeated; a linked showcase shows its entry point's file, syntax highlighted, with the frame.
- _`D101`_ (`live`; replaces _`D95`_; changes _`D86`_): **For now, `showroom` only embeds the showcase frame**: it neither adds nor removes source code, for inline and linked showcases alike, so the document shows exactly what it shows in any Markdown viewer. Later, a showcase becomes a playground component, a source editor with the showcase frame as its preview, for inline and linked showcases alike; that is where showing (_`D86`_) and editing (_`D85`_) the source land. Rejected: showing a linked showcase's entry point file with its frame (_`D95`_).
- _`D102`_ (`live`; refines _`D94`_): **`check` keeps showcases from drifting from the code**, in two tiers. Always: the static checks of _`D94`_ (markers, adapters, options, name collisions, linked files, each showcase adapter's host requirements), without building anything. With a flag (`showroom check --showcases`; the name may change in planning): also building every showcase with its showcase adapter into a temporary folder, thrown away afterwards, reporting each failure with its documentation file and the entry point's line. A plain `check` stays fast, and works without the host repository's dependencies installed. `build` fails on any showcase that doesn't build; `serve` shows the error in that showcase's frame instead of stopping. Rejected: always building in `check` (slow, and needs the dependencies installed even to validate the configuration); a separate command (one more to document). Running every showcase headless to catch runtime errors (a third tier) is in "Ideas and later".

## _`S6.6`_ Showcase adapters

approved 2026-11-12; revised 2026-11-12 (_`R5`_); re-approved 2026-11-12

- _`R5`_ 2026-11-12: custom showcase adapters are listed under `customShowcaseAdapters`, and documented and exported as experimental (_`D99`_ changed), caused by _`D133`_.

- _`D96`_ (`live`; replaces _`D79`_; refines _`D15`_ (SPEC.md), changes its "React-specific stack adapter"): **Showcase adapters build showcase frames**, independent of the stack adapter. Each showcase names its showcase adapter in its marker, so a host repository can mix them (e.g. html, React and Angular showcases in one README). A showcase adapter takes the entry point, the virtual files (_`D91`_), the documentation file's folder and its options, and returns a built showcase frame page with its assets; `showroom` adds its frame script (_`D77`_). It states what it needs from the host repository (e.g. React installed, _`D80`_), and `check` reports what's missing. There are no React or Angular stack adapters: a React or Angular host repository uses the TypeScript stack adapter. Rejected: _`D79`_'s showcase frames through the stack adapter, one framework per host repository.
- _`D97`_ (`live`; refines _`D75`_): **Built-in showcase adapters**: `html` (the entry point is the page; an HTML fragment is wrapped into a complete page; needs nothing from the host repository), `ts` (runs the entry point in the frame, and shows what it writes to the console), `react` and `angular` (their formats are _`S6.3`_ and _`S6.4`_).
- _`D98`_ (`live`, refined by _`D103`_): **Showcase adapter options** are defined and validated by each showcase adapter (e.g. `ts({ failOnTypeScriptErrors: true })`; whether and how an adapter type checks is decided when it is built). A showcase demonstrating an error leaves such an option off.
- _`D103`_ (`live`; refines _`D98`_): **Type checking is on by default** in the `ts` showcase adapter and the showcase adapters building on it (`react`, `angular`), so a changed signature fails the showcases using it (_`D102`_). A showcase demonstrating a type error turns it off with an option. Such an adapter could drop the option, or change its default, but isn't expected to.
- _`D99`_ (`live`, changed by _`D133`_; refines _`D78`_): **"Bring your own build" is a host-provided showcase adapter**: a JavaScript (ES) module, named in `showroom.json` under an adapter name that can't shadow a built-in one, implementing the same interface as the built-in showcase adapters, and used as `showcase=<name>`. It stays undocumented as _`D78`_ says. Rejected: a build command and the folder it writes frames to (process management; any command can still be run from such a module).
- _`D100`_ (`live`): **Order of work**: the showcase adapter interface, the `html` showcase adapter and "bring your own build" first; the `ts`, `react` and `angular` showcase adapters after, refined into their own formats then.
- _`D133`_ (`live`; changes _`D78`_, _`D99`_): **Custom showcase adapters are a documented, experimental feature**: a showcase adapter the host repository supplies ("bring your own build", _`D99`_) is listed in `showroom.json` under `customShowcaseAdapters`, and the showcase adapter interface and its types are exported and documented in `README.md` as experimental, liable to change in any release until the interface is declared stable. This replaces keeping them undocumented until then (_`D78`_, _`D99`_): without the exported interface, a third party can't reasonably write one (the user, in _`P4.1`_'s planning). Rejected: exporting the interface undocumented; keeping it unexported until it is stable.

### Open points

- [ ] _`O19`_ (the React part resolved by _`D231`_; the `ts` part resolved by _`D257`_ (PLAN-P7.1-ts.md); the Angular part open) From _`O15`_. Per showcase adapter: the per-host setup (e.g. providers, global styles), and how a showcase's editable parts are located (_`D85`_).

## _`S6.7`_ Showcase format: TypeScript

approved 2026-11-12; revised 2026-11-13 (_`R15`_); re-approved 2026-11-13; revised 2026-11-13 (_`R16`_, _`R17`_); re-approved 2026-11-13

- _`R15`_ 2026-11-13: a `ts` entry point's languages (_`O43`_ resolved), and the showcase frame root and the console panel's place in the page (_`D233`_ refined), caused by _`D247`_ and _`D249`_ (PLAN-P7.1-ts.md).
- _`R16`_ 2026-11-13: type checking reports every type error outside `node_modules` and TypeScript's library files, the host's own files included, not only the entry point's and virtual files' (_`D234`_ changed), caused by _`D282`_ (PLAN-P7.1-ts.md).
- _`R17`_ 2026-11-13: type checking applies the nearest tsconfig whole, reports errors only in the files a showcase reaches (_`R16`_ narrowed), uses TypeScript's defaults without a tsconfig, is skipped on TypeScript 7, gets `allowJs` for JavaScript entry points, and `ts` gains a second option, `allowJs` (_`D234`_ refined and changed), caused by _`D274`_, _`D280`_, _`D283`_, _`D288`_, _`D289`_, _`D290`_ (PLAN-P7.1-ts.md).

The `ts` showcase adapter's format (_`D97`_, _`D103`_), which the `react` (and later `angular`) showcase adapter builds on.

- _`D229`_ (`live`; refines _`D100`_): **The `ts` showcase format is specified before the React one**, in this segment, so that compiling, type checking and reporting errors are settled once, for `ts` and the showcase adapters building on it. Rejected: specifying React alone, and leaving `ts` to follow from it.
- _`D233`_ (`live`, refined by _`D249`_ (PLAN-P7.1-ts.md); refines _`D97`_): **What a `ts` showcase shows**: its showcase frame shows a console panel, one line per `console.log`, `info`, `warn`, `error` and `debug` call, styled by its level, along with uncaught errors and rejected promises; values are shown readably (strings as they are, objects and arrays as indented JSON, with a fallback for the rest, e.g. functions and cycles), and every call still reaches the browser's console. The module may also write to the page: it gets an empty container above the panel, and the panel is hidden while nothing has been logged. Rejected: the console only (no DOM result); the page only (doesn't show the console, _`D97`_).
- _`D234`_ (`live`, refined by _`D280`_, _`D283`_, _`D288`_, changed by _`D274`_, _`D282`_, _`D289`_, _`D290`_ (PLAN-P7.1-ts.md); refines _`D103`_): **Type checking uses the host repository's own TypeScript** (_`D81`_) and the `tsconfig.json` nearest to the documentation file (walking up to the host repository's root). It checks the entry point and the virtual files it imports, and reports each error at its line: in the code block, for inline files, or in the linked file (_`D102`_). The option turning it off is `ts({ typeCheck: false })`. `typescript` is a host requirement (_`D96`_) only when some showcase type checks. Rejected: `showroom`'s own TypeScript (may differ from the host's); fixed compiler options (diverge from how the host's code is checked).
- _`D235`_ (`live`): **`ts` (and the showcase adapters building on it) compile and bundle with `showroom`'s own Vite**: its built-in transform handles TypeScript and JSX without the host repository's tooling, so only framework code (e.g. React) comes from the host (_`D81`_), and `ts` needs nothing installed when type checking is off. Virtual files are served as Vite virtual modules, never written to disk (_`K14`_). Rejected: the host's own bundler (unbounded variety, _`K11`_).
- _`D236`_ (`live`; its self-reference premise, _`K15`_ (SPEC-pitfalls.md), confirmed by _`D259`_ (PLAN-P7.1-ts.md)): **What a showcase can import** (narrowing _`K11`_, _`D80`_): relative paths (real and virtual files); packages installed in the host repository's `node_modules`, including the host's own package by its name, through its `exports` (so it must be built when they point at its `dist/`); and what Vite handles out of the box (CSS, assets, JSON). Not supported for now: tsconfig `paths` aliases, and anything needing the host's own bundler configuration (e.g. SCSS without `sass` installed, environment variables). Rejected: also mapping tsconfig `paths` (one more thing to map and test).

### Open points

- [x] _`O43`_ (resolved by _`D247`_ (PLAN-P7.1-ts.md)) From review 2026-11-12 #13 (PLAN-P7-ts-react.md). Which languages a `ts` entry point may be: ` ```ts ` fences and `.ts` files only, or `js` (and `mts`/`mjs`) too; _`D238`_ settles it for `react` only. For _`P7.1`_.

## Ideas and later

- **Editable showcases** (_`D85`_): the template and a few function bodies editable in the browser, for React and Angular.
- **The showcase playground** (_`D101`_): each showcase as a source editor with its showcase frame as the preview, for inline and linked showcases; it shows (_`D86`_) and later edits (_`D85`_) the source.
- **Custom showcase adapters declared stable** (_`D78`_, _`D133`_), once the interface has settled (no longer experimental).
- Showcases for other frameworks.
- **Anchors** (_`D88`_, _`D93`_): a showcase placed elsewhere than before its entry point, at a `<!-- showcase:<name> -->` comment it names with `anchor=<name>`.
- **Running every showcase headless** in `check` (a third tier of _`D102`_), catching runtime errors the showcase frames report; needs a headless browser.
- **Running `ts` showcases in Node** at build time (an option of the `ts` showcase adapter), and type checking inline code blocks during `check`.
