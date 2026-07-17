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
`mise run db:up` がそのポートを解決し、正しい `DATABASE_URL` を含む `.env.runtime` を書き出す。
mise はこれを自動的に読み込む。

### テスト

`pnpm run test` で全ワークスペースのテストを実行する。

#### サーバーの統合テスト

サーバーの統合テストには、起動中の PostgreSQL と専用のテスト用データベース (`ddr_score_manager_test`) が必要である。

```sh
# 1. Docker で PostgreSQL を起動し .env.runtime を書き出す (開発用に起動済みならスキップ)
mise run db:up

# 2. テスト用データベースを作成する (初回のみ)
docker compose exec db createdb -U ddr_score_manager ddr_score_manager_test

pnpm --filter server run test
```

Compose ファイルは固定の project name (`ddr-score-manager-infra`) を使うため、同じ PostgreSQL コンテナが全 worktree で共有される。
どの worktree から `mise run db:up` を実行しても安全で、コンテナが重複して作成されることはない。

`mise run db:up` は `.env.runtime` に `DATABASE_URL` (`ddr_score_manager_dev` を指す) と `TEST_DATABASE_URL` (`ddr_score_manager_test` を指す) の両方を書き出す。
mise が両方を自動的に読み込むため、`pnpm --filter server run test` は `TEST_DATABASE_URL` を自動的に優先する。
手動でのポート確認や `export` は不要で、`ddr_score_manager_dev` の開発用データが失われる心配もない。

マイグレーションはテストの global setup (`server/src/db/test/global-setup.ts`) が自動的に適用するため、テスト用データベースに対して手動で `db:migrate` を実行する必要はない。
