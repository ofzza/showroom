/**
 * Highlighted code, shared by rendered Markdown and the linked files' modal: highlight.js's token colours, as FluentUI tokens, and a highlighted code
 * block with line numbers, rendered through the same `react-markdown` and `rehype-highlight` as Markdown's code blocks
 */

import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { makeStyles, tokens, type GriffelStyle } from '@fluentui/react-components';

// #region Token colours

/**
 * Colours of highlight.js's token classes, as FluentUI tokens, so code blocks follow the theme. Every class highlight.js emits is coloured, except
 * those listed in UNCOLOURED_TOKEN_CLASSES
 */
const _TOKEN_STYLES: [string[], GriffelStyle][] = [
  [['hljs-comment', 'hljs-quote'], { color: tokens.colorNeutralForeground3, fontStyle: 'italic' }],
  // A code block or span inside Markdown (e.g. a fenced example in an `md` block), and a formula
  [['hljs-code', 'hljs-formula'], { color: tokens.colorNeutralForeground3 }],
  [
    ['hljs-keyword', 'hljs-selector-tag', 'hljs-literal', 'hljs-doctag', 'hljs-meta .hljs-keyword', 'hljs-template-tag', 'hljs-variable.language_'],
    { color: tokens.colorPaletteBerryForeground1 },
  ],
  [['hljs-string', 'hljs-regexp', 'hljs-addition', 'hljs-meta .hljs-string'], { color: tokens.colorPaletteGreenForeground1 }],
  [['hljs-number', 'hljs-symbol', 'hljs-bullet', 'hljs-link', 'hljs-char.escape_'], { color: tokens.colorPaletteDarkOrangeForeground1 }],
  [
    ['hljs-title', 'hljs-section', 'hljs-name', 'hljs-selector-id', 'hljs-selector-class', 'hljs-selector-pseudo'],
    { color: tokens.colorPaletteBlueForeground2 },
  ],
  [['hljs-type', 'hljs-built_in', 'hljs-title.class_', 'hljs-class .hljs-title'], { color: tokens.colorPaletteTealForeground2 }],
  [
    ['hljs-attr', 'hljs-attribute', 'hljs-variable', 'hljs-template-variable', 'hljs-property', 'hljs-params', 'hljs-operator', 'hljs-selector-attr'],
    { color: tokens.colorPaletteRedForeground1 },
  ],
  [['hljs-meta'], { color: tokens.colorNeutralForeground2 }],
  [['hljs-deletion'], { color: tokens.colorPaletteRedForeground1 }],
  [['hljs-emphasis'], { fontStyle: 'italic' }],
  [['hljs-strong'], { fontWeight: tokens.fontWeightSemibold }],
];

/**
 * highlight.js's token classes that deliberately keep the code block's own colour: punctuation, a substitution's content (e.g. `${...}` in a
 * template string, whose parts are coloured themselves), and the containers of other tokens (an HTML tag, a function's signature)
 */
export const UNCOLOURED_TOKEN_CLASSES = ['hljs-punctuation', 'hljs-subst', 'hljs-tag', 'hljs-function', 'hljs-class'];

/**
 * Names of highlight.js's token classes the showroom colours (each style's first class, e.g. `hljs-title` for `hljs-title.class_`)
 */
export const COLOURED_TOKEN_CLASSES = [...new Set(_TOKEN_STYLES.flatMap(([classes]) => classes.map((name) => name.split(/[ .]/)[0]!)))];

/**
 * Styles colouring highlight.js's tokens inside an element, to spread into a `makeStyles` class
 */
export const TOKEN_STYLES: Record<string, GriffelStyle> = Object.fromEntries(
  _TOKEN_STYLES.flatMap(([classes, style]) => classes.map((name) => [`& .${name}`, style])),
);

// #endregion

// #region Highlighted code

/**
 * Styles of a highlighted code block
 */
const _useStyles = makeStyles({
  block: {
    display: 'flex',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    overflowX: 'auto',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    '& pre': { margin: '0', padding: tokens.spacingHorizontalM, lineHeight: 'inherit' },
    '& code': { fontFamily: 'inherit', fontSize: 'inherit' },
    ...TOKEN_STYLES,
  },
  gutter: {
    flexShrink: 0,
    textAlign: 'right',
    color: tokens.colorNeutralForeground4,
    userSelect: 'none',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  code: { flexGrow: 1, minWidth: 0 },
});

/**
 * Represents a fenced code block built around a text
 */
export interface Fence {
  /**
   * The Markdown of the fenced code block
   */
  markdown: string;
  /**
   * Number of lines of the text, as the code block shows it
   */
  lines: number;
}

/**
 * Builds a fenced code block around a text, so it renders as Markdown's code blocks do: a fence of backticks longer than any run of backticks in the
 * text (at least 3), with the language as its info string unless it holds a backtick or a space; one line break ending the text is dropped, as a
 * code block shows none
 * @param content The text
 * @param language The highlighting language, or an empty string for none
 * @returns The fenced code block, and its number of lines
 */
export function getFence(content: string, language: string): Fence {
  const text = content.replace(/(\r\n|\r|\n)$/, '');
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  const info = /[`\s]/.test(language) ? '' : language;
  return { markdown: `${fence}${info}\n${text}\n${fence}\n`, lines: text.split(/\r\n|\r|\n/).length };
}

/**
 * Represents the properties of a highlighted code block
 */
export interface HighlightedCodeProps {
  /**
   * The code
   */
  content: string;
  /**
   * The highlighting language (e.g. `ts`); one highlight.js doesn't know is shown as plain text
   */
  language: string;
}

/**
 * Renders code highlighted, as Markdown's code blocks are, with line numbers in a gutter beside it
 * @param props Properties of the component
 * @returns The highlighted code block
 */
export function HighlightedCode({ content, language }: HighlightedCodeProps): ReactNode {
  const styles = _useStyles();
  const fence = getFence(content, language);
  return (
    <div className={styles.block}>
      <pre className={styles.gutter} aria-hidden="true">
        {Array.from({ length: fence.lines }, (_, index) => index + 1).join('\n')}
      </pre>
      <div className={styles.code}>
        <ReactMarkdown rehypePlugins={[rehypeHighlight]} skipHtml>
          {fence.markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// #endregion
