#!/usr/bin/env node
/**
 * Executable entry point of the `showroom` command line (the `bin` in `package.json`); never imported. It installs the command line's clean-up
 * (the processes recorded showcases start, and the run folders), which the library never does.
 */

import { installCleanUp } from '../processes/index.js';
import { main } from './index.js';

installCleanUp();
process.exitCode = await main(process.argv.slice(2));
