import { config } from '@fohte/eslint-config'

export default config(
<<<<<<< before updating
  {
    typescript: { typeChecked: true },
    errorHandling: {},
  },
  // `server`/`parser` gained tsconfig.build.json project references (for
  // cross-package type resolution), which makes `tsc --build` emit
  // declaration files under dist/ — exclude that build output from lint.
  { ignores: ['**/dist/**'] },
||||||| last update
  { typescript: { typeChecked: true } },
=======
>>>>>>> after updating
  {
    typescript: { typeChecked: true },
    errorHandling: {},
  },
  {
    // vite.config.ts and vitest.config.ts are outside src/ where the @ alias is unavailable
    files: ['**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
)
