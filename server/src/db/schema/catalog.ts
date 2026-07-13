import { sql } from 'drizzle-orm'
import {
  check,
  customType,
  foreignKey,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

import { user } from '@/db/schema/auth'

const bytea = customType<{ data: Buffer }>({
  dataType: () => 'bytea',
})

export const musics = pgTable(
  'musics',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    artist: text('artist'),
    status: text('status').notNull(),
    approvedAt: timestamp('approved_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    check('musics_id_alnum', sql`${table.id} ~ '^[A-Za-z0-9]{1,64}$'`),
    check(
      'musics_status_valid',
      sql`${table.status} IN ('pending', 'approved')`,
    ),
  ],
)

export const musicCharts = pgTable(
  'music_charts',
  {
    musicId: text('music_id').notNull(),
    playStyle: text('play_style').notNull(),
    difficulty: text('difficulty').notNull(),
    level: smallint('level'),
    status: text('status').notNull(),
    approvedAt: timestamp('approved_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (table) => [
    primaryKey({
      name: 'music_charts_pkey',
      columns: [table.musicId, table.playStyle, table.difficulty],
    }),
    foreignKey({
      name: 'music_charts_music_id_fk',
      columns: [table.musicId],
      foreignColumns: [musics.id],
    }),
    check(
      'music_charts_play_style_valid',
      sql`${table.playStyle} IN ('sp', 'dp')`,
    ),
    check(
      'music_charts_difficulty_valid',
      sql`${table.difficulty} IN ('beginner', 'basic', 'difficult', 'expert', 'challenge')`,
    ),
    check('music_charts_level_range', sql`${table.level} BETWEEN 1 AND 19`),
    check(
      'music_charts_status_valid',
      sql`${table.status} IN ('pending', 'approved')`,
    ),
  ],
)

export const musicSubmissions = pgTable(
  'music_submissions',
  {
    musicId: text('music_id').notNull(),
    userId: text('user_id').notNull(),
    titleNormalized: text('title_normalized').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    primaryKey({
      name: 'music_submissions_pkey',
      columns: [table.musicId, table.userId],
    }),
    foreignKey({
      name: 'music_submissions_music_id_fk',
      columns: [table.musicId],
      foreignColumns: [musics.id],
    }),
    // No ON DELETE cascade: see the same note on score_records_user_id_fk.
    foreignKey({
      name: 'music_submissions_user_id_fk',
      columns: [table.userId],
      foreignColumns: [user.id],
    }),
  ],
)

export const chartSubmissions = pgTable(
  'chart_submissions',
  {
    musicId: text('music_id').notNull(),
    playStyle: text('play_style').notNull(),
    difficulty: text('difficulty').notNull(),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    primaryKey({
      name: 'chart_submissions_pkey',
      columns: [table.musicId, table.playStyle, table.difficulty, table.userId],
    }),
    foreignKey({
      name: 'chart_submissions_chart_fk',
      columns: [table.musicId, table.playStyle, table.difficulty],
      foreignColumns: [
        musicCharts.musicId,
        musicCharts.playStyle,
        musicCharts.difficulty,
      ],
    }),
    // No ON DELETE cascade: see the same note on score_records_user_id_fk.
    foreignKey({
      name: 'chart_submissions_user_id_fk',
      columns: [table.userId],
      foreignColumns: [user.id],
    }),
  ],
)

export const musicJackets = pgTable(
  'music_jackets',
  {
    musicId: text('music_id').primaryKey(),
    content: bytea('content').notNull(),
    contentType: text('content_type').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    foreignKey({
      name: 'music_jackets_music_id_fk',
      columns: [table.musicId],
      foreignColumns: [musics.id],
    }),
  ],
)
