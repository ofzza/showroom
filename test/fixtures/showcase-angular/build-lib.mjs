// Generates lib/, this fixture's own partially compiled library (as ng-packagr would publish it), from lib-src/, with the Angular compiler
// of the showroom repository it sits in: `node build-lib.mjs` from this folder; lib/ is committed, so run it only after changing lib-src/
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ngc = join(dirname(createRequire(import.meta.url).resolve('@angular/compiler-cli/package.json')), 'bundles', 'src', 'bin', 'ngc.js');
rmSync(join(here, 'lib'), { recursive: true, force: true });
execFileSync(process.execPath, [ngc, '-p', join(here, 'tsconfig.lib.json')], { cwd: here, stdio: 'inherit' });
