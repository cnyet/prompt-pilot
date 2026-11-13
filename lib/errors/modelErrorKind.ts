/**
 * 模型相关错误的界面分类（Task 4）。
 *
 * 只按错误码映射，不解析 message：服务端文案会变，code 是稳定契约。
 * 归类用于决定提示方式（去设置 / 等完成 / 刷新 / 检查输入），
 * 具体文案仍由调用方决定。
 */
export type ModelErrorKind =
  | 'unavailable'
  | 'in-flight'
  | 'not-found'
  | 'invalid'
  | 'unknown'

const KIND_BY_CODE: Readonly<Record<string, ModelErrorKind>> = {
  NO_MODEL: 'unavailable',
  ITERATION_IN_FLIGHT: 'in-flight',
  RECORD_NOT_FOUND: 'not-found',
  INVALID_INPUT: 'invalid',
}

/** 大小写与连字符不敏感：`iteration-in-flight` 与 `ITERATION_IN_FLIGHT` 等价。 */
export function modelErrorKind(code: string): ModelErrorKind {
  const normalized = code.trim().toUpperCase().replace(/-/g, '_')
  return KIND_BY_CODE[normalized] ?? 'unknown'
}
