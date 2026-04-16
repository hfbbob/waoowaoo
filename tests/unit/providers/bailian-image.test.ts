import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 'bailian',
    apiKey: 'bl-key-test',
  })),
)

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { generateBailianImage } from '@/lib/providers/bailian/image'

const MultimodalEndpoint = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
const AsyncEndpoint = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation'

function createMockResponse(body: object, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('bailian image provider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('wan2.7-image-pro - multimodal synchronous endpoint', () => {
    it('uses multimodal-generation endpoint without async header', async () => {
      const fetchMock = vi.fn(async () =>
        createMockResponse({
          request_id: 'req-1',
          output: {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: [{ image: 'https://example.com/image.png' }],
                },
              },
            ],
          },
        }),
      )
      vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

      const result = await generateBailianImage({
        userId: 'user-1',
        prompt: 'a beautiful landscape',
        options: {
          provider: 'bailian',
          modelId: 'wan2.7-image-pro',
          modelKey: 'bailian::wan2.7-image-pro',
        },
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe(MultimodalEndpoint)
      expect(init.headers).not.toMatchObject({ 'X-DashScope-Async': 'enable' })
      expect(result.success).toBe(true)
      expect(result.imageUrl).toBe('https://example.com/image.png')
    })

    it('includes size parameter for wan2.7-image-pro when specified', async () => {
      const fetchMock = vi.fn(async () =>
        createMockResponse({
          request_id: 'req-1',
          output: {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: [{ image: 'https://example.com/image-2k.png' }],
                },
              },
            ],
          },
        }),
      )
      vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

      const result = await generateBailianImage({
        userId: 'user-1',
        prompt: 'a beautiful landscape',
        options: {
          provider: 'bailian',
          modelId: 'wan2.7-image-pro',
          modelKey: 'bailian::wan2.7-image-pro',
          size: '2K',
        },
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      const body = JSON.parse(init.body as string)
      expect(body.parameters).toMatchObject({ size: '2K' })
      expect(result.success).toBe(true)
    })
  })

  describe('wan2.7-image - multimodal synchronous endpoint', () => {
    it('uses multimodal-generation endpoint for wan2.7-image', async () => {
      const fetchMock = vi.fn(async () =>
        createMockResponse({
          request_id: 'req-1',
          output: {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: [{ image: 'https://example.com/wan27-image.png' }],
                },
              },
            ],
          },
        }),
      )
      vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

      const result = await generateBailianImage({
        userId: 'user-1',
        prompt: 'a person walking',
        options: {
          provider: 'bailian',
          modelId: 'wan2.7-image',
          modelKey: 'bailian::wan2.7-image',
        },
      })

      const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe(MultimodalEndpoint)
      expect(result.success).toBe(true)
    })
  })

  describe('wan2.6-image - async endpoint', () => {
    it('uses image-generation async endpoint with X-DashScope-Async header', async () => {
      const fetchMock = vi.fn(async () =>
        createMockResponse({
          request_id: 'req-1',
          output: { task_id: 'task-wan26-123' },
        }),
      )
      vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

      const result = await generateBailianImage({
        userId: 'user-1',
        prompt: 'a landscape',
        options: {
          provider: 'bailian',
          modelId: 'wan2.6-image',
          modelKey: 'bailian::wan2.6-image',
        },
      })

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe(AsyncEndpoint)
      expect(init.headers).toMatchObject({ 'X-DashScope-Async': 'enable' })
      expect(result.success).toBe(true)
      expect(result.async).toBe(true)
      expect(result.requestId).toBe('task-wan26-123')
    })

    it('does not include size parameter for wan2.6-image', async () => {
      const fetchMock = vi.fn(async () =>
        createMockResponse({
          request_id: 'req-1',
          output: { task_id: 'task-wan26-124' },
        }),
      )
      vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

      await generateBailianImage({
        userId: 'user-1',
        prompt: 'a landscape',
        options: {
          provider: 'bailian',
          modelId: 'wan2.6-image',
          modelKey: 'bailian::wan2.6-image',
          size: '2K',
        },
      })

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      const body = JSON.parse(init.body as string)
      expect(body.parameters).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('throws when API returns error code', async () => {
      const fetchMock = vi.fn(async () =>
        createMockResponse({
          request_id: 'req-error',
          code: 'InvalidParameter',
          message: 'invalid parameters',
        }),
      )
      vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

      await expect(
        generateBailianImage({
          userId: 'user-1',
          prompt: 'test',
          options: {
            provider: 'bailian',
            modelId: 'wan2.7-image-pro',
            modelKey: 'bailian::wan2.7-image-pro',
          },
        }),
      ).rejects.toThrow()
    })
  })
})
