import { and, eq } from 'drizzle-orm'

import type { Db, Tx } from '@/db'
import { musics, musicSubmissions, scoreRecords } from '@/db/schema'

// ScoreReadApi (曲別詳細の 404) と JacketService (ジャケットの 404) から共有される:
// pending の楽曲は、自分のスコアまたは送信記録が紐づくユーザーにのみ可視とし、
// それ以外のユーザーには存在しないものとして扱う。
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
