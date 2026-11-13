# `number-table`

> A custom showcase adapter, and the custom showcase adapter example: this is how a host repository can bring its own showcase adapter to `showroom`. See [`README.md` › Custom showcase adapters](../../README.md#custom-showcase-adapters-experimental) for the interface it implements, which is experimental.

`number-table` shows a JSON array of rows as a table, its numbers right-aligned, with tabular figures, and formatted for a language. It is a single JavaScript module, [`number-table.js`](./number-table.js), with no dependencies, which this repository lists in its own `showroom.json`:

```json
{
  "customShowcaseAdapters": { "number-table": "./examples/number-table/number-table.js" }
}
```

Every `showroom check` of this repository loads it, and its showcases name it in their marker, `showcase=number-table`.

## Planets

A linked showcase: [`planets.json`](./planets.json), a real file, with a caption.

[The planets](./planets.json 'showcase=number-table({ caption: "The planets" })')

## Options

| Option    | Type       | Default                                        | What it does                          |
| --------- | ---------- | ---------------------------------------------- | ------------------------------------- |
| `columns` | `string[]` | every key of the rows, in the order first seen | which columns to show, in order       |
| `caption` | `string`   | none                                           | a caption above the table             |
| `locale`  | `string`   | `en`                                           | the language numbers are formatted in |

`validate()` rejects any other option, or one of the wrong type, and an entry point that isn't JSON, so `showroom check` reports them without building anything. A code block showcase, choosing its columns and formatting in German:

```json showcase=number-table({ columns: ["city", "population", "area (km²)"], locale: "de" })
[
  { "city": "Tokyo", "country": "Japan", "population": 37115000, "area (km²)": 2194.07 },
  { "city": "Delhi", "country": "India", "population": 33807000, "area (km²)": 1484 },
  { "city": "Shanghai", "country": "China", "population": 29868000, "area (km²)": 6340.5 },
  { "city": "Zagreb", "country": "Croatia", "population": 767131, "area (km²)": 641.4 }
]
```

## Errors and warnings

`build()` returns errors, failing the showcase, or warnings, failing nothing. They can't be shown live here, as this repository's own check must pass without any. This block, with an unquoted property name:

````md
```json showcase=number-table
[{ "planet": "Mercury", "moons": 0 }]
```
````

fails, with the error at its line in the documentation file (here, the block's fence at line 3 of a `README.md`):

```text
error: README.md:5: Showcase README.md#1 (README.md:3): Invalid JSON: Expected property name or '}' in JSON at position 6 (line 2 column 5)
```

and a number column holding something else, `{ "planet": "Jupiter", "moons": "many" }`, is a warning:

```text
warning: README.md:9: Showcase README.md#2 (README.md:9): Row 2's "moons" is not a number: "many"
```

## The module

[`number-table.js`](./number-table.js) is plain JavaScript, typed with JSDoc against `showroom`'s exported types. In short:

```js
/** @import { ShowcaseAdapter } from '@ofzza/showroom' */

/** @returns {ShowcaseAdapter} */
export default () => ({
  // Checks the options and the entry point's extension, before anything is built
  validate: (showcase) => ({ options: showcase.options ?? {}, errors: [] }),
  // Reads the JSON (from the virtual files, or from disk), and returns the page and its stylesheet
  build: async ({ root, showcase, options, virtualFiles }) => ({
    page: 'index.html',
    files: [
      { path: 'index.html', content: '<!doctype html>…' },
      { path: 'table.css', content: 'table { … }' },
    ],
    reads: [showcase.entry],
    warnings: [],
  }),
});
```

It has no `check()`, as it needs nothing from the host repository, and no `close()`, as it keeps nothing between builds.
