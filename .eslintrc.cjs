/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  extends: ['next/core-web-vitals', 'eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // Keep defaults but allow console for server-side files
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  },
}
module.exports = {
  extends: 'next/core-web-vitals',
};
