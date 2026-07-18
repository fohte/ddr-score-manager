import type { Difficulty, ParsedPage, PlayStyle } from 'parser'

import type { Tx } from '@/db'

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
  register(tx: Tx, input: CatalogRegisterInput): Promise<void>
  /** 手動承認。存在しない・承認済みの対象は無視する (冪等) */
  approve(input: CatalogApproveRequest): Promise<CatalogApproveResponse>
  listPending(): Promise<PendingCatalogResponse>
}
