/**
 * Tests of the issues bar
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FluentProvider, SSRProvider, webLightTheme } from '@fluentui/react-components';
import type { CheckIssue } from '../../cli/check/index.js';
import { IssuesBar, getIssueLocation, getIssuesTitle } from './index.js';

/**
 * Renders the issues bar to HTML on the server
 * @param issues The issues
 * @returns The rendered HTML, without the empty comments React puts between adjacent text nodes
 */
function _render(issues: CheckIssue[]): string {
  return renderToString(
    <SSRProvider>
      <FluentProvider theme={webLightTheme}>
        <IssuesBar issues={issues} />
      </FluentProvider>
    </SSRProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('app/issues', () => {
  // Tests the issues bar rendered to HTML on the server (expanded, as it starts; collapsing needs a DOM), and its title and locations.

  const error: CheckIssue = { severity: 'error', message: 'Showcase README.md#1 (README.md:5): Broke <here>', path: 'README.md', line: 7 };
  const warning: CheckIssue = { severity: 'warning', message: 'Several readme files', path: 'docs' };

  it('Renders nothing without issues', () => {
    expect(_render([])).not.toContain('fui-MessageBar');
  });

  it('Lists every issue with its file and line, escaped', () => {
    const html = _render([error, warning, { severity: 'warning', message: 'No file' }]);
    expect(html).toContain('README.md:7: </span>Showcase README.md#1 (README.md:5): Broke &lt;here&gt;');
    expect(html).toContain('docs: </span>Several readme files');
    expect(html).toContain('<li>No file</li>');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('>Hide<');
  });

  it('Is an error bar with any error, otherwise a warning bar', () => {
    // The intent only shows in the bar's icon
    const icon = (issues: CheckIssue[]) => /<path d="([^"]*)"/.exec(_render(issues))?.[1];
    expect(icon([warning, error])).toBe(icon([error]));
    expect(icon([warning])).not.toBe(icon([error]));
  });

  it('Titles the bar with the number of errors and warnings', () => {
    expect(getIssuesTitle([error])).toBe('1 error');
    expect(getIssuesTitle([error, error, warning])).toBe('2 errors, 1 warning');
    expect(getIssuesTitle([warning, warning])).toBe('2 warnings');
    expect(getIssuesTitle([])).toBe('');
  });

  it("Gets an issue's location", () => {
    expect(getIssueLocation(error)).toBe('README.md:7');
    expect(getIssueLocation(warning)).toBe('docs');
    expect(getIssueLocation({ severity: 'error', message: 'x', path: 'a.md', line: 0 })).toBe('a.md:0');
    expect(getIssueLocation({ severity: 'error', message: 'x' })).toBeUndefined();
  });
});
