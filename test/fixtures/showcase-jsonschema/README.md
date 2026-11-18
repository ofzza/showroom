# JSON Schema showcases host

A linked schema, shown as a block:

[The timetable](./schemas/timetable.schema.json 'showcase=jsonschema block include=markdown')

A root model, with every kind of definition and reference:

```json showcase=jsonschema
{
  "title": "Kinds",
  "type": "object",
  "required": ["model"],
  "properties": {
    "model": { "$ref": "#/$defs/Model" },
    "nullable": { "oneOf": [{ "$ref": "#/$defs/Model" }, { "type": "null" }] },
    "list": { "type": "array", "items": { "$ref": "#/$defs/Model" } },
    "grid": { "type": "array", "items": { "type": "array", "items": { "$ref": "#/$defs/Colour" } } },
    "either": { "anyOf": [{ "$ref": "#/$defs/Model" }, { "$ref": "#/$defs/Alias" }] },
    "inline": { "type": "object", "properties": { "a": { "type": "string" } } },
    "choice": { "enum": ["x", "y"] },
    "map": { "type": "object", "additionalProperties": { "$ref": "#/$defs/Model" } },
    "maybe": { "type": ["string", "null"] }
  },
  "$defs": {
    "Model": { "type": "object", "required": ["id"], "properties": { "id": { "type": "string", "format": "uuid" }, "parent": { "$ref": "#/$defs/Model" } } },
    "Colour": { "enum": ["red", "green", null] },
    "Alias": { "$ref": "#/$defs/Model" },
    "Derived": { "allOf": [{ "$ref": "#/$defs/Model" }, { "type": "object", "properties": { "extra": { "type": "integer" } } }] },
    "Union": { "oneOf": [{ "$ref": "#/$defs/Model" }, { "$ref": "#/$defs/Derived" }, { "type": "string" }] },
    "Code": { "type": "string", "pattern": "^[A-Z]+$" },
    "Fixed": { "const": 42 }
  }
}
```

A root that only references a definition:

```json showcase=jsonschema
{ "$ref": "#/$defs/Entry", "$defs": { "Entry": { "type": "object", "properties": { "name": { "type": "string" } } } } }
```

A root of definitions only:

```json showcase=jsonschema
{ "$defs": { "Only": { "type": "object", "properties": { "flag": { "type": "boolean" } } } } }
```

A named showcase, its root named after it:

```json showcase=jsonschema file=named.json
{ "type": "object", "properties": { "value": { "type": "number" } } }
```

Awkward names, shown as they are written:

```json showcase=jsonschema view=demo,source
{
  "title": "Awk}ward\nroot",
  "type": "object",
  "properties": {
    "-lead": { "type": "string" },
    "#hash": { "$ref": "#/$defs/List~T~" },
    "a(b)": { "type": "string" },
    "q\"uote": { "type": "string" },
    "$$": { "type": "string" }
  },
  "$defs": {
    "List~T~": { "type": "object", "properties": { "</script>": { "enum": ["}", "a\nb", "%%{init}%%"] } } },
    "__proto__": { "type": "string" },
    "toString": { "type": "object", "properties": { "x": { "$ref": "#/$defs/toString" } } }
  }
}
```
