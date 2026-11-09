/**
 * Template entry point: a Hello World implementation, so there is something to build, run and test
 */

import { pathToFileURL } from 'node:url';

// #region Hello

/**
 * Gets a greeting for the given name
 * @param name Name to greet
 * @returns Greeting for the given name
 */
export function hello(name: string = 'World'): string {
  return `Hello ${name}!`;
}

// #endregion

// #region Entry point

// Only print when executed directly (`npm start`), never when imported
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(hello());
}

// #endregion
