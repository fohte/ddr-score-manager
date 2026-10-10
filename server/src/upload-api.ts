import {
  type ParsedPage,
  parsedPageSchema,
} from '@fohte/ddr-score-manager-parser'
import type { Logger } from '@fohte/service-kit/logger'
import { Hono } from 'hono'
import { Result, ResultAsync } from 'neverthrow'
import { z } from 'zod'

import type { AuthMiddlewareEnvironment } from '#auth-middleware'
import type { ScoreIngestService } from '#score-ingest-service'

const MAX_BODY_BYTES = 1_048_576
const MAX_PAGES = 20

const uploadRequestSchema = z.object({
  pages: z.array(parsedPageSchema).min(1).max(MAX_PAGES),
}) satisfies z.ZodType<{ pages: ParsedPage[] }>

interface UploadResponse {
  saved: number
  duplicates: number
}

type BodyReadResult =
  { kind: 'body'; text: string } | { kind: 'invalid' } | { kind: 'tooLarge' }

const isByteStream = (body: unknown): body is ReadableStream<Uint8Array> =>
  typeof body === 'object' &&
  body !== null &&
  'getReader' in body &&
  typeof body.getReader === 'function'

const readBody = async (request: Request): Promise<BodyReadResult> => {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { kind: 'tooLarge' }
  }

  const readResult = await ResultAsync.fromPromise(
    (async (): Promise<BodyReadResult> => {
      const body: unknown = request.body
      if (!isByteStream(body)) return { kind: 'invalid' }

      const reader = body.getReader()
      const chunks: Uint8Array[] = []
      let byteLength = 0
      // Content-Length が欠落または過少でも、実際の読み取り量で上限を守る。
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break

        byteLength += chunk.value.byteLength
        if (byteLength > MAX_BODY_BYTES) {
          void reader.cancel().catch(() => undefined)
          return { kind: 'tooLarge' }
        }
        chunks.push(chunk.value)
      }

      const bytes = new Uint8Array(byteLength)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }

      return {
        kind: 'body',
        text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      }
    })(),
    (): BodyReadResult => ({ kind: 'invalid' }),
  )

  return readResult.match(
    (result) => result,
    (error) => error,
  )
}

const parseJson = Result.fromThrowable(
  (text: string): unknown => JSON.parse(text),
  () => undefined,
)

export const createUploadApi = (
  service: ScoreIngestService,
  logger: Logger,
) => {
  const api = new Hono<AuthMiddlewareEnvironment>()

  api.post('/upload', async (c) => {
    const body = await readBody(c.req.raw)
    if (body.kind === 'tooLarge') {
      return c.json({ error: 'Payload Too Large' }, 413)
    }
    if (body.kind === 'invalid') {
      return c.json({ error: 'Bad Request' }, 400)
    }

    const contentType = c.req.header('content-type')
    if (
      contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json'
    ) {
      return c.json({ error: 'Bad Request' }, 400)
    }

    const json = parseJson(body.text)
    if (json.isErr()) return c.json({ error: 'Bad Request' }, 400)

    const parsed = uploadRequestSchema.safeParse(json.value)
    if (!parsed.success) return c.json({ error: 'Bad Request' }, 400)

    const result = await service.ingest({
      userId: c.var.userId,
      userEmail: c.var.userEmail,
      pages: parsed.data.pages,
    })
    if (result.isErr()) {
      logger.error({ err: result.error }, 'failed to ingest uploaded scores')
      return c.json({ error: 'Internal Server Error' }, 500)
    }

    return c.json({
      saved: result.value.saved,
      duplicates: result.value.duplicates,
    } satisfies UploadResponse)
  })

  return api
}
