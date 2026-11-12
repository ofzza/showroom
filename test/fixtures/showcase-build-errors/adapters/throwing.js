// A custom showcase adapter whose build throws
export default () => ({
  validate: () => ({ errors: [] }),
  build: async () => {
    throw new Error('build broke');
  },
});
