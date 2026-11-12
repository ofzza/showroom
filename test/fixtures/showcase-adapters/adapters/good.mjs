// A custom showcase adapter accepting every showcase
export default {
  validate: (showcase) => ({ options: showcase.options, errors: [] }),
  check: () => ['good needs nothing, but says so'],
  build: async () => ({ errors: [{ message: 'not built' }], reads: [] }),
};
