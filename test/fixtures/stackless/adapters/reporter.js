// A custom showcase adapter whose host check reports, as a warning, the stack and project it is given, and whose build shows them on a page
const describe = (context) => `stack ${JSON.stringify(context.stack)}, project ${JSON.stringify(context.project)}`;

export default () => ({
  validate: () => ({ errors: [] }),
  check: (_root, _showcases, context) => ({ errors: [], warnings: [describe(context)] }),
  build: async (request) => ({
    page: 'index.html',
    files: [{ path: 'index.html', content: `<!doctype html><title>Reporter</title><p>${describe(request).replaceAll('<', '&lt;')}</p>` }],
    reads: [],
  }),
});
