import {
  assertOfficialModelRegistered,
  type OfficialModelModality,
} from '@/lib/providers/official/model-registry'
import { getProviderConfig } from '@/lib/api-config'
import type { GenerateResult } from '@/lib/generators/base'
import { toFetchableUrl } from '@/lib/storage/utils'
import { ensureBailianCatalogRegistered } from './catalog'
import type { BailianGenerateRequestOptions } from './types'

export interface BailianVideoGenerateParams {
  userId: string
  imageUrl: string
  prompt?: string
  options: BailianGenerateRequestOptions
}

function assertRegistered(modelId: string): void {
  ensureBailianCatalogRegistered()
  assertOfficialModelRegistered({
    provider: 'bailian',
    modality: 'video' satisfies OfficialModelModality,
    modelId,
  })
}

const BAILIAN_VIDEO_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'
const BAILIAN_KF2V_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis'
const BAILIAN_FIRST_LAST_FRAME_CAPABLE_MODELS = new Set([
  'wan2.7-i2v',
])

// wan2.7-i2v 使用新版多模态 API 协议（media 数组格式）
const BAILIAN_NEW_PROTOCOL_MODELS = new Set([
  'wan2.7-i2v',
])

function usesNewProtocol(modelId: string): boolean {
  return BAILIAN_NEW_PROTOCOL_MODELS.has(modelId)
}

interface BailianVideoSubmitResponse {
  request_id?: string
  code?: string
  message?: string
  output?: {
    task_id?: string
    task_status?: string
  }
}

interface BailianVideoSubmitParameters {
  resolution?: string
  size?: string
  watermark?: boolean
  prompt_extend?: boolean
  duration?: number
}

interface BailianVideoSubmitMediaItem {
  type: string
  url: string
}

interface BailianVideoSubmitBody {
  model: string
  input: Record<string, string | BailianVideoSubmitMediaItem[]>
  parameters?: BailianVideoSubmitParameters
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`BAILIAN_VIDEO_OPTION_INVALID_${fieldName.toUpperCase()}`)
  }
  return value
}

function supportsFirstLastFrame(modelId: string): boolean {
  return BAILIAN_FIRST_LAST_FRAME_CAPABLE_MODELS.has(modelId)
}

function assertNoUnsupportedOptions(options: BailianGenerateRequestOptions): void {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'prompt',
    'resolution',
    'size',
    'watermark',
    'promptExtend',
    'duration',
    'lastFrameImageUrl',
  ])
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`BAILIAN_VIDEO_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function buildSubmitRequest(params: BailianVideoGenerateParams): {
  endpoint: string
  body: BailianVideoSubmitBody
} {
  const imageUrl = readTrimmedString(params.imageUrl)
  if (!imageUrl) {
    throw new Error('BAILIAN_VIDEO_IMAGE_URL_REQUIRED')
  }
  const modelId = readTrimmedString(params.options.modelId)
  if (!modelId) {
    throw new Error('BAILIAN_VIDEO_MODEL_ID_REQUIRED')
  }

  const firstFrameUrl = toFetchableUrl(imageUrl)
  const lastFrameImageUrl = readTrimmedString(params.options.lastFrameImageUrl)
  const firstLastFrame = !!lastFrameImageUrl
  if (firstLastFrame && !supportsFirstLastFrame(modelId)) {
    throw new Error(`BAILIAN_VIDEO_LAST_FRAME_UNSUPPORTED_FOR_MODEL: ${modelId}`)
  }

  const prompt = readTrimmedString(params.prompt) || readTrimmedString(params.options.prompt)
  const resolution = readTrimmedString(params.options.resolution)
  const size = readTrimmedString(params.options.size)
  const watermark = readOptionalBoolean(params.options.watermark)
  const promptExtend = readOptionalBoolean(params.options.promptExtend)
  const duration = readOptionalPositiveInteger(params.options.duration, 'duration')

  // wan2.7-i2v 使用新版多模态 API（media 数组格式）
  if (usesNewProtocol(modelId)) {
    const media: Array<{ type: string; url: string }> = [
      { type: 'first_frame', url: firstFrameUrl },
    ]
    if (firstLastFrame) {
      media.push({ type: 'last_frame', url: toFetchableUrl(lastFrameImageUrl) })
    }

    const submitBody: BailianVideoSubmitBody = {
      model: modelId,
      input: {
        media,
      },
    }
    if (prompt) {
      submitBody.input.prompt = prompt
    }

    const submitParameters: BailianVideoSubmitParameters = {}
    if (resolution) {
      submitParameters.resolution = resolution
    }
    if (size) {
      submitParameters.size = size
    }
    if (typeof watermark === 'boolean') {
      submitParameters.watermark = watermark
    }
    if (typeof promptExtend === 'boolean') {
      submitParameters.prompt_extend = promptExtend
    }
    if (typeof duration === 'number') {
      submitParameters.duration = duration
    }
    if (Object.keys(submitParameters).length > 0) {
      submitBody.parameters = submitParameters
    }

    return {
      endpoint: BAILIAN_VIDEO_ENDPOINT,
      body: submitBody,
    }
  }

  // 旧版模型使用扁平 input 格式
  const submitBody: BailianVideoSubmitBody = {
    model: modelId,
    input: firstLastFrame
      ? {
        first_frame_url: firstFrameUrl,
        last_frame_url: toFetchableUrl(lastFrameImageUrl),
      }
      : {
        img_url: firstFrameUrl,
      },
  }
  if (prompt) {
    submitBody.input.prompt = prompt
  }

  const submitParameters: BailianVideoSubmitParameters = {}
  if (resolution) {
    submitParameters.resolution = resolution
  }
  if (size) {
    submitParameters.size = size
  }
  if (typeof watermark === 'boolean') {
    submitParameters.watermark = watermark
  }
  if (typeof promptExtend === 'boolean') {
    submitParameters.prompt_extend = promptExtend
  }
  if (typeof duration === 'number') {
    submitParameters.duration = duration
  }
  if (Object.keys(submitParameters).length > 0) {
    submitBody.parameters = submitParameters
  }

  return {
    endpoint: firstLastFrame ? BAILIAN_KF2V_ENDPOINT : BAILIAN_VIDEO_ENDPOINT,
    body: submitBody,
  }
}

async function parseSubmitResponse(response: Response): Promise<BailianVideoSubmitResponse> {
  const raw = await response.text()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('BAILIAN_VIDEO_RESPONSE_INVALID')
    }
    return parsed as BailianVideoSubmitResponse
  } catch {
    throw new Error('BAILIAN_VIDEO_RESPONSE_INVALID_JSON')
  }
}

export async function generateBailianVideo(params: BailianVideoGenerateParams): Promise<GenerateResult> {
  assertRegistered(params.options.modelId)
  assertNoUnsupportedOptions(params.options)

  const { apiKey } = await getProviderConfig(params.userId, params.options.provider)
  const submitRequest = buildSubmitRequest(params)
  const response = await fetch(submitRequest.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(submitRequest.body),
  })
  const data = await parseSubmitResponse(response)

  if (!response.ok) {
    const code = readTrimmedString(data.code)
    const message = readTrimmedString(data.message)
    throw new Error(`BAILIAN_VIDEO_SUBMIT_FAILED(${response.status}): ${code || message || 'unknown error'}`)
  }

  const taskId = readTrimmedString(data.output?.task_id)
  if (!taskId) {
    throw new Error('BAILIAN_VIDEO_TASK_ID_MISSING')
  }

  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `BAILIAN:VIDEO:${taskId}`,
  }
}
