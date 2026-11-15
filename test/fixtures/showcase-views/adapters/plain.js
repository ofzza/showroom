// A custom showcase adapter declaring its default views
export default () => ({
  defaultViews: ['source'],
  validate: (showcase) => ({ options: showcase.options, errors: [] }),
  build: async () => ({ page: '<p>plain</p>', reads: [] }),
});
