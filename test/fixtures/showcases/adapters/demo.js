// A custom showcase adapter taking an optional size, defaulting to 1
export default () => ({
  validate: (showcase) =>
    showcase.options === undefined || typeof showcase.options?.size === 'number'
      ? { options: { size: showcase.options?.size ?? 1 }, errors: [] }
      : { errors: ['demo takes { size: <number> }'] },
  check: () => ({ errors: [], warnings: [] }),
  build: async () => ({ issues: [{ severity: 'error', message: 'not built' }], reads: [] }),
});
