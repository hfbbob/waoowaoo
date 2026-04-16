import { logInfo as _ulogInfo } from '@/lib/logging/core'
import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { getProviderConfig } from '@/lib/api-config'
import type { GenerateResult } from '@/lib/generators/base'
import { toFetchableUrl } from '@/lib/storage/utils'
import { ensureBailianCatalogRegistered } from './catalog'
import type { BailianGenerateRequestOptions } from './types'

export interface BailianImageGenerateParams {
  userId: string
  prompt: string
  referenceImages?: string[]
  options: BailianGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'image' satisfies OfficialModelModality,
    modelId,
  })
}

// wan2.7-image 系列：multimodal-generation 端点
const BAILIAN_IMAGE_MULTIMODAL_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
// wan2.6-image：image-generation 异步端点
const BAILIAN_IMAGE_ASYNC_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation'

// wan2.7-image 系列使用 multimodal-generation 同步端点（官方推荐）
const BAILIAN_MULTIMODAL_IMAGE_MODELS = new Set([
  'wan2.7-image-pro',
  'wan2.7-image',
])

// wan2.6-image 使用 image-generation 异步端点
const BAILIAN_ASYNC_IMAGE_MODELS = new Set([
  'wan2.6-image',
])

function isMultimodalModel(modelId: string): boolean {
  return BAILIAN_MULTIMODAL_IMAGE_MODELS.has(modelId)
}

function supportsAsync(modelId: string): boolean {
  return BAILIAN_ASYNC_IMAGE_MODELS.has(modelId)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`BAILIAN_IMAGE_OPTION_INVALID_${fieldName.toUpperCase()}`)
  }
  return value
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

interface BailianImageSubmitBody {
  model: string
  input: {
    prompt?: string
    messages?: Array<{
      role: 'user'
      content: Array<{ text?: string; image?: string }>
    }>
  }
  parameters?: Record<string, unknown>
}

function buildSubmitRequest(params: BailianImageGenerateParams): {
  endpoint: string
  body: BailianImageSubmitBody
  useAsync: boolean
} {
  const modelId = readTrimmedString(params.options.modelId)
  if (!modelId) {
    throw new Error('BAILIAN_IMAGE_MODEL_ID_REQUIRED')
  }

  const prompt = readTrimmedString(params.prompt) || readTrimmedString(params.options.prompt)
  if (!prompt) {
    throw new Error('BAILIAN_IMAGE_PROMPT_REQUIRED')
  }

  const size = readTrimmedString(params.options.size) || readTrimmedString(params.options.resolution) || '2K'
  const n = readOptionalPositiveInteger(params.options.n, 'n')
  const watermark = readOptionalBoolean(params.options.watermark)
  const promptExtend = readOptionalBoolean(params.options.promptExtend)
  const enableSequential = readOptionalBoolean(params.options.enableSequential)

  const isMultimodal = isMultimodalModel(modelId)

  // 🔥 wan2.7-image 系列使用 messages 格式，旧版模型使用 input.prompt 格式
  const body: BailianImageSubmitBody = {
    model: modelId,
    input: isMultimodal
      ? (() => {
          const content: Array<{ text?: string; image?: string }> = []
          if (params.referenceImages && params.referenceImages.length > 0) {
            for (const refImg of params.referenceImages) {
              content.push({ image: toFetchableUrl(refImg) })
            }
          }
          content.push({ text: prompt })
          return { messages: [{ role: 'user', content }] }
        })()
      : { prompt },
  }

  // Parameters
  const parameters: Record<string, unknown> = {}
  // wan2.7 系列: size 支持 "1K"/"2K"/"4K" 格式
  // wan2.6-image: 不支持 size 参数
  if (isMultimodal && size) {
    parameters.size = size
  }
  if (typeof n === 'number') {
    parameters.n = n
  }
  if (typeof watermark === 'boolean') {
    parameters.watermark = watermark
  }
  if (typeof promptExtend === 'boolean') {
    parameters.prompt_extend = promptExtend
  }
  if (typeof enableSequential === 'boolean') {
    parameters.enable_sequential = enableSequential
  }
  if (Object.keys(parameters).length > 0) {
    body.parameters = parameters
  }

  // 确定端点和模式
  // wan2.7 系列: multimodal-generation 同步端点
  // wan2.6-image: image-generation 异步端点
  const useAsync = supportsAsync(modelId)
  const endpoint = isMultimodal
    ? BAILIAN_IMAGE_MULTIMODAL_ENDPOINT
    : BAILIAN_IMAGE_ASYNC_ENDPOINT

  _ulogInfo(`[Bailian Image Submit] model=${modelId}, endpoint=${endpoint}, useAsync=${useAsync}`)
  _ulogInfo(`[Bailian Image Submit] parameters: ${JSON.stringify(body.parameters)}`)
  _ulogInfo(`[Bailian Image Submit] input keys: ${Object.keys(body.input)}`)
  _ulogInfo(`[Bailian Image Submit] prompt length: ${prompt.length}`)

  return { endpoint, body, useAsync }
}

