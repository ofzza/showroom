# _`S6`_ Showcases

approved 2026-11-11

Showcases move from _`S5`_'s "Ideas and later" into the specification. This segment holds what is decided about them; the showcase format itself is still to be discussed in detail (_`S6.2`_–_`S6.4`_). Pitfalls _`K9`_–_`K13`_ are in [Pitfalls](./SPEC-pitfalls.md).

## Must-haves

- _`D74`_ (`live`): **Showcases.** A host repository can provide any number of showcases. A showcase is a component demonstrating the usage of a unit of the host repository (a service, hook, directive, component, …). The host repository provides its code; tsshowcase builds it and includes it in the showcase application, alongside the documentation files. tsshowcase specifies how the code is provided, and what has to or can be provided.
- _`D75`_ (`live`): **React and Angular first.** Showcases are supported per framework; React and Angular are the first. Other frameworks may follow later.

## _`S6.1`_ Showcase frames and stack adapters

approved 2026-11-11

- _`D76`_ (`live`): **Every showcase renders in an iframe**, a showcase frame, so it is fully isolated from the showcase application: its own framework and version, CSS and globals (e.g. zone.js, polyfills). Syncing the iframe's size with its content is accepted as solvable. Rejected: rendering showcases in the showcase application's own bundle (the host's component needs the host's own React, and never works for Angular); mounting a separately built bundle into the page (CSS and globals leak both ways); web components (globals still shared, theming awkward).
- _`D77`_ (`live`): **The showcase frame contract.** A showcase frame is an HTML page that renders one showcase, chosen by its URL, and loads a small, framework-free script tsshowcase provides. Through `postMessage`, the frame reports its content's size to the showcase application, and the showcase application tells it the current theme (light or dark). Everything else (framework, compilation, styles) is the frame's own business: the showcase application only knows which URL shows which showcase. The exact messages are left to planning.
- _`D78`_ (`live`): **The frame contract is an internal boundary.** "Bring your own build" frames (built by the host repository, any framework, and only embedded by tsshowcase) are implemented and tested like the React and Angular showcases, so they stay fully supported, but they are not documented as a feature until the interface is stable; then they are reconsidered.
- _`D79`_ (`live`; refines _`D15`_): **React and Angular stack adapters** (`stack: "react"`, `stack: "angular"`) extend the TypeScript stack adapter. A host repository has one showcase framework, the one its stack adapter supports. Building showcase frames is a self-contained part a stack adapter supplies, through which "bring your own build" frames (_`D78`_) work with any stack. Rejected: a separate kind of adapter for showcase frameworks (only needed for several frameworks per host, which isn't a concern).
- _`D80`_ (`live`; refines _`D19`_): **Host requirements are acceptable** wherever they keep tsshowcase simple, e.g. an Angular host repository having an `angular.json`, and the host repository's dependencies being installed (`npm install`) before showcases are built. tsshowcase decides how it's used and what the host repository needs to do; it aims to be easy to use, but never grows in complexity to support every variation of host repository.
- _`D81`_ (`live`): **Showcases are built with the host repository's own framework and tooling**, from its installed dependencies (e.g. its React, its Angular compiler), never with copies of them in tsshowcase's `dependencies`. Rejected: shipping framework tooling with tsshowcase (install size, and a version that may not match the host's).
- _`D82`_ (`live`): **Showcases work in `tsshowcase serve` and `tsshowcase build`** alike (refines _`D13`_): `serve` updates a showcase when its code changes, and `build` builds the showcase frames into the output folder with the rest of the showcase application.

## _`S6.2`_ Showcase format

approved 2026-11-11

- _`D83`_ (`live`): **tsshowcase's own, strict showcase format**, per supported framework. It deliberately limits what is supported to what can be implemented (relatively) easily. Rejected: adopting a third-party format (e.g. Storybook's Component Story Format), and supporting everything a third party supports.
- _`D84`_ (`live`): **No metadata in showcase code files.** A showcase's metadata (e.g. its title, description and grouping) is never written in its code, nor extracted from it. Rejected: an exported metadata object in the code file, read by static analysis.
- _`D85`_ (`live`): **The format is designed for editable showcases**, although they aren't in the first version: a showcase is shaped strictly enough that its fixed part (imports, providers and injections) can stay compiled ahead of time, while a few parts (the template, i.e. JSX or HTML, and the bodies of a few functions) could later be edited in the browser.
- _`D86`_ (`live`): **A showcase's own source code is shown next to it**, syntax highlighted like code blocks in documentation files (_`D12`_).

### Open points

- [ ] _`O14`_ From _`D84`_. Where a showcase's metadata comes from: a JSON file specifying it and linking to the code, embeds in Markdown files (a showcase appears only where a documentation file embeds it), or both. To be settled in the showcase format discussion.
- [ ] _`O15`_ From _`D83`_. The showcase format's details common to every framework (discovery, the per-host setup, e.g. providers and global styles, and how editable parts are marked, _`D85`_), to be discussed in detail.

## _`S6.3`_ Showcase format: React

approved 2026-11-11

### Open points

- [ ] _`O16`_ From _`D83`_. The React showcase format, to be discussed in detail.

## _`S6.4`_ Showcase format: Angular

approved 2026-11-11

### Open points

- [ ] _`O17`_ From _`D83`_. The Angular showcase format, to be discussed in detail.
- [ ] _`O18`_ From _`D75`_. The Angular versions supported (e.g. standalone components only, zone or zoneless).

## Ideas and later

- **Editable showcases** (_`D85`_): the template and a few function bodies editable in the browser, for React and Angular.
- **"Bring your own build" frames documented as a feature** (_`D78`_), once the frame contract is stable.
- Showcases for other frameworks.
