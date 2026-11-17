# _`P21`_ The `jsonschema` showcase adapter

draft

_`S17`_ (SPEC-S17-json-schema.md): the built-in `jsonschema` showcase adapter, showing a JSON Schema's definitions, and how they reference one another, as a Mermaid class diagram in the showcase frame.

## Evidence

Spike 2026-11-17 (_`O130`_ (SPEC-S17-json-schema.md); `./.workflow/.temp/spike-jsonschema/`, its `NOTES.md`): Mermaid 12.3.0 and `@ofzza/tsschema@0.1.0-alpha.7`, a mapper written in Node, and a page drawing its source; on a realistic schema (16 definitions and a root model) and a schema of awkward names.

- **`reflect()` on arbitrary JSON** (_`K30`_ (SPEC-pitfalls.md)): it never throws; a string, a number, `null`, an array, `true`, `false`, `{}` and a schema with `definitions` only all reflect as `unknown`, with no definitions. Unresolvable `$ref`s (`#/$defs/Missing`, into another file, `#/definitions/D`) are `unknown`, without their `$ref` (as _`D821`_ (SPEC-S17-json-schema.md) assumed). `__proto__` and `toString` as definition names are listed by `definitionNames`. The `Type` getter throws. `properties` without `type: "object"` is `unknown` (_`L19`_ (PLAN.md)). A reference carries its target's `name`, so a walk by name never recurses. `allOf: [$ref, model]` gives `allOf` with `reference` and `model` members; a nullable `oneOf: [$ref, null]` gives `oneOf`, `nullable`, with `reference` and `null` members; an enum carries `values` and `names`. `additionalProperties` alone gives a `record` whose values are `unknown` (even a `$ref`), and beside `properties` is dropped; a tuple's `prefixItems` gives an `array` of `unknown` (_`L18`_ (PLAN.md) holds: no edge).
- **The mapping** (_`D823`_, _`D830`_, _`D831`_ (SPEC-S17-json-schema.md)): generated node ids and one escaper encoding Mermaid's special characters as `#<code>;` (the ASCII punctuation the spike's `map.mjs` lists, the underscore and the backtick among them) render every awkward name and text as written, with no markup in the drawing. The underscore must be among them: Mermaid reads a label's `__x__` as Markdown bold (the definition `__proto__` showed as a bold `proto`).
- **What a showcase frame loads** (_`K29`_ (SPEC-pitfalls.md), _`O133`_, _`O136`_ (SPEC-S17-json-schema.md)): `mermaid` 12.3 still depends on `elkjs`, and its default `layout` is `"elk"`, so a class diagram loads elkjs's 1.6 MB chunk unless the page sets `layout: 'dagre'`. Mermaid's own ESM build (`mermaid.esm.min.mjs` and its `chunks/`, without source maps) is 5.5 MB in 210 files, every diagram type, elkjs's chunk included; a class diagram with `dagre` loads 28 of them, 871 kB. A Vite bundle of `mermaid` (`mermaid.core.mjs`, whose dependencies are bare imports) with `elkjs` aliased to a stub module is 3.8 MB (5.2 MB without the stub), holds no elkjs code, and loads 22 files for a class diagram, 782 kB (206 kB gzipped); it needs Vite's `base: './'`, or its preload links point at the server's root. At several MB per copy, Mermaid can't be copied into every showcase frame: one bundle shared by every showcase frame.
- **The page**: the Mermaid source travels as a JSON data element (`<` written as `<`) and is drawn with `mermaid.render()`, `maxTextSize`, `maxEdges` and `layout` set in `initialize()`; redrawing on a theme change (a `MutationObserver` on an attribute, a fresh render id each time) leaves one drawing. The realistic schema draws in about 0.5 s, 1237 × 1385 px at its natural size.
- **Readability** (_`K31`_ (SPEC-pitfalls.md)): the user found the realistic schema's diagram readable, with the changes of _`D831`_ (SPEC-S17-json-schema.md): no multiplicities, a referencing property marked `→` in its node, fitted to the frame's width, a light palette of `showroom`'s own on Mermaid's `base` theme.

## Decisions

None yet.

## Open points

- [ ] _`O140`_ From _`O130`_'s spike. `tsschema` describes `additionalProperties` alone as a `record` (values `unknown`), not as `unknown`: its type text (e.g. `Record of unknown`, or `object`), and whether _`L18`_ (PLAN.md)'s wording needs narrowing.
- Taken from _`S17`_ (SPEC-S17-json-schema.md): _`O131`_–_`O139`_ (_`O130`_ resolved by the spike above).
