/**
 * The `jsonschema` showcase adapter: its entry point is a JSON Schema (a `json` code block, or a linked `.json` file), read with `@ofzza/tsschema`'s
 * reflection and written, in Node, as the source of a Mermaid class diagram of its definitions and how they reference one another; its showcase
 * frame's page only draws that source with the shared Mermaid bundle, following the showroom's theme. It takes no options, needs nothing from the
 * host repository, and runs nothing of it. Internal, never re-exported.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reflect } from '@ofzza/tsschema';
import type { TSSchemaModelPropertyDescriptor, TSSchemaTypeDescriptor } from '@ofzza/tsschema';
import type { Showcase, ShowcaseView } from '../../../host/index.js';
import { THEME_ATTRIBUTE } from '../../../frame/index.js';
import type { ShowcaseAdapter, ShowcaseBuildIssue, ShowcaseBuildRequest, ShowcaseBuildResult, ShowcaseValidation } from '../index.js';

// #region Constants

/**
 * Path of the page the jsonschema showcase adapter builds, in its showcase frame's folder
 */
export const JSONSCHEMA_PAGE = 'index.html';

/**
 * Module specifier the page imports the shared Mermaid bundle by, which the import map `showroom` inserts into the page resolves (the same as
 * `src/showcases/`'s MERMAID_SPECIFIER, which this module can't import, as `src/showcases/` imports the registry)
 */
export const JSONSCHEMA_MERMAID_SPECIFIER = 'showroom-mermaid';

/**
 * Mermaid's own limit on a diagram's source, in characters (its `maxTextSize`, set by the page): a longer source is a build error
 */
export const MERMAID_MAX_TEXT_SIZE = 50000;

/**
 * Mermaid's own limit on a diagram's edges (its `maxEdges`, set by the page): more edges are a build error
 */
export const MERMAID_MAX_EDGES = 500;

/**
 * Longest display text written into the diagram, in characters, before it is cut (ending in `…`)
 */
export const MAX_DISPLAY_TEXT_LENGTH = 120;

/**
 * Mermaid's theme variables for the light theme, on its `base` theme: a white background, light grey nodes, dark grey lines, the system font
 */
export const LIGHT_THEME_VARIABLES: Readonly<Record<string, string>> = {
  background: '#ffffff',
  primaryColor: '#f5f5f5',
  primaryBorderColor: '#8a8a8a',
  primaryTextColor: '#242424',
  lineColor: '#616161',
  secondaryColor: '#ebf3fc',
  tertiaryColor: '#fafafa',
  fontFamily: 'Segoe UI, system-ui, sans-serif',
};

/**
 * Background of the page in the light theme
 */
export const LIGHT_BACKGROUND = '#ffffff';

/**
 * Background of the page in the dark theme, under Mermaid's `dark` theme
 */
export const DARK_BACKGROUND = '#1b1b1b';

/**
 * Mermaid's special characters in a display text, each written as its character code (`#<code>;`), so that names and texts show as written: the
 * underscore too, as Mermaid reads a label's `__x__` as bold
 */
