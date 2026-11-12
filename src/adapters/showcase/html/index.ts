/**
 * The `html` showcase adapter: its entry point is an HTML page or fragment; it takes no options and needs nothing from the host repository.
 * Internal, never re-exported.
 */

import type { Showcase } from '../../../host/index.js';
import type { ShowcaseAdapter, ShowcaseBuildRequest, ShowcaseBuildResult, ShowcaseValidation } from '../index.js';

/**
 * Represents the `html` showcase adapter
 */
export class HtmlShowcaseAdapter implements ShowcaseAdapter {
  /**
   * Validates a showcase: it takes no options, and its entry point must be an `html` or `htm` code block, or a linked `.html` or `.htm` file
   * @param showcase The showcase
   * @returns No options, or the errors found
   */
  public validate(showcase: Showcase): ShowcaseValidation {
    const errors: string[] = [];
    if ('options' in showcase) {
      errors.push('The html showcase adapter takes no options');
    }
    if (!/\.html?$/i.test(showcase.entry)) {
      errors.push(
        showcase.kind === 'inline'
          ? 'The html showcase adapter needs an "html" or "htm" code block'
          : `The html showcase adapter needs a link to an .html or .htm file, not "${showcase.entry}"`,
      );
    }
    return errors.length ? { errors } : { errors: [] };
  }

  /**
   * Builds a showcase's showcase frame (not implemented yet: it comes with showcase frames in `build`)
   * @param _request What to build
   * @returns The showcase frame's files, or the build errors
   */
  public async build(_request: ShowcaseBuildRequest): Promise<ShowcaseBuildResult> {
    throw new Error('Building html showcases is not implemented yet');
  }
}
