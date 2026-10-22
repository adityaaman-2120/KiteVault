const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  { ignores: ['dist/*', 'android/*', '.expo/*', 'coverage/*'] },
  {
    // Plain Node scripts and config plugins (CommonJS): Node's globals are allowed there.
    files: ['scripts/**/*.js', 'plugins/**/*.js', 'jest/**/*.js', '*.js'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
      },
    },
  },
]);
