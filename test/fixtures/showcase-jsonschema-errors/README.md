# JSON Schema showcase errors host

A syntax error, on the schema's third line:

```json showcase=jsonschema
{
  "type": "object",
  "properties": { "a": { "type": "string" }, }
}
```

A comment, which strict JSON doesn't allow:

```json showcase=jsonschema
{
  // A comment
  "type": "object"
}
```

A linked schema with a syntax error on its fifth line: [broken](./schemas/broken.schema.json 'showcase=jsonschema')

An array, not a schema:

```json showcase=jsonschema
[{ "type": "string" }]
```

A boolean schema:

```json showcase=jsonschema
true
```

Definitions without `$defs`:

```json showcase=jsonschema
{ "definitions": { "Old": { "type": "object", "properties": { "a": { "type": "string" } } } } }
```

References that can't be resolved, of every reason:

```json showcase=jsonschema
{
  "title": "Unresolved",
  "type": "object",
  "properties": {
    "other": { "$ref": "other.schema.json#/$defs/Thing" },
    "virtual": { "$ref": "./README.showcase-1.json" },
    "legacy": { "$ref": "#/definitions/Old" },
    "missing": { "$ref": "#/$defs/Missing" },
    "self": { "$ref": "#" },
    "escaped": { "$ref": "#/$defs/A~1B" },
    "found": { "$ref": "#/$defs/Found" },
    "data": { "const": { "$ref": "#/$defs/NotAReference" } }
  },
  "$defs": { "Found": { "type": "string" }, "A/B": { "type": "string" } }
}
```

Properties without `type: "object"`, in the root and a definition (not in an `allOf`'s member):

```json showcase=jsonschema
{
  "title": "Untyped",
  "properties": { "a": { "type": "string" } },
  "$defs": {
    "Loose": { "properties": { "b": { "type": "string" } } },
    "Member": { "allOf": [{ "properties": { "c": { "type": "string" } } }] }
  }
}
```

An empty diagram:

```json showcase=jsonschema
{}
```

A diagram over Mermaid's limits: [big](./schemas/big.schema.json 'showcase=jsonschema')
