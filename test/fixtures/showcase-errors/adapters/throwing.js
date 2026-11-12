// A custom showcase adapter whose every method throws
export default () => ({
  validate: () => {
    throw new Error('validate broke');
  },
  check: () => {
    throw new Error('check broke');
  },
  build: async () => {
    throw new Error('build broke');
  },
  close: () => {
    throw new Error('close broke');
  },
});
