# public.user

## Description

Better Auth が管理する認証ユーザー。

## Columns

| Name           | Type                        | Default | Nullable | Children                                                                                                                                                                                                                                | Parents | Comment                            |
| -------------- | --------------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------- |
| id             | text                        |         | false    | [public.account](public.account.md) [public.session](public.session.md) [public.chart_submissions](public.chart_submissions.md) [public.music_submissions](public.music_submissions.md) [public.score_records](public.score_records.md) |         |                                    |
| name           | text                        |         | false    |                                                                                                                                                                                                                                         |         | ユーザー名。                       |
| email          | text                        |         | false    |                                                                                                                                                                                                                                         |         | ユーザーのメールアドレス。         |
| email_verified | boolean                     | false   | false    |                                                                                                                                                                                                                                         |         | メールアドレスが確認済みかどうか。 |
| image          | text                        |         | true     |                                                                                                                                                                                                                                         |         | ユーザー画像の URL。               |
| created_at     | timestamp without time zone | now()   | false    |                                                                                                                                                                                                                                         |         |                                    |
| updated_at     | timestamp without time zone | now()   | false    |                                                                                                                                                                                                                                         |         |                                    |

## Constraints

| Name                         | Type        | Definition              |
| ---------------------------- | ----------- | ----------------------- |
| user_created_at_not_null     | n           | NOT NULL created_at     |
| user_email_not_null          | n           | NOT NULL email          |
| user_email_verified_not_null | n           | NOT NULL email_verified |
| user_id_not_null             | n           | NOT NULL id             |
| user_name_not_null           | n           | NOT NULL name           |
| user_updated_at_not_null     | n           | NOT NULL updated_at     |
| user_pkey                    | PRIMARY KEY | PRIMARY KEY (id)        |
| user_email_unique            | UNIQUE      | UNIQUE (email)          |

## Indexes

| Name              | Definition                                                                 |
| ----------------- | -------------------------------------------------------------------------- |
| user_pkey         | CREATE UNIQUE INDEX user_pkey ON public."user" USING btree (id)            |
| user_email_unique | CREATE UNIQUE INDEX user_email_unique ON public."user" USING btree (email) |

## Relations

```mermaid
erDiagram

"public.account" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.session" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id) ON DELETE CASCADE"
"public.chart_submissions" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id)"
"public.music_submissions" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id)"
"public.score_records" }o--|| "public.user" : "FOREIGN KEY (user_id) REFERENCES #quot;user#quot;(id)"

"public.user" {
  text id
  text name
  text email
  boolean email_verified
  text image
  timestamp_without_time_zone created_at
  timestamp_without_time_zone updated_at
}
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
"public.chart_submissions" {
  text music_id FK
  text play_style FK
  text difficulty FK
  text user_id FK
  timestamp_with_time_zone created_at
}
"public.music_submissions" {
  text music_id FK
  text user_id FK
  text title_normalized
  timestamp_with_time_zone created_at
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
