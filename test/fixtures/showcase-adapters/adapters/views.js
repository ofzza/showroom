// A custom showcase adapter declaring its default views
export default () => ({
  defaultViews: ['source', 'console'],
  validate: (showcase) => ({ options: showcase.options, errors: [] }),
  build: async () => ({ issues: [{ severity: 'error', message: 'not built' }], reads: [] }),
});
