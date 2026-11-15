// A custom showcase adapter accepting every showcase
export default () => ({
  validate: (showcase) => ({ options: showcase.options, errors: [] }),
  check: () => ({ errors: ['good needs nothing, but says so'], warnings: [] }),
  build: async () => ({ issues: [{ severity: 'error', message: 'not built' }], reads: [] }),
});
