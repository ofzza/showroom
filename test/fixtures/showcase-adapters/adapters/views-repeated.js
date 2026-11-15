// A custom showcase adapter whose default views repeat a view
export default () => ({ defaultViews: ['demo', 'demo'], validate: () => ({ errors: [] }), build: async () => ({ reads: [] }) });
