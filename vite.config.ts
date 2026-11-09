import { defineConfig } from 'vitest/config';

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
          exclude: ['node_modules/**', 'dist/**'],
          typecheck: {
            enabled: true,
            include: ['src/**/*.{test,unit.test,spec,unit.spec,test-d,spec-d}.{ts,tsx}'],
            exclude: ['node_modules/**', 'dist/**'],
            tsconfig: './tsconfig.json',
            // Vitest 5.0.1 documents, but does not apply, a default for this, but consumes it unguarded when spawning the checker
            spawnTimeout: 10000,
          },
        },
      },
    ],
  },
});
