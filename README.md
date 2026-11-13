# `showroom`

[![npm](https://img.shields.io/npm/v/@ofzza/showroom)](https://www.npmjs.com/package/@ofzza/showroom)

Build a showroom for a repository: its documentation, enriched by showcases.

See this repository's own showroom, built by `showroom` itself: [ofzza.github.io/showroom](https://ofzza.github.io/showroom/).

`showroom` reads a host repository (the repository that uses it) and collects its host information: the project information, the documentation files (`README`, `CONTRIBUTE`, `LICENSE`, ...), an index of its code files, and the showcases its documentation files embed. `showroom check` collects and checks it, `showroom build` builds the showroom that presents it into static files, ready for static hosting such as GitHub Pages, and `showroom serve` previews it. The showroom is a React/FluentUI SPA with the project information, a page per documentation file, and a light/dark toggle.

---

Jump to section:

- [Get `showroom`](#get-showroom)
- [Usage](#usage)
  - [Configuration: `showroom.json`](#configuration-showroomjson)
  - [Patterns](#patterns)
  - [Documentation files](#documentation-files)
  - [Stack adapters](#stack-adapters)
  - [Showcases](#showcases)
  - [Custom showcase adapters (experimental)](#custom-showcase-adapters-experimental)
  - [`showroom check`](#showroom-check)
  - [`showroom serve`](#showroom-serve)
  - [`showroom build`](#showroom-build)
  - [Publishing to GitHub Pages](#publishing-to-github-pages)
  - [API](#api)
- [Development](#development)
- [Contributing](#contributing)

# Get `showroom`

`showroom` is published as an NPM package. Install it in the host repository, and run it through `npx`:

```sh
$ npm install --save-dev @ofzza/showroom
$ npx showroom check
```

Or install it globally:

```sh
$ npm install -g @ofzza/showroom
$ showroom check
```

Or run it without installing it:

```sh
$ npx @ofzza/showroom check
```

A host repository with no `package.json` of its own (e.g. a .NET one) can run it the same way, with Node installed: `npx --package @ofzza/showroom showroom build`. It still needs a stack adapter for its kind of repository, and the only one so far is `typescript`.

# Usage

## Configuration: `showroom.json`

Every host repository needs a `showroom.json` file in its root. Without it, `showroom` stops with an error.

```json
{
  "stack": "typescript",
  "sourceRoot": "src",
  "ignore": ["examples"],
  "code": ["!*.test.ts"],
  "documentation": ["docs/*.md"]
}
```

| Key                      | Required | Default             | Meaning                                                                                                                                                                |
| ------------------------ | -------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack`                  | yes      |                     | Name of the [stack adapter](#stack-adapters) to use.                                                                                                                   |
| `sourceRoot`             | no       | the stack adapter's | Source root directory, relative to the host repository's root. Code files are only looked for under it.                                                                |
| `outDir`                 | no       | `./showroom`        | Output folder of `showroom build`, relative to the host repository's root. It must be inside the host repository, and isn't its root. Nothing in it is ever collected. |
| `ignore`                 | no       | `[]`                | [Patterns](#patterns) of files to ignore, appended to the stack adapter's.                                                                                             |
| `code`                   | no       | `[]`                | [Patterns](#patterns) of code files, relative to the source root, appended to the stack adapter's.                                                                     |
| `documentation`          | no       | `[]`                | [Patterns](#patterns) of documentation files, appended to the built-in ones and the stack adapter's.                                                                   |
| `customShowcaseAdapters` | no       | `{}`                | Experimental: [custom showcase adapters](#custom-showcase-adapters-experimental), as `{ "<name>": "<path>" }`.                                                         |

Any other key is an error, which catches typos.

## Patterns

`ignore`, `code` and `documentation` are each a list of patterns that work like a `.gitignore` file:

- The stack adapter's patterns come first, and the configuration's are appended to them.
- They're applied in order, and the last pattern matching a file wins. A pattern starting with `!` re-includes what an earlier one matched, e.g. `!dist` in `ignore` stops ignoring `dist`, or `!*.test.ts` in `code` drops test files from the code file index. As in `.gitignore`, a file can't be re-included if a folder it's in is ignored: ignore `vendor/*` and re-include `!vendor/keep`, rather than ignoring `vendor`.
- A pattern without a `/` matches at any depth; one with a `/` is anchored to the host repository's root (to the source root, for `code`).
- Matching is case-insensitive.

Ignored files are left out of everything: the documentation files and the code file index. Symbolic links are not followed.

## Documentation files

`showroom` collects these documentation files, matching their names regardless of case, in UK or US spelling, and with the `.md` or `.txt` extension or none:

- `README` files anywhere in the host repository;
- `LICENSE` (or `LICENCE`) and `CONTRIBUTE` (or `CONTRIBUTING`) in the host repository's root.

The stack adapter's and the configuration's `documentation` patterns can add more files, or remove these with `!` (e.g. `!README.txt`). If one folder holds several files of the same kind (e.g. `README.md` and `README.txt`), `showroom` keeps one of them, preferring `.md`, then no extension, then `.txt`, and reports a warning.

## Stack adapters

A stack adapter handles one kind of host repository: it reads the project information and sets the default source root and patterns. The `stack` key selects one by name.

| Stack adapter | Project information | Source root | Code (`code`)                                                        | Ignored (`ignore`)                         | Documentation (`documentation`) |
| ------------- | ------------------- | ----------- | -------------------------------------------------------------------- | ------------------------------------------ | ------------------------------- |
| `typescript`  | `package.json`      | `src`       | `*.ts`, `*.tsx`, `*.mts`, `*.cts`, `*.js`, `*.jsx`, `*.mjs`, `*.cjs` | `.git`, `node_modules`, `dist`, `coverage` | none beyond the built-in ones   |

The `typescript` stack adapter reads the `name` (required), `version`, `description`, `license`, `author`, `homepage` and `repository` fields of `package.json`.

## Showcases

A showcase demonstrates a unit of the host repository (a component, a service, ...) live, in the showroom, right where its documentation describes it. Showcases are embedded in Markdown documentation files (`.md`), so the documentation still reads as plain Markdown anywhere else, e.g. on GitHub. A showcase adapter, which the showcase's marker names, builds each showcase into a showcase frame.

> Showcases are shown by `showroom build` and `showroom serve`, each in its [showcase frame](#showcase-frames). `showroom serve` also updates them as you edit them.

The **showcase marker** is `showcase`, `showcase=<adapter>`, or `showcase=<adapter>(<options>)`, followed by space-separated keys:

- `<adapter>` names the showcase adapter: lower-case letters, digits and `-`, starting with a letter. A naked `showcase` means `showcase=html`.
- `<options>` are [JSON5](https://json5.org/) (parsed, never evaluated), for the showcase adapter to validate. Empty options (`()`) are an error.
- The keys:
  - `file=<name>` marks a resource (below), and goes with no other key.
  - `inline` or `block` says how a linked showcase is shown: inline, the default, or as a block, in place of the paragraph holding its link, which must be its paragraph's only content (in a list item or a blockquote too, never in a footnote). A code block showcase is always a block, so neither key goes on a code block.
  - `include=<path>,<path>` lists a showcase's **included files**, which are shown with it: real files, documentation files, or virtual files (a resource, or a code block showcase's entry point, by its generated name, which changes when a showcase is added above it), in any folder. Paths are relative to the documentation file's folder, comma-separated, with no spaces, commas, `?` or `#` in them, URL-decoded as link targets are, and matched exactly, case included, on every OS. `check` reports an included file that doesn't exist, is a folder, is the showcase's own entry point, is listed twice, is in the output folder, or leads outside the host repository. Including a file only adds it: it is always available to the showcase's build (see each showcase adapter below), and a showcase still uses whatever else it uses, included or not.
  - `anchor=<name>` is reserved for later, and any other key is an error. Keys are case-sensitive, and a repeated key is an error.

A **code block showcase** is a fenced code block with the marker right after its language, which stays first so that the block is still highlighted everywhere. Its code is the showcase's entry point:

````md
```html showcase
<style>
  .n {
    font: 1.5em monospace;
    color: #0f6cbd;
  }
  .n b {
    font-weight: normal;
    color: #242424;
    background: #fde300;
  }
  .n i {
    font-style: normal;
    color: #c50f1f;
  }
</style>
<span class="n">1<b>,</b>234<b>,</b>567<b>.</b><i>89</i></span>
```
````

> Here is that block again, as a live showcase in this repository's own showroom:
>
> ```html showcase
> <style>
>   .n {
>     font: 1.5em monospace;
>     color: #0f6cbd;
>   }
>   .n b {
>     font-weight: normal;
>     color: #242424;
>     background: #fde300;
>   }
>   .n i {
>     font-style: normal;
>     color: #c50f1f;
>   }
> </style>
> <span class="n">1<b>,</b>234<b>,</b>567<b>.</b><i>89</i></span>
> ```

A code block marked `showcase file=<name>` is a **resource** instead: a file the showcases of its folder can use. Here, the same styles as a stylesheet, and a code block showcase using it:

````md
```css showcase file=figures.css
.figure {
  font: 1.5em monospace;
  color: #0f6cbd;
}
.figure b {
  font-weight: normal;
  color: #242424;
  background: #fde300;
}
.figure i {
  font-style: normal;
  color: #c50f1f;
}
```

```html showcase
<link rel="stylesheet" href="./figures.css" /> <span class="figure">3<b>.</b><i>14159</i></span>
```
````

> Here are those blocks again, live:
>
> ```css showcase file=figures.css
> .figure {
>   font: 1.5em monospace;
>   color: #0f6cbd;
> }
> .figure b {
>   font-weight: normal;
>   color: #242424;
>   background: #fde300;
> }
> .figure i {
>   font-style: normal;
>   color: #c50f1f;
> }
> ```
>
> ```html showcase
> <link rel="stylesheet" href="./figures.css" /> <span class="figure">3<b>.</b><i>14159</i></span>
> ```

The code blocks of code block showcases and resources are **virtual files**: they resolve like real files in their documentation file's folder, so every documentation file in that folder, and other folders through relative paths, can use them. A resource is named by its `file` key, a plain file name. A code block showcase's entry point gets a generated name, `<documentation file's name>.showcase-<n>.<extension>`, where `<n>` is its position among the showcases in its documentation file, and `<extension>` comes from the code block's language (`typescript` gives `ts`, `javascript` gives `js`, `htm` gives `html`; any other language is used as is). The first showcase in `README.md`, the number above, is `README.showcase-1.html`. A virtual file's name may not collide, ignoring case, with another virtual file or a real file or folder in the same folder.

A **linked showcase** is a link to its entry point's file, with the marker as the link's title. The link stays an ordinary link anywhere else:

```md
[Formatted figures](./examples/figures.html 'showcase')
```

> Here is that link again, live:
>
> [Formatted figures](./examples/figures.html 'showcase')

The link must be an inline link (not a reference, nor an image) with a relative path, without a query or fragment, naming a file inside the host repository that isn't a virtual file. The files the entry point uses are ordinary files too, which a showcase adapter building from disk follows; the `html` showcase adapter follows none (see below). A title is a marker when its first word is `showcase`, or starts with `showcase=`, and must then be a valid marker.

The built-in showcase adapters:

| Showcase adapter | Entry point                                                                                                       | Options                | Needs from the host repository                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| `html`           | an `html` or `htm` code block, or an `.html` or `.htm` file                                                       | none                   | nothing                                                                                    |
| `ts`             | a `ts`, `js`, `mts` or `mjs` code block (or `typescript`, `javascript`), or a `.ts`, `.mts`, `.js` or `.mjs` file | `typeCheck`, `allowJs` | the packages its showcases import, and `typescript` (5.x or 6.x) where they type check     |
| `react`          | a `tsx` or `jsx` code block, or a `.tsx` or `.jsx` file                                                           | `typeCheck`, `allowJs` | `ts`'s, and `react` and `react-dom` 18 or later, with `@types/react` where they type check |

An `angular` showcase adapter is planned. A broken showcase is an error `showroom check` reports, with its documentation file and line: a broken marker, a marker anywhere else than after a code block's language or in an inline link's title, an unknown showcase adapter, options or an entry point the showcase adapter rejects, a virtual file's name that collides, a linked file that doesn't exist, and a showcase adapter's missing host requirements (reported once per run, with no documentation file or line; a showcase adapter can also warn about the host repository).

### `html` showcases

An `html` showcase's showcase frame is its entry point, as the page, **every resource of its documentation file's folder**, next to the page under its name, whether the page uses it or not, and **its included files**, next to the page as they sit next to the entry point (so they must be inside the entry point's folder). An entry point that starts (after whitespace and comments) with `<!doctype`, `<html`, `<head` or `<?xml` is a complete page, used as it is; anything else is a fragment, wrapped into a page of its own. Pages are UTF-8. Nothing else is followed or copied: the page isn't read for its relative references (`<script src>`, `<link href>`, `<img src>`), so they only reach those resources, and resolve as written for a code block showcase, or a linked page in its documentation file's folder. Keep other styles and scripts inline, or use absolute URLs. A resource named `index.html` would replace the page, and fails the build; so does an included file landing where a resource of the documentation file's folder does (including that resource itself is fine), and `check` reports an included file named `index.html`, in any case. (A script needs its closing tag, `<script src="./demo.js"></script>`: HTML has no self-closing `<script />`.)

The [`html` example](./examples/html/README.md) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md)) documents `numerals`, a made-up CSS library, on its own showcases. Its first showcase is a page of its own, [`clock.html`](./examples/html/clock.html), linked as a showcase:

```md
[A 7-segment clock](./examples/html/clock.html 'showcase')
```

> Here is that link again, live:
>
> [A 7-segment clock](./examples/html/clock.html 'showcase')

See the rest in the example: its stylesheet as a [resource](./examples/html/README.md#the-stylesheet) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md#the-stylesheet)), [tabular figures](./examples/html/README.md#tabular-figures) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md#tabular-figures)), [grouped digits](./examples/html/README.md#grouped-digits) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md#grouped-digits)), [comic digits](./examples/html/README.md#comic-digits) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md#comic-digits)) and [large figures](./examples/html/README.md#large-figures-and-displays) ([live](https://ofzza.github.io/showroom/#/examples/html/README.md#large-figures-and-displays)), following the showroom's theme.

### `ts` showcases

A `ts` showcase's entry point is a TypeScript or JavaScript module, which `showroom` bundles with its own Vite (no Vite, PostCSS or bundler configuration of the host repository is read) and runs in its showcase frame's page. The page holds an empty `<div id="root">`, the **showcase frame root**, for the showcase to write to, and below it the **console panel**, listing what the showcase writes to the browser's console (`console.log`, `info`, `warn`, `error` and `debug`, styled by level), its uncaught errors and its rejected promises. The panel is hidden until something is logged, scrolls once it holds about 12 lines, and follows the showroom's theme; every call still reaches the browser's console. Values are shown readably: strings as they are, errors as their stack, objects and arrays as indented JSON. The page has no other content and no styles of its own beyond the browser's: write into `#root`, rather than replacing `document.body`, which holds the console panel too.

The [`ts` example](./examples/ts/README.md) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md)) documents `tempo`, a made-up TypeScript library of durations, relative times and rounding, typed throughout. Its first showcase is [`countdown.ts`](./examples/ts/demo/countdown.ts), a module importing the library, linked as a showcase:

```md
[A countdown to the new year](./examples/ts/demo/countdown.ts 'showcase=ts')
```

> Here is that link again, live (see the console panel below it):
>
> [A countdown to the new year](./examples/ts/demo/countdown.ts 'showcase=ts')

See the rest in the example: [code block showcases importing the library](./examples/ts/README.md#durations) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md#durations)), [a virtual TypeScript file](./examples/ts/README.md#a-shared-helper) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md#a-shared-helper)) two showcases import, [relative times](./examples/ts/README.md#relative-times) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md#relative-times)), [rounding with an `enum`](./examples/ts/README.md#rounding) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md#rounding)), and [a `js` showcase](./examples/ts/README.md#from-javascript) ([live](https://ofzza.github.io/showroom/#/examples/ts/README.md#from-javascript)) importing TypeScript, each type checked with the example's own `tsconfig.json`.

What a `ts` showcase can import:

- relative paths, to real files and to virtual files anywhere in the host repository, as if the virtual files were on disk: without an extension, by a `.js` specifier naming a `.ts` file, or by a folder holding an `index` file;
- packages installed in the host repository's `node_modules`, and the host's own package by its name, through its `package.json`'s `exports` (so build it first, when they point at its `dist/`);
- what Vite handles out of the box: CSS, JSON and assets (e.g. images). A virtual CSS file must be imported from TypeScript or JavaScript (`import './demo.css'`), as a CSS `@import` only reaches real files. Any other virtual file is imported as a `data:` URL of its text, typed by its extension (e.g. `image/svg+xml` for an `svg` resource, which an `<img>` can show; `text/plain` for an unknown one).

Not supported for now: tsconfig `paths` aliases, and anything needing the host repository's own bundler configuration (e.g. SCSS without `sass` installed, environment variables). The host's PostCSS configuration is ignored; the settings Vite's TypeScript transform reads from the nearest `tsconfig.json` (e.g. `experimentalDecorators`, `useDefineForClassFields`) apply. There is no setup shared by a host repository's showcases: a showcase imports what it needs (global styles, polyfills) itself.

`showroom serve` builds showcases in development mode (unminified, with inline source maps), and `build` and `check --showcases` in production mode (minified); `process.env.NODE_ENV`, `import.meta.env.MODE`, `import.meta.env.DEV` and `import.meta.env.PROD` follow the mode, as do packages' `development` and `production` conditions. Its options are `typeCheck` and `allowJs`, both booleans (see [Type checking](#type-checking)). A `tsx` or `jsx` entry point is the [`react` showcase adapter](#react-showcases)'s.

#### Type checking

Unless its `typeCheck` option is `false` (`showcase=ts({ typeCheck: false })`), a `ts` showcase is type checked once it bundles, and its type errors fail it as build errors do (in `check --showcases` and `build`, and in the showcase frame `serve` shows), each at its file and line, as `TS<code>: <message>` (in a code block, at its line in the documentation file):

- **With the host repository's own TypeScript**, 5.x or 6.x, found as Node finds `typescript` from the documentation file's folder. `showroom check` reports an error where the showcases that type check find none, or one older than 5.0; TypeScript 7 and later aren't supported yet: their type checking is skipped, with a warning. TypeScript is loaded once per process: restart `showroom serve` after upgrading it.
- **With the nearest `tsconfig.json`**, from the documentation file's folder up to the host repository's root, applied whole, as `tsc -p` applies it (its `extends` followed, and its `files`, `include` and `exclude` in the program, so its declarations and globals apply to the showcase too; its `references` aren't built), with `noEmit`, and without the options that can't apply to a file outside the project: `rootDir`, `composite`, `incremental`, `tsBuildInfoFile`, `outDir`, `outFile`, `declaration`, `declarationMap`, `declarationDir`, `emitDeclarationOnly`, `isolatedDeclarations`, `sourceMap`, `inlineSourceMap`, `inlineSources`, `mapRoot` and `sourceRoot`. Its own errors (e.g. an unknown option) are reported in it. Without one, TypeScript's own defaults apply, as `tsc` without a tsconfig applies them: on TypeScript 5.x, whose defaults don't resolve packages' `exports`, add a `tsconfig.json`. A solution-style `tsconfig.json` (`files: []` with `references`) is used as it is: put a `tsconfig.json` with the right options next to the documentation, or turn `typeCheck` off.
- **Reporting the errors of every file the showcase reaches**: its entry point and, transitively, every file it imports or references (virtual files, the host's own files, its own package's declarations), except in `node_modules` and TypeScript's library files, with the errors of the compiler options. An error in a host file is reported by each showcase reaching it; host files no showcase reaches are left to the host's own checks. Host files are checked with the compiler options nearest the documentation, which may differ from the ones the host builds them with.
- **What Vite bundles and TypeScript doesn't know of** (CSS, assets, `?raw` imports, a virtual resource imported as a URL, `import.meta.env`) must be declared by the host repository, or type checking fails (e.g. TS2307, or TS2882 for a CSS import on TypeScript 6): add `/// <reference types="vite/client" />` to a `.d.ts` file the tsconfig includes, where `vite` is installed, or declarations of your own (e.g. `declare module '*.css';`), or turn `typeCheck` off.
- **Two differences from the bundle**: type checking follows the host's own module resolution (e.g. under `node16` or `nodenext`, an extensionless import, which Vite bundles, is an error, TS2835), and applies the documentation folder's tsconfig to every file, where Vite's transform looks one up per file.
- **JavaScript**: a `js` or `mjs` entry point is type checked with `allowJs`, so its TypeScript imports are checked (the entry point itself only with the tsconfig's `checkJs`). Importing a `.js` file without declarations is an error under `strict` (TS7016), as it is in the host's own code: the `allowJs` option (`showcase=ts({ allowJs: true })`) type checks that showcase with `allowJs`, leaving the tsconfig as it is.

### `react` showcases

A `react` showcase's entry point is a TSX or JSX module whose **default export is a component**, which `showroom` renders into the showcase frame root with the host repository's own React (`react-dom/client`'s `createRoot`), without `StrictMode`:

```tsx
import { useState } from 'react';

export default function Demo() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>;
}
```

It builds on the [`ts` showcase adapter](#ts-showcases): it is bundled the same way, can import the same things, runs on the same page (the showcase frame root above the console panel, which also shows React's warnings and render errors), and is [type checked](#type-checking) the same way, with the same options, `typeCheck` and `allowJs`. Beyond that:

- **React comes from the host repository**: `react` and `react-dom`, 18 or later, found as Node finds them from the documentation file's folder, which `showroom check` reports when missing or older; and where the showcases type check, React's types (`@types/react`, unless `react` ships its own). Each showcase frame bundles its own copy of React.
- **The default export** can be any component React renders: a function, a class, or what `memo()`, `forwardRef()` or `lazy()` return. A module without one fails the build, at the entry point; named exports are allowed, and ignored. A default export React can't render fails in the showcase frame, as React's own error in the console panel.
- **JSX always uses the automatic runtime** (no `import React` needed), whatever the tsconfig's `jsx` says; its `jsxImportSource` applies. Type checking uses `jsx: react-jsx` where the nearest tsconfig (or its absence) leaves `jsx` unset, and the tsconfig's own `jsx` otherwise. A `jsx` entry point is type checked with `allowJs`, as a `js` one is.
- **No setup shared by the showcases**: a showcase that needs providers (a theme, a router, a store), global styles or `StrictMode` wraps itself in them, in its own code.
- **The theme**: like any page in a showcase frame, a showcase reads the showroom's theme from `<html>`'s `data-showroom-theme` attribute and `color-scheme` (see [Showcase frames](#showcase-frames)); a hook can follow it with a `MutationObserver`, as the example's [`useShowroomTheme()`](./examples/react/src/useShowroomTheme.ts) does.

The [`react` example](./examples/react/README.md) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md)) documents `ticker`, a made-up React component library of a stopwatch, counters and a theme hook. Its first showcase is [`Stopwatch.tsx`](./examples/react/demo/Stopwatch.tsx), a module whose default export renders the library's stopwatch, linked as a showcase:

```md
[A stopwatch](./examples/react/demo/Stopwatch.tsx 'showcase=react')
```

> Here is that link again, live:
>
> [A stopwatch](./examples/react/demo/Stopwatch.tsx 'showcase=react')

See the rest in the example: [counters with props](./examples/react/README.md#counters) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#counters)) logging to the console panel, [following the theme](./examples/react/README.md#following-the-theme) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#following-the-theme)), [a virtual TSX file](./examples/react/README.md#a-shared-component) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#a-shared-component)) the [next showcase](./examples/react/README.md#composing) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#composing)) imports, [a memoized component](./examples/react/README.md#memoized-components) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#memoized-components)), and [a `jsx` showcase](./examples/react/README.md#from-jsx) ([live](https://ofzza.github.io/showroom/#/examples/react/README.md#from-jsx)), each type checked with the example's own `tsconfig.json`.

### Showcase frames

Each showcase is shown in its own iframe, a showcase frame, right before the block holding its entry point: before a code block showcase's code block, or before the paragraph (or heading, or table) holding a linked showcase's link. The code blocks and links stay as they are. A showcase frame is as wide as the text, and as high as its content, which `showroom` measures with a small script it adds to every showcase frame page: down to the bottom margin of `<body>`, or of its lowest element if that reaches further. Don't size a showcase to its viewport (`100vh`, or `height: 100%` on `html` and `body`): it would grow with its own iframe, which `showroom` stops after a few steps.

The showroom loads a showcase frame's page by a URL whose query carries a hash of the showcase frame's content (`index.html?hash=<hash>&theme=<theme>`), so a changed showcase frame gets a new URL, and a browser never shows a cached earlier page. Its other files keep their names: a static host may still serve a cached earlier version of one of them after a new build.

The showcase frame follows the showroom's light or dark theme: the script sets it as the `data-showroom-theme` attribute (`light` or `dark`) and the `color-scheme` of the page's `<html>`, from the first paint on, and whenever the theme changes. A showcase can follow it with `[data-showroom-theme='dark']` selectors, or with CSS's `light-dark()`:

````md
```html showcase
<style>
  .themed {
    font: 1.5em monospace;
    color: light-dark(#0f6cbd, #479ef5);
  }
  .themed b {
    font-weight: normal;
    color: light-dark(#242424, #ffffff);
    background: light-dark(#fde300, #8a3707);
  }
  .themed i {
    font-style: normal;
    color: light-dark(#c50f1f, #f1707b);
  }
</style>
<span class="themed">2<b>.</b><i>71828</i></span>
```
````

> Here is that block again, live (switch the showroom's theme to see it change):
>
> ```html showcase
> <style>
>   .themed {
>     font: 1.5em monospace;
>     color: light-dark(#0f6cbd, #479ef5);
>   }
>   .themed b {
>     font-weight: normal;
>     color: light-dark(#242424, #ffffff);
>     background: light-dark(#fde300, #8a3707);
>   }
>   .themed i {
>     font-style: normal;
>     color: light-dark(#c50f1f, #f1707b);
>   }
> </style>
> <span class="themed">2<b>.</b><i>71828</i></span>
> ```

## Custom showcase adapters (experimental)

> Experimental: the showcase adapter interface may change in any release until it is declared stable.

A host repository can bring its own showcase adapter: a JavaScript (ES) module whose default export is a function returning an object that implements the `ShowcaseAdapter` interface, listed in `showroom.json` under the name showcases use it by:

```json
{
  "stack": "typescript",
  "customShowcaseAdapters": { "my-frames": "./tools/my-frames.js" }
}
```

```md
[My widget](./src/widget.js 'showcase=my-frames({ "size": 2 })')
```

Names follow the marker's rules, and can't be a built-in showcase adapter's (or a planned one's: `angular`). Paths are relative to the host repository's root, inside it, to a `.js` or `.mjs` file. Every listed module is loaded by every `showroom check`, used or not, so each listed module runs the host repository's code; one that doesn't load, or doesn't implement the interface, is an error. Each module is loaded once per process, and once more whenever its content changes (in `serve`; the modules it imports are not loaded again), and its default export is called once per run (a `check`, then the showcases' build in `build`, `serve` or `check --showcases`; `serve` runs both again after every change), so every run gets a fresh showcase adapter object, closed at the end of that run.

```ts
import type { ShowcaseAdapter } from '@ofzza/showroom';

// Creates a showcase adapter object; called once per run
export default (): ShowcaseAdapter => ({
  // Checks one showcase statically, returning the options to use, or errors
  validate: (showcase) =>
    showcase.entry.endsWith('.js') ? { options: showcase.options ?? {}, errors: [] } : { errors: ['my-frames needs a .js entry point'] },
  // Optional: what the host repository is missing (errors), and warnings, checked once per run if any showcase uses the adapter
  check: async (root, showcases) => ({ errors: [], warnings: [] }),
  // Builds one showcase frame in memory: its page and assets, or build errors
  build: async ({ showcase }) => ({
    page: 'index.html',
    files: [
      { path: 'index.html', content: '<!doctype html><html><head><script type="module" src="widget.js"></script></head><body></body></html>' },
      { path: 'widget.js', content: `document.body.textContent = ${JSON.stringify(showcase.id)};` },
    ],
    reads: [showcase.entry],
  }),
  // Optional: cleans up at the end of a run
  close: async () => {},
});
```

- Every method gets the `Showcase` with its `display` (`inline` or `block`) and its `include`d files (paths relative to the root), which a custom showcase adapter may use as it sees fit (e.g. to copy them, as the `html` showcase adapter does).
- `validate(showcase)` gets the `Showcase` with its options as the marker gives them, and returns `{ options, errors: [] }` (the options as the adapter will use them) or `{ errors: [...] }`.
- `check?(root, showcases)` checks the host repository for what the adapter needs (e.g. a package installed), once per run when some showcase uses the adapter. It gets the `showcases` using the adapter whose validation passed, with their validated options, and returns a `ShowcaseHostCheck`: `{ errors, warnings }`, two lists of messages, either of them empty. Errors (the host requirements that are missing) fail the check, warnings don't; `showroom` prefixes both with the adapter's name. This is a breaking change: `check?()` used to return the list of errors alone; return it as `{ errors: <the list>, warnings: [] }`. Any other result, or a `check?()` that throws, is an error of the adapter.
- `build(request)` builds one showcase, called by `showroom build`, `showroom serve` and `showroom check --showcases`, one showcase at a time. It gets a `ShowcaseBuildRequest`: the host repository's absolute `root`, the `showcase`, its validated `options`, the `virtualFiles` of its documentation file's folder, resources and code block showcases' entry points told apart by their `kind` (in memory: they aren't on disk, so put them before your tooling yourself), every virtual file of the host repository as `hostVirtualFiles` (for imports reaching other folders), the `mode` to build in (`development` in `serve`, `production` in `build` and `check --showcases`), and an empty `scratchFolder` for tools that must write to disk, removed after the build. It returns a `ShowcaseBuildResult`, with the files it `reads` (paths relative to the root), and optionally `warnings` (shaped like errors, below; reported as warnings, failing nothing), either way:
  - the showcase frame: its `files`, each with a `path` relative to the showcase frame's folder (POSIX-style, with no `.`, `..` or empty segments, unique ignoring case) and its `content` (a string, or bytes as a `Uint8Array`), and the `page` among them (an `.html` or `.htm` file, UTF-8 if given as bytes). `showroom` adds its frame script to the page, and writes the files into the showcase frame's folder (`showcases/<documentation file's path>/<n>/` in the output folder), so relative references between them work;
  - or `errors`, each with a `message`, and the `path` (relative to the root) and `line` it concerns, if any. An error in a virtual file is reported in its documentation file, at its code block's line plus the error's; one without a path, at the showcase's entry point. A `build()` that throws, or returns anything else, fails the showcase too.
- `close?()` is called once at the end of a run, so an adapter can share work between its showcases.

The [`number-table` example](./examples/number-table/README.md) ([live](https://ofzza.github.io/showroom/#/examples/number-table/README.md)) is a custom showcase adapter of this repository's own, listed in its `showroom.json`: a JSON array of rows, shown as a table with its numbers formatted. Its first showcase is [`planets.json`](./examples/number-table/planets.json), linked as a showcase:

```md
[The planets](./examples/number-table/planets.json 'showcase=number-table({ caption: "The planets" })')
```

> Here is that link again, live:
>
> [The planets](./examples/number-table/planets.json 'showcase=number-table({ caption: "The planets" })')

See the rest in the example: [its options](./examples/number-table/README.md#options) ([live](https://ofzza.github.io/showroom/#/examples/number-table/README.md#options)), checked by `validate()`, its [errors and warnings](./examples/number-table/README.md#errors-and-warnings) ([live](https://ofzza.github.io/showroom/#/examples/number-table/README.md#errors-and-warnings)), and [the module](./examples/number-table/README.md#the-module) ([live](https://ofzza.github.io/showroom/#/examples/number-table/README.md#the-module)).

## Linked files

A file that a Markdown documentation file links to by a relative path, and that isn't a documentation file, is a **linked file**: a code file, an image, any other file in the host repository. Links to linked files work in the showroom, which copies each of them, and only them, never whole folders:

- a link to a linked file is marked with a "code" icon after its text;
- a text file up to 1 MB opens in a modal, its content syntax highlighted (by its extension, or its name when it has none, e.g. `Makefile`; plain text for a language highlight.js doesn't know) with line numbers and a copy button, as code blocks are, under its path, with a link opening the file in a new tab;
- any other file (a binary file, or a text file over 1 MB) opens in a new tab;
- a relative image (`![logo](./docs/logo.png)`) is shown from its linked file;
- a linked showcase's entry point is a linked file too: its link, below its showcase frame, opens its source in the modal;
- a showcase's included real files (`include=`) are linked files too, copied whether a link names them or not.

Whether a file is text is decided from its content (UTF-8 with no NUL byte), whatever its name. A link's fragment (e.g. `#L10`) is ignored. A linked file is copied even when the `ignore` patterns skip it (e.g. a file in `dist/`): the link states the intent, but a file missing where `showroom` runs (e.g. a build output not built in CI) is a broken link. It isn't copied when it is in the output folder, which `build` empties first, or when its real path leads outside the host repository through a symbolic link; `check` warns about both, and reports them as errors for an included file. A link to a folder with no `README` stays plain text.

`serve` and `build` hand out the linked files at `files/<path>`, next to the showroom's page: `build` copies them into the output folder, and `serve` answers only them there, from the host repository, so what you preview is what gets published.

## `showroom check`

Checks the host repository in the current directory (or the one `--root` names):

```sh
$ npx showroom check [--root <dir>] [--out-dir <dir>] [--showcases] [--quiet]
```

- Every issue found goes to `stderr`, one per line, as `error: <path>: <message>` or `warning: <path>: <message>`, with the line (`<path>:<line>:`) when the issue concerns one.
- If the check passes, the host information goes to `stdout`, as indented JSON, unless `--quiet` is given (e.g. in CI, where only the issues matter). If it fails, `stdout` stays empty.
- The exit code is `0` if the check passes, and `1` if it finds any error, or the arguments are wrong. Warnings alone don't fail it.

`--out-dir` overrides `showroom.json`'s `outDir`, relative to the current directory (as `--root` is); `check` takes it so it skips the same files `build` would.

`--showcases` also builds every showcase, as `showroom build` does, and throws the result away, once the rest of the check finds no errors. A showcase that doesn't build is an error, naming the showcase and its entry point (e.g. `error: README.md:16: Showcase README.md#2 (README.md:14): <message>`), placed where the build error is. A build's warnings are reported the same way, as warnings. Without it, `check` builds nothing, so it stays fast, and works without the host repository's dependencies installed; run `check --showcases` in CI to catch showcases that no longer build.

Errors are: a missing or invalid `showroom.json`, an unknown `stack`, project information that can't be read, a source root that doesn't exist or is outside the host repository, an output folder that is the host repository's root or outside it, a [broken showcase](#showcases), and a [custom showcase adapter](#custom-showcase-adapters-experimental) that doesn't load. Warnings are: several documentation files of the same kind in one folder, broken links and images, and [linked files](#linked-files) that aren't copied (in the output folder, or outside the host repository through a symbolic link). A link (or reference definition, or image) in a Markdown documentation file is broken when its relative target, URL-decoded and without its query and fragment, leads outside the host repository, or to nothing on disk; links to fragments only, and absolute URLs, are not checked.

The host information has this shape (types `HostInformation`, `ProjectInformation`, `DocumentationFile`, `Showcase`, `VirtualFile` and `LinkedFile`):

````json
{
  "project": { "name": "my-library", "version": "1.0.0" },
  "documentation": [{ "path": "README.md", "kind": "readme", "extension": ".md", "content": "# My library\n\n```html showcase\n<p>Hi</p>\n```\n" }],
  "code": ["src/index.ts"],
  "showcases": [
    {
      "id": "README.md#1",
      "documentation": "README.md",
      "line": 3,
      "offset": 14,
      "kind": "code-block",
      "display": "block",
      "adapter": "html",
      "entry": "README.showcase-1.html",
      "include": []
    }
  ],
  "virtualFiles": [{ "path": "README.showcase-1.html", "kind": "entry", "content": "<p>Hi</p>", "documentation": "README.md", "line": 3 }],
  "linkedFiles": [{ "path": "src/index.ts", "size": 1024, "text": true }]
}
````

Documentation files have a `kind` of `readme`, `contribute`, `license`, or `other` for the files the `documentation` patterns add. A showcase has an `id` (its documentation file and its position there), the `line` and character `offset` of its entry point (the code block, or the link), its `kind` (`code-block` or `link`), how it is shown (`display`: `block`, or `inline` for a linked showcase without the `block` key), its showcase `adapter`, its `options` as the showcase adapter validated them (left out when there are none), the path of its `entry` point (a virtual file, or the linked file), and the paths of its included files (`include`, in the marker's order; empty when it has none). A virtual file has its `path`, its `kind` (`resource`, or `entry` for a code block showcase's entry point), its `content`, and the `documentation` file and `line` of its code block. A linked file has its `path`, its `size` in bytes, and whether it is `text` (UTF-8 with no NUL byte, and no larger than 1 MB, so the showroom shows it in the modal). Paths are POSIX-style and relative to the host repository's root. Documentation files and linked files are sorted by path, showcases and virtual files by documentation file and line.

## `showroom serve`

Serves the showroom of the host repository in the current directory (or the one `--root` names), for previewing it while writing its documentation:

```sh
$ npx showroom serve [--root <dir>] [--port <port>] [--out-dir <dir>]
```

- It checks the host repository first, as `showroom check` does. If the check fails, it writes the issues to `stderr` and exits with `1` without serving.
- It then builds every showcase, in development mode, and writes the check's issues and the showcases' build errors and warnings to `stderr`. A showcase that doesn't build doesn't stop it: its showcase frame shows its build errors instead (with each error's file and line), and every other showcase is shown as usual.
- It then serves the showroom with Vite's dev server on `--port` (default: `5173`, or the next free port), writing its URL to `stdout`, until you stop it with Ctrl+C. The showcase frames are served from memory, and the [linked files](#linked-files) from the host repository, at the same paths `build` writes them to; nothing is written into the host repository.
- It watches the host repository, skipping the files the `ignore` patterns skip, and the output folder (`--out-dir`, as for `check`). After any change it checks the host repository again and, when the check passes, builds every showcase again. It reloads the page when the project information or a documentation file changed, a showcase was added, removed or moved, or a linked file was added or removed, or changed its size; when only showcase frames changed (e.g. a linked showcase's page, or another file a build reads), only their iframes reload, and the page stays where it is. A code block showcase's code and a resource are part of their documentation file, which the page shows too, so editing them reloads the page. A failed check keeps showing the last good data. Changes to `showroom.json` apply without a restart, custom showcase adapters included.
- The current issues (the check's errors and warnings, and the showcases' build errors and warnings) are shown in a bar at the top of the page, which you can collapse, and are written to `stderr` whenever they change. The bar is gone once there are none.
- A changed [custom showcase adapter](#custom-showcase-adapters-experimental) module is loaded again, but the modules it imports aren't: restart `serve` after changing them.
- Files the `ignore` patterns skip (e.g. under `dist/`) aren't watched, except the files the latest showcase builds read (e.g. the host's own package's `dist/`, which a `ts` showcase imports by the package's name), the custom showcase adapter modules, and the linked files: a change to one checks and builds again, as any change does, so `tsc --watch` running alongside `serve` updates the showcases. While a showcase doesn't build, the files earlier builds read stay watched too, so it recovers once they're back (e.g. after `dist/` is deleted and built again). They never become documentation or code files, and files under `node_modules` or `.git` are never watched.

The showroom has a page per documentation file, its address in the URL's hash (e.g. `#/docs/guide.md`), and a home page with the project information and the root `README` (when the `README` opens with a level-1 heading, that heading is the home page's title, and the project information follows it). The navigation lists `README` (the home page), `CONTRIBUTING` and `LICENSE` first, whatever the root files' actual names (e.g. `CONTRIBUTE.md`, `LICENCE.txt`), then every other documentation file by its path. `.md` files are rendered as GitHub-flavoured Markdown, with syntax-highlighted code blocks and the same heading ids as on GitHub; other documentation files are shown as plain text. The navigation stays in view as a page scrolls; on a narrow (phone) viewport, below 768 px, it opens from the header's menu button instead. In Markdown:

- every code block is syntax highlighted with line numbers (which are never copied with the code), whatever its length, and has a copy button (shown only where the browser allows writing to the clipboard: over HTTPS, or on `localhost`);
- relative links to documentation files (or to folders whose `README` is one) open their page; relative links to [linked files](#linked-files), marked with a "code" icon, open them in the modal, or in a new tab; other relative links (e.g. to a folder with no `README`, or a missing file) are shown as plain text;
- relative images are shown from their linked files, or as their alt text when they're missing; absolute image URLs work;
- raw HTML tags are left out, keeping the Markdown between them.

Each run keeps Vite's cache in a fresh folder in the system's temporary folder, and removes it on exit; starting takes a few seconds while Vite prepares the dependencies.

## `showroom build`

Builds the showroom of the host repository in the current directory (or the one `--root` names) into its output folder, as static files:

```sh
$ npx showroom build [--root <dir>] [--out-dir <dir>]
```

- It checks the host repository first, as `showroom check` does, writing the issues to `stderr`. If the check fails, it exits with `1` without building.
- It then builds every showcase. If any doesn't build, it writes every build error to `stderr` (as `check --showcases` does), and exits with `1`, leaving the output folder untouched. The builds' warnings are written to `stderr` too, and don't fail it.
- The output folder is `outDir` from `showroom.json` (default: `./showroom`), or `--out-dir`, relative to the current directory. It must be inside the host repository, and can't be its root.
- **The output folder is emptied before every build.** To keep a mistyped `outDir` from deleting your files, every build writes a `.showroom` marker file into it, and `build` refuses (exiting with `1`) to empty a folder that holds anything but a `.showroom` file from an earlier build. A missing or empty folder is fine.
- It writes the output folder's path to `stdout` once built, and exits with `0`. Warnings from the check don't fail it.

The output is an `index.html`, its `assets/`, the showcase frames in `showcases/` (one folder per showcase, `showcases/<documentation file's path>/<n>/`), the [linked files](#linked-files) in `files/` (each at `files/<path>`) and the `.showroom` marker, with relative paths throughout, so it works wherever it's hosted, under any path (e.g. GitHub Pages' `https://<user>.github.io/<repo>/`). Pages are addressed in the URL's hash, so the host needs no rewrite rules. It needs to be served over HTTP: browsers won't run it from `file://`. Add the output folder to your `.gitignore`, unless you mean to commit it.

## Publishing to GitHub Pages

`showroom` only builds; publishing is up to the host repository. With `showroom` in its `devDependencies`, a GitHub Actions workflow like this one (e.g. `.github/workflows/showroom.yml`) builds and publishes the showroom on every push to `master`, once the repository's Settings › Pages › Source is set to "GitHub Actions":

```yaml
name: Showroom

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx showroom build
      - uses: actions/upload-pages-artifact@v5
        with:
          path: showroom
      - id: deployment
        uses: actions/deploy-pages@v5
```

Publishing this way skips Jekyll, so no `.nojekyll` file is needed. If you configured another `outDir`, change the artifact's `path` to match. Without `showroom` in `devDependencies`, run `npx --yes @ofzza/showroom build` instead of `npx showroom build`.

## API

Everything the command line does is also exported, except serving and building, which are only available through the command line and `main()`:

```ts
import { check, readConfiguration, getStackAdapter, getStackAdapterNames, type CheckResult } from '@ofzza/showroom';

// Checks a host repository, and collects its host information if the check passes
const result: CheckResult = await check('./path/to/host');
// The output folder can be overridden, as with --out-dir; showcases: true also builds every showcase, as with --showcases
await check('./path/to/host', { outDir: './path/to/host/site', showcases: true });
if (result.passed) {
  console.log(result.host?.code);
}
for (const issue of result.issues) {
  console.error(issue.severity, issue.path, issue.line, issue.message);
}
for (const showcase of result.host?.showcases ?? []) {
  console.log(showcase.id, showcase.adapter, showcase.entry);
}

// Reads and validates a host repository's showroom.json
const { configuration, errors } = await readConfiguration('./path/to/host');

// Looks up a built-in stack adapter by name
const adapter = getStackAdapter(configuration?.stack ?? 'typescript');
const project = await adapter?.readProject('./path/to/host');
console.log(getStackAdapterNames(), project, errors);
```

- `check(root, options?)`: checks a host repository and collects its host information; resolves to a `CheckResult` (`passed`, `host` when it passed, and `issues`, each with its `severity`, `message`, and the `path` and `line` it concerns, if any). `options` (`CheckOptions`) overrides the configuration: `outDir`, absolute or relative to the current directory; and `showcases: true` also builds every showcase, failing the check on any that doesn't build.
- `readConfiguration(root)` / `validateConfiguration(value)`: read and validate a `showroom.json`, resolving to either a `configuration` or `errors`.
- `getStackAdapter(name)` / `getStackAdapterNames()`: look up the built-in stack adapters, which implement the `StackAdapter` interface; `TypeScriptStackAdapter` is the `typescript` one.
- `main(args, output?)`: runs the command line with the given arguments, resolving to its exit code; `USAGE` is its help text.
- Constants: `CONFIGURATION_FILE_NAME` (`showroom.json`), `DEFAULT_OUT_DIR` (`./showroom`), and `BUILT_IN_DOCUMENTATION` (the built-in documentation patterns).
- Types: `HostInformation`, `ProjectInformation`, `DocumentationFile`, `DocumentationKind`, `Showcase`, `ShowcaseKind`, `ShowcaseDisplay`, `VirtualFile`, `VirtualFileKind`, `LinkedFile`, `Configuration`, `ConfigurationResult`, `StackAdapter`, `CheckOptions`, `CheckResult`, `CheckIssue`, `CheckIssueSeverity` and `CliOutput`.
- Experimental types, for [custom showcase adapters](#custom-showcase-adapters-experimental): `ShowcaseAdapter`, `ShowcaseValidation`, `ShowcaseHostCheck`, `ShowcaseBuildRequest`, `ShowcaseBuildResult`, `ShowcaseBuildFile` and `ShowcaseBuildError`.

# Development

- `npm run build` - cleans `dist/` (`npm run clean`), then compiles `src/` into it, emitting declarations, and copies the showroom's `src/app/index.html` to `dist/app/` (`npm run copy-app`). Also run on `prepare`, so a local `npm install` builds too.
- `npm run dev` - the same, in watch mode (restart it after changing `src/app/index.html`).
- `npm start` - runs the built command line, `dist/cli/bin.js`; pass it arguments after `--`, e.g. `npm start -- check --root test/fixtures/minimal`. Try `build` on a copy of a host repository (never on a fixture in `test/fixtures/`, which tests rely on), and serve its output folder over HTTP to look at it. To preview the showroom while working on it, serve a host repository with `npm start -- serve --root <host>` while `npm run dev` recompiles `src/app/` into `dist/app/`, and reload the page after a change. `npm run build` empties `dist/` first, so restart `serve` after it.
- `npm test` - runs every `test:*` script.
  - `npm run test:unit` - a single Vitest invocation that executes test files (`*.test.ts(x)`), runs their runtime expectations, and type checks them, reporting type errors as test failures. Tests run against the fixture host repositories in `test/fixtures/`; the showroom's tests render it to HTML with `react-dom/server`.
  - `npm run test:integration` - real showcase adapter builds (`*.integration.test.ts`), on the fixture host repositories. A fixture on another React than `showroom`'s own (`test/fixtures/showcase-react-18/`) carries a lockfile, and is installed with `npm ci` once per lockfile into `node_modules/.cache/showroom-tests/installs/` (by `test:integration` and `test:e2e`), so their first run needs the npm registry.
  - `npm run test:e2e` - the command line, and `build()` with Vite's build of the showroom, on copies of the fixture host repositories (`*.e2e.test.ts`). It first compiles `src/` once into a scratch folder, so it never depends on, or writes to, `dist/`. Tests copy fixtures, and create scratch folders, only inside `node_modules/.cache/showroom-tests/`, and remove them afterwards. The integration, end-to-end and dev server tests also see a temporary folder of their own there as the system's temporary folder (`TMPDIR`, `TMP`, `TEMP`).
  - `npm run test:serve` - the dev server (`*.serve.test.ts`): `serve()` on copies of the fixture host repositories, on a free port, fetching the showroom, its showcase frames and their files, with the showroom compiled as for `test:e2e`. Updates after a change are only unit-tested, as the dev server doesn't watch the copies (they are under `node_modules/`).
- `npm run ci` - runs every `ci:*` script: build, ESLint, Prettier, the tests, and `showroom check --showcases --quiet` on this repository itself, with the command line just built (`ci:showroom`). This is what GitHub Actions runs on every pull request targeting, and every push to, `master` or `develop`, against Node 22 and 24. It also runs on `prepublishOnly`, so `npm publish` refuses to publish a failing build.

# Contributing

For reporting issues, contribution workflow and branching, see [CONTRIBUTE.md](./CONTRIBUTE.md).
For releasing a version, see [PUBLISH.md](./PUBLISH.md).

MIT - see [LICENSE.md](./LICENSE.md).