const _SPECIAL_CHARACTERS = /[&#;<>{}()[\]"'`~:$%|\\,*+_-]/g;

// #endregion

// #region Display text

/**
 * Escapes a display text for the diagram's source: line breaks and tabs to spaces, cut at MAX_DISPLAY_TEXT_LENGTH (ending in `…`), and Mermaid's
 * special characters written as their character codes (`#<code>;`)
 * @param text The text
 * @returns The escaped text
 */
export function escapeDisplayText(text: string): string {
  let flat = text.replace(/[\r\n\t]+/g, ' ');
  if (flat.length > MAX_DISPLAY_TEXT_LENGTH) flat = `${flat.slice(0, MAX_DISPLAY_TEXT_LENGTH - 1)}…`;
  return flat.replace(_SPECIAL_CHARACTERS, (character) => `#${character.charCodeAt(0)};`);
}

/**
 * Writes a JSON value as display text: as JSON
 * @param value The value
 * @returns Its JSON text
 */
function _json(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

// #endregion

// #region Parsing

/**
 * Represents the outcome of parsing a JSON Schema's text: its value, or the syntax error with its line
 */
export type JsonParseResult = { value: unknown } | { error: string; line?: number };

/**
 * Parses a JSON Schema's text as strict JSON (a byte order mark is accepted; comments are a syntax error)
 * @param text The text
 * @returns Its value, or the syntax error, with its line (from 1) when the parser gives a position
 */
export function parseJsonSchema(text: string): JsonParseResult {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return { value: JSON.parse(content) };
  } catch (err) {
    // V8's message gives the position (`… in JSON at position 67 (line 3 column 5)`), or says the input ended
    const message = (err as Error).message;
    const position = /at position (\d+)/.exec(message);
    const before = position ? content.slice(0, Number(position[1])) : /^Unexpected end of JSON input/.test(message) ? content : undefined;
    const reason = message.replace(/\s*in JSON at position \d+.*$/, '').replace(/\s*\(line \d+ column \d+\)$/, '');
    if (before === undefined) return { error: `The schema isn't valid JSON: ${reason}` };
    const lines = before.split('\n');
    return { error: `The schema isn't valid JSON: ${reason} (column ${lines[lines.length - 1].length + 1})`, line: lines.length };
  }
}

// #endregion

// #region Raw checks

/**
 * Checks if a JSON value is an object (not an array, not `null`)
 * @param value The value
 * @returns True if it is one
 */
function _isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Keywords whose values are data, never schemas, so a scan for `$ref` skips them
 */
const _DATA_KEYWORDS = new Set(['enum', 'const', 'default', 'examples']);

/**
 * Lists every `$ref` keyword's value in a JSON Schema, in document order: a scan of the raw JSON, skipping the values of data keywords (`enum`,
 * `const`, `default`, `examples`)
 * @param schema The schema
 * @returns The references, distinct
 */
export function listReferences(schema: unknown): string[] {
  const references = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (_isObject(value)) {
      for (const [key, item] of Object.entries(value)) {
        if (key === '$ref' && typeof item === 'string') references.add(item);
        else if (!_DATA_KEYWORDS.has(key)) walk(item);
      }
    }
  };
  walk(schema);
  return [...references];
}

/**
 * Represents the references of a JSON Schema `tsschema` can't resolve, by reason
 */
export interface UnresolvedReferences {
  /**
   * References into another file (not starting with `#`), never read yet
   */
  otherFiles: string[];
  /**
   * References inside the schema's own file that `tsschema` doesn't read yet (e.g. `#/definitions/X`, a missing definition, `#`, a pointer into a
   * definition, an escaped name)
   */
  sameFile: string[];
}

/**
 * Gets the references of a JSON Schema `tsschema` can't resolve: every `$ref` into another file, and every other `$ref` that `tsschema` doesn't
 * resolve against the schema's own `$defs` (asked by reflecting a schema of that `$ref` beside those `$defs`, as it decides, e.g. not an escaped
 * name)
 * @param schema The schema, an object
 * @returns The references it can't resolve, by reason
 */
export function getUnresolvedReferences(schema: Record<string, unknown>): UnresolvedReferences {
  const result: UnresolvedReferences = { otherFiles: [], sameFile: [] };
  for (const reference of listReferences(schema)) {
    if (!reference.startsWith('#')) {
      result.otherFiles.push(reference);
      continue;
    }
    const probe = reflect({ $ref: reference, $defs: schema.$defs } as Parameters<typeof reflect>[0]);
    if ((probe.typeDescriptor as TSSchemaTypeDescriptor).kind !== 'reference') result.sameFile.push(reference);
  }
  return result;
}

/**
 * Checks if a schema's own keywords describe properties without `type: "object"` (which `tsschema` describes as `unknown`, not as a model)
 * @param schema The schema
 * @returns True if it has `properties`, and its `type` isn't, or doesn't include, `object`
 */
function _hasUntypedProperties(schema: unknown): boolean {
  if (!_isObject(schema) || schema.properties === undefined) return false;
  const type = schema.type;
  return !(type === 'object' || (Array.isArray(type) && type.includes('object')));
}

/**
 * Gets the warnings about a JSON Schema object's limitations, from its raw JSON: `definitions` without `$defs`, the references `tsschema` can't
 * resolve (one warning), and each definition, and the root, with `properties` but no `type: "object"` (their own keywords only)
 * @param schema The schema, an object
 * @param rootName Name of the root, as the diagram names it
 * @returns The warnings' messages
 */
