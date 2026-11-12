#!/usr/bin/env node
/**
 * Executable entry point of the `showroom` command line (the `bin` in `package.json`); never imported
 */

import { main } from './index.js';

process.exitCode = await main(process.argv.slice(2));
