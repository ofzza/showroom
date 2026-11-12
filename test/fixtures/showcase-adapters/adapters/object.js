// A custom showcase adapter exporting the object itself, not a function creating it
export default {
  validate: () => ({ errors: [] }),
  build: async () => ({ errors: [{ message: 'not built' }], reads: [] }),
};