export function getSchemaWarnings(schema: Record<string, unknown>, rootName: string): string[] {
  const warnings: string[] = [];
  if (schema.definitions !== undefined && schema.$defs === undefined) {
    warnings.push('The schema has "definitions" and no "$defs": only "$defs" is read yet, so its definitions aren\'t shown');
  }
  const { otherFiles, sameFile } = getUnresolvedReferences(schema);
  if (otherFiles.length || sameFile.length) {
    const list = (references: string[]) => references.map((reference) => JSON.stringify(reference)).join(', ');
    const parts = [
      ...(otherFiles.length ? [`into other files, not read yet: ${list(otherFiles)}`] : []),
      ...(sameFile.length ? [`in this file, not read yet: ${list(sameFile)}`] : []),
    ];
    warnings.push(`References not resolved, shown as "unknown": ${parts.join('; ')}`);
  }
  const untyped = (name: string) => `"${name}" has "properties" without "type": "object", which isn't read as a model yet: its properties aren't shown`;
  if (_hasUntypedProperties(schema)) warnings.push(untyped(rootName));
  if (_isObject(schema.$defs)) {
    for (const [name, definition] of Object.entries(schema.$defs)) {
      if (_hasUntypedProperties(definition)) warnings.push(untyped(name));
    }
  }
  return warnings;
}

// #endregion

// #region Mapping

/**
 * Checks if a type descriptor is nullable without a `null` member saying so
 * @param type The type descriptor
 * @returns True if its type text needs ` | null`
 */
function _needsNull(type: TSSchemaTypeDescriptor): boolean {
  if (!type.nullable || type.kind === 'null') return false;
  return !((type.kind === 'anyOf' || type.kind === 'oneOf') && type.members.some((member) => member.kind === 'null'));
}

/**
 * Gets a type descriptor's type text, as a property's type shows it (e.g. `string (uuid)`, `Item[]`, `"a" | "b"`, `Record<string, unknown>`,
 * `Operator | null`); never reads a reference's `target`
 * @param type The type descriptor
 * @returns The type text, not escaped
 */
export function getTypeText(type: TSSchemaTypeDescriptor): string {
  const text = _getBareTypeText(type);
  return _needsNull(type) ? `${text} | null` : text;
}

/**
 * Gets a type descriptor's type text, without its nullability
 * @param type The type descriptor
 * @returns The type text
 */
function _getBareTypeText(type: TSSchemaTypeDescriptor): string {
  switch (type.kind) {
    case 'reference':
      return type.name;
    case 'array': {
      const items = getTypeText(type.items);
      return /[ |&]/.test(items) ? `(${items})[]` : `${items}[]`;
    }
    case 'primitive':
      return type.constraints.format ? `${type.type} (${type.constraints.format})` : type.type;
    case 'enum':
      return type.values.map(_json).join(' | ');
    case 'const':
      return _json(type.value);
    case 'model':
      return 'object';
    case 'record':
      return `Record<string, ${getTypeText(type.values)}>`;
    case 'null':
      return 'null';
    case 'anyOf':
    case 'oneOf':
      return type.members.map(getTypeText).join(' | ');
    case 'allOf':
      return type.members.map(getTypeText).join(' & ');
    case 'not':
      return `not ${getTypeText(type.not)}`;
    default:
      return 'unknown';
  }
}

/**
 * Lists the definitions a type descriptor references: directly, through arrays and records, and as members of an `anyOf`, `oneOf` or `allOf`
 * (nullable or not); never reads a reference's `target`
 * @param type The type descriptor
 * @returns The referenced definitions' names, distinct, in order
 */
export function getReferencedNames(type: TSSchemaTypeDescriptor): string[] {
  const names = new Set<string>();
  const walk = (item: TSSchemaTypeDescriptor): void => {
    if (item.kind === 'reference') names.add(item.name);
    else if (item.kind === 'array') walk(item.items);
    else if (item.kind === 'record') walk(item.values);
    else if (item.kind === 'anyOf' || item.kind === 'oneOf' || item.kind === 'allOf') item.members.forEach(walk);
  };
  walk(type);
  return [...names];
}

/**
 * Flattens an `allOf` type descriptor's members: nested `allOf`s (implicit or explicit) give their own members
 * @param type The `allOf` type descriptor
 * @returns Its members, flattened
 */
function _flattenAllOf(type: TSSchemaTypeDescriptor): TSSchemaTypeDescriptor[] {
  return type.kind === 'allOf' ? type.members.flatMap(_flattenAllOf) : [type];
}

