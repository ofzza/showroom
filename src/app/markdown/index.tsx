/**
 * Markdown rendering of documentation files: GitHub-flavoured Markdown, with heading ids, syntax-highlighted code blocks, links resolved inside the
 * showroom, relative images shown as their alt text, showcase frames placed before their entry points, and no raw HTML
 */

import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { Link, Tooltip, makeStyles, tokens, type GriffelStyle } from '@fluentui/react-components';
import type { DocumentationFile } from '../../host/index.js';
import { getOpeningTitleOffset, isAbsoluteUrl } from '../../markdown/index.js';
import type { ShownShowcase } from '../host/index.js';
import { resolveLink } from '../links/index.js';
import { scrollToAnchor } from '../routing/index.js';
import { SHOWCASE_FRAME_ELEMENT, SHOWCASE_ID_PROPERTY, ShowcaseFrame, remarkShowcaseFrames } from '../showcases/index.js';

// #region Styles

/**
 * Tooltip of a link that points to nothing in the showroom
 */
export const UNRESOLVED_LINK_TOOLTIP = 'Not in the showroom';

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
 * Styles of rendered Markdown
 */
const _useStyles = makeStyles({
  markdown: {
    lineHeight: tokens.lineHeightBase400,
    fontSize: tokens.fontSizeBase400,
    overflowWrap: 'break-word',
    '& code': { fontFamily: tokens.fontFamilyMonospace, fontSize: '90%' },
    // Inline code; code blocks are told apart through their `pre` element
    '& :not(pre) > code': { backgroundColor: tokens.colorNeutralBackground3, padding: '0.1em 0.3em', borderRadius: tokens.borderRadiusSmall },
    '& pre': {
      backgroundColor: tokens.colorNeutralBackground3,
      padding: tokens.spacingHorizontalM,
      borderRadius: tokens.borderRadiusMedium,
      overflowX: 'auto',
      lineHeight: tokens.lineHeightBase300,
    },
    '& blockquote': {
      margin: '0',
      paddingLeft: tokens.spacingHorizontalM,
      borderLeft: `4px solid ${tokens.colorNeutralStroke1}`,
      color: tokens.colorNeutralForeground2,
    },
    '& table': { borderCollapse: 'collapse', display: 'block', overflowX: 'auto' },
    '& th': { border: `1px solid ${tokens.colorNeutralStroke1}`, padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}` },
    '& td': { border: `1px solid ${tokens.colorNeutralStroke1}`, padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}` },
    '& img': { maxWidth: '100%' },
    ...Object.fromEntries(_TOKEN_STYLES.flatMap(([classes, style]) => classes.map((name) => [`& .${name}`, style]))),
  },
  unresolved: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    cursor: 'help',
  },
});

// #endregion

// #region Markdown

/**
 * Represents the properties of the Markdown component
 */
export interface MarkdownProps {
  /**
   * The documentation file to render
   */
  file: DocumentationFile;
  /**
   * Documentation files, to resolve links against
   */
  documentation: DocumentationFile[];
  /**
   * Shown showcases, whose showcase frames are placed in the documentation file embedding them; none if not given
   */
  showcases?: ShownShowcase[];
  /**
   * Content placed right after the level-1 heading the file opens with (see getOpeningTitleOffset()); not shown if it doesn't open with one
   */
  afterTitle?: ReactNode;
}

/**
 * No shown showcases, the default of the Markdown component's, kept as one array so its memoised values stay put
 */
const _NO_SHOWCASES: ShownShowcase[] = [];

/**
 * Renders a documentation file's content as Markdown
 * @param props Properties of the component
 * @returns The rendered Markdown
 */
