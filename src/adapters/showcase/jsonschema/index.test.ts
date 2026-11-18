/**
 * Tests of the jsonschema showcase adapter
 */

import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Showcase, VirtualFile } from '../../../host/index.js';
import { MERMAID_SPECIFIER } from '../../../showcases/index.js';
import type { ShowcaseBuildRequest } from '../index.js';
import {
  escapeDisplayText,
  getJsonSchemaPage,
  getSchemaWarnings,
  getTypeText,
  getUnresolvedReferences,
  JSONSCHEMA_MERMAID_SPECIFIER,
  JSONSCHEMA_PAGE,
  JSONSCHEMA_PAGE_CONSTANTS,
  JsonSchemaShowcaseAdapter,
  jsonSchemaPageScript,
  listReferences,
  mapJsonSchema,
  MAX_DISPLAY_TEXT_LENGTH,
  MIN_DIAGRAM_SCALE,
  MERMAID_MAX_EDGES,
  MERMAID_MAX_TEXT_SIZE,
  parseJsonSchema,
} from './index.js';

/**
 * Path of the fixture host repository with jsonschema showcases
 */
const _ROOT = fileURLToPath(new URL('../../../../test/fixtures/showcase-jsonschema', import.meta.url));

/**
 * Path of the fixture host repository with jsonschema showcases' errors and warnings
 */
const _ERRORS_ROOT = fileURLToPath(new URL('../../../../test/fixtures/showcase-jsonschema-errors', import.meta.url));

/**
 * Creates a showcase for the jsonschema showcase adapter
 * @param kind Kind of the showcase
 * @param entry Path of its entry point
 * @param extra Other fields to set (e.g. options)
 * @returns The showcase
 */
function _showcase(kind: Showcase['kind'], entry: string, extra: Partial<Showcase> = {}): Showcase {
  return {
    id: 'README.md#1',
    documentation: 'README.md',
    line: 1,
    offset: 0,
    kind,
    display: 'block',
    adapter: 'jsonschema',
    entry,
    include: [],
    tabs: [{ kind: 'source' }],
    views: ['demo'],
    ...extra,
  };
}

/**
 * Builds a code block showcase of a schema's text, as the virtual file `README.showcase-1.json` (or a named one)
 * @param content The schema's text
 * @param name Name of a named showcase's virtual file, if it is one
 * @returns The build result
 */
async function _build(content: string, name?: string) {
  const path = name ?? 'README.showcase-1.json';
  const file: VirtualFile = { path, named: name !== undefined, showcase: 'README.md#1', content, documentation: 'README.md', line: 3, offset: 10 };
  return new JsonSchemaShowcaseAdapter().build(_request(_showcase('code-block', path), [file], _ROOT));
}

/**
 * Creates a build request
 * @param showcase The showcase
 * @param virtualFiles The virtual files of its folder
 * @param root The host repository's root
 * @returns The request
 */
function _request(showcase: Showcase, virtualFiles: VirtualFile[], root: string): ShowcaseBuildRequest {
  return { root, showcase, options: undefined, virtualFiles, hostVirtualFiles: virtualFiles, mode: 'production', scratchFolder: root, stack: 'typescript' };
}

/**
 * Gets the Mermaid source a built page carries
 * @param page The page's HTML
 * @returns The source
 */
function _getSource(page: string): string {
  const json = /<script type="application\/json" id="showroom-diagram-source">(.*?)<\/script>/s.exec(page)![1];
  return JSON.parse(json) as string;
}

