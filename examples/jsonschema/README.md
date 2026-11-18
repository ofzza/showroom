# `headway`

> The made-up data models of a city transport timetable, and the `jsonschema` showcase adapter's example: this is how a host repository could document its JSON Schemas with `showroom`, each drawn as a diagram of its definitions and how they reference one another. See [`README.md` › `jsonschema` showcases](../../README.md#jsonschema-showcases) for what a `jsonschema` showcase shows.
>
> This example is part of this repository's own showroom: see its diagrams in [the published showroom](https://ofzza.github.io/showroom/#/examples/jsonschema/README.md), or preview it from a clone of this repository with `npm ci`, then `npm start -- serve`, at its root. Read anywhere else (e.g. on GitHub), each showcase is only its code block or its link.

`headway` describes when things leave: stations and their platforms, lines and their stops, and schedules, either every few minutes or at fixed times of day.

## The timetable

A linked showcase, shown as a block: [`timetable.schema.json`](./timetable.schema.json), the whole timetable, its schema a click away. Each definition of its `$defs` is a node, and its root, a model, is the node marked `«root»`. `Station` and `Line` inherit `Identified`'s `id` (an `allOf` holding a reference), a property referencing another definition starts with `→` and points to it, and `Schedule`, a `oneOf`, points to each of its choices.

[The timetable](./timetable.schema.json 'showcase=jsonschema block include=markdown')

## A departure board

A code block showcase whose root is a model, named by its `title`: a departure's line, its platform and its delay, each a definition of its own. An enum shows its values, and an alias (a definition that is only a `$ref`) points to what it names.

```json showcase=jsonschema include=markdown
{
  "title": "DepartureBoard",
  "type": "object",
  "required": ["station", "departures"],
  "properties": {
    "station": { "type": "string" },
    "updated": { "type": "string", "format": "date-time" },
    "departures": { "type": "array", "items": { "$ref": "#/$defs/Departure" } }
  },
  "$defs": {
    "Departure": {
      "type": "object",
      "required": ["line", "time", "status"],
      "properties": {
        "line": { "$ref": "#/$defs/LineCode" },
        "destination": { "type": "string" },
        "time": { "type": "string", "pattern": "^[0-2][0-9]:[0-5][0-9]$" },
        "platform": { "oneOf": [{ "$ref": "#/$defs/Platform" }, { "type": "null" }] },
        "status": { "$ref": "#/$defs/Status" }
      }
    },
    "LineCode": { "type": "string", "pattern": "^[A-Z][0-9]+$" },
    "Platform": {
      "type": "object",
      "required": ["number"],
      "properties": { "number": { "type": "integer", "minimum": 1 }, "side": { "enum": ["left", "right"] } }
    },
    "Status": { "enum": ["on time", "delayed", "cancelled"] },
    "Delay": { "$ref": "#/$defs/Status" }
  }
}
```

## Fares

A named showcase, `showcase=jsonschema file=fares.json`: its root has no `title`, so its node is named after the showcase, `fares`. A zone's prices are a record, shown as `Record<string, …>`.

```json showcase=jsonschema file=fares.json include=markdown
{
  "type": "object",
  "required": ["zones"],
  "properties": {
    "currency": { "type": "string", "minLength": 3, "maxLength": 3 },
    "zones": { "type": "array", "items": { "$ref": "#/$defs/Zone" }, "minItems": 1 }
  },
  "$defs": {
    "Zone": {
      "type": "object",
      "required": ["name", "prices"],
      "properties": { "name": { "type": "string" }, "prices": { "type": "object", "additionalProperties": { "type": "number" } } }
    }
  }
}
```

## A trip

A schema whose root is only a `$ref` beside its `$defs`: the definition it names, `Trip`, is the node marked `«root»`. A `Trip` is a list of legs, each walking or riding, an `anyOf` of the two.

```json showcase=jsonschema include=markdown
{
  "$ref": "#/$defs/Trip",
  "$defs": {
    "Trip": { "type": "object", "required": ["legs"], "properties": { "legs": { "type": "array", "items": { "$ref": "#/$defs/Leg" }, "minItems": 1 } } },
    "Leg": { "anyOf": [{ "$ref": "#/$defs/Walk" }, { "$ref": "#/$defs/Ride" }] },
    "Walk": { "type": "object", "required": ["minutes"], "properties": { "minutes": { "type": "integer" } } },
    "Ride": { "type": "object", "required": ["line", "stops"], "properties": { "line": { "type": "string" }, "stops": { "type": "integer" } } }
  }
}
```

## A clock, with its schema

`view=demo,source` shows the schema below its diagram, highlighted as JSON: `showcase=jsonschema include=markdown view=demo,source`.

```json showcase=jsonschema include=markdown view=demo,source
{
  "title": "Clock",
  "type": "object",
  "required": ["hours", "minutes"],
  "properties": {
    "hours": { "type": "integer", "minimum": 0, "maximum": 23 },
    "minutes": { "type": "integer", "minimum": 0, "maximum": 59 },
    "zone": { "type": ["string", "null"] }
  }
}
```

## What isn't shown yet

A `jsonschema` showcase reads its schema with [`@ofzza/tsschema`](https://www.npmjs.com/package/@ofzza/tsschema), and shows what it reads; what it doesn't read yet is warned of when the showroom is built (see [`README.md` › `jsonschema` showcases](../../README.md#jsonschema-showcases)). This repository's own check must pass without warnings, so this example only describes them:

- a schema with `definitions` and no `$defs` (draft-04 to draft-07) shows no definitions;
- a `$ref` into another file (e.g. `"$ref": "stations.schema.json#/$defs/Station"`) shows as `unknown`, as does a `$ref` inside the file that isn't a definition of its own `$defs` (e.g. `#/definitions/Station`);
- `properties` without `"type": "object"` aren't read as a model, so a definition or root written so shows none of its properties;
- a record's values (`additionalProperties`) show as `unknown`, and a tuple (`prefixItems`) as an array of `unknown`.
