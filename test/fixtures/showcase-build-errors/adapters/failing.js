// A custom showcase adapter failing with errors: in the entry point's code block, without a position, outside the host repository, in a real file
export default () => ({
  validate: () => ({ errors: [] }),
  build: async ({ showcase }) => ({
    issues: [
      { severity: 'error', message: 'Unexpected token', path: showcase.entry, line: 2 },
      { severity: 'error', message: 'Something went wrong' },
      { severity: 'error', message: 'Not here', path: '../outside.js', line: 1 },
      { severity: 'error', message: 'Widget broke', path: 'src/widget.js', line: 2 },
    ],
    reads: [showcase.documentation],
  }),
});
