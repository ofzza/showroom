/**
 * Entry point of the showroom, loaded by `index.html`: mounts the application with the shown host information and the current issues from the
 * virtual module; in `serve`, it follows the dev server's custom events, updating the URLs of the showcase frames and their tabs, and the issues,
 * without a reload. It has side effects, so nothing imports it, and it has no test.
 */

/// <reference types="vite/client" />

import host, { issues } from 'virtual:showroom-host';
import type { CheckIssue } from '../cli/check/index.js';
import type { ShownShowcase } from './host/index.js';
import { mount } from './index.js';

const _root = document.getElementById('root');
if (_root) {
  const update = mount(_root, host, issues);
  // Only the dev server has hot module replacement; `build` leaves this out
  if (import.meta.hot) {
    import.meta.hot.on('showroom:showcases', (showcases: ShownShowcase[]) => update({ showcases }));
    import.meta.hot.on('showroom:issues', (issues: CheckIssue[]) => update({ issues }));
  }
}
