// A custom showcase adapter without build(), and with a check that is not a function
export default () => ({ validate: () => ({ errors: [] }), check: true });
