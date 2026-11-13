/**
 * 存为模板表单校验（Task 6）。
 *
 * 纯函数：只管空值与正文上限，不发请求、不碰 React。
 * title / description / style 的长度上限由输入框 `maxLength` 保证；
 * body 上限 8000 是双保险（输入框 + 这里的校验），bodyCount 始终回传原始长度，
 * 由界面显示计数。空值判断按 trim，计数用原始长度。
 */

export const TEMPLATE_TITLE_LIMIT = 80
export const TEMPLATE_DESCRIPTION_LIMIT = 200
export const TEMPLATE_STYLE_LIMIT = 40
export const TEMPLATE_BODY_LIMIT = 8000

export interface TemplateFormValues {
  title: string
  description: string
  style: string
  body: string
}

export type TemplateFormInvalidReason =
  | 'emptyTitle'
  | 'emptyDescription'
  | 'emptyStyle'
  | 'bodyTooLong'

export interface TemplateFormValidation {
  valid: boolean
  reason: TemplateFormInvalidReason | null
  bodyCount: number
}

/** 校验优先级：title → description → style → bodyTooLong。 */
export function validateTemplateForm(
  values: TemplateFormValues,
): TemplateFormValidation {
  const bodyCount = values.body.length

  if (values.title.trim().length === 0) {
    return { valid: false, reason: 'emptyTitle', bodyCount }
  }
  if (values.description.trim().length === 0) {
    return { valid: false, reason: 'emptyDescription', bodyCount }
  }
  if (values.style.trim().length === 0) {
    return { valid: false, reason: 'emptyStyle', bodyCount }
  }
  if (bodyCount > TEMPLATE_BODY_LIMIT) {
    return { valid: false, reason: 'bodyTooLong', bodyCount }
  }

  return { valid: true, reason: null, bodyCount }
}
