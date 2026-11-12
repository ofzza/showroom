// A custom showcase adapter rejecting every option, and missing a host requirement
export default () => ({
  validate: (showcase) => (showcase.options === undefined ? { errors: [] } : { errors: ['needy takes no options'] }),
  check: () => ['needs "left-pad" installed'],
  build: async () => ({ errors: [{ message: 'not built' }], reads: [] }),
});
