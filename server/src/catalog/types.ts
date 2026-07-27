import type {
  Difficulty,
  ParsedPage,
  PlayStyle,
} from '@fohte/ddr-score-manager-parser'
import type { ResultAsync } from 'neverthrow'

import type { CatalogError } from '#catalog/errors'
import type { Tx } from '#db/index'

export interface CatalogRegisterInput {
  userId: string
  trusted: boolean // CatalogTrustPolicy の判定結果
  pages: ParsedPage[]
}

export interface CatalogApproveRequest {
  musicIds?: string[]
  charts?: { musicId: string; playStyle: PlayStyle; difficulty: Difficulty }[]
}

export interface CatalogApproveResponse {
  approvedMusics: number
  approvedCharts: number
}

export interface PendingCatalogResponse {
  musics: {
    id: string
    title: string
    submitterCount: number // 送信者数 (タイトル一致は問わない参考値)
    createdAt: string // ISO 8601
  }[]
  charts: {
    musicId: string
    playStyle: PlayStyle
    difficulty: Difficulty
    submitterCount: number
  }[]
}

export interface CatalogService {
  /** 取り込みトランザクション内で楽曲・譜面を登録し、承認評価まで行う */
  register(tx: Tx, input: CatalogRegisterInput): ResultAsync<void, CatalogError>
  /** 手動承認。存在しない・承認済みの対象は無視する (冪等) */
  approve(
    input: CatalogApproveRequest,
  ): ResultAsync<CatalogApproveResponse, CatalogError>
  listPending(): ResultAsync<PendingCatalogResponse, CatalogError>
}
