// A custom showcase adapter declaring no default views, which showroom.json sets
export default () => ({
  validate: (showcase) => ({ options: showcase.options, errors: [] }),
  build: async () => ({ page: '<p>bare</p>', reads: [] }),
});
