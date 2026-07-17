# ddr-score-manager

Score viewer and visualizer for DDR

## Development

### Prerequisites

- [mise](https://mise.jdx.dev/) (manages Node.js, pnpm, and other tool versions via `.mise.toml`)
- Docker + docker compose plugin ([Docker Desktop](https://www.docker.com/) or [Colima](https://github.com/abiosoft/colima))

### Setup

```sh
scripts/bootstrap
mise run db:up
pnpm --filter server run db:migrate
pnpm --filter server run dev
```

The `db` service is published to a random host port to avoid clashing with other projects' Postgres instances — `mise run db:up` resolves it and writes `.env.runtime` with the correct `DATABASE_URL`, which mise loads automatically.

### Testing

Tests are run with `pnpm run test`, which executes tests across all workspaces.

#### Server integration tests

Server integration tests require a running PostgreSQL instance and a dedicated test database (`ddr_score_manager_test`).

```sh
# 1. Start PostgreSQL via Docker and write .env.runtime (skip if already running for development)
mise run db:up

# 2. Create the test database (first time only)
docker compose exec db createdb -U ddr_score_manager ddr_score_manager_test

# 3. Run server tests
pnpm --filter server run test
```

The Compose file uses a fixed project name (`ddr-score-manager-infra`), so the same PostgreSQL container is shared across all worktrees. Running `mise run db:up` from any worktree is safe and will not create duplicate containers.

`mise run db:up` writes `.env.runtime` with both `DATABASE_URL` (pointed at `ddr_score_manager_dev`) and `TEST_DATABASE_URL` (pointed at `ddr_score_manager_test`). mise loads both automatically, and `pnpm --filter server run test` prefers `TEST_DATABASE_URL` on its own — no manual port lookup or `export` needed, and dev data in `ddr_score_manager_dev` is never at risk.

Migrations are applied automatically by the test global setup (`server/src/db/test/global-setup.ts`), so there is no need to run `db:migrate` manually for the test database.
