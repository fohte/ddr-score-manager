# ddr-score-manager

Score viewer and visualizer for DDR

## 開発

### 前提条件

- [mise](https://mise.jdx.dev/) (`.mise.toml` により Node.js, pnpm などのツールバージョンを管理する)
- Docker + docker compose プラグイン ([Docker Desktop](https://www.docker.com/) または [Colima](https://github.com/abiosoft/colima))

### セットアップ

```sh
scripts/bootstrap
mise run db:up
pnpm --filter server run db:migrate
pnpm --filter server run dev
```

`db` サービスは他プロジェクトの Postgres と衝突しないようランダムなホストポートで公開される。
`mise run db:up` は PostgreSQL を起動し、server の開発用・テスト用データベースを作成する。
`DATABASE_URL` と `TEST_DATABASE_URL` は mise が実行時に解決するため、URL を保存したファイルは作成されない。
個人用の URL は `.env.local` で上書きできる。

既存の PostgreSQL 17 の開発データは新しいデータベースへ自動移行されない。
旧データは既存の Docker volume に残るため、継続利用する場合は PostgreSQL 17 から dump し、新しい開発用データベースへ restore する。

### スキーマ変更

`server/src/auth.ts` の better-auth 構成 (プラグイン追加など、認証テーブルに影響する変更) を変えた場合は、先にスキーマ (`server/src/db/schema/auth.ts`) を再生成してからマイグレーションを生成する。

```sh
pnpm --filter server run auth:generate
pnpm --filter server run db:generate
```

それ以外のテーブルは `db:generate` を直接実行する。

### テスト

`pnpm run test` で全ワークスペースのテストを実行する。

#### サーバーの統合テスト

サーバーの統合テストには、起動中の PostgreSQL と専用のテスト用データベース (`ddr-score-manager_server_test`) が必要である。

```sh
# PostgreSQL と開発用・テスト用データベースを起動する
mise run db:up

pnpm --filter server run test
```

mise がテスト実行時に開発用 URL をテスト用 URL に切り替える。
マイグレーションはテストの global setup (`server/src/db/test/global-setup.ts`) が適用するため、テスト用データベースに対する手動の `db:migrate` は不要である。

### DB ドキュメント

`mise run db:doc` は migration を使い捨てデータベースへ適用し、`server/docs/db` を生成して `tbls lint` を実行する。
テーブルとカラムの説明は `server/.tbls.yml` の `comments:` に記載する。
