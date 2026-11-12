// A custom showcase adapter building a page with assets: a stylesheet, and an image given as bytes, as is the page itself
export default () => ({
  validate: (showcase) =>
    showcase.options === undefined || typeof showcase.options?.label === 'string'
      ? { options: { label: showcase.options?.label ?? 'Showcase' }, errors: [] }
      : { errors: ['assets takes { label: <string> }'] },
  build: async ({ showcase, options }) => ({
    page: 'index.html',
    files: [
      {
        path: 'index.html',
        content: new TextEncoder().encode(
          `<!doctype html><html><head><link rel="stylesheet" href="assets/style.css"></head><body><img src="assets/pixel.gif" alt=""> ${options.label} ✓</body></html>`,
        ),
      },
      { path: 'assets/style.css', content: 'body { font-family: sans-serif; }' },
      { path: 'assets/pixel.gif', content: Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0)) },
    ],
    reads: [showcase.entry],
  }),
});
