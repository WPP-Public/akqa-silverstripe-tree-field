module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  env: {
    browser: true,
    es2022: true,
    jest: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: {
    react: { version: '18' },
  },
  rules: {
    // Props are validated with prop-types on the components' own definitions
    'react/prop-types': 'off',
    'react/jsx-props-no-spreading': 'off',
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
};
