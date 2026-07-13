import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

import { user } from '@/db/schema/auth'
import { musicCharts } from '@/db/schema/catalog'

export const scoreRecords = pgTable(
  'score_records',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: text('user_id').notNull(),
    musicId: text('music_id').notNull(),
    playStyle: text('play_style').notNull(),
    difficulty: text('difficulty').notNull(),
    score: integer('score').notNull(),
    // rank/clearType/flareRank have no CHECK: e-amusement's value sets for
    // these (unlike playStyle/difficulty) aren't a fixed, exhaustively known
    // enum across game versions.
    rank: text('rank').notNull(),
    clearType: text('clear_type'),
    flareRank: text('flare_rank'),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    // No ON DELETE cascade: unlike better-auth's own session/account tables,
    // score history is never implicitly deleted alongside a user — removing
    // it must be an explicit, separate decision.
    foreignKey({
      name: 'score_records_user_id_fk',
      columns: [table.userId],
      foreignColumns: [user.id],
    }),
    foreignKey({
      name: 'score_records_chart_fk',
      columns: [table.musicId, table.playStyle, table.difficulty],
      foreignColumns: [
        musicCharts.musicId,
        musicCharts.playStyle,
        musicCharts.difficulty,
      ],
    }),
    // Backs both "latest score per chart" (DISTINCT ON on this prefix) and
    // per-music score history queries.
    index('score_records_lookup_idx').on(
      table.userId,
      table.musicId,
      table.playStyle,
      table.difficulty,
      table.id.desc(),
    ),
    // Supports the chart FK above: Postgres doesn't auto-index FK columns,
    // and this one isn't covered by the lookup index's prefix (userId is
    // its leftmost column).
    index('score_records_chart_idx').on(
      table.musicId,
      table.playStyle,
      table.difficulty,
    ),
    check(
      'score_records_score_range',
      sql`${table.score} BETWEEN 0 AND 1000000`,
    ),
  ],
)
