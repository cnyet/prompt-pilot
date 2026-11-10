'use client'

import { cn } from '@/lib/utils'
import type { VariableField } from '@/lib/engine/variables'

export interface RunFormProps {
  fields: readonly VariableField[]
  values: Readonly<Record<string, string>>
  errors: Readonly<Record<string, string>>
  disabled?: boolean
  onChange: (name: string, value: string) => void
}

const INPUT_CLASS =
  'mt-1 w-full rounded-control border border-line bg-surface px-2.5 py-1.5 text-body text-ink placeholder:text-ink-faint transition-colors hover:border-line-strong focus:border-accent disabled:cursor-not-allowed disabled:text-ink-faint'

function fieldInputClass(hasError: boolean): string {
  return cn(INPUT_CLASS, hasError && 'border-danger')
}

function Switch({
  id,
  checked,
  disabled,
  hasError,
  describedBy,
  onChange,
}: {
  id: string
  checked: boolean
  disabled: boolean
  hasError: boolean
  describedBy?: string | undefined
  onChange: (next: boolean) => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-invalid={hasError}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'mt-1 inline-flex items-center gap-2 rounded-control border px-2.5 py-1.5 text-label transition-colors disabled:cursor-not-allowed disabled:text-ink-faint',
        hasError ? 'border-danger' : 'border-line hover:border-line-strong',
        checked ? 'bg-accent-subtle text-ink' : 'bg-surface text-ink-muted',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-3.5 w-6 items-center rounded-chip border transition-colors',
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-bg-sunken',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-2 rounded-chip',
            checked ? 'right-0.5 bg-surface' : 'left-0.5 bg-ink-faint',
          )}
        />
      </span>
      {checked ? '是' : '否'}
    </button>
  )
}

/** 按变量类型渲染控件：枚举下拉、长文本多行、数字输入、布尔开关。 */
export function RunForm({
  fields,
  values,
  errors,
  disabled = false,
  onChange,
}: RunFormProps) {
  if (fields.length === 0) {
    return (
      <p className="rounded-control border border-line bg-bg-sunken px-3 py-2 text-caption text-ink-muted">
        该提示词没有声明变量，可以直接试运行。
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => {
        const id = `run-var-${field.name}`
        const value = values[field.name] ?? ''
        const error = errors[field.name]
        const hasError = error !== undefined
        const errorId = hasError ? `${id}-error` : undefined
        const describedBy = [field.description ? `${id}-description` : undefined, errorId]
          .filter((value): value is string => value !== undefined)
          .join(' ')

        return (
          <div key={field.name}>
            <label
              htmlFor={id}
              className="flex flex-wrap items-center gap-1.5 text-label text-ink"
            >
              <span>{field.label}</span>
              <span className="text-caption text-ink-faint">
                {field.required ? '必填' : '可选'}
              </span>
              <code className="rounded-chip border border-line bg-bg-sunken px-1 py-0.5 font-mono text-caption text-ink-muted">
                {`{{${field.name}}}`}
              </code>
            </label>
            {field.description ? (
              <p
                id={`${id}-description`}
                className="mt-1 text-caption text-ink-faint"
              >
                {field.description}
              </p>
            ) : null}

            {field.control === 'switch' ? (
              <Switch
                id={id}
                checked={value === 'true'}
                disabled={disabled}
                hasError={hasError}
                describedBy={describedBy.length > 0 ? describedBy : undefined}
                onChange={(next) => {
                  onChange(field.name, next ? 'true' : 'false')
                }}
              />
            ) : field.control === 'select' ? (
              <select
                id={id}
                value={value}
                disabled={disabled}
                aria-invalid={hasError}
                aria-describedby={describedBy.length > 0 ? describedBy : undefined}
                onChange={(event) => onChange(field.name, event.target.value)}
                className={fieldInputClass(hasError)}
              >
                <option value="">请选择</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.control === 'textarea' ? (
              <textarea
                id={id}
                value={value}
                rows={field.type === 'json' ? 4 : 3}
                disabled={disabled}
                spellCheck={field.type !== 'json'}
                aria-invalid={hasError}
                aria-describedby={describedBy.length > 0 ? describedBy : undefined}
                onChange={(event) => onChange(field.name, event.target.value)}
                className={cn(
                  fieldInputClass(hasError),
                  'resize-y',
                  field.type === 'json' && 'font-mono text-caption',
                )}
              />
            ) : field.control === 'number' ? (
              <input
                id={id}
                type="number"
                inputMode="decimal"
                value={value}
                disabled={disabled}
                aria-invalid={hasError}
                aria-describedby={describedBy.length > 0 ? describedBy : undefined}
                onChange={(event) => onChange(field.name, event.target.value)}
                className={cn(fieldInputClass(hasError), 'tnum')}
              />
            ) : (
              <input
                id={id}
                type="text"
                value={value}
                disabled={disabled}
                aria-invalid={hasError}
                aria-describedby={describedBy.length > 0 ? describedBy : undefined}
                onChange={(event) => onChange(field.name, event.target.value)}
                className={fieldInputClass(hasError)}
              />
            )}

            {error ? (
              <p
                id={`${id}-error`}
                role="alert"
                className="mt-1 text-caption text-danger"
              >
                {error}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
