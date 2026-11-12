/**
 * The issues bar: the current issues of the host repository being served (the check's errors and warnings, and the showcases' build errors), in a
 * collapsible message bar at the top of the page; `serve` only, as `build` stops on errors
 */

import { useState, type ReactNode } from 'react';
import { Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, makeStyles, tokens } from '@fluentui/react-components';
import type { CheckIssue } from '../../cli/check/index.js';

// #region Issues bar

/**
 * Styles of the issues bar
 */
const _useStyles = makeStyles({
  bar: { marginBottom: tokens.spacingVerticalL },
  list: { margin: `${tokens.spacingVerticalXS} 0 0`, paddingLeft: tokens.spacingHorizontalL },
  location: { fontFamily: tokens.fontFamilyMonospace },
});

/**
 * Gets the issues bar's title: the number of errors and of warnings
 * @param issues The issues
 * @returns E.g. `2 errors, 1 warning`
 */
export function getIssuesTitle(issues: readonly CheckIssue[]): string {
  const count = (severity: CheckIssue['severity'], name: string) => {
    const n = issues.filter((issue) => issue.severity === severity).length;
    return n ? [`${n} ${name}${n === 1 ? '' : 's'}`] : [];
  };
  return [...count('error', 'error'), ...count('warning', 'warning')].join(', ');
}

/**
 * Gets an issue's location: its file, and its line if it has one
 * @param issue The issue
 * @returns E.g. `docs/guide.md:12`, or undefined if the issue has no file
 */
export function getIssueLocation(issue: CheckIssue): string | undefined {
  return issue.path ? `${issue.path}${issue.line !== undefined ? `:${issue.line}` : ''}` : undefined;
}

/**
 * Represents the properties of the issues bar
 */
export interface IssuesBarProps {
  /**
   * The current issues
   */
  issues: CheckIssue[];
}

/**
 * Renders the issues bar: an error bar if any issue is an error, otherwise a warning bar, titled with their numbers, listing every issue with its
 * file and line when expanded (at first); nothing without issues
 * @param props Properties of the component
 * @returns The issues bar
 */
export function IssuesBar({ issues }: IssuesBarProps): ReactNode {
  const styles = _useStyles();
  const [expanded, setExpanded] = useState(true);
  if (!issues.length) return null;
  return (
    <MessageBar className={styles.bar} intent={issues.some((issue) => issue.severity === 'error') ? 'error' : 'warning'} layout="multiline">
      <MessageBarBody>
        <MessageBarTitle>{getIssuesTitle(issues)}</MessageBarTitle>
        {expanded ? (
          <ul className={styles.list}>
            {issues.map((issue, index) => {
              const location = getIssueLocation(issue);
              return (
                <li key={index}>
                  {location ? <span className={styles.location}>{location}: </span> : null}
                  {issue.message}
                </li>
              );
            })}
          </ul>
        ) : null}
      </MessageBarBody>
      <MessageBarActions>
        <Button appearance="transparent" size="small" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide' : 'Show'}
        </Button>
      </MessageBarActions>
    </MessageBar>
  );
}

// #endregion
