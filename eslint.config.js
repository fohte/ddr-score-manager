import { config } from '@fohte/eslint-config'

// server/ ワークスペースのみが対象。外部 SDK・フレームワーク (Hono,
// better-auth, drizzle) との境界、およびプロセス起動/DB接続管理を担う
// ファイルを throw/try-catch の許容範囲とする。
const INTEROP_BOUNDARY_FILES = [
  'server/src/app.ts',
  'server/src/auth.ts',
  'server/src/bootstrap.ts',
  'server/src/db/**/*.ts',
  'server/src/env.ts',
  'server/src/index.ts',
  'server/src/main.ts',
  // vitest の *.test.ts / __tests__ 命名規則に沿わないテスト専用ヘルパー
  'server/src/resolve-test-database-url.ts',
  'server/src/catalog/test/**/*.ts',
  // db.transaction() の resolve/reject で COMMIT/ROLLBACK を制御する契約に
  // 従うため、Result の Err を throw に変換する境界
  'server/src/catalog/transaction.ts',
  // drizzle-kit CLI が直接 import/実行する設定ファイル
  'server/drizzle.config.ts',
]

export default config(
  {
    typescript: { typeChecked: true },
    errorHandling: { interopBoundaryFiles: INTEROP_BOUNDARY_FILES },
  },
  // `server`/`parser` gained tsconfig.build.json project references (for
  // cross-package type resolution), which makes `tsc --build` emit
  // declaration files under dist/ — exclude that build output from lint.
  { ignores: ['**/dist/**'] },
  {
    // errorHandling は server/ ワークスペースのみを対象にする。
    // web/parser/bookmarklet では throw/try-catch も neverthrow の
    // Result 型も要求しない。
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['server/**'],
    rules: {
      'no-restricted-syntax': 'off',
      'neverthrow/must-use-result': 'off',
    },
  },
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
