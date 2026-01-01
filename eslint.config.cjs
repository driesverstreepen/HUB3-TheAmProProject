/** ESLint flat config for this repository. Kept minimal to be compatible with ESLint v9+. */
/** ESLint flat config (v9+). Uses the TypeScript parser and enables JSX parsing. */
module.exports = [
  {
    ignores: ['node_modules/**', '.next/**', '.vercel/**', 'dist/**'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      react: require('eslint-plugin-react'),
      'react-hooks': require('eslint-plugin-react-hooks'),
      '@next/next': require('@next/eslint-plugin-next'),
      'jsx-a11y': require('eslint-plugin-jsx-a11y'),
      import: require('eslint-plugin-import'),
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-unused-vars': 'warn',
    },
  },
  // Enable project-based rules only for TypeScript files to avoid applying `parserOptions.project`
  // to non-TypeScript files (scripts, config files, etc.).
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  },
]