/**
 * Represents the Mermaid source of a JSON Schema's diagram
 */
export interface JsonSchemaDiagram {
  /**
   * The Mermaid source: a `classDiagram`
   */
  source: string;
  /**
   * Number of nodes in it
   */
  nodes: number;
  /**
   * Number of edges in it
   */
  edges: number;
}

/**
 * Represents a node of the diagram, before it is written
 */
interface _Node {
  /**
   * Its generated id
   */
  id: string;
  /**
   * Its display text, not escaped
   */
  name: string;
  /**
   * Its stereotypes, from the adapter's own words (e.g. `enumeration`), not escaped
   */
  stereotypes: string[];
  /**
   * Its member lines, escaped
   */
  members: string[];
}

/**
 * Maps a JSON Schema to the Mermaid source of its class diagram (read with `tsschema`'s `reflect()`): each definition of `$defs` a node (a model
 * with its properties, an `allOf` merging its models' properties, an enum with its values, an alias, an `anyOf`/`oneOf`, or any other kind named by
 * its stereotype), and the root a node when it is a model (`<<root>>`, named `rootName`), or, when it is only a reference, the definition it
 * references marked `<<root>>`. A property referencing definitions starts with `→` and gives an association labelled with its name to each; an
 * `allOf`'s references are inheritance; an `anyOf`/`oneOf`'s references, an alias's target, and any other kind's references are dependencies. Nodes
 * get generated ids, and every display text goes through escapeDisplayText(). Definitions are walked by their names, and references followed by
 * their targets' names, so a recursive schema never recurses.
 * @param schema The schema
 * @param rootName Name of the root's node
 * @returns The Mermaid source, with its numbers of nodes and edges
 */
export function mapJsonSchema(schema: unknown, rootName: string): JsonSchemaDiagram {
  // The cast only lets reflect() take any JSON: it never throws, and describes what it can't read as `unknown`
  const reflection = reflect(schema as Parameters<typeof reflect>[0]);
  const names = reflection.definitionNames as string[];
  const ids = new Map<string, string>(names.map((name, index) => [name, `n${index}`]));
  const nodes: _Node[] = [];
  const edges: string[] = [];
  const label = (text: string) => ` : ${escapeDisplayText(text)}`;

  // Writes one node, and its edges
  const addNode = (id: string, name: string, type: TSSchemaTypeDescriptor, stereotypes: string[]): void => {
    const node: _Node = { id, name, stereotypes: [...stereotypes], members: [] };
    nodes.push(node);
    const addProperties = (properties: Iterable<[string, TSSchemaModelPropertyDescriptor]>) => {
      for (const [property, descriptor] of properties) {
        const referenced = getReferencedNames(descriptor.type).filter((target) => ids.has(target));
        const mark = referenced.length ? '→ ' : '';
        node.members.push(`${mark}${escapeDisplayText(property)}${descriptor.required ? '' : '?'} : ${escapeDisplayText(getTypeText(descriptor.type))}`);
        for (const target of referenced) edges.push(`${id} --> ${ids.get(target)}${label(property)}`);
      }
    };
    const dependOn = (members: readonly TSSchemaTypeDescriptor[], edgeLabel = '') => {
      for (const target of members.flatMap(getReferencedNames)) if (ids.has(target)) edges.push(`${id} ..> ${ids.get(target)}${edgeLabel}`);
    };
    switch (type.kind) {
      case 'model':
        addProperties(Object.entries(type.properties));
        break;
      case 'allOf': {
        const members = _flattenAllOf(type);
        for (const member of members) {
          if (member.kind === 'reference') {
            if (ids.has(member.name)) edges.push(`${ids.get(member.name)} <|-- ${id}`);
          } else if (member.kind === 'model') {
            addProperties(Object.entries(member.properties));
          } else {
            if (!node.stereotypes.includes(member.kind)) node.stereotypes.push(member.kind);
            node.members.push(escapeDisplayText(getTypeText(member)));
            dependOn([member]);
          }
        }
        break;
      }
      case 'enum':
        node.stereotypes.push('enumeration');
        node.members.push(...type.values.map((value) => escapeDisplayText(_json(value))));
        if (type.nullable) node.members.push('null');
        break;
      case 'reference':
        node.stereotypes.push('alias');
        dependOn([type]);
        break;
      case 'anyOf':
      case 'oneOf':
        node.stereotypes.push(type.kind);
        for (const member of type.members) if (member.kind !== 'reference') node.members.push(escapeDisplayText(getTypeText(member)));
        dependOn(
          type.members.filter((member) => member.kind === 'reference'),
          label(type.kind),
        );
        dependOn(type.members.filter((member) => member.kind !== 'reference'));
        break;
      default:
        node.stereotypes.push(type.kind);
        node.members.push(escapeDisplayText(getTypeText(type)));
        dependOn([type]);
    }
  };

  // The definitions, then the root
  const root = reflection.typeDescriptor as TSSchemaTypeDescriptor;
  const rootTarget = root.kind === 'reference' && ids.has(root.name) ? root.name : undefined;
  for (const name of names) {
    const definition = reflection.getDefinition(name as never) as { typeDescriptor: TSSchemaTypeDescriptor } | undefined;
    addNode(ids.get(name)!, name, definition?.typeDescriptor ?? { kind: 'unknown', nullable: false }, name === rootTarget ? ['root'] : []);
  }
  if (root.kind === 'model' || (root.kind === 'allOf' && _flattenAllOf(root).some((member) => member.kind === 'model'))) {
    addNode(`n${names.length}`, rootName, root, ['root']);
  }

  // Written: the nodes, then the edges
  const lines = ['classDiagram'];
  for (const node of nodes) {
    // Mermaid shows one stereotype per class, so a node's stereotypes are joined into one
    const body = [...(node.stereotypes.length ? [`  <<${node.stereotypes.join(' · ')}>>`] : []), ...node.members.map((member) => `  ${member}`)];
    lines.push(`class ${node.id}["${escapeDisplayText(node.name)}"]${body.length ? ' {' : ''}`, ...(body.length ? [...body, '}'] : []));
  }
  lines.push(...edges);
  return { source: lines.join('\n'), nodes: nodes.length, edges: edges.length };
}

