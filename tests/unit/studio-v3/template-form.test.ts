import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_BODY_LIMIT,
  validateTemplateForm,
  type TemplateFormValues,
} from '@/lib/ui/template-form'

const VALID: TemplateFormValues = {
  title: '周报',
  description: '每周汇报',
  style: '营销',
  body: 'x',
}

describe('validateTemplateForm', () => {
  it('合法输入通过，bodyCount 为原始长度', () => {
    expect(validateTemplateForm(VALID)).toEqual({
      valid: true,
      reason: null,
      bodyCount: 1,
    })
  })

  it('title 为空或纯空白时返回 emptyTitle', () => {
    expect(validateTemplateForm({ ...VALID, title: '' }).reason).toBe('emptyTitle')
    expect(validateTemplateForm({ ...VALID, title: '   ' }).reason).toBe('emptyTitle')
  })

  it('description 为空时返回 emptyDescription', () => {
    expect(validateTemplateForm({ ...VALID, description: '' }).reason).toBe(
      'emptyDescription',
    )
    expect(validateTemplateForm({ ...VALID, description: ' \n ' }).reason).toBe(
      'emptyDescription',
    )
  })

  it('style 为空时返回 emptyStyle', () => {
    expect(validateTemplateForm({ ...VALID, style: '' }).reason).toBe('emptyStyle')
    expect(validateTemplateForm({ ...VALID, style: '\t' }).reason).toBe('emptyStyle')
  })

  it('空值优先级为 title → description → style', () => {
    expect(
      validateTemplateForm({ title: ' ', description: '', style: '', body: 'x' }).reason,
    ).toBe('emptyTitle')
    expect(
      validateTemplateForm({ title: '周报', description: ' ', style: '', body: 'x' })
        .reason,
    ).toBe('emptyDescription')
  })

  it('body 8001 字返回 bodyTooLong，bodyCount 为 8001', () => {
    const result = validateTemplateForm({
      ...VALID,
      body: 'a'.repeat(TEMPLATE_BODY_LIMIT + 1),
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('bodyTooLong')
    expect(result.bodyCount).toBe(TEMPLATE_BODY_LIMIT + 1)
  })

  it('body 恰好 8000 字有效，bodyCount 为 8000', () => {
    const result = validateTemplateForm({
      ...VALID,
      body: 'a'.repeat(TEMPLATE_BODY_LIMIT),
    })
    expect(result).toEqual({
      valid: true,
      reason: null,
      bodyCount: TEMPLATE_BODY_LIMIT,
    })
  })

  it('空值优先于正文超限', () => {
    expect(
      validateTemplateForm({
        title: '',
        description: '',
        style: '',
        body: 'a'.repeat(TEMPLATE_BODY_LIMIT + 1),
      }).reason,
    ).toBe('emptyTitle')
  })

  it('纯函数，不改动传入对象', () => {
    const values: TemplateFormValues = { ...VALID, title: '  ' }
    validateTemplateForm(values)
    expect(values.title).toBe('  ')
  })
})
