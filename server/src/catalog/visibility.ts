import { and, eq } from 'drizzle-orm'

import type { Db, Tx } from '@/db'
import { musics, musicSubmissions, scoreRecords } from '@/db/schema'

// Shared by ScoreReadApi (music detail 404) and JacketService (jacket 404):
// a pending music is visible only to a user with their own score or
// submission attached to it; everyone else must see it as nonexistent.
export const isMusicVisibleToUser = async (
  db: Db | Tx,
  musicId: string,
  userId: string,
): Promise<boolean> => {
  const [music] = await db
    .select({ status: musics.status })
    .from(musics)
    .where(eq(musics.id, musicId))
  if (music === undefined) return false
  if (music.status === 'approved') return true

  const [ownScore] = await db
    .select({ id: scoreRecords.id })
    .from(scoreRecords)
    .where(
      and(eq(scoreRecords.musicId, musicId), eq(scoreRecords.userId, userId)),
    )
    .limit(1)
  if (ownScore !== undefined) return true

  const [ownSubmission] = await db
    .select({ musicId: musicSubmissions.musicId })
    .from(musicSubmissions)
    .where(
      and(
        eq(musicSubmissions.musicId, musicId),
        eq(musicSubmissions.userId, userId),
      ),
    )
    .limit(1)
  return ownSubmission !== undefined
}
