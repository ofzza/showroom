// A custom showcase adapter returning a result whose page is not among its files
export default () => ({
  validate: () => ({ errors: [] }),
  build: async () => ({ page: 'missing.html', files: [{ path: 'index.html', content: '' }], reads: [] }),
});
