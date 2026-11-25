/**
 * Markdown rendering of documentation files: GitHub-flavoured Markdown, with heading ids, syntax-highlighted code blocks with line numbers and a copy
 * button, links resolved inside the showroom (linked files marked with a "code" icon before their text, opening in the showcase sidebar, or in a new
 * tab; linked showcases shown inline marked with a "play" icon, opening the showcase in the showcase sidebar), relative images shown from their
 * linked files (or as their alt text), showcases shown as blocks in their entry points' place, and no raw HTML
 */

import { createContext, useContext, useMemo, useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { Link, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { Code16Regular, Link16Regular, Play16Regular } from '@fluentui/react-icons';
import type { DocumentationFile, LinkedFile } from '../../host/index.js';
import { getOpeningTitleOffset } from '../../markdown/index.js';
import { CodeBlock } from '../code/index.js';
import { ShowcaseBlock, SidebarShowcase } from '../code-pane/index.js';
import { ShowcaseSidebar } from '../showcase-sidebar/index.js';
import type { ShownShowcase, ShownVirtualFile } from '../host/index.js';
import { resolveImage, resolveLink } from '../links/index.js';
import { NARROW_VIEWPORT } from '../layout/index.js';
import { getDocumentationRoute, replaceRoute, scrollToAnchor } from '../routing/index.js';
import { SHOWCASE_BLOCK_ELEMENT, SHOWCASE_ID_PROPERTY, SHOWCASE_VIRTUAL_FILE_ELEMENT, VirtualFileViews, remarkShowcaseFrames } from '../showcases/index.js';

// #region Styles

/**
 * Tooltip of a link that points to nothing in the showroom
 */
export const UNRESOLVED_LINK_TOOLTIP = 'Not in the showroom';

/**
 * Label of a heading's link icon
 */
export const HEADING_LINK_LABEL = 'Link to this heading';

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
  // A heading linking to itself (D938, PLAN-P27-collapsed-inherited.md): its link icon in the left margin, so the heading never moves, shown on its
  // hover or the icon's focus, and hidden on narrow viewports, where there is no margin (clicking the heading still links it)
  heading: {
    position: 'relative',
    cursor: 'pointer',
    '&:hover > a[data-heading-link]': { opacity: 1 },
  },
  headingLink: {
    position: 'absolute',
    right: '100%',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'inline-flex',
    paddingRight: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
    opacity: 0,
    ':focus-visible': { opacity: 1 },
    ':hover': { color: tokens.colorBrandForegroundLink },
    [NARROW_VIEWPORT]: { display: 'none' },
  },
  // A link's icon, before its text, inside the link; the link underlined by a bottom border, as no underline is drawn under an inline SVG (D622)
  icon: { marginRight: '0.15em', verticalAlign: 'middle' },
  iconLink: {
    textDecorationLine: 'none',
    borderBottom: `${tokens.strokeWidthThin} solid currentColor`,
    ':hover': { textDecorationLine: 'none' },
    ':active': { textDecorationLine: 'none' },
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
   * Shown virtual files, placed in the documentation file holding them; none if not given
   */
  virtualFiles?: ShownVirtualFile[];
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
 * No shown virtual files, the default of the Markdown component's, kept as one array so its memoised values stay put
 */
const _NO_VIRTUAL_FILES: ShownVirtualFile[] = [];

/**
 * No linked files, the default of the Markdown component's, kept as one array so its memoised values stay put
 */
const _NO_LINKED_FILES: LinkedFile[] = [];

/**
 * Renders a documentation file's content as Markdown
 * @param props Properties of the component
 * @returns The rendered Markdown
 */
export function Markdown({
  file,
  documentation,
  showcases = _NO_SHOWCASES,
  virtualFiles = _NO_VIRTUAL_FILES,
  linkedFiles = _NO_LINKED_FILES,
  afterTitle,
}: MarkdownProps): ReactNode {
  const styles = _useStyles();
  // What the showcase sidebar shows, if anything: a linked file, or a linked showcase shown inline (by id, so it follows the showcase's updates)
  const [shown, setShown] = useState<{ file: LinkedFile } | { showcase: string } | undefined>(undefined);
  const titleOffset = useMemo(() => (afterTitle === undefined ? undefined : getOpeningTitleOffset(file.content)), [afterTitle, file.content]);
  const fileShowcases = useMemo(() => showcases.filter((showcase) => showcase.documentation === file.path), [showcases, file.path]);
  const fileVirtualFiles = useMemo(() => virtualFiles.filter((virtualFile) => virtualFile.documentation === file.path), [virtualFiles, file.path]);
  const remarkPlugins = useMemo<Options['remarkPlugins']>(
    () => [remarkGfm, [remarkShowcaseFrames, { showcases: fileShowcases, virtualFiles: fileVirtualFiles }]],
    [fileShowcases, fileVirtualFiles],
  );
  // Kept between renders, so react-markdown doesn't remount every link, image and showcase frame on each one; the theme and the showcases reach
  // showcase frames through contexts, so neither a theme change nor a showcase frame's new URL remounts them
  const components = useMemo<Components>(() => {
    const heading = (level: _HeadingLevel, props: ComponentProps<'h1'>): ReactNode => (
      <MarkdownHeading level={level} file={file} className={styles.heading} linkClassName={styles.headingLink} {...props} />
    );
    return {
      a: ({ node, href, children }) => (
        <MarkdownLink
          href={href}
          offset={node?.position?.start.offset}
          from={file}
          documentation={documentation}
          linkedFiles={linkedFiles}
          onShowFile={(shownFile) => setShown({ file: shownFile })}
          onShowShowcase={(showcase) => setShown({ showcase })}
          iconClassName={styles.icon}
          iconLinkClassName={styles.iconLink}
          unresolvedClassName={styles.unresolved}
        >
          {children}
        </MarkdownLink>
      ),
      // Every heading links to itself; the opening title is told apart by its offset, as the file is rendered whole (showcase frames are placed by
      // offsets too)
      h1: ({ node, ...props }) =>
        titleOffset !== undefined && node?.position?.start.offset === titleOffset ? (
          <>
            {heading('h1', props)}
            {afterTitle}
          </>
        ) : (
          heading('h1', props)
        ),
      h2: ({ node: _node, ...props }) => heading('h2', props),
      h3: ({ node: _node, ...props }) => heading('h3', props),
      h4: ({ node: _node, ...props }) => heading('h4', props),
      h5: ({ node: _node, ...props }) => heading('h5', props),
      h6: ({ node: _node, ...props }) => heading('h6', props),
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
        [SHOWCASE_BLOCK_ELEMENT]: (props: Record<string, unknown>) => <PlacedShowcaseBlock id={props[SHOWCASE_ID_PROPERTY]} documentation={documentation} />,
        [SHOWCASE_VIRTUAL_FILE_ELEMENT]: (props: Record<string, unknown>) => <PlacedVirtualFile path={props[SHOWCASE_ID_PROPERTY]} />,
      } as Components),
    };
  }, [file, documentation, linkedFiles, styles.icon, styles.iconLink, styles.unresolved, styles.heading, styles.headingLink, titleOffset, afterTitle]);
  const shownShowcase = shown && 'showcase' in shown ? fileShowcases.find((showcase) => showcase.id === shown.showcase) : undefined;
  return (
    <div className={styles.markdown}>
      <_ShowcasesContext.Provider value={fileShowcases}>
        <_VirtualFilesContext.Provider value={fileVirtualFiles}>
          <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={[rehypeSlug, rehypeHighlight]} skipHtml components={components}>
            {file.content}
          </ReactMarkdown>
        </_VirtualFilesContext.Provider>
      </_ShowcasesContext.Provider>
      <ShowcaseSidebar file={shown && 'file' in shown ? shown.file : undefined} documentation={documentation} onClose={() => setShown(undefined)} />
      <SidebarShowcase showcase={shownShowcase} documentation={documentation} onClose={() => setShown(undefined)} />
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
 * The shown virtual files of the documentation file being rendered, which placed virtual files look theirs up in
 */
const _VirtualFilesContext = createContext<ShownVirtualFile[]>(_NO_VIRTUAL_FILES);

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
 * Renders a shown virtual file the remark plugin placed, looking it up by path in the documentation file's shown virtual files
 * @param props Properties of the component: the virtual file's path
 * @returns Its views, or nothing if no shown virtual file has that path
 */
export function PlacedVirtualFile({ path }: { path: unknown }): ReactNode {
  const file = useContext(_VirtualFilesContext).find((candidate) => candidate.path === path);
  return file ? <VirtualFileViews file={file} /> : null;
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
   * Shows a linked file in the showcase sidebar
   */
  onShowFile: (file: LinkedFile) => void;
  /**
   * Shows a linked showcase shown inline in the showcase sidebar, by its id
   */
  onShowShowcase: (id: string) => void;
  /**
   * Class name of the icon before a link's text: a linked file's "code" icon, or a linked showcase shown inline's "play" icon
   */
  iconClassName: string;
  /**
   * Class name of a link with an icon
   */
  iconLinkClassName: string;
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
 * showcase sidebar, any other in a new tab), marked with a "code" icon before its text, to a linked showcase shown inline (opening it in the showcase
 * sidebar), marked with a "play" icon, or as plain text with a tooltip when it points to nothing in the showroom; exported only as ESLint's React
 * hooks rules take a `_`-prefixed function for no component
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
  onShowShowcase,
  iconClassName,
  iconLinkClassName,
  unresolvedClassName,
  children,
}: MarkdownLinkProps): ReactNode {
  const link = href === undefined ? ({ kind: 'unresolved' } as const) : resolveLink(href, from, documentation, linkedFiles);
  // The linked showcase shown inline this link is the entry point of, if any
  const showcase = useContext(_ShowcasesContext).find((candidate) => candidate.offset === offset && candidate.display === 'inline');
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
      const icon = showcase ? (
        <Play16Regular className={iconClassName} aria-hidden="true" data-link-icon="showcase" />
      ) : (
        <Code16Regular className={iconClassName} aria-hidden="true" data-link-icon="file" />
      );
      return link.file.text || showcase ? (
        <Link
          inline
          className={iconLinkClassName}
          href={link.href}
          // The link's own URL still opens the file in a new tab, from the browser's menu or with a modifier key
          onClick={(event) => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            if (showcase) onShowShowcase(showcase.id);
            else onShowFile(link.file);
          }}
        >
          {icon}
          {children}
        </Link>
      ) : (
        <Link inline className={iconLinkClassName} href={link.href} target="_blank" rel="noopener noreferrer">
          {icon}
          {children}
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

// #region Headings

/**
 * Represents a heading's element name
 */
type _HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/**
 * Represents the properties of a heading linking to itself
 */
export interface MarkdownHeadingProps extends ComponentProps<'h1'> {
  /**
   * The heading's element name
   */
  level: _HeadingLevel;
  /**
   * Documentation file the heading is in, whose route its link carries
   */
  file: DocumentationFile;
  /**
   * Class name of the heading
   */
  className: string;
  /**
   * Class name of its link icon
   */
  linkClassName: string;
}

/**
 * Renders a heading linking to itself (D938, PLAN-P27-collapsed-inherited.md): a link icon in front of it, and a click on either (not one ending a
 * text selection, nor one on a link inside it) replacing the URL with its page's route and its id as the anchor, without adding to the history
 * @param props Properties of the component
 * @returns The rendered heading; a plain one without an id
 */
export function MarkdownHeading({ level: Level, file, className, linkClassName, id, children, ...props }: MarkdownHeadingProps): ReactNode {
  if (!id) {
    return <Level {...props}>{children}</Level>;
  }
  const route = getDocumentationRoute(file, id);
  const link = (): void => {
    // replaceRoute() tells the router, which scrolls to the anchor; the same route again doesn't change, so it scrolls here
    if (window.location.hash === route) scrollToAnchor(id);
    else replaceRoute(route);
  };
  const onHeadingClick = (event: MouseEvent<HTMLElement>): void => {
    if (event.button !== 0 || (event.target as Element).closest('a')) return;
    if (window.getSelection()?.toString()) return;
    link();
  };
  return (
    <Level id={id} className={className} onClick={onHeadingClick} {...props}>
      <a
        href={route}
        className={linkClassName}
        aria-label={HEADING_LINK_LABEL}
        data-heading-link=""
        // The link's own URL still opens the heading in a new tab, from the browser's menu or with a modifier key
        onClick={(event) => {
          if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          link();
        }}
      >
        <Link16Regular aria-hidden="true" />
      </a>
      {children}
    </Level>
  );
}

// #endregion