// #endregion

// #region Page

/**
 * Id of the page's element holding the diagram's source, as JSON
 */
const _SOURCE_ID = 'showroom-diagram-source';

/**
 * Id of the page's element the diagram is drawn into
 */
const _DIAGRAM_ID = 'showroom-diagram';

/**
 * Represents the constants the page's script receives as its argument, as it references no outer names
 */
export interface JsonSchemaPageConstants {
  /**
   * Id of the element holding the diagram's source, as JSON
   */
  sourceId: string;
  /**
   * Id of the element the diagram is drawn into
   */
  diagramId: string;
  /**
   * See THEME_ATTRIBUTE
   */
  themeAttribute: string;
  /**
   * See MERMAID_MAX_TEXT_SIZE
   */
  maxTextSize: number;
  /**
   * See MERMAID_MAX_EDGES
   */
  maxEdges: number;
  /**
   * See LIGHT_THEME_VARIABLES
   */
  lightThemeVariables: Readonly<Record<string, string>>;
  /**
   * See LIGHT_BACKGROUND
   */
  lightBackground: string;
  /**
   * See DARK_BACKGROUND
   */
  darkBackground: string;
}

/**
 * The page script's constants
 */
export const JSONSCHEMA_PAGE_CONSTANTS: JsonSchemaPageConstants = {
  sourceId: _SOURCE_ID,
  diagramId: _DIAGRAM_ID,
  themeAttribute: THEME_ATTRIBUTE,
  maxTextSize: MERMAID_MAX_TEXT_SIZE,
  maxEdges: MERMAID_MAX_EDGES,
  lightThemeVariables: LIGHT_THEME_VARIABLES,
  lightBackground: LIGHT_BACKGROUND,
  darkBackground: DARK_BACKGROUND,
};

/**
 * Represents the part of Mermaid's API the page uses
 */
export interface JsonSchemaPageMermaid {
  /**
   * Sets Mermaid's configuration
   * @param config The configuration
   */
  initialize(config: Record<string, unknown>): void;
  /**
   * Renders a diagram's source into an SVG, off the document
   * @param id Id of the diagram, unique per render
   * @param source The diagram's source
   * @returns The SVG's markup
   */
  render(id: string, source: string): Promise<{ svg: string }>;
}

