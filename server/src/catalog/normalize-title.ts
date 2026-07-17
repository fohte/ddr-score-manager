// NFKC で全角/半角・互換文字の表記揺れを吸収し、前後の空白除去と連続空白の
// 単一化で入力ゆれを一致させる。承認閾値判定 (同一楽曲を指す送信の集約) の
// 基準値として使う。
export const normalizeTitle = (title: string): string =>
  title.normalize('NFKC').trim().replace(/\s+/g, ' ')
