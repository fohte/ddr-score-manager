# CLAUDE.md

## Code organization rules

### Split files before they grow past ~500 lines of production code

When a change would push a file's non-test code past ~500 lines, split it along responsibility seams before adding more. Splits must be move-only commits: no logic changes, renames, or reformatting mixed in. Keep external import paths unchanged by keeping the entrypoint file in place and re-exporting the pieces you split out into new files (e.g. `index.ts` re-exports from the new files). Tests move together with the code they verify.

Prefer creating a new focused file over appending to the largest existing one.

## Testing

### Running tests

```sh
pnpm run test                 # all workspaces
pnpm --filter server run test # server only (runs tsc --noEmit + vitest in parallel)
```

### Server integration tests — database setup

Server integration tests require PostgreSQL running via Docker.

```sh
mise run db:up                                                              # skip if already running
docker compose exec db createdb -U ddr_score_manager ddr_score_manager_test # first time only
```

The Compose file uses a fixed project name (`ddr-score-manager-infra`), so the same PostgreSQL container is shared across all worktrees. Running `mise run db:up` from any worktree is safe and will not create duplicate containers — skip if already running for development.

The `db` service publishes Postgres on a random host port to avoid clashing with other projects. `mise run db:up` resolves the assigned port and writes it to `.env.runtime` as both `DATABASE_URL` (`ddr_score_manager_dev`) and `TEST_DATABASE_URL` (`ddr_score_manager_test`); mise loads both automatically and `server`'s test runs prefer `TEST_DATABASE_URL`. Do not point `DATABASE_URL` at `ddr_score_manager_dev` for tests — existing data there causes test failures.

Migrations are applied automatically by `server/src/db/test/global-setup.ts`.

## Test code rules

### Assert on the whole output with a single equality check

Treat each test as a spec: build the expected output as one literal value (object, struct, JSON, array, etc.) and compare it to the actual output with a single equality assertion. Do not split the assertion into per-field checks, and do not use partial matchers (substring contains, `toContain`, `toMatchObject`, prefix/suffix checks, regex-on-substring, etc.). Partial matches silently ignore unexpected fields and extra elements, so the test stops working as a spec the moment the shape of the output changes.

```ts
// bad: picks fields one by one — silent on any new/changed field
const ev = run()
expect(ev.path).toBe('/a')
expect(ev.event).toBe('ok')
expect(ev.message).toContain('done')

// good: one literal, one equality — any drift in shape fails the test
expect(run()).toEqual({
  path: '/a',
  event: 'ok',
  message: 'done',
})
```

For dynamic fields (timestamps, UUIDs, random IDs), normalize them in a helper before the comparison (e.g. replace with a fixed placeholder) so the full output can still be asserted in one equality check. Do not weaken the assertion to dodge the dynamic value.
