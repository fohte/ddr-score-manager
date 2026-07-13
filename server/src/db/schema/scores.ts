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
    rank: text('rank').notNull(),
    clearType: text('clear_type'),
    flareRank: text('flare_rank'),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
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
    // Backs both "latest score per chart" (DISTINCT ON) and per-music history
    // queries; see design/data-models.md.
    index('score_records_lookup_idx').on(
      table.userId,
      table.musicId,
      table.playStyle,
      table.difficulty,
      table.id.desc(),
    ),
    check(
      'score_records_score_range',
      sql`${table.score} BETWEEN 0 AND 1000000`,
    ),
  ],
)
