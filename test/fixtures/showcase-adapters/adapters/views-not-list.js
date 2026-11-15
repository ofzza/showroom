// A custom showcase adapter whose default views are not a list
export default () => ({ defaultViews: 'demo', validate: () => ({ errors: [] }), build: async () => ({ reads: [] }) });
