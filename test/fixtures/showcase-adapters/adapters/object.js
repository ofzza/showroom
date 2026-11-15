// A custom showcase adapter exporting the object itself, not a function creating it
export default {
  validate: () => ({ errors: [] }),
  build: async () => ({ issues: [{ severity: 'error', message: 'not built' }], reads: [] }),
};
