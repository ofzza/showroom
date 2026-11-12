import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Absolute path of this repository's root
 */
const _ROOT = fileURLToPath(new URL('.', import.meta.url));

/**
 * Test tiers beside `unit`, each a Vitest project of its own: real showcase adapter builds (`integration`), the command line on fixture copies
 * (`e2e`), and the dev server (`serve`)
 */
const _TIERS = ['integration', 'e2e', 'serve'] as const;

/**
 * Globs of the other tiers' test files, which the `unit` project leaves out although they end in `.test.*` too
 */
const _OTHER_TIERS = _TIERS.map((tier) => `src/**/*.${tier}.test.{js,jsx,ts,tsx}`);

/**
 * Gets the environment variables pointing a test project's OS temp folder into this repository
 * @param tier Name of the test project
 * @returns `TMPDIR`, `TMP` and `TEMP`, all set to `node_modules/.cache/showroom-tests/tmp-<tier>/`
 */
function _getTemporaryFolderEnv(tier: string): Record<string, string> {
  const folder = join(_ROOT, 'node_modules', '.cache', 'showroom-tests', `tmp-${tier}`);
  return { TMPDIR: folder, TMP: folder, TEMP: folder };
}

export default defineConfig({
  test: {
    reporters: ['tree'],
    projects: [
      // Only defined when `VITEST_DEBUG=1`, so that an unfiltered run (plain `vitest`, CI, tools listing every project) does not run every test twice.
      // `vitest --project debug` without it fails with "No projects were found".
      ...(process.env.VITEST_DEBUG === '1'
        ? [
            {
              test: {
                name: 'debug',
                setupFiles: [],
                include: ['src/**/*.{test,unit.test,spec,unit.spec,debug,debug.test}.{js,jsx,ts,tsx}'],
                exclude: ['node_modules/**', 'dist/**'],
              },
            },
          ]
        : []),
      {
        // Test files are run twice: executed by the default pool for their runtime expectations, and type checked by `tsc` for their compile time
        // assertions. `include` and `typecheck.include` deliberately match the same files, which is why each test file is reported twice.
        // Type-only `*.test-d.*` / `*.spec-d.*` files are only type checked, and JavaScript files are only executed.
        test: {
          name: 'unit',
          setupFiles: [],
          include: ['src/**/*.{test,unit.test,spec,unit.spec}.{js,jsx,ts,tsx}'],
          exclude: ['node_modules/**', 'dist/**', ..._OTHER_TIERS],
          typecheck: {
            enabled: true,
            include: ['src/**/*.{test,unit.test,spec,unit.spec,test-d,spec-d}.{ts,tsx}'],
            exclude: ['node_modules/**', 'dist/**', ..._OTHER_TIERS],
            tsconfig: './tsconfig.json',
            // Vitest 5.0.1 documents, but does not apply, a default for this, but consumes it unguarded when spawning the checker
            spawnTimeout: 10000,
          },
        },
      },
      // The other test tiers, each told apart by its file name suffix: only executed, never type checked by Vitest (the `unit` project's `tsc` run
      // still reports type errors in them, as it checks the whole `tsconfig.json` program). Their OS temp folder is a folder of their own inside this
      // repository, so the temporary folders `showroom` makes stay there, created and removed by a global setup; the `e2e` project also compiles
      // the showroom once per run, for its builds.
      ..._TIERS.map((tier) => ({
        test: {
          name: tier,
          setupFiles: [],
          globalSetup: ['src/testing/setup/temporary-folder.ts', ...(tier === 'e2e' ? ['src/testing/setup/app.ts'] : [])],
          env: _getTemporaryFolderEnv(tier),
          include: [`src/**/*.${tier}.test.{js,jsx,ts,tsx}`],
          exclude: ['node_modules/**', 'dist/**'],
          testTimeout: 60000,
          hookTimeout: 60000,
        },
      })),
    ],
  },
});