/**
 * The page's script, run in the showcase frame as a module: it draws the diagram's source with Mermaid, in the theme the frame script sets on
 * `<html>` (Mermaid's `base` theme with LIGHT_THEME_VARIABLES, or its `dark` theme), with `layout: 'dagre'` (so elkjs is never asked for) and
 * Mermaid's limits, scaled to the frame's width; and draws it again, with a fresh id, whenever the theme changes, swapping the new drawing in at
 * once. Draws run one after another. Mermaid's failures are reported with `console.error`, never drawn. It is inlined into the page as its source
 * text, so it references no outer names: everything it uses comes from `window`, Mermaid and its constants come from its arguments.
 * @param mermaid Mermaid
 * @param constants The page script's constants
 * @returns A promise resolved once the first drawing is done
 */
export function jsonSchemaPageScript(mermaid: JsonSchemaPageMermaid, constants: JsonSchemaPageConstants): Promise<void> {
  const document = window.document;
  const root = document.documentElement;
  const box = document.getElementById(constants.diagramId);
  let source = '';
  try {
    source = JSON.parse(document.getElementById(constants.sourceId)?.textContent ?? '""') as string;
  } catch (err) {
    window.console.error(err);
  }
  let count = 0;
  let drawn: string | undefined;
  let queue: Promise<void> = Promise.resolve();

  // Draws the diagram in the current theme, unless it is drawn in it already
  const draw = async (): Promise<void> => {
    const theme = root.getAttribute(constants.themeAttribute) === 'dark' ? 'dark' : 'light';
    if (theme === drawn || !box) return;
    drawn = theme;
    document.body.style.background = theme === 'dark' ? constants.darkBackground : constants.lightBackground;
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'base',
      themeVariables: theme === 'dark' ? {} : { ...constants.lightThemeVariables },
      layout: 'dagre',
      maxTextSize: constants.maxTextSize,
      maxEdges: constants.maxEdges,
      suppressErrorRendering: true,
      class: { useMaxWidth: true },
    });
    try {
      const { svg } = await mermaid.render(`showroom-diagram-${count++}`, source);
      box.innerHTML = svg;
      const element = box.querySelector('svg');
      if (element) {
        element.setAttribute('width', '100%');
        element.style.maxWidth = '100%';
        element.style.height = 'auto';
      }
    } catch (err) {
      window.console.error(err);
    }
  };
  const schedule = (): Promise<void> => (queue = queue.then(draw));
  new window.MutationObserver(() => void schedule()).observe(root, { attributes: true, attributeFilter: [constants.themeAttribute] });
  return schedule();
}

/**
 * Writes a value as JSON safe inside a `<script>` element: `<` written as `<`, so nothing in it closes the element
 * @param value The value
 * @returns The JSON
 */
function _scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Gets the jsonschema showcase adapter's page: the diagram's source as a JSON data element, and a module script importing Mermaid (by
 * JSONSCHEMA_MERMAID_SPECIFIER) and running jsonSchemaPageScript() with it
 * @param source The diagram's Mermaid source
 * @returns The page's HTML
 */
export function getJsonSchemaPage(source: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<style>html,body{margin:0}body{padding:8px}#${_DIAGRAM_ID}{width:100%}</style></head>` +
    `<body><div id="${_DIAGRAM_ID}"></div>` +
    `<script type="application/json" id="${_SOURCE_ID}">${_scriptJson(source)}</script>` +
    `<script type="module">import mermaid from ${_scriptJson(JSONSCHEMA_MERMAID_SPECIFIER)};` +
    `(${jsonSchemaPageScript.toString()})(mermaid, ${_scriptJson(JSONSCHEMA_PAGE_CONSTANTS)});</script>` +
    '</body></html>'
  );
}

// #endregion

// #region Showcase adapter

/**
 * Represents the `jsonschema` showcase adapter
 */
export class JsonSchemaShowcaseAdapter implements ShowcaseAdapter {
  /**
   * Its default showcase views: its diagram
   */
  readonly defaultViews: readonly ShowcaseView[] = ['demo'];

  /**
   * Validates a showcase: it takes no options, and its entry point must be a `json` code block, or a linked `.json` file; its content is read by the
   * build
   * @param showcase The showcase
   * @returns No options, or the errors found
   */
  public validate(showcase: Showcase): ShowcaseValidation {
    const errors: string[] = [];
    if ('options' in showcase) errors.push('The jsonschema showcase adapter takes no options');
    if (!/\.json$/i.test(showcase.entry)) {
      errors.push(
        showcase.kind === 'code-block'
          ? 'The jsonschema showcase adapter needs a "json" code block'
          : `The jsonschema showcase adapter needs a link to a .json file, not "${showcase.entry}"`,
      );
    }
    return errors.length ? { errors } : { errors: [] };
  }