describe('adapters/showcase/jsonschema', () => {
  // Tests the jsonschema showcase adapter without a browser: its validation, the parsing, the raw checks, the mapping (asserting the Mermaid
  // source, never tsschema's objects, see PLAN-P21 D840), its builds on schemas in memory and on the fixtures' linked files, and the page's script,
  // run with a stubbed window and a fake Mermaid.

  const adapter = new JsonSchemaShowcaseAdapter();

  describe('Validation', () => {
    // Its validation only checks the options and the entry point's extension; the content is the build's (PLAN-P21 D857).

    it('Accepts json entry points without options', () => {
      expect(adapter.defaultViews).toEqual(['demo']);
      expect(adapter.validate(_showcase('code-block', 'README.showcase-1.json'))).toEqual({ errors: [] });
      expect(adapter.validate(_showcase('link', 'schemas/a.schema.JSON'))).toEqual({ errors: [] });
    });

    it('Rejects other entry points and any options', () => {
      expect(adapter.validate(_showcase('code-block', 'README.showcase-1.jsonc')).errors).toEqual([
        'The jsonschema showcase adapter needs a "json" code block',
      ]);
      expect(adapter.validate(_showcase('link', 'a.yaml')).errors).toEqual(['The jsonschema showcase adapter needs a link to a .json file, not "a.yaml"']);
      expect(adapter.validate(_showcase('code-block', 'a.json', { options: null })).errors).toEqual(['The jsonschema showcase adapter takes no options']);
    });
  });

  describe('Parsing', () => {
    // Strict JSON: a byte order mark is accepted, comments are syntax errors, placed at their line and column.

    it('Parses strict JSON, with a byte order mark', () => {
      expect(parseJsonSchema('\uFEFF{ "a": 1 }')).toEqual({ value: { a: 1 } });
    });

    it('Places syntax errors at their line and column', () => {
      expect(parseJsonSchema('{\n  "a": 1,\n}')).toEqual({ error: expect.stringMatching(/^The schema isn't valid JSON: .* \(column 1\)$/), line: 3 });
      expect(parseJsonSchema('{\n  // comment\n  "a": 1\n}')).toEqual({ error: expect.stringMatching(/\(column 3\)$/), line: 2 });
      expect(parseJsonSchema('{\n  "a": [1,')).toMatchObject({ line: 2 });
    });
  });

  describe('Display text', () => {
    // One escaper writes every display text (PLAN-P21 D841, SPEC-S17 D830).

    it("Encodes Mermaid's special characters, the underscore and backtick among them", () => {
      expect(escapeDisplayText('__proto__')).toBe('#95;#95;proto#95;#95;');
      expect(escapeDisplayText('a`b~T~')).toBe('a#96;b#126;T#126;');
      expect(escapeDisplayText('</script>')).toBe('#60;/script#62;');
      expect(escapeDisplayText('%%{init}%%')).toBe('#37;#37;#123;init#125;#37;#37;');
    });

    it('Turns line breaks into spaces, and cuts long texts', () => {
      expect(escapeDisplayText('a\r\nb\tc')).toBe('a b c');
      const long = escapeDisplayText('x'.repeat(MAX_DISPLAY_TEXT_LENGTH + 10));
      expect(long).toBe(`${'x'.repeat(MAX_DISPLAY_TEXT_LENGTH - 1)}…`);
      expect(MAX_DISPLAY_TEXT_LENGTH).toBe(120);
    });
  });

  describe('Raw checks', () => {
    // The warnings read the raw JSON (SPEC-S17 D817, D821, D822, PLAN-P21 D847); which references resolve is asked of tsschema itself.

    it('Lists $ref keywords, skipping data keywords', () => {
      const schema = {
        a: { $ref: '#/x' },
        enum: [{ $ref: 'no' }],
        const: { $ref: 'no' },
        default: { $ref: 'no' },
        examples: [{ $ref: 'no' }],
        b: [{ $ref: '#/x' }],
      };
      expect(listReferences(schema)).toEqual(['#/x']);
    });

    it("Groups the references tsschema can't resolve by reason", () => {
      const schema = {
        properties: {
          a: { $ref: 'other.json#/$defs/A' },
          b: { $ref: '#/definitions/B' },
          c: { $ref: '#/$defs/Missing' },
          d: { $ref: '#/$defs/A~1B' },
          e: { $ref: '#/$defs/Found' },
          f: { $ref: '#/$defs/List~T~' },
        },
        $defs: { Found: { type: 'string' }, 'A/B': { type: 'string' }, 'List~T~': { type: 'string' } },
      };
      expect(getUnresolvedReferences(schema)).toEqual({
        otherFiles: ['other.json#/$defs/A'],
        sameFile: ['#/definitions/B', '#/$defs/Missing', '#/$defs/A~1B'],
      });
    });

    it('Reports a $ref to a virtual file of the same documentation file as into another file', () => {
      // See PLAN-P21 D854: SPEC-S17 D829's case, a virtual file being another file
      expect(getUnresolvedReferences({ $ref: './README.showcase-2.json' })).toEqual({ otherFiles: ['./README.showcase-2.json'], sameFile: [] });
    });

    it('Warns of definitions, unresolved references and untyped properties, one at a time', () => {
      expect(getSchemaWarnings({ definitions: {} }, 'root')).toEqual([
        'The schema has "definitions" and no "$defs": only "$defs" is read yet, so its definitions aren\'t shown',
      ]);
      expect(getSchemaWarnings({ definitions: {}, $defs: {} }, 'root')).toEqual([]);
      expect(getSchemaWarnings({ $ref: 'a.json', properties: { a: { $ref: '#/x' } } }, 'Root')).toEqual([
        'References not resolved, shown as "unknown": into other files, not read yet: "a.json"; in this file, not read yet: "#/x"',
        '"Root" has "properties" without "type": "object", which isn\'t read as a model yet: its properties aren\'t shown',
      ]);
    });

    it("Looks only at a definition's and the root's own keywords for untyped properties", () => {
      // See PLAN-P21 D847: an allOf member's properties are a gap, written into L19 (SPEC.md)
      const schema = {
        type: 'object',
        properties: {},
        $defs: { A: { type: ['object', 'null'], properties: {} }, B: { properties: {} }, C: { allOf: [{ properties: {} }] } },
      };
      expect(getSchemaWarnings(schema, 'root')).toEqual([
        '"B" has "properties" without "type": "object", which isn\'t read as a model yet: its properties aren\'t shown',
      ]);
    });
  });

  describe('Mapping', () => {
    // The Mermaid source, asserted whole on small schemas (SPEC-S17 D811–D814, D823, D824, D830, D831; PLAN-P21 D837, D841).

    it('Maps models, references and inheritance', () => {
      const schema = {
        title: 'Root',
        type: 'object',
        required: ['a'],
        properties: { a: { $ref: '#/$defs/A' }, list: { type: 'array', items: { $ref: '#/$defs/B' } }, n: { type: ['string', 'null'] } },
        $defs: {
          A: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, self: { $ref: '#/$defs/A' } } },
          B: { allOf: [{ $ref: '#/$defs/A' }, { type: 'object', properties: { b: { type: 'integer' } } }] },
        },
      };
      expect(mapJsonSchema(schema, 'Root')).toEqual({
        source: [
          'classDiagram',
          'class n0["A"] {',
          '  id? : string #40;uuid#41;',
          '  → self? : A',
          '}',
          'class n1["B"] {',
          '  b? : integer',
          '}',
          'class n2["Root"] {',
          '  <<root>>',
          '  → a : A',
          '  → list? : B#91;#93;',
          '  n? : string #124; null',
          '}',
          'n0 --> n0 : self',
          'n0 <|-- n1',
          'n2 --> n0 : a',
          'n2 --> n1 : list',
        ].join('\n'),
        nodes: 3,
        edges: 4,
      });
    });

    it('Maps enums, aliases, unions and the other kinds by their stereotypes', () => {
      const schema = {
        $defs: {
          E: { enum: ['x', 1, null] },
          Al: { $ref: '#/$defs/E' },
          U: { oneOf: [{ $ref: '#/$defs/E' }, { type: 'string' }] },
          Arr: { type: 'array', items: { type: 'array', items: { $ref: '#/$defs/E' } } },
          R: { type: 'object', additionalProperties: { $ref: '#/$defs/E' } },
          C: { const: 'k' },
          Unknown: {},
        },
      };
      expect(mapJsonSchema(schema, 'root').source).toBe(
        [
          'classDiagram',
          'class n0["E"] {',
          '  <<enumeration>>',
          '  #34;x#34;',
          '  1',
          '  null',
          '}',
          'class n1["Al"] {',
          '  <<alias>>',
          '}',
          'class n2["U"] {',
          '  <<oneOf>>',
          '  string',
          '}',
          'class n3["Arr"] {',
          '  <<array>>',
          '  E#91;#93;#91;#93;',
          '}',
          'class n4["R"] {',
          '  <<record>>',
          '  Record#60;string#44; unknown#62;',
          '}',
          'class n5["C"] {',
          '  <<const>>',
          '  #34;k#34;',
          '}',
          'class n6["Unknown"] {',
          '  <<unknown>>',
          '  unknown',
          '}',
          'n1 ..> n0',
          'n2 ..> n0 : oneOf',
          'n3 ..> n0',
        ].join('\n'),
      );
    });

    it("Gives a record's values as unknown, with no edge", () => {
      // See L18 (SPEC.md), D819 (SPEC-S17): tsschema reads additionalProperties' values as unknown; a bump lifting it gives the edge
      expect(mapJsonSchema({ $defs: { R: { type: 'object', additionalProperties: { $ref: '#/$defs/R' } } } }, 'root').edges).toBe(0);
    });

    it('Shows a root model under the given name, and nothing for a root of definitions only', () => {
      expect(mapJsonSchema({ type: 'object', properties: {} }, 'named').source).toBe('classDiagram\nclass n0["named"] {\n  <<root>>\n}');
      expect(mapJsonSchema({ $defs: { A: { type: 'object', properties: {} } } }, 'root').source).toBe('classDiagram\nclass n0["A"]');
    });

    it('Marks the definition a root reference names as the root, beside its own stereotype', () => {
      // Mermaid shows one stereotype per class, so they are joined
      const schema = { $ref: '#/$defs/K', $defs: { K: { enum: ['a'] }, M: { type: 'object', properties: {} } } };
      expect(mapJsonSchema(schema, 'root').source).toBe('classDiagram\nclass n0["K"] {\n  <<root · enumeration>>\n  #34;a#34;\n}\nclass n1["M"]');
    });

    it('Writes awkward names and texts only as escaped display text, with generated ids', () => {
      // See SPEC-S17 D830
      const schema = {
        title: 'Awk}ward\nroot',
        type: 'object',
        properties: {
          '-lead': { type: 'string' },
          '#hash': { $ref: '#/$defs/List~T~' },
          'a(b)': { type: 'string' },
          'q"uote': { type: 'string' },
          $$: { type: 'string' },
        },
        $defs: { 'List~T~': { type: 'object', properties: { '</script>': { enum: ['}', 'a\nb', '%%{init}%%'] } } }, toString: { type: 'string' } },
      };
      const source = JSON.parse(JSON.stringify(schema).replace('"toString"', '"__proto__"'));
      expect(mapJsonSchema(source, 'Awk}ward\nroot').source).toBe(
        [
          'classDiagram',
          'class n0["List#126;T#126;"] {',
          '  #60;/script#62;? : #34;#125;#34; #124; #34;a#92;nb#34; #124; #34;#37;#37;#123;init#125;#37;#37;#34;',
          '}',
          'class n1["#95;#95;proto#95;#95;"] {',
          '  <<primitive>>',
          '  string',
          '}',
          'class n2["Awk#125;ward root"] {',
          '  <<root>>',
          '  #45;lead? : string',
          '  → #35;hash? : List#126;T#126;',
          '  a#40;b#41;? : string',
          '  q#34;uote? : string',
          '  #36;#36;? : string',
          '}',
          'n2 --> n0 : #35;hash',
        ].join('\n'),
      );
    });

    it('Walks recursive schemas by name, without recursing', () => {
      const schema = {
        $defs: { A: { type: 'object', properties: { b: { $ref: '#/$defs/B' } } }, B: { type: 'object', properties: { a: { $ref: '#/$defs/A' } } } },
      };
      expect(mapJsonSchema(schema, 'root').edges).toBe(2);
    });

    it('Writes type texts', () => {
      const constraints = { format: undefined } as never;
      const string = { kind: 'primitive', type: 'string', constraints, nullable: true } as const;
      expect(getTypeText({ kind: 'array', items: string, constraints, nullable: false })).toBe('(string | null)[]');
      expect(getTypeText({ kind: 'not', not: { kind: 'null', nullable: true }, nullable: false })).toBe('not null');
      expect(
        getTypeText({
          kind: 'oneOf',
          members: [
            { kind: 'reference', name: 'A', target: undefined as never, nullable: false },
            { kind: 'null', nullable: true },
          ],
          nullable: true,
        }),
      ).toBe('A | null');
    });
  });

  describe('Builds', () => {
    // Builds on schemas in memory and on the fixtures' linked files: the page, its issues and their places, its reads.

    it("Builds a code block's page, reading its documentation file", async () => {
      const result = await _build('{ "title": "T", "type": "object", "properties": {} }');
      expect(result).toEqual({ page: JSONSCHEMA_PAGE, files: [{ path: JSONSCHEMA_PAGE, content: expect.any(String) }], reads: ['README.md'] });
      expect(_getSource(result.files![0].content as string)).toBe('classDiagram\nclass n0["T"] {\n  <<root>>\n}');
    });

    it("Names the root by its title, else a named showcase's name, else root", async () => {
      // See PLAN-P21 D854: the root's three names (SPEC-S17 D824)
      const source = async (content: string, name?: string) => _getSource((await _build(content, name)).files![0].content as string);
      expect(await source('{ "title": "T", "type": "object", "properties": {} }', 'timetable.json')).toContain('class n0["T"]');
      expect(await source('{ "type": "object", "properties": {} }', 'timetable.json')).toContain('class n0["timetable"]');
      expect(await source('{ "type": "object", "properties": {} }')).toContain('class n0["root"]');
    });

    it("Builds a linked file's page, reading it", async () => {
      const result = await adapter.build(_request(_showcase('link', 'schemas/timetable.schema.json'), [], _ROOT));
      expect(result.reads).toEqual(['schemas/timetable.schema.json']);
      expect(result.issues).toBeUndefined();
      const source = _getSource(result.files![0].content as string);
      expect(source).toContain('class n16["Timetable"] {\n  <<root>>');
      expect(source).toContain('n0 <|-- n3');
    });

    it('Fails on a syntax error at its line, with no files', async () => {
      // See PLAN-P21 D857: the build reports it, naming no check, so its build status mark shows it
      const result = await _build('{\n  "a": 1,\n}');
      expect(result).toEqual({
        reads: ['README.md'],
        issues: [{ severity: 'error', message: expect.stringContaining("isn't valid JSON"), path: 'README.showcase-1.json', line: 3 }],
      });
      const linked = await adapter.build(_request(_showcase('link', 'schemas/broken.schema.json'), [], _ERRORS_ROOT));
      expect(linked.issues).toEqual([{ severity: 'error', message: expect.stringContaining("isn't valid JSON"), path: 'schemas/broken.schema.json', line: 5 }]);
    });

    it("Fails on a schema that isn't an object, and warns of a boolean one", async () => {
      expect((await _build('[1]')).issues).toEqual([
        { severity: 'error', message: 'The schema must be a JSON object, not an array', path: 'README.showcase-1.json' },
      ]);
      expect((await _build('null')).issues![0].message).toBe('The schema must be a JSON object, not null');
      expect((await _build('"s"')).issues![0].message).toBe('The schema must be a JSON object, not a string');
      const boolean = await _build('false');
      expect(boolean.files).toHaveLength(1);
      expect(boolean.issues).toEqual([
        {
          severity: 'warning',
          message: 'The schema is the boolean schema "false", which has no definitions: nothing is shown',
          path: 'README.showcase-1.json',
        },
      ]);
    });

    it('Warns of an empty diagram, shipping it', async () => {
      const result = await _build('{}');
      expect(result.files).toHaveLength(1);
      expect(result.issues).toEqual([
        { severity: 'warning', message: 'The diagram is empty: the schema has no definitions, and its root is no model', path: 'README.showcase-1.json' },
      ]);
    });

    it("Fails on a diagram over Mermaid's limits", async () => {
      // See PLAN-P21 D835: Mermaid's own limits, which the page sets
      expect([MERMAID_MAX_TEXT_SIZE, MERMAID_MAX_EDGES]).toEqual([50000, 500]);
      const linked = await adapter.build(_request(_showcase('link', 'schemas/big.schema.json'), [], _ERRORS_ROOT));
      expect(linked.files).toBeUndefined();
      expect(linked.issues).toEqual([
        { severity: 'error', message: 'The diagram is too large for Mermaid: it has 510 edges (at most 500)', path: 'schemas/big.schema.json' },
      ]);
      const properties = Object.fromEntries(Array.from({ length: 450 }, (_, index) => [`${'p'.repeat(110)}${index}`, { type: 'string' }]));
      const long = await _build(JSON.stringify({ type: 'object', properties }));
      expect(long.issues![0].message).toMatch(/^The diagram is too large for Mermaid: its source is \d+ characters long \(at most 50000\)$/);
    });

    it("Fails when the entry point can't be read", async () => {
      const result = await adapter.build(_request(_showcase('link', 'missing.json'), [], _ROOT));
      expect(result.issues).toEqual([{ severity: 'error', message: expect.stringContaining("The entry point can't be read"), path: 'missing.json' }]);
      expect((await adapter.build(_request(_showcase('code-block', 'README.showcase-1.json'), [], _ROOT))).issues![0].message).toBe(
        'The entry point\'s virtual file "README.showcase-1.json" is missing',
      );
    });
  });

  describe('Page', () => {
    // The page's HTML, and its script run with a stubbed window (a fake document and MutationObserver) and a fake Mermaid (PLAN-P21 D842, D854).

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('Carries the source as data, never closing its element early, and imports Mermaid by its specifier', () => {
      expect(JSONSCHEMA_MERMAID_SPECIFIER).toBe(MERMAID_SPECIFIER);
      const page = getJsonSchemaPage('classDiagram\nclass n0["#60;/script#62;"] </script>');
      expect(page).not.toContain('</script> ');
      expect(page).toContain('\\u003c/script>');
      expect(_getSource(page)).toBe('classDiagram\nclass n0["#60;/script#62;"] </script>');
      expect(page).toContain(`import mermaid from "${MERMAID_SPECIFIER}";`);
      // A diagram narrower than the frame is centred; a wider one starts at its left edge, and scrolls (PLAN-P21 D862)
      expect(page).toContain('#showroom-diagram{width:100%;overflow-x:auto}#showroom-diagram svg{display:block;margin:0 auto}');
    });

    /**
     * Runs the page's script against a fake document and Mermaid
     * @param source The diagram's source
     * @param render What the fake Mermaid's render() does
     * @returns The fake objects, and a way to change the theme
     */
    function _run(
      source: string,
      render: (id: string) => Promise<{ svg: string }> = async (id) => ({ svg: `<svg id="${id}"></svg>` }),
      { viewBox = '0 0 800 600', frameWidth = 1000 }: { viewBox?: string | null; frameWidth?: number } = {},
    ) {
      const attributes = new Map<string, string>([[JSONSCHEMA_PAGE_CONSTANTS.themeAttribute, 'light']]);
      let observer: (() => void) | undefined;
      let resized: (() => void) | undefined;
      const svgAttributes = new Map<string, string>([['height', '600'], ...(viewBox === null ? [] : [['viewBox', viewBox] as [string, string]])]);
      const svg = {
        attributes: svgAttributes,
        getAttribute: (name: string) => svgAttributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => void svgAttributes.set(name, value),
        removeAttribute: (name: string) => void svgAttributes.delete(name),
        style: {} as Record<string, string>,
      };
      const box = { innerHTML: '', clientWidth: frameWidth, querySelector: () => svg };
      const body = { style: {} as Record<string, string> };
      const document = {
        documentElement: { getAttribute: (name: string) => attributes.get(name) ?? null },
        body,
        getElementById: (id: string) => (id === JSONSCHEMA_PAGE_CONSTANTS.diagramId ? box : { textContent: JSON.stringify(source) }),
      };
      const console = { error: vi.fn() };
      class FakeObserver {
        constructor(callback: () => void) {
          observer = callback;
        }
        observe() {}
      }
      const addEventListener = (type: string, listener: () => void) => {
        if (type === 'resize') resized = listener;
      };
      vi.stubGlobal('window', { document, console, MutationObserver: FakeObserver, addEventListener });
      const mermaid = { initialize: vi.fn(), render: vi.fn((id: string) => render(id)) };
      const done = jsonSchemaPageScript(mermaid, JSONSCHEMA_PAGE_CONSTANTS);
      const setTheme = (theme: string) => {
        attributes.set(JSONSCHEMA_PAGE_CONSTANTS.themeAttribute, theme);
        observer!();
      };
      const resize = (width: number) => {
        box.clientWidth = width;
        resized!();
      };
      return { done, mermaid, box, body, console, svg, setTheme, resize };
    }

    it("Draws in the theme's colours, with dagre and Mermaid's limits", async () => {
      const { done, mermaid, box, body } = _run('classDiagram');
      await done;
      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'base', layout: 'dagre', maxTextSize: 50000, maxEdges: 500, suppressErrorRendering: true, startOnLoad: false }),
      );
      expect(mermaid.render).toHaveBeenCalledWith('showroom-diagram-0', 'classDiagram');
      expect(box.innerHTML).toBe('<svg id="showroom-diagram-0"></svg>');
      expect(body.style.background).toBe('#ffffff');
    });

    it('Draws a diagram at its natural size, never larger, shrunk to fit down to half its size, fitted again on resizes', async () => {
      // A small schema in a wide frame stays small; a wide one shrinks to the frame, but never below MIN_DIAGRAM_SCALE, scrolling beyond
      expect(MIN_DIAGRAM_SCALE).toBe(0.5);
      const { done, svg, resize } = _run('classDiagram');
      await done;
      expect([svg.attributes.get('width'), svg.attributes.has('height'), svg.style.height, svg.style.maxWidth]).toEqual(['800', false, 'auto', 'none']);
      resize(600);
      expect(svg.attributes.get('width')).toBe('600');
      resize(300);
      expect(svg.attributes.get('width')).toBe('400');
      // A viewBox written with commas, and none at all
      const commas = _run('classDiagram', undefined, { viewBox: '0,0,500.4,10', frameWidth: 2000 });
      await commas.done;
      expect(commas.svg.attributes.get('width')).toBe('500');
      const none = _run('classDiagram', undefined, { viewBox: null });
      await none.done;
      expect(none.svg.attributes.get('width')).toBe('100%');
    });

    it('Draws again once per theme change, with a fresh id each time', async () => {
      const { done, mermaid, box, body, setTheme } = _run('classDiagram');
      await done;
      for (const [theme, renders] of [
        ['dark', 2],
        ['dark', 2],
        ['light', 3],
        ['dark', 4],
      ] as const) {
        setTheme(theme);
        await vi.waitFor(() => expect(box.innerHTML).toBe(`<svg id="showroom-diagram-${renders - 1}"></svg>`));
        expect(mermaid.render).toHaveBeenCalledTimes(renders);
      }
      expect(mermaid.render.mock.calls.map(([id]) => id)).toEqual(['showroom-diagram-0', 'showroom-diagram-1', 'showroom-diagram-2', 'showroom-diagram-3']);
      expect(mermaid.initialize.mock.calls.map(([config]) => config.theme)).toEqual(['base', 'dark', 'base', 'dark']);
      expect(box.innerHTML).toBe('<svg id="showroom-diagram-3"></svg>');
      expect(body.style.background).toBe('#1b1b1b');
    });

    it("Reports Mermaid's failures to the console, drawing nothing", async () => {
      // See SPEC-S17 D828: the frame script captures the error, so runtime shows ✗
      const error = new Error('Parse error');
      const { done, box, console } = _run('classDiagram', () => Promise.reject(error));
      await done;
      expect(console.error).toHaveBeenCalledWith(error);
      expect(box.innerHTML).toBe('');
    });
  });
});