export function Markdown({ file, documentation, showcases = _NO_SHOWCASES, afterTitle }: MarkdownProps): ReactNode {
  const styles = _useStyles();
  const titleOffset = useMemo(() => (afterTitle === undefined ? undefined : getOpeningTitleOffset(file.content)), [afterTitle, file.content]);
  const fileShowcases = useMemo(() => showcases.filter((showcase) => showcase.documentation === file.path), [showcases, file.path]);
  const remarkPlugins = useMemo<Options['remarkPlugins']>(() => [remarkGfm, [remarkShowcaseFrames, { showcases: fileShowcases }]], [fileShowcases]);
  // Kept between renders, so react-markdown doesn't remount every link, image and showcase frame on each one; the theme and the showcases reach
  // showcase frames through contexts, so neither a theme change nor a showcase frame's new URL remounts them
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => (
        <_MarkdownLink href={href} from={file} documentation={documentation} unresolvedClassName={styles.unresolved}>
          {children}
        </_MarkdownLink>
      ),
      // The opening title is told apart by its offset, as the file is rendered whole (showcase frames are placed by offsets too)
      h1: ({ node, ...props }) =>
        titleOffset !== undefined && node?.position?.start.offset === titleOffset ? (
          <>
            <h1 {...props} />
            {afterTitle}
          </>
        ) : (
          <h1 {...props} />
        ),
      img: ({ src, alt }) => (typeof src === 'string' && isAbsoluteUrl(src) ? <img src={src} alt={alt ?? ''} /> : <span>{alt}</span>),
      // An element react-markdown's types don't know, as the remark plugin names it
      ...({
        [SHOWCASE_FRAME_ELEMENT]: (props: Record<string, unknown>) => <PlacedShowcaseFrame id={props[SHOWCASE_ID_PROPERTY]} />,
      } as Components),
    }),
    [file, documentation, styles.unresolved, titleOffset, afterTitle],
  );
  return (
    <div className={styles.markdown}>
      <_ShowcasesContext.Provider value={fileShowcases}>
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={[rehypeSlug, rehypeHighlight]} skipHtml components={components}>
          {file.content}
        </ReactMarkdown>
      </_ShowcasesContext.Provider>
    </div>
  );
}

/**
 * Context holding the shown showcases of the documentation file being rendered, which its placed showcase frames look themselves up in
 */
const _ShowcasesContext = createContext<ShownShowcase[]>(_NO_SHOWCASES);

/**
 * Renders a showcase frame the remark plugin placed, looking its showcase up by id in the documentation file's showcases
 * @param props Properties of the component: the showcase's id
 * @returns The showcase frame, or nothing if no showcase has that id
 */
export function PlacedShowcaseFrame({ id }: { id: unknown }): ReactNode {
  const showcase = useContext(_ShowcasesContext).find((candidate) => candidate.id === id);
  return showcase ? <ShowcaseFrame showcase={showcase} /> : null;
}

/**
 * Represents the properties of a link in rendered Markdown
 */
interface _MarkdownLinkProps {
  /**
   * The link's target, as written in the Markdown
   */
  href?: string;
  /**
   * The documentation file holding the link
   */
  from: DocumentationFile;
  /**
   * Documentation files, to resolve the link against
   */
  documentation: DocumentationFile[];
  /**
   * Class name of a link that points to nothing in the showroom
   */
  unresolvedClassName: string;
  /**
   * The link's content
   */
  children?: ComponentProps<'a'>['children'];
}

/**
 * Renders a link in rendered Markdown: to an absolute URL in a new tab, to a page of the showroom, or as plain text with a tooltip when it
 * points to nothing in the showroom
 * @param props Properties of the component
 * @returns The rendered link
 */
function _MarkdownLink({ href, from, documentation, unresolvedClassName, children }: _MarkdownLinkProps): ReactNode {
  const link = href === undefined ? ({ kind: 'unresolved' } as const) : resolveLink(href, from, documentation);
  switch (link.kind) {
    case 'external':
      return (
        <Link inline href={link.href} target="_blank" rel="noopener noreferrer">
          {children}
        </Link>
      );
    case 'route':
      return (
        <Link
          inline
          href={link.href}
          // A link to the page and heading already shown doesn't change the hash, so it scrolls by itself
          onClick={() => window.location.hash === link.href && scrollToAnchor(link.anchor)}
        >
          {children}
        </Link>
      );
    case 'unresolved':
      return (
        <Tooltip content={UNRESOLVED_LINK_TOOLTIP} relationship="description">
          <span className={unresolvedClassName} tabIndex={0}>
            {children}
          </span>
        </Tooltip>
      );
  }
}

// #endregion
