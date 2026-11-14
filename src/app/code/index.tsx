/**
 * Highlighted code, shared by rendered Markdown and the linked files' modal: highlight.js's token colours, as FluentUI tokens; the code block every
 * piece of code is shown in (line numbers in a gutter, a copy button); and a highlighted code block of a text, rendered through the same
 * `react-markdown` and `rehype-highlight` as Markdown's code blocks
 */

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { Button, makeStyles, mergeClasses, tokens, type GriffelStyle } from '@fluentui/react-components';
import { Checkmark16Regular, Copy16Regular, ErrorCircle16Regular } from '@fluentui/react-icons';

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

// #region Code block

/**
 * Styles of a code block
 */
const _useStyles = makeStyles({
  block: {
    position: 'relative',
    margin: `${tokens.spacingVerticalM} 0`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    '& pre': { margin: '0', padding: tokens.spacingHorizontalM, lineHeight: 'inherit', fontFamily: 'inherit' },
    '& code': { fontFamily: 'inherit', fontSize: 'inherit' },
    ...TOKEN_STYLES,
  },
  scroll: { display: 'flex', overflowX: 'auto' },
  // Filling its parent, a flex column (the code pane's code), and scrolling both ways inside it, its copy button staying in place
  fillBlock: { margin: '0', flex: '1 1 auto', minHeight: '0', display: 'flex', flexDirection: 'column' },
  fillScroll: { flex: '1 1 auto', minHeight: '0', overflow: 'auto', alignItems: 'flex-start' },
  // Sticky, so line numbers stay in place while long lines scroll sideways
  gutter: {
    position: 'sticky',
    left: '0',
    zIndex: 1,
    flexShrink: 0,
    textAlign: 'right',
    color: tokens.colorNeutralForeground4,
    backgroundColor: tokens.colorNeutralBackground3,
    userSelect: 'none',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  code: { flexGrow: 1, minWidth: 0 },
  copy: { position: 'absolute', top: tokens.spacingVerticalXS, right: tokens.spacingHorizontalXS, zIndex: 2 },
});

/**
 * Counts the lines of a code block's text, as the code block shows them: one line break ending the text is dropped, as a code block shows none
 * @param text The code block's text
 * @returns Its number of lines, at least 1
 */
export function countLines(text: string): number {
  return text.replace(/(\r\n|\r|\n)$/, '').split(/\r\n|\r|\n/).length;
}

/**
 * Represents the properties of a code block
 */
export interface CodeBlockProps {
  /**
   * The code's text, which the gutter numbers the lines of, and the copy button copies
   */
  text: string;
  /**
   * The highlighted code: a `pre` element holding a `code` element
   */
  children: ReactNode;
  /**
   * True to fill its parent, a flex column, with no margin, scrolling both ways inside it (the code pane's code); otherwise as high as its code,
   * scrolling sideways
   */
  fill?: boolean;
  /**
   * False to leave out its copy button (the code pane has one of its own, in its header); true by default
   */
  copy?: boolean;
}

/**
 * Renders a code block: line numbers in a gutter that can't be selected beside the highlighted code, and a copy button
 * @param props Properties of the component
 * @returns The code block
 */
export function CodeBlock({ text, children, fill = false, copy = true }: CodeBlockProps): ReactNode {
  const styles = _useStyles();
  return (
    <div className={mergeClasses(styles.block, fill && styles.fillBlock)}>
      <div className={mergeClasses(styles.scroll, fill && styles.fillScroll)}>
        <pre className={styles.gutter} aria-hidden="true">
          {Array.from({ length: countLines(text) }, (_, index) => index + 1).join('\n')}
        </pre>
        <div className={styles.code}>{children}</div>
      </div>
      {copy && <CopyButton text={text} className={styles.copy} />}
    </div>
  );
}

// #endregion

// #region Copy button

/**
 * How long the copy button shows what copying did, in milliseconds
 */
export const COPY_STATUS_DURATION = 2000;

/**
 * Checks if the clipboard can be written to: `navigator.clipboard` only exists in secure contexts (HTTPS, `localhost`)
 * @returns True if `navigator.clipboard` exists
 */
export function canCopy(): boolean {
  return typeof navigator !== 'undefined' && navigator.clipboard !== undefined;
}

/**
 * Copies a text to the clipboard; called from a click handler only, as browsers refuse it otherwise
 * @param text The text
 * @returns True if it was copied, false if the clipboard is missing or refused it
 */
export async function copyText(text: string): Promise<boolean> {
  if (!canCopy()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Subscribes to changes of whether the clipboard exists, which never happen
 * @returns The function unsubscribing, which does nothing
 */
function _subscribeToNothing(): () => void {
  return () => undefined;
}

/**
 * Represents the properties of a copy button
 */
export interface CopyButtonProps {
  /**
   * The text it copies
   */
  text: string;
  /**
   * Its class name
   */
  className: string;
}

/**
 * Renders a code block's copy button, which shows what copying did for a moment; hidden in the browser where the clipboard is missing (outside
 * secure contexts), and always rendered on the server, which can't tell
 * @param props Properties of the component
 * @returns The copy button, or nothing where the clipboard is missing
 */
export function CopyButton({ text, className }: CopyButtonProps): ReactNode {
  // Whether the clipboard exists never changes while the page is open; the server-side rendering shows the button
  const available = useSyncExternalStore(_subscribeToNothing, canCopy, () => true);
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (status === 'idle') return;
    const timer = setTimeout(() => setStatus('idle'), COPY_STATUS_DURATION);
    return () => clearTimeout(timer);
  }, [status]);
  if (!available) return null;
  const icon = status === 'copied' ? <Checkmark16Regular /> : status === 'failed' ? <ErrorCircle16Regular /> : <Copy16Regular />;
  return (
    <Button
      className={className}
      appearance="subtle"
      size="small"
      icon={icon}
      aria-label={status === 'idle' ? 'Copy code' : undefined}
      title="Copy code"
      onClick={() => void copyText(text).then((copied) => setStatus(copied ? 'copied' : 'failed'))}
    >
      {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : undefined}
    </Button>
  );
}

// #endregion

// #region Highlighted code

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
  return { markdown: `${fence}${info}\n${text}\n${fence}\n`, lines: countLines(content) };
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
  /**
   * True to fill its parent (see CodeBlockProps' `fill`)
   */
  fill?: boolean;
  /**
   * False to leave out its copy button (see CodeBlockProps' `copy`)
   */
  copy?: boolean;
}

/**
 * Renders a text as a code block, highlighted as Markdown's code blocks are
 * @param props Properties of the component
 * @returns The code block
 */
export function HighlightedCode({ content, language, fill, copy }: HighlightedCodeProps): ReactNode {
  return (
    <CodeBlock text={content} fill={fill} copy={copy}>
      <ReactMarkdown rehypePlugins={[rehypeHighlight]} skipHtml>
        {getFence(content, language).markdown}
      </ReactMarkdown>
    </CodeBlock>
  );
}

// #endregion
