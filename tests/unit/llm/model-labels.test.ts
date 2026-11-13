import { describe, expect, it } from 'vitest'
import {
  MODEL_DISPLAY_LABELS,
  modelDisplayLabel,
} from '@/lib/llm/model-labels'
import {
  MODEL_DISPLAY_LABELS as REGISTRY_LABELS,
  modelDisplayLabel as registryModelDisplayLabel,
} from '@/lib/llm/registry'

describe('模型显示名', () => {
  it('已知模型使用显示名', () => {
    expect(modelDisplayLabel('deepseek-v4.1-flash')).toBe('DeepSeek V4.1 Flash')
    expect(modelDisplayLabel('gpt-5.6-luna')).toBe('GPT 5.6 Luna')
    expect(MODEL_DISPLAY_LABELS['deepseek-v4.1-flash']).toBe(
      'DeepSeek V4.1 Flash',
    )
  })

  it('未知模型原样返回', () => {
    expect(modelDisplayLabel('custom-model')).toBe('custom-model')
  })

  it('registry 继续 re-export 同一符号', () => {
    expect(registryModelDisplayLabel).toBe(modelDisplayLabel)
    expect(REGISTRY_LABELS).toBe(MODEL_DISPLAY_LABELS)
  })
})
