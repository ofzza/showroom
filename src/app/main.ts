/**
 * Entry point of the showcase application, loaded by `index.html`: mounts the application with the shown host information from the virtual module. It has
 * side effects, so nothing imports it, and it has no test.
 */

import host from 'virtual:tsshowcase-host';
import { mount } from './index.js';

const _root = document.getElementById('root');
if (_root) {
  mount(_root, host);
}
