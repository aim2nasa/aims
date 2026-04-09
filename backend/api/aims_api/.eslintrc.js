module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2021,
  },
  rules: {
    'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
    'no-undef': 'error',
    'no-redeclare': 'error',
  },
};
