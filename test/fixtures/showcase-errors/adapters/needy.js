// A custom showcase adapter rejecting every option, missing a host requirement, and warning about the showcases its host check is given
export default () => ({
  validate: (showcase) => (showcase.options === undefined ? { errors: [] } : { errors: ['needy takes no options'] }),
  check: (_root, showcases) => ({ errors: ['needs "left-pad" installed'], warnings: [`checked ${showcases.map((showcase) => showcase.id).join(', ')}`] }),
  build: async () => ({ errors: [{ message: 'not built' }], reads: [] }),
});
