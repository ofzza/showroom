// A custom showcase adapter whose "lint" check fails beside its files, or, with { unlisted: true }, which names a check it doesn't list
export default () => ({
  validate: (showcase) => ({ options: { unlisted: showcase.options?.unlisted === true }, errors: [] }),
  build: async ({ showcase, options }) => ({
    page: 'index.html',
    files: [{ path: 'index.html', content: '<p>Checked</p>' }],
    reads: [showcase.documentation],
    checks: options.unlisted ? [] : ['lint'],
    issues: [
      { severity: 'error', message: 'Unused variable', path: showcase.entry, line: 1, check: 'lint' },
      { severity: 'warning', message: 'Long line', check: 'lint' },
    ],
  }),
});
