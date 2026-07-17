import { config } from '@fohte/eslint-config'

export default config(
  { typescript: { typeChecked: true } },
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
