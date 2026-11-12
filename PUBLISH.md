# Publishing

How to release a new version of this package to NPM. Releases are cut from `develop` and published from `master`, following the branching model in [AGENTS.md](./AGENTS.md#branching).

## Showroom on GitHub Pages

This repository's own showroom is built and published to GitHub Pages by `.github/workflows/showroom.yml`, on every push to `master`, so it shows the latest release. Set it up once, in the GitHub repository's settings:

- [ ] **Settings › Pages › Build and deployment › Source** is "GitHub Actions".
- [ ] **Settings › Environments › `github-pages` › Deployment branches and tags** allows `master`. GitHub only lets the default branch (`develop`) deploy to this environment, so without it the deployment fails with "Branch "master" is not allowed to deploy to github-pages due to environment protection rules". The environment appears once Pages is set up.

## Before each publish

- [ ] **`develop` is clean and in sync with `origin`**: `git status` shows nothing to commit, and `git pull` brings in nothing new.
- [ ] **CI is green** for the head of `develop` on GitHub, on both `CI / Node 22` and `CI / Node 24`.
- [ ] **`npm run ci` passes locally**: build, ESLint, Prettier and the unit tests, type checks included.
- [ ] **The documentation matches the code**: the `README.md` `# Usage` section covers everything re-exported from `src/index.ts`, and its code samples have been checked against `tsc`.
- [ ] **The package contents are right**: `npm pack --dry-run` lists only `dist/`, `README.md`, `LICENSE.md` and `package.json`, with no `*.test.*` files under `dist/`.
- [ ] **The packed tarball works for a consumer**: see [Consumer smoke test](#consumer-smoke-test) below.
- [ ] **The new version has been chosen** following semver, and does not appear in `npm view <package> versions`. Nothing may be published under a version that has been used before, even one that was unpublished.
- [ ] **You are logged in to NPM**: `npm whoami` prints an account that may publish the package (and its scope, if scoped). If not, run `npm login`.
- [ ] **`master` can be fast-forwarded to `develop`**: `git log develop..master` prints nothing. If it prints commits (a hotfix, for example), merge `master` into `develop` first and start this checklist again.

### Consumer smoke test

Install the packed tarball into a throwaway project, and check that its types resolve under both `nodenext` and `bundler` module resolution, that it imports at runtime, and that its `showroom` command line (the `bin` in `package.json`) runs:

```sh
$ npm pack --pack-destination /tmp/<package>-smoke
$ cd /tmp/<package>-smoke
$ npm init -y && npm pkg set type=module
$ npm install ./<package>-<version>.tgz typescript
$ cat > smoke.ts <<'TS'
import { check, type CheckResult } from '<package>';
export const result: Promise<CheckResult> = check('.');
TS
$ npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext smoke.ts
$ npx tsc --noEmit --strict --module esnext --moduleResolution bundler smoke.ts
$ node -e "import('<package>').then(() => console.log('ok'))"
$ npx showroom --help
```

## Packaging and publishing

1. **Bump the version on `develop`.** `npm version` updates `package.json` and `package-lock.json`, commits the change, and tags the commit as `v<version>`:

   ```sh
   $ git switch develop
   $ npm version <major|minor|patch|x.y.z>
   ```

2. **Push `develop` with the tag**, and wait for CI to pass on the version commit:

   ```sh
   $ git push --follow-tags origin develop
   ```

3. **Fast-forward `master` to `develop`** and push it, so that `master` points at exactly the tagged commit:

   ```sh
   $ git switch master
   $ git pull --ff-only
   $ git merge --ff-only develop
   $ git push origin master
   ```

   The push also publishes the showroom: check that the `Showroom` workflow run passes, and that [ofzza.github.io/showroom](https://ofzza.github.io/showroom/) shows the new version (see [Showroom on GitHub Pages](#showroom-on-github-pages)).

4. **Publish from `master`.** `prepublishOnly` runs `npm run ci` first and aborts the publish if anything fails. `publishConfig.access` is already `public`, so `--access public` is not needed:

   ```sh
   $ npm publish
   ```

   A prerelease version (`x.y.z-alpha.n`, `-beta.n`, `-rc.n`) is rejected with "You must specify a tag using --tag when publishing a prerelease version". Publish it under its prerelease identifier, so that `latest` stays reserved for stable releases:

   ```sh
   $ npm publish --tag alpha
   ```

   If the account uses 2FA for publishing, also pass `--otp=<code>`. `prepublishOnly` runs before the upload, so use a freshly generated code.

5. **Verify the release**: `npm view <package> version` prints the new version, and installing `<package>@<version>` into a fresh project works. For a prerelease, check `npm view <package> dist-tags` instead, since `version` follows `latest`. Right after a package's _first_ publish, the registry may keep answering 404 for a while, because a 404 fetched before the publish stays cached. The tarball at `https://registry.npmjs.org/<package>/-/<package>-<version>.tgz` is available immediately and can be installed directly to verify.

6. **Switch back to `develop`** to continue work:

   ```sh
   $ git switch develop
   ```
