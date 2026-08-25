module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: {
    es2022: true,
  },
  ignorePatterns: ['node_modules', '.expo', 'dist', 'expo-env.d.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};
