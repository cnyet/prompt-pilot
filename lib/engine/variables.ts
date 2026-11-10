import type { PromptVariable } from './schema'

/**
 * 变量派生与校验的纯函数。
 *
 * 试运行区与 `/api/run` 共用这一份逻辑：前端据此决定控件类型与必填提示，
 * 服务端在真正调用模型前再校验一次，避免「带空值运行」。
 * 本文件不读环境、不发生 IO，便于单测与同构复用。
 */

export type VariableControl =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'switch'

const CONTROL_BY_TYPE: Readonly<Record<PromptVariable['type'], VariableControl>> =
  {
    text: 'text',
    longtext: 'textarea',
    number: 'number',
    enum: 'select',
    json: 'textarea',
    boolean: 'switch',
  }

export interface VariableField {
  name: string
  label: string
  description?: string
  type: PromptVariable['type']
  control: VariableControl
  required: boolean
  defaultValue?: string
  options: readonly string[]
}

export interface VariableIssue {
  name: string
  label: string
  message: string
}

function copyOptions(options: readonly string[] | undefined): string[] {
  return options ? [...options] : []
}

/** 把 schema 里的变量声明转成表单字段，类型到控件的映射只此一处。 */
export function deriveVariableFields(
  variables: readonly PromptVariable[],
): VariableField[] {
  return variables.map((variable) => {
    const field: VariableField = {
      name: variable.name,
      label: variable.label,
      type: variable.type,
      control: CONTROL_BY_TYPE[variable.type],
      required: variable.required,
      options: copyOptions(variable.options),
    }
    if (variable.description !== undefined) {
      field.description = variable.description
    }
    if (variable.defaultValue !== undefined) {
      field.defaultValue = variable.defaultValue
    }
    return field
  })
}

/** 布尔默认关闭；枚举默认值不在候选内时退回空值，让用户显式选择。 */
export function defaultVariableValue(field: VariableField): string {
  if (field.type === 'boolean') {
    if (field.defaultValue === 'true' || field.defaultValue === '1') {
      return 'true'
    }
    return 'false'
  }
  const raw = field.defaultValue
  if (raw === undefined) {
    return ''
  }
  if (field.type === 'enum' && field.options.length > 0) {
    return field.options.includes(raw) ? raw : ''
  }
  return raw
}

export function initialVariableValues(
  fields: readonly VariableField[],
): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of fields) {
    values[field.name] = defaultVariableValue(field)
  }
  return values
}

/** 表单展示值：布尔值转成「是 / 否」，其余原样送入提示词。 */
export function displayVariableValue(
  field: VariableField,
  value: string,
): string {
  if (field.type === 'boolean') {
    return value === 'true' ? '是' : '否'
  }
  return value
}

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

/**
 * 必填与非空格式校验。可选变量留空是合法的；布尔永远有值。
 * 文案保持陈述句，不带感叹号。
 */
export function validateVariableValues(
  fields: readonly VariableField[],
  values: Readonly<Record<string, string>>,
): VariableIssue[] {
  const issues: VariableIssue[] = []
  for (const field of fields) {
    const value = values[field.name] ?? ''
    const trimmed = value.trim()

    if (field.required && field.type !== 'boolean' && trimmed.length === 0) {
      issues.push({
        name: field.name,
        label: field.label,
        message: `请填写「${field.label}」后再运行。`,
      })
      continue
    }

    if (field.type === 'number' && trimmed.length > 0) {
      if (!Number.isFinite(Number(trimmed))) {
        issues.push({
          name: field.name,
          label: field.label,
          message: `「${field.label}」需要填写数字。`,
        })
      }
      continue
    }

    if (field.type === 'json' && trimmed.length > 0 && !isValidJson(value)) {
      issues.push({
        name: field.name,
        label: field.label,
        message: `「${field.label}」需要是合法的 JSON。`,
      })
      continue
    }

    if (
      field.type === 'enum' &&
      trimmed.length > 0 &&
      !field.options.includes(value)
    ) {
      issues.push({
        name: field.name,
        label: field.label,
        message: `「${field.label}」只能从预设选项中选择。`,
      })
      continue
    }

    if (field.type === 'boolean' && value !== 'true' && value !== 'false') {
      issues.push({
        name: field.name,
        label: field.label,
        message: `「${field.label}」需要是开关状态。`,
      })
    }
  }
  return issues
}

export function issuesToMap(
  issues: readonly VariableIssue[],
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const issue of issues) {
    map[issue.name] = issue.message
  }
  return map
}

/** 把 `{{name}}` 全部替换成展示值；未知占位符保持原样，便于暴露问题。 */
export function substituteVariables(
  template: string,
  fields: readonly VariableField[],
  values: Readonly<Record<string, string>>,
): string {
  let text = template
  for (const field of fields) {
    const value = values[field.name] ?? defaultVariableValue(field)
    // 兼容 {{ name }} 这种带空格的写法；变量名已在 schema 层限定为标识符。
    const pattern = new RegExp(`\\{\\{\\s*${field.name}\\s*\\}\\}`, 'g')
    text = text.replace(pattern, displayVariableValue(field, value))
  }
  return text
}

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/** 提取模板里出现的变量名，供路由核对待填变量是否齐全。 */
export function extractVariableNames(template: string): string[] {
  const names = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1]
    if (name) {
      names.add(name)
    }
  }
  return [...names]
}

/** 落库用的变量快照；只保留当前 schema 声明过的变量。 */
export function serializeVariableValues(
  fields: readonly VariableField[],
  values: Readonly<Record<string, string>>,
): string {
  const snapshot: Record<string, string> = {}
  for (const field of fields) {
    snapshot[field.name] = values[field.name] ?? defaultVariableValue(field)
  }
  return JSON.stringify(snapshot)
}
