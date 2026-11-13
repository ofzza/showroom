/**
 * The showroom's pages: the home page, a documentation file's page, and the not-found page
 */

import type { ReactNode } from 'react';
import { Body1, Caption1, Link, Title1, Title2, makeStyles, tokens } from '@fluentui/react-components';
import type { DocumentationFile, LinkedFile, ProjectInformation } from '../../host/index.js';
import { getOpeningTitleOffset } from '../../markdown/index.js';
import { isMarkdown, type ShownShowcase } from '../host/index.js';
import { Markdown } from '../markdown/index.js';
import { formatRoute } from '../routing/index.js';

// #region Styles

/**
 * Styles of the pages
 */
const _useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  project: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  fields: {
    display: 'grid',
    gridTemplateColumns: 'max-content 1fr',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalXS,
    margin: '0',
    // Long values (e.g. URLs) wrap anywhere, rather than widening the page on a narrow viewport
    '& dd': { margin: '0', minWidth: '0', overflowWrap: 'anywhere' },
    '& dt': { color: tokens.colorNeutralForeground3 },
  },
  text: { fontFamily: tokens.fontFamilyMonospace, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', margin: '0' },
  path: { color: tokens.colorNeutralForeground3 },
});

// #endregion

// #region Documentation content

/**
 * Represents the properties of the documentation content component
 */
export interface DocumentationContentProps {
  /**
   * The documentation file to show
   */
  file: DocumentationFile;
  /**
   * Documentation files, to resolve links against
   */
  documentation: DocumentationFile[];
  /**
   * Shown showcases, whose showcase frames are placed in the documentation files embedding them
   */
  showcases?: ShownShowcase[];
  /**
   * Linked files, to resolve links and images against
   */
  linkedFiles?: LinkedFile[];
}

/**
 * Renders a documentation file's content: `.md` files as Markdown, any other file as plain, wrapped, monospace text
 * @param props Properties of the component
 * @returns The rendered content
 */
export function DocumentationContent({ file, documentation, showcases, linkedFiles }: DocumentationContentProps): ReactNode {
  const styles = _useStyles();
  return isMarkdown(file) ? (
    <Markdown file={file} documentation={documentation} showcases={showcases} linkedFiles={linkedFiles} />
  ) : (
    <pre className={styles.text}>{file.content}</pre>
  );
}

// #endregion

// #region Home page

/**
 * Represents the properties of the home page
 */
export interface HomePageProps {
  /**
   * Project information
   */
  project: ProjectInformation;
  /**
   * The root `README`, if the host repository has one
   */
  readme?: DocumentationFile;
  /**
   * Documentation files, to resolve links against
   */
  documentation: DocumentationFile[];
  /**
   * Shown showcases, whose showcase frames are placed in the documentation files embedding them
   */
  showcases?: ShownShowcase[];
  /**
   * Linked files, to resolve links and images against
   */
  linkedFiles?: LinkedFile[];
}

/**
 * Gets the URL a project information link opens, for a value that is one (e.g. `git+https://...` opens `https://...`)
 * @param value Value of the project information field
 * @returns The URL, or undefined if the value isn't an HTTP(S) URL
 */
function _getProjectUrl(value: string): string | undefined {
  const url = value.replace(/^git\+/, '');
  return /^https?:\/\//i.test(url) ? url : undefined;
}

/**
 * Renders the project information: the project's name as a title (unless left out), its description, and its fields
 * @param props Properties of the component: the project information, and whether to leave out the title
 * @returns The rendered project information
 */
function _ProjectInformation({ project, untitled }: { project: ProjectInformation; untitled?: boolean }): ReactNode {
  const styles = _useStyles();
  const fields: [string, string | undefined, boolean][] = [
    ['Version', project.version, false],
    ['License', project.license, false],
    ['Author', project.author, false],
    ['Homepage', project.homepage, true],
    ['Repository', project.repository, true],
  ];
  return (
    <section className={styles.project}>
      {untitled ? null : <Title1 as="h1">{project.name}</Title1>}
      {project.description ? <Body1>{project.description}</Body1> : null}
      <dl className={styles.fields}>
        {fields
          .filter(([, value]) => value)
          .map(([label, value, isLink]) => {
            const url = isLink ? _getProjectUrl(value!) : undefined;
            return [
              <dt key={`${label}-label`}>
                <Body1>{label}</Body1>
              </dt>,
              <dd key={`${label}-value`}>
                {url ? (
                  <Link href={url} target="_blank" rel="noopener noreferrer">
                    {value}
                  </Link>
                ) : (
                  <Body1>{value}</Body1>
                )}
              </dd>,
            ];
          })}
      </dl>
    </section>
  );
}

/**
 * Renders the home page: the project information, followed by the root `README` if there is one. When the `README` is Markdown opening with a
 * level-1 heading, that heading is the page's title, and the project information follows it, without the project's name
 * @param props Properties of the component
 * @returns The rendered page
 */
export function HomePage({ project, readme, documentation, showcases, linkedFiles }: HomePageProps): ReactNode {
  const styles = _useStyles();
  const titled = readme !== undefined && isMarkdown(readme) && getOpeningTitleOffset(readme.content) !== undefined;
  return (
    <div className={styles.page}>
      {titled ? (
        <Markdown
          file={readme}
          documentation={documentation}
          showcases={showcases}
          linkedFiles={linkedFiles}
          afterTitle={<_ProjectInformation project={project} untitled />}
        />
      ) : (
        <>
          <_ProjectInformation project={project} />
          {readme ? <DocumentationContent file={readme} documentation={documentation} showcases={showcases} linkedFiles={linkedFiles} /> : null}
        </>
      )}
    </div>
  );
}

// #endregion

// #region Documentation page

/**
 * Represents the properties of a documentation file's page
 */
export interface DocumentationPageProps {
  /**
   * The documentation file shown
   */
  file: DocumentationFile;
  /**
   * Documentation files, to resolve links against
   */
  documentation: DocumentationFile[];
  /**
   * Shown showcases, whose showcase frames are placed in the documentation files embedding them
   */
  showcases?: ShownShowcase[];
  /**
   * Linked files, to resolve links and images against
   */
  linkedFiles?: LinkedFile[];
}

/**
 * Renders a documentation file's page: its path, then its content
 * @param props Properties of the component
 * @returns The rendered page
 */
export function DocumentationPage({ file, documentation, showcases, linkedFiles }: DocumentationPageProps): ReactNode {
  const styles = _useStyles();
  return (
    <article className={styles.page}>
      <Caption1 className={styles.path}>{file.path}</Caption1>
      <DocumentationContent file={file} documentation={documentation} showcases={showcases} linkedFiles={linkedFiles} />
    </article>
  );
}

// #endregion

// #region Not-found page

/**
 * Renders the not-found page, for a route that isn't a page of the showroom
 * @returns The rendered page
 */
export function NotFoundPage(): ReactNode {
  const styles = _useStyles();
  return (
    <div className={styles.page}>
      <Title2 as="h1">Page not found</Title2>
      <Body1>
        This page isn&apos;t in the showroom. <Link href={formatRoute()}>Go to the home page</Link>
      </Body1>
    </div>
  );
}

// #endregion
