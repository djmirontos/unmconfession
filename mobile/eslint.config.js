const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'types/database.ts'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
]);