async function parseMultimodalResponse(response: Response): Promise<{ imageUrl: string } | null> {
  const raw = await response.text()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.code) {
      throw new Error(`BAILIAN_IMAGE_SUBMIT_FAILED(${response.status}): ${parsed.message || parsed.code}`)
    }
    const output = parsed.output as Record<string, unknown> | undefined
    const choices = output?.choices as Array<Record<string, unknown>> | undefined
    if (choices && choices.length > 0) {
      const message = choices[0].message as Record<string, unknown> | undefined
      const msgContent = message?.content as Array<Record<string, unknown>> | undefined
      if (msgContent && msgContent.length > 0) {
        const imageUrl = msgContent[0].image as string | undefined
        if (imageUrl) return { imageUrl }
      }
    }
    return null
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('BAILIAN')) throw e
    throw new Error('BAILIAN_IMAGE_RESPONSE_INVALID_JSON')
  }
}

async function parseAsyncSubmitResponse(response: Response): Promise<{ taskId: string }> {
  const raw = await response.text()
  if (!raw) throw new Error('BAILIAN_IMAGE_RESPONSE_EMPTY')
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.code) {
      throw new Error(`BAILIAN_IMAGE_SUBMIT_FAILED(${response.status}): ${parsed.message || parsed.code}`)
    }
    const output = parsed.output as Record<string, unknown> | undefined
    const taskId = output?.task_id as string | undefined
    if (!taskId) throw new Error('BAILIAN_IMAGE_TASK_ID_MISSING')
    return { taskId }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('BAILIAN')) throw e
    throw new Error('BAILIAN_IMAGE_RESPONSE_INVALID_JSON')
  }
}

export async function generateBailianImage(params: BailianImageGenerateParams): Promise<GenerateResult> {
  assertRegistered(params.options.modelId)

  const { apiKey } = await getProviderConfig(params.userId, params.options.provider)
  const { endpoint, body, useAsync } = buildSubmitRequest(params)

  const modelId = readTrimmedString(params.options.modelId)
  _ulogInfo(`[Bailian Image] 提交任务: model=${modelId}, endpoint=${endpoint.split('/').pop()}, prompt=${params.prompt.slice(0, 50)}...`)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (useAsync) {
    headers['X-DashScope-Async'] = 'enable'
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  // 🔥 同步模式：直接返回图片 URL
  if (!useAsync) {
    const result = await parseMultimodalResponse(response)
    if (!result) {
      throw new Error('BAILIAN_IMAGE_OUTPUT_NOT_FOUND')
    }
    _ulogInfo(`[Bailian Image] 同步生成成功: ${result.imageUrl.slice(0, 80)}...`)
    return {
      success: true,
      imageUrl: result.imageUrl,
    }
  }

  // 🔥 异步模式：返回 task_id
  const data = await parseAsyncSubmitResponse(response)
  _ulogInfo(`[Bailian Image] 异步任务提交成功: task_id=${data.taskId}`)

  return {
    success: true,
    async: true,
    requestId: data.taskId,
    externalId: `BAILIAN:IMAGE:${data.taskId}`,
  }
}
