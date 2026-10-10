import { noopLogger } from '@fohte/service-kit/logger'
import { Hono } from 'hono'
import { okAsync } from 'neverthrow'
import { describe, expect, it } from 'vitest'

import type { AuthMiddlewareEnvironment } from '#auth-middleware'
import { scoreListPage, scoreRow } from '#catalog/test/fixtures'
import type { ScoreIngestService } from '#score-ingest-service'
import { createUploadApi } from '#upload-api'

const MAX_BODY_BYTES = 1_048_576
type ScoreIngestInput = Parameters<ScoreIngestService['ingest']>[0]

const createTestApi = (service: ScoreIngestService) => {
  const app = new Hono<AuthMiddlewareEnvironment>()
  app.use('*', async (c, next) => {
    c.set('userId', 'upload-user')
    c.set('userEmail', 'owner@example.test')
    await next()
  })
  return app.route('/api/scores', createUploadApi(service, noopLogger))
}

const requestJson = (value: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
})

const createRecordingService = (
  calls: ScoreIngestInput[],
): ScoreIngestService => ({
  ingest: (input) => {
    calls.push(input)
    return okAsync({ saved: 2, duplicates: 1 })
  },
})

const uploadResponseOutput = async (
  response: Response,
  calls: ScoreIngestInput[],
) => ({
  status: response.status,
  contentType: response.headers.get('content-type'),
  body: await response.json(),
  calls,
})

describe('POST /api/scores/upload', () => {
  it('passes validated parsed pages with the authenticated identity to the ingest service', async () => {
    const calls: ScoreIngestInput[] = []
    const app = createTestApi(createRecordingService(calls))
    const pages = [scoreListPage([scoreRow({ musicId: 'example123' })])]
    const response = await app.request(
      '/api/scores/upload',
      requestJson({ pages }),
    )

    expect(await uploadResponseOutput(response, calls)).toEqual({
      status: 200,
      contentType: 'application/json',
      body: { saved: 2, duplicates: 1 },
      calls: [
        {
          userId: 'upload-user',
          userEmail: 'owner@example.test',
          pages,
        },
      ],
    })
  })

  it.each([
    [
      'score values outside the parser schema',
      {
        pages: [
          scoreListPage([
            scoreRow({ musicId: 'example123', score: 1_000_001 }),
          ]),
        ],
      },
    ],
    [
      'more than twenty pages',
      {
        pages: Array.from({ length: 21 }, () => ({
          pageType: 'musicDetail',
          detail: {
            musicId: 'example123',
            title: 'Example Track',
            artist: 'Example Artist',
            charts: [],
          },
        })),
      },
    ],
  ])(
    'rejects %s without invoking the ingest service',
    async (_description, payload) => {
      const calls: ScoreIngestInput[] = []
      const app = createTestApi(createRecordingService(calls))
      const response = await app.request(
        '/api/scores/upload',
        requestJson(payload),
      )

      expect(await uploadResponseOutput(response, calls)).toEqual({
        status: 400,
        contentType: 'application/json',
        body: { error: 'Bad Request' },
        calls: [],
      })
    },
  )

  it('rejects bodies larger than one MiB without invoking the ingest service', async () => {
    const calls: ScoreIngestInput[] = []
    const app = createTestApi(createRecordingService(calls))
    const response = await app.request('/api/scores/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: ' '.repeat(MAX_BODY_BYTES + 1),
    })

    expect(await uploadResponseOutput(response, calls)).toEqual({
      status: 413,
      contentType: 'application/json',
      body: { error: 'Payload Too Large' },
      calls: [],
    })
  })
})
