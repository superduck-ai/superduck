import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['assets/**', 'node_modules/**', 'public/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-useless-catch': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/naming-convention': [
        'warn',
        // Variables: camelCase / UPPER_CASE (constants) / PascalCase (React components, classes assigned to vars)
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow'
        },
        // Functions: camelCase or PascalCase (React components)
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow'
        },
        // Function parameters: camelCase
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow'
        },
        // Types, interfaces, classes, enums: PascalCase
        {
          selector: 'typeLike',
          format: ['PascalCase']
        },
        // Enum members: PascalCase or UPPER_CASE
        {
          selector: 'enumMember',
          format: ['PascalCase', 'UPPER_CASE']
        },
        // Object literal properties: skip format checks (interop with external APIs / JSON)
        {
          selector: ['objectLiteralProperty', 'typeProperty'],
          format: null
        },
        // Imports: allow any format (dependent on the upstream package)
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase']
        }
      ]
    }
  }
);