  /**
   * Builds a showcase's showcase frame: reads its entry point (a code block's virtual file, or a linked file from disk), parses it as strict JSON,
   * maps it to the Mermaid source of its diagram, and writes the page drawing it. Its errors name no check, so its `build` status mark shows them,
   * and the showcase frame isn't shipped: a syntax error (at its line), a schema that isn't an object or a boolean, and a diagram over Mermaid's
   * limits. Its warnings ship it: a boolean schema, `definitions` without `$defs`, unresolved references, `properties` without `type: "object"`, an
   * empty diagram. Every issue is at the entry point. Its reads are the entry point (a code block's documentation file).
   * @param request What to build
   * @returns The showcase frame's page, its issues and its reads
   */
  public async build({ root, showcase, virtualFiles }: ShowcaseBuildRequest): Promise<ShowcaseBuildResult> {
    // The entry point's content
    let content: string;
    let reads: string[];
    const virtualFile = showcase.kind === 'code-block' ? virtualFiles.find((file) => file.path === showcase.entry) : undefined;
    if (showcase.kind === 'code-block') {
      reads = [showcase.documentation];
      if (!virtualFile) return { reads, issues: [{ severity: 'error', message: `The entry point's virtual file "${showcase.entry}" is missing` }] };
      content = virtualFile.content;
    } else {
      reads = [showcase.entry];
      try {
        content = await readFile(join(root, showcase.entry), 'utf8');
      } catch (err) {
        return { reads, issues: [{ severity: 'error', message: `The entry point can't be read: ${(err as Error).message}`, path: showcase.entry }] };
      }
    }
    const issue = (severity: 'error' | 'warning', message: string, line?: number): ShowcaseBuildIssue => ({
      severity,
      message,
      path: showcase.entry,
      ...(line === undefined ? {} : { line }),
    });

    // Strict JSON, an object or a boolean
    const parsed = parseJsonSchema(content);
    if ('error' in parsed) return { reads, issues: [issue('error', parsed.error, parsed.line)] };
    const schema = parsed.value;
    const warnings: ShowcaseBuildIssue[] = [];
    if (typeof schema === 'boolean') {
      warnings.push(issue('warning', `The schema is the boolean schema "${schema}", which has no definitions: nothing is shown`));
    } else if (!_isObject(schema)) {
      const kind = Array.isArray(schema) ? 'an array' : schema === null ? 'null' : `a ${typeof schema}`;
      return { reads, issues: [issue('error', `The schema must be a JSON object, not ${kind}`)] };
    }

    // The diagram, within Mermaid's limits
    const named = virtualFile?.named ? virtualFile.path.slice(virtualFile.path.lastIndexOf('/') + 1).replace(/\.json$/i, '') : undefined;
    const title = _isObject(schema) && typeof schema.title === 'string' ? schema.title : undefined;
    const rootName = title ?? named ?? 'root';
    if (_isObject(schema)) warnings.push(...getSchemaWarnings(schema, rootName).map((message) => issue('warning', message)));
    const diagram = mapJsonSchema(schema, rootName);
    const over = [
      ...(diagram.source.length > MERMAID_MAX_TEXT_SIZE ? [`its source is ${diagram.source.length} characters long (at most ${MERMAID_MAX_TEXT_SIZE})`] : []),
      ...(diagram.edges > MERMAID_MAX_EDGES ? [`it has ${diagram.edges} edges (at most ${MERMAID_MAX_EDGES})`] : []),
    ];
    if (over.length) return { reads, issues: [...warnings, issue('error', `The diagram is too large for Mermaid: ${over.join(', and ')}`)] };
    if (!diagram.nodes && typeof schema !== 'boolean')
      warnings.push(issue('warning', 'The diagram is empty: the schema has no definitions, and its root is no model'));
    return {
      page: JSONSCHEMA_PAGE,
      files: [{ path: JSONSCHEMA_PAGE, content: getJsonSchemaPage(diagram.source) }],
      reads,
      ...(warnings.length ? { issues: warnings } : {}),
    };
  }
}

// #endregion
