/**
 * Markdown rendering of documentation files: GitHub-flavoured Markdown, with heading ids, syntax-highlighted code blocks, links resolved inside the showcase
 * application, relative images shown as their alt text, and no raw HTML
 */

import { useMemo, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { Link, Tooltip, makeStyles, tokens, type GriffelStyle } from '@fluentui/react-components';
import type { DocumentationFile } from '../../host/index.js';
import { isAbsoluteUrl, resolveLink } from '../links/index.js';
import { scrollToAnchor } from '../routing/index.js';

// #region Styles

/**
 * Tooltip of a link that points to nothing in the showroom
 */
export const UNRESOLVED_LINK_TOOLTIP = 'Not in the showroom';

/**
 * Colours of highlight.js's token classes, as FluentUI tokens, so code blocks follow the theme
 */
const _TOKEN_STYLES: [string[], GriffelStyle][] = [
  [['hljs-comment', 'hljs-quote'], { color: tokens.colorNeutralForeground3, fontStyle: 'italic' }],
  [['hljs-keyword', 'hljs-selector-tag', 'hljs-literal', 'hljs-doctag', 'hljs-meta .hljs-keyword'], { color: tokens.colorPaletteBerryForeground1 }],
  [['hljs-string', 'hljs-regexp', 'hljs-addition', 'hljs-meta .hljs-string'], { color: tokens.colorPaletteGreenForeground1 }],
  [['hljs-number', 'hljs-symbol', 'hljs-bullet', 'hljs-link'], { color: tokens.colorPaletteDarkOrangeForeground1 }],
  [['hljs-title', 'hljs-section', 'hljs-name', 'hljs-selector-id', 'hljs-selector-class'], { color: tokens.colorPaletteBlueForeground2 }],
  [['hljs-type', 'hljs-built_in', 'hljs-title.class_', 'hljs-class .hljs-title'], { color: tokens.colorPaletteTealForeground2 }],
  [['hljs-attr', 'hljs-attribute', 'hljs-variable', 'hljs-template-variable', 'hljs-property', 'hljs-params'], { color: tokens.colorPaletteRedForeground1 }],
  [['hljs-meta'], { color: tokens.colorNeutralForeground2 }],
  [['hljs-deletion'], { color: tokens.colorPaletteRedForeground1 }],
  [['hljs-emphasis'], { fontStyle: 'italic' }],
  [['hljs-strong'], { fontWeight: tokens.fontWeightSemibold }],
];

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
}

/**
 * Renders a documentation file's content as Markdown
 * @param props Properties of the component
 * @returns The rendered Markdown
 */
export function Markdown({ file, documentation }: MarkdownProps): ReactNode {
  const styles = _useStyles();
  // Kept between renders, so react-markdown doesn't remount every link and image on each one
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => (
        <_MarkdownLink href={href} from={file} documentation={documentation} unresolvedClassName={styles.unresolved}>
          {children}
        </_MarkdownLink>
      ),
      img: ({ src, alt }) => (typeof src === 'string' && isAbsoluteUrl(src) ? <img src={src} alt={alt ?? ''} /> : <span>{alt}</span>),
    }),
    [file, documentation, styles.unresolved],
  );
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug, rehypeHighlight]} skipHtml components={components}>
        {file.content}
      </ReactMarkdown>
    </div>
  );
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
