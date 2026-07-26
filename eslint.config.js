import { config } from '@fohte/eslint-config'

export default config(
  {
    typescript: { typeChecked: true },
    errorHandling: {},
  },
  // `server`/`parser` gained tsconfig.build.json project references (for
  // cross-package type resolution), which makes `tsc --build` emit
  // declaration files under dist/ — exclude that build output from lint.
  { ignores: ['**/dist/**'] },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*', '../*'],
              message:
                'Please use absolute imports instead of relative imports.',
            },
          ],
        },
      ],
    },
  },
  {
    // vite.config.ts and vitest.config.ts are outside src/ where the @ alias is unavailable
    files: ['**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
)
