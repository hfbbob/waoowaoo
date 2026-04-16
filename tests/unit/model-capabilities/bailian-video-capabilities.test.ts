import { describe, expect, it } from 'vitest'
import { findBuiltinCapabilities } from '@/lib/model-capabilities/catalog'

describe('bailian video capabilities catalog', () => {
  it('registers bailian i2v models as normal-mode only', () => {
    const models = [
      'wan2.6-i2v-flash',
      'wan2.6-i2v',
      'wan2.5-i2v-preview',
    ]

    for (const modelId of models) {
      const capabilities = findBuiltinCapabilities('video', 'bailian', modelId)
      expect(capabilities?.video?.generationModeOptions).toEqual(['normal'])
      expect(capabilities?.video?.firstlastframe).toBe(false)
    }
  })

  it('registers wan2.7 i2v as dual-mode', () => {
    const capabilities = findBuiltinCapabilities('video', 'bailian', 'wan2.7-i2v')
    expect(capabilities?.video?.generationModeOptions).toEqual(['normal', 'firstlastframe'])
    expect(capabilities?.video?.firstlastframe).toBe(true)
  })
})
