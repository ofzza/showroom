/**
 * number-table: a custom showcase adapter, and the custom showcase adapter example. It shows a JSON array of rows (objects) as a table, its numbers
 * formatted for a language: from a `json` code block, or a linked `.json` file.
 */

/** @import { Showcase, ShowcaseAdapter, ShowcaseBuildError, ShowcaseBuildRequest, ShowcaseBuildResult } from '@ofzza/showroom' */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The options a showcase can give, and their types
 */
const OPTIONS = { columns: 'an array of strings', caption: 'a string', locale: 'a string' };

/**
 * The table's styles: right-aligned, tabular numbers, following the showroom's theme (which sets the page's `color-scheme`)
 */
const STYLES = `body { margin: 0; padding: 1rem; font-family: system-ui, sans-serif; }
table { border-collapse: collapse; }
caption { padding-bottom: 0.5rem; font-weight: 600; text-align: left; }
th, td { padding: 0.25rem 0.75rem; border-bottom: 1px solid light-dark(#d1d1d1, #424242); }
th { text-align: left; }
td.number { text-align: right; font-variant-numeric: tabular-nums; }
tbody tr:nth-child(even) { background: light-dark(#f5f5f5, #1f1f1f); }
`;

/**
 * Escapes text for HTML
 * @param {string} text The text
 * @returns {string} The escaped text
 */
const _escape = (text) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/**
 * Checks a showcase's options
 * @param {unknown} options The options, as the marker gives them
 * @returns {string[]} What's wrong with them
 */
const _checkOptions = (options) => {
  if (options === undefined) {
    return [];
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    return ['number-table options must be an object'];
  }
  return Object.entries(options).flatMap(([name, value]) => {
    if (!(name in OPTIONS)) {
      return [`number-table has no option "${name}"; it has ${Object.keys(OPTIONS).join(', ')}`];
    }
    const valid = name === 'columns' ? Array.isArray(value) && value.every((column) => typeof column === 'string') : typeof value === 'string';
    return valid ? [] : [`number-table's ${name} option must be ${OPTIONS[/** @type {keyof typeof OPTIONS} */ (name)]}`];
  });
};

/**
 * Parses the rows, reporting invalid JSON at its line
 * @param {string} text The JSON
 * @param {string} path Path of the file holding it, relative to the root
 * @returns {{ rows: Record<string, unknown>[] } | { error: ShowcaseBuildError }} The rows, or the error
 */
const _parse = (text, path) => {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Node's messages name the line, or at least the position, of most errors
    const [, line, position] = /\(line (\d+)|position (\d+)/.exec(message) ?? [];
    const at = line ? Number(line) : position ? text.slice(0, Number(position)).split('\n').length : undefined;
    return { error: { message: `Invalid JSON: ${message}`, path, line: at } };
  }
  if (!Array.isArray(value) || !value.length || !value.every((row) => typeof row === 'object' && row !== null && !Array.isArray(row))) {
    return { error: { message: 'number-table needs a non-empty array of objects, one per row', path } };
  }
  return { rows: value };
};

/**
 * Creates the number-table showcase adapter; `showroom` calls this once per run
 * @returns {ShowcaseAdapter} The showcase adapter
 */
export default () => ({
  /**
   * Accepts `.json` entry points, with valid options
   * @param {Showcase} showcase The showcase
   */
  validate: (showcase) => {
    const errors = _checkOptions(showcase.options);
    if (!showcase.entry.endsWith('.json')) {
      errors.unshift('number-table needs a json code block, or a linked .json file');
    }
    return errors.length ? { errors } : { options: showcase.options ?? {}, errors: [] };
  },

  /**
   * Builds the table into a page and its stylesheet
   * @param {ShowcaseBuildRequest} request What to build
   * @returns {Promise<ShowcaseBuildResult>} The showcase frame's files, or the errors
   */
  build: async ({ root, showcase, options, virtualFiles }) => {
    const { columns, caption, locale = 'en' } = /** @type {{ columns?: string[], caption?: string, locale?: string }} */ (options);

    // An inline showcase's JSON is a virtual file, in memory; a linked one is read from disk
    const virtual = virtualFiles.find((file) => file.path === showcase.entry);
    const reads = virtual ? [] : [showcase.entry];
    const parsed = _parse(virtual ? virtual.content : await readFile(join(root, showcase.entry), 'utf8'), showcase.entry);
    if ('error' in parsed) {
      return { errors: [parsed.error], reads };
    }

    // Lays out the columns: the ones asked for, or every key in the order first seen; a column holding a number is a numeric one
    const { rows } = parsed;
    const names = columns ?? [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const numeric = new Set(names.filter((name) => rows.some((row) => typeof row[name] === 'number')));
    const format = new Intl.NumberFormat(locale);
    /** @type {ShowcaseBuildError[]} */
    const warnings = [];
    const cell = (/** @type {Record<string, unknown>} */ row, /** @type {string} */ name, /** @type {number} */ index) => {
      const value = row[name];
      if (numeric.has(name) && value !== undefined && typeof value !== 'number') {
        warnings.push({ message: `Row ${index + 1}'s "${name}" is not a number: ${JSON.stringify(value)}`, path: showcase.entry });
      }
      const text = value === undefined ? '–' : typeof value === 'number' ? format.format(value) : String(value);
      return `<td${numeric.has(name) ? ' class="number"' : ''}>${_escape(text)}</td>`;
    };

    const page = `<!doctype html>
<html lang="${_escape(locale)}">
  <head><meta charset="utf-8" /><link rel="stylesheet" href="table.css" /></head>
  <body>
    <table>
      ${caption ? `<caption>${_escape(caption)}</caption>` : ''}
      <thead><tr>${names.map((name) => `<th>${_escape(name)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row, index) => `<tr>${names.map((name) => cell(row, name, index)).join('')}</tr>`).join('')}</tbody>
    </table>
  </body>
</html>
`;
    return {
      page: 'index.html',
      files: [
        { path: 'index.html', content: page },
        { path: 'table.css', content: STYLES },
      ],
      reads,
      warnings,
    };
  },
});
