/**
 * Markdown rendering of documentation files: GitHub-flavoured Markdown, with heading ids, syntax-highlighted code blocks with line numbers and a copy
 * button, links resolved inside the showroom (linked files marked with a "code" icon, opening in the
 * modal, or in a new tab; a linked showcase shown inline with included files, with its tabs), relative images shown from their linked files (or as
 * their alt text), showcase frames placed before their entry points, showcases shown as blocks in their entry points' place, and no raw HTML
 */

import { createContext, useContext, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { Link, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { Code16Regular } from '@fluentui/react-icons';
import type { DocumentationFile, LinkedFile } from '../../host/index.js';
import { getOpeningTitleOffset } from '../../markdown/index.js';
import { CodeBlock } from '../code/index.js';
import { ShowcaseBlock } from '../code-pane/index.js';
import { LinkedFileDialog } from '../file-modal/index.js';
import type { ShownShowcase } from '../host/index.js';
import { resolveImage, resolveLink } from '../links/index.js';
import { scrollToAnchor } from '../routing/index.js';
import { SHOWCASE_BLOCK_ELEMENT, SHOWCASE_FRAME_ELEMENT, SHOWCASE_ID_PROPERTY, ShowcaseFrame, remarkShowcaseFrames } from '../showcases/index.js';

// #region Styles

/**
 * Tooltip of a link that points to nothing in the showroom
 */
export const UNRESOLVED_LINK_TOOLTIP = 'Not in the showroom';

/**
 * Styles of rendered Markdown
 */
const _useStyles = makeStyles({
  markdown: {
    lineHeight: tokens.lineHeightBase400,
    fontSize: tokens.fontSizeBase400,
    overflowWrap: 'break-word',
    // Inline code; code blocks are told apart through their `pre` element, and styled by CodeBlock
    '& :not(pre) > code': {
      fontFamily: tokens.fontFamilyMonospace,
      fontSize: '90%',
      backgroundColor: tokens.colorNeutralBackground3,
      padding: '0.1em 0.3em',
      borderRadius: tokens.borderRadiusSmall,
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
  },
  fileIcon: { marginLeft: '0.15em', verticalAlign: 'middle' },
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
   * Linked files, to resolve links and images against; none if not given
   */
  linkedFiles?: LinkedFile[];
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
 * No linked files, the default of the Markdown component's, kept as one array so its memoised values stay put
 */
const _NO_LINKED_FILES: LinkedFile[] = [];

/**
 * Renders a documentation file's content as Markdown
 * @param props Properties of the component
 * @returns The rendered Markdown
 */
export function Markdown({ file, documentation, showcases = _NO_SHOWCASES, linkedFiles = _NO_LINKED_FILES, afterTitle }: MarkdownProps): ReactNode {
  const styles = _useStyles();
  // The linked file shown in the modal, if any, with the id of the linked showcase shown inline whose tabs it shows
  const [shown, setShown] = useState<{ file: LinkedFile; showcase?: string } | undefined>(undefined);
  const titleOffset = useMemo(() => (afterTitle === undefined ? undefined : getOpeningTitleOffset(file.content)), [afterTitle, file.content]);
  const fileShowcases = useMemo(() => showcases.filter((showcase) => showcase.documentation === file.path), [showcases, file.path]);
  const remarkPlugins = useMemo<Options['remarkPlugins']>(() => [remarkGfm, [remarkShowcaseFrames, { showcases: fileShowcases }]], [fileShowcases]);
  // Kept between renders, so react-markdown doesn't remount every link, image and showcase frame on each one; the theme and the showcases reach
  // showcase frames through contexts, so neither a theme change nor a showcase frame's new URL remounts them
  const components = useMemo<Components>(
    () => ({
      a: ({ node, href, children }) => (
        <MarkdownLink
          href={href}
          offset={node?.position?.start.offset}
          from={file}
          documentation={documentation}
          linkedFiles={linkedFiles}
          onShowFile={(shownFile, showcase) => setShown({ file: shownFile, showcase })}
          fileIconClassName={styles.fileIcon}
          unresolvedClassName={styles.unresolved}
        >
          {children}
        </MarkdownLink>
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
      // Code blocks, each in a CodeBlock around rehype-highlight's output
      pre: ({ node, children }) => {
        const code = node?.children.find((child) => child.type === 'element' && child.tagName === 'code');
        return (
          <CodeBlock text={code ? _getText(code) : ''}>
            <pre>{children}</pre>
          </CodeBlock>
        );
      },
      img: ({ src, alt }) => {
        const url = typeof src === 'string' ? resolveImage(src, file, linkedFiles) : undefined;
        return url ? <img src={url} alt={alt ?? ''} /> : <span>{alt}</span>;
      },
      // An element react-markdown's types don't know, as the remark plugin names it
      ...({
        [SHOWCASE_FRAME_ELEMENT]: (props: Record<string, unknown>) => <PlacedShowcaseFrame id={props[SHOWCASE_ID_PROPERTY]} />,
        [SHOWCASE_BLOCK_ELEMENT]: (props: Record<string, unknown>) => <PlacedShowcaseBlock id={props[SHOWCASE_ID_PROPERTY]} documentation={documentation} />,
      } as Components),
    }),
    [file, documentation, linkedFiles, styles.fileIcon, styles.unresolved, titleOffset, afterTitle],
  );
  return (
    <div className={styles.markdown}>
      <_ShowcasesContext.Provider value={fileShowcases}>
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={[rehypeSlug, rehypeHighlight]} skipHtml components={components}>
          {file.content}
        </ReactMarkdown>
      </_ShowcasesContext.Provider>
      <LinkedFileDialog
        file={shown?.file}
        tabs={shown?.showcase === undefined ? undefined : fileShowcases.find((showcase) => showcase.id === shown.showcase)?.tabs}
        documentation={documentation}
        onClose={() => setShown(undefined)}
      />
    </div>
  );
}

/**
 * Represents the few fields of a syntax tree node (hast) that getting a code block's text reads
 */
interface _TextNode {
  type: string;
  value?: string;
  children?: _TextNode[];
}

/**
 * Gets the text of a node of the syntax tree (hast): its text nodes' values, joined
 * @param node The node
 * @returns Its text
 */
function _getText(node: _TextNode): string {
  return node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(_getText).join('');
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
 * Renders a showcase shown as a block that the remark plugin placed, looking its showcase up by id in the documentation file's showcases
 * @param props Properties of the component: the showcase's id, and the shown documentation files
 * @returns The block, or nothing if no showcase has that id
 */
export function PlacedShowcaseBlock({ id, documentation }: { id: unknown; documentation: DocumentationFile[] }): ReactNode {
  const showcase = useContext(_ShowcasesContext).find((candidate) => candidate.id === id);
  return showcase ? <ShowcaseBlock showcase={showcase} documentation={documentation} /> : null;
}

/**
 * Represents the properties of a link in rendered Markdown
 */
export interface MarkdownLinkProps {
  /**
   * The link's target, as written in the Markdown
   */
  href?: string;
  /**
   * Offset of the link in the documentation file's content, which tells a linked showcase's link apart
   */
  offset?: number;
  /**
   * The documentation file holding the link
   */
  from: DocumentationFile;
  /**
   * Documentation files, to resolve the link against
   */
  documentation: DocumentationFile[];
  /**
   * Linked files, to resolve the link against
   */
  linkedFiles: LinkedFile[];
  /**
   * Shows a linked file in the modal, with the tabs of the linked showcase shown inline it is the entry point of, if any
   */
  onShowFile: (file: LinkedFile, showcase?: string) => void;
  /**
   * Class name of the "code" icon after a link to a linked file
   */
  fileIconClassName: string;
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
 * Renders a link in rendered Markdown: to an absolute URL in a new tab, to a page of the showroom, to a linked file (a text file up to 1 MB in the
 * modal, any other in a new tab; a linked showcase shown inline with included files, with its tabs), marked with a "code" icon, or as plain text
 * with a tooltip when it points to nothing in the showroom; exported only as ESLint's React hooks rules take a `_`-prefixed function for no component
 * @param props Properties of the component
 * @returns The rendered link
 */
export function MarkdownLink({
  href,
  offset,
  from,
  documentation,
  linkedFiles,
  onShowFile,
  fileIconClassName,
  unresolvedClassName,
  children,
}: MarkdownLinkProps): ReactNode {
  const link = href === undefined ? ({ kind: 'unresolved' } as const) : resolveLink(href, from, documentation, linkedFiles);
  // The linked showcase shown inline this link is the entry point of, when it has included files to show as tabs
  const showcase = useContext(_ShowcasesContext).find(
    (candidate) => candidate.offset === offset && candidate.display === 'inline' && candidate.tabs.length > 1,
  );
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
    case 'file': {
      // The link's own text names the file, so the icon is hidden from screen readers
      const icon = <Code16Regular className={fileIconClassName} aria-hidden="true" />;
      return link.file.text ? (
        <Link
          inline
          href={link.href}
          // The link's own URL still opens the file in a new tab, from the browser's menu or with a modifier key
          onClick={(event) => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onShowFile(link.file, showcase?.id);
          }}
        >
          {children}
          {icon}
        </Link>
      ) : (
        <Link inline href={link.href} target="_blank" rel="noopener noreferrer">
          {children}
          {icon}
        </Link>
      );
    }
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
