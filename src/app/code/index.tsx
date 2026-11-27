/**
 * Highlighted code, shared by rendered Markdown and the showcase sidebar: highlight.js's token colours, as FluentUI tokens; the code block every
 * piece of code is shown in (line numbers in a gutter, issue markers on lines, a copy button); and a highlighted code block of a text, rendered through the same
 * `react-markdown` and `rehype-highlight` as Markdown's code blocks
 */

import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
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
 * Most lines a showcase view's code block shows before scrolling, as the code pane's code (unless the viewport is shorter)
 */
export const MAX_CODE_LINES = 20;

/**
 * Room for a scrollbar: a horizontal one below the code, added to a height counted in lines, so long lines don't scroll the code vertically too;
 * and a vertical one beside the copy button of a code block that scrolls vertically, so the button never covers it
 */
const _SCROLLBAR_ROOM = '16px';

/**
 * Gets the height of a number of code lines, as the code block shows them: its line height, its code's padding above and below, and room for a
 * horizontal scrollbar
 * @param lines The number of lines (a number, or a CSS expression)
 * @returns The CSS height
 */
export function getCodeHeight(lines: number | string): string {
  return `calc(${lines} * ${tokens.lineHeightBase300} + 2 * ${tokens.spacingHorizontalM} + ${_SCROLLBAR_ROOM})`;
}

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
  // Below the bands, so the copy button and the gutter stay above them
  // Filling its parent, a flex column (the code pane's code), and scrolling both ways inside it, its copy button staying in place
  fillBlock: { margin: '0', flex: '1 1 auto', minHeight: '0', display: 'flex', flexDirection: 'column' },
  fillScroll: { flex: '1 1 auto', minHeight: '0', overflow: 'auto', alignItems: 'flex-start' },
  // Sticky, so line numbers stay in place while long lines scroll sideways; one element per line, so a marked line's number takes its colour
  gutter: {
    position: 'sticky',
    left: '0',
    zIndex: 1,
    flexShrink: 0,
    padding: tokens.spacingHorizontalM,
    textAlign: 'right',
    whiteSpace: 'pre',
    color: tokens.colorNeutralForeground4,
    backgroundColor: tokens.colorNeutralBackground3,
    userSelect: 'none',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  errorNumber: { color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  warningNumber: { color: tokens.colorPaletteMarigoldForeground1, fontWeight: tokens.fontWeightSemibold },
  // A faint band across a marked line, its messages as its tooltip; over the code, so its colour is translucent and the code shows through
  band: { position: 'absolute', left: '0', right: '0', height: tokens.lineHeightBase300 },
  errorBand: { backgroundColor: `color-mix(in srgb, ${tokens.colorPaletteRedBackground3} 15%, transparent)` },
  warningBand: { backgroundColor: `color-mix(in srgb, ${tokens.colorPaletteYellowBackground3} 20%, transparent)` },
  // A showcase view: the block's border and corners, at most MAX_CODE_LINES lines or the viewport's height, scrolling both ways inside
  viewBlock: { margin: '0', borderRadius: '0' },
  viewScroll: { maxHeight: `min(${getCodeHeight(MAX_CODE_LINES)}, 100vh)`, overflow: 'auto', alignItems: 'flex-start' },
  code: { position: 'relative', flexGrow: 1, minWidth: 0 },
  copy: { position: 'absolute', top: tokens.spacingVerticalXS, right: tokens.spacingHorizontalXS, zIndex: 2 },
  // Left of a vertical scrollbar, where the code scrolls vertically (filling its parent, or a showcase view); always, as CSS can't tell whether one shows
  scrollCopy: { right: `calc(${tokens.spacingHorizontalXS} + ${_SCROLLBAR_ROOM})` },
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
 * Represents a marker on a code block's line: the most serious of the issues at it, and their messages
 */
export interface LineMarker {
  /**
   * The most serious issue's severity: an error's marker over a warning's
   */
  severity: 'error' | 'warning';
  /**
   * The issues' messages, in order
   */
  messages: string[];
}

/**
 * Represents the markers of a code block's lines, by line, from 1
 */
export type LineMarkers = ReadonlyMap<number, LineMarker>;

/**
 * No markers
 */
export const NO_MARKERS: LineMarkers = new Map();

/**
 * Represents an issue a line marker is made of (see ShownIssue)
 */
export interface MarkedIssue {
  /**
   * Its severity
   */
  severity: 'error' | 'warning';
  /**
   * Its message
   */
  message: string;
  /**
   * POSIX-style path of its file
   */
  path: string;
  /**
   * Its line in the file, from 1, if it names one
   */
  line?: number;
}

/**
 * Gets the markers of the lines of a file's code block: one per line holding issues, an error's over a warning's, with every message at it
 * @param issues The issues
 * @param path POSIX-style path of the file shown
 * @param offset Number of lines shown before the file's first line (e.g. 1 for a fence's opening line); none by default
 * @returns The markers, by line of the code block
 */
export function getLineMarkers(issues: readonly MarkedIssue[], path: string, offset = 0): LineMarkers {
  const markers = new Map<number, LineMarker>();
  for (const issue of issues) {
    if (issue.path !== path || issue.line === undefined) continue;
    const line = issue.line + offset;
    const marker = markers.get(line);
    markers.set(line, {
      severity: marker?.severity === 'error' || issue.severity === 'error' ? 'error' : 'warning',
      messages: [...(marker?.messages ?? []), issue.message],
    });
  }
  return markers;
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
  /**
   * True for a showcase view: no margin or rounded corners of its own, and at most MAX_CODE_LINES lines or the viewport's height high, scrolling
   * inside; otherwise as high as its code
   */
  view?: boolean;
  /**
   * The markers of its lines (see getLineMarkers()); none by default
   */
  markers?: LineMarkers;
}

/**
 * Renders a code block: line numbers in a gutter that can't be selected beside the highlighted code, a marked line's number in its issue's colour
 * and a faint band across it (its messages as its tooltip), and a copy button
 * @param props Properties of the component
 * @returns The code block
 */
export function CodeBlock({ text, children, fill = false, copy = true, view = false, markers = NO_MARKERS }: CodeBlockProps): ReactNode {
  const styles = _useStyles();
  const lines = countLines(text);
  return (
    <div className={mergeClasses(styles.block, fill && styles.fillBlock, view && styles.viewBlock)}>
      <div className={mergeClasses(styles.scroll, fill && styles.fillScroll, view && styles.viewScroll)}>
        <div className={styles.gutter} aria-hidden="true">
          {Array.from({ length: lines }, (_, index) => {
            const marker = markers.get(index + 1);
            return (
              <div key={index} className={marker && styles[`${marker.severity}Number`]} data-line-marker={marker?.severity}>
                {index + 1}
              </div>
            );
          })}
        </div>
        <div className={styles.code}>
          {[...markers].map(([line, marker]) =>
            line <= lines ? (
              <div
                key={line}
                className={mergeClasses(styles.band, styles[`${marker.severity}Band`])}
                style={{ top: `calc(${tokens.spacingHorizontalM} + ${line - 1} * ${tokens.lineHeightBase300})` }}
                title={marker.messages.join('\n')}
                data-line-band={line}
              />
            ) : null,
          )}
          {children}
        </div>
      </div>
      {copy && <CopyButton text={text} className={mergeClasses(styles.copy, (fill || view) && styles.scrollCopy)} />}
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
  /**
   * True for a showcase view (see CodeBlockProps' `view`)
   */
  view?: boolean;
  /**
   * The markers of its lines (see CodeBlockProps' `markers`)
   */
  markers?: LineMarkers;
}

/**
 * Renders a text as a code block, highlighted as Markdown's code blocks are
 * @param props Properties of the component
 * @returns The code block
 */
export function HighlightedCode({ content, language, fill, copy, view, markers }: HighlightedCodeProps): ReactNode {
  return (
    <CodeBlock text={content} fill={fill} copy={copy} view={view} markers={markers}>
      <ReactMarkdown rehypePlugins={[rehypeHighlight]} skipHtml>
        {getFence(content, language).markdown}
      </ReactMarkdown>
    </CodeBlock>
  );
}

/**
 * Represents a segment of a code block highlighted in a language of its own
 */
export interface CodeSegment {
  /**
   * Its text: whole lines, with no line break ending it
   */
  text: string;
  /**
   * Its highlighting language
   */
  language: string;
}

/**
 * Renders highlighted segments, one after the other, as one code block: one line numbering, one copy button copying them all (e.g. a fence's lines
 * highlighted as Markdown around its inside highlighted as its language)
 * @param props Properties of the component: the segments, whether it is a showcase view (see CodeBlockProps' `view`), and its lines' markers
 * @returns The code block
 */
export function SegmentedCode({ segments, view, markers }: { segments: CodeSegment[]; view?: boolean; markers?: LineMarkers }): ReactNode {
  // Each segment is highlighted as a fence of its own, its `pre` dropped, so all their `code` elements share one `pre`; each code element's text
  // ends with a line break already, which separates it from the next
  const components = { pre: ({ children }: { children?: ReactNode }) => <>{children}</> };
  return (
    <CodeBlock text={segments.map(({ text }) => text).join('\n')} view={view} markers={markers}>
      <pre>
        {segments.map(({ text, language }, index) => (
          <Fragment key={index}>
            <ReactMarkdown rehypePlugins={[rehypeHighlight]} skipHtml components={components}>
              {getFence(text, language).markdown}
            </ReactMarkdown>
          </Fragment>
        ))}
      </pre>
    </CodeBlock>
  );
}

// #endregion
