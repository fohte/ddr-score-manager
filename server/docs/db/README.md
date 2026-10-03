# ddr-score-manager server

## Tables

| Name                                                    | Columns | Comment                                              | Type       |
| ------------------------------------------------------- | ------- | ---------------------------------------------------- | ---------- |
| [public.account](public.account.md)                     | 13      | Better Auth が管理する外部認証アカウントと認証情報。 | BASE TABLE |
| [public.apikey](public.apikey.md)                       | 22      | Better Auth API key plugin が管理する API キー。     | BASE TABLE |
| [public.session](public.session.md)                     | 8       | Better Auth が管理するログインセッション。           | BASE TABLE |
| [public.user](public.user.md)                           | 7       | Better Auth が管理する認証ユーザー。                 | BASE TABLE |
| [public.verification](public.verification.md)           | 6       | Better Auth の検証処理で使う値と有効期限。           | BASE TABLE |
| [public.chart_submissions](public.chart_submissions.md) | 5       | 未承認の譜面に対するユーザーごとの登録記録。         | BASE TABLE |
| [public.music_charts](public.music_charts.md)           | 6       | 楽曲ごとのプレイスタイル・難易度別譜面と承認状態。   | BASE TABLE |
| [public.music_jackets](public.music_jackets.md)         | 4       | 楽曲に紐づくジャケット画像データ。                   | BASE TABLE |
| [public.music_submissions](public.music_submissions.md) | 4       | 楽曲ごとにユーザーが行った登録内容の記録。           | BASE TABLE |
| [public.musics](public.musics.md)                       | 7       | DDR 楽曲のカタログと承認状態。                       | BASE TABLE |
| [public.score_records](public.score_records.md)         | 10      | ユーザーが登録した譜面ごとのスコア記録。             | BASE TABLE |

## Relations

```mermaid
erDiagram

"public.account" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.session" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.chart_submissions" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id)"
"public.chart_submissions" }o--|| "public.music_charts" : "FOREIGN KEY (music_id, play_style, difficulty) REFERENCES music_charts(music_id, play_style, difficulty)"
"public.music_charts" }o--|| "public.musics" : "FOREIGN KEY (music_id) REFERENCES musics(id)"
"public.music_jackets" |o--|| "public.musics" : "FOREIGN KEY (music_id) REFERENCES musics(id)"
"public.music_submissions" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id)"
"public.music_submissions" }o--|| "public.musics" : "FOREIGN KEY (music_id) REFERENCES musics(id)"
"public.score_records" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id)"
"public.score_records" }o--|| "public.music_charts" : "FOREIGN KEY (music_id, play_style, difficulty) REFERENCES music_charts(music_id, play_style, difficulty)"

"public.account" {
  text id
  text account_id
  text provider_id
  text user_id FK
  text access_token
  text refresh_token
  text id_token
  timestamp_without_time_zone access_token_expires_at
  timestamp_without_time_zone refresh_token_expires_at
  text scope
  text password
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.apikey" {
  text id
  text config_id
  text name
  text start
  text reference_id
  text prefix
  text key
  integer refill_interval
  integer refill_amount
  timestamp_without_time_zone last_refill_at
  boolean enabled
  boolean rate_limit_enabled
  integer rate_limit_time_window
  integer rate_limit_max
  integer request_count
  integer remaining
  timestamp_without_time_zone last_request
  timestamp_without_time_zone expires_at
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
  text permissions
  text metadata
}
"public.session" {
  text id
  timestamp_without_time_zone expires_at
  text token
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
  text ip_address
  text user_agent
  text user_id FK
}
"public.user" {
  text id
  text name
  text email
  boolean email_verified
  text image
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.verification" {
  text id
  text identifier
  text value
  timestamp_without_time_zone expires_at
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
"public.chart_submissions" {
  text music_id FK
  text play_style FK
  text difficulty FK
  text user_id FK
  timestamp_with_time_zone created_at
}
"public.music_charts" {
  text music_id FK
  text play_style
  text difficulty
  smallint level
  text status
  timestamp_with_time_zone approved_at
}
"public.music_jackets" {
  text music_id FK
  bytea content
  text content_type
  timestamp_with_time_zone fetched_at
}
"public.music_submissions" {
  text music_id FK
  text user_id FK
  text title_normalized
  timestamp_with_time_zone created_at
}
"public.musics" {
  text id
  text title
  text artist
  text status
  timestamp_with_time_zone approved_at
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.score_records" {
  bigint id
  text user_id FK
  text music_id FK
  text play_style FK
  text difficulty FK
  integer score
  text rank
  text clear_type
  text flare_rank
  timestamp_with_time_zone recorded_at
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
