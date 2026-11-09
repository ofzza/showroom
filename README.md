# tsshowcase

[![npm](https://img.shields.io/npm/v/@ofzza/tsshowcase)](https://www.npmjs.com/package/@ofzza/tsshowcase)

Enforce and build documentation/showcase apps for TypeScript libraries.

---

Jump to section:

- [Get tsshowcase](#get-tsshowcase)
- [Usage](#usage)
  - [`hello(name?)`](#helloname)
- [Development](#development)
- [Contributing](#contributing)

# Get tsshowcase

tsshowcase is published as an NPM package:

```sh
$ npm install @ofzza/tsshowcase
```

# Usage

## `hello(name?)`

Gets a greeting for the given name, defaulting to `'World'`:

```ts
import { hello } from '@ofzza/tsshowcase';

hello(); // 'Hello World!'
hello('TypeScript'); // 'Hello TypeScript!'
```

Run as a script (`npm start`), the entry point prints `Hello World!`.

# Development

- `npm run build` - cleans `dist/` (`npm run clean`), then compiles `src/` into it, emitting declarations. Also run on `prepare`, so a local `npm install` builds too.
- `npm run dev` - the same, in watch mode.
- `npm start` - runs the built entry point, `dist/index.js`.
- `npm test` - runs every `test:*` script.
  - `npm run test:unit` - a single Vitest invocation that executes test files, runs their runtime expectations, and type checks them, reporting type errors as test failures.
- `npm run ci` - runs every `ci:*` script: build, ESLint, Prettier and the tests. This is what GitHub Actions runs on every pull request targeting, and every push to, `master` or `develop`, against Node 22 and 24. It also runs on `prepublishOnly`, so `npm publish` refuses to publish a failing build.

# Contributing

For reporting issues, contribution workflow and branching, see [CONTRIBUTE.md](./CONTRIBUTE.md).
For releasing a version, see [PUBLISH.md](./PUBLISH.md).

MIT - see [LICENSE.md](./LICENSE.md).
