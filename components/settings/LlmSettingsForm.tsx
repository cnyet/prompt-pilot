'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { inputStyles } from '@/components/ui/Input'
import { useModelStatus } from '@/components/shell/modelStatus'
import { cn } from '@/lib/utils'
import type { LlmSettingsView, SettingSource } from '@/lib/settings/store'

type FieldKey =
  | 'apiKey'
  | 'baseUrl'
  | 'modelGenerate'
  | 'modelOptimize'
  | 'generateTemperature'
  | 'generateMaxTokens'
  | 'optimizeTemperature'
  | 'optimizeMaxTokens'

interface ModelTestResult {
  role: string
  roleLabel: string
  modelLabel: string | null
  configured: boolean
  ok: boolean
  latencyMs: number | null
  error?: string
}

interface TestResult {
  ok: boolean
  configured: boolean
  checkedAt: string
  models: ModelTestResult[]
}

function readTestResult(payload: unknown): TestResult | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const result = (payload as { result?: unknown }).result
  if (typeof result !== 'object' || result === null) {
    return null
  }
  const models = (result as { models?: unknown }).models
  if (!Array.isArray(models)) {
    return null
  }
  return result as TestResult
}

function formatLatency(latencyMs: number | null): string {
  if (latencyMs === null) {
    return ''
  }
  return latencyMs >= 1000
    ? `${(latencyMs / 1000).toFixed(1)}s`
    : `${latencyMs}ms`
}

const SOURCE_LABEL: Record<SettingSource, string> = {
  settings: '设置',
  env: '环境变量',
  default: '默认值',
  none: '未配置',
  inherited: '继承生成',
}

function SourceBadge({ source }: { source: SettingSource }) {
  return (
    <span
      className={cn(
        'rounded-chip px-1.5 py-0.5 text-caption',
        source === 'settings'
          ? 'bg-accent-subtle text-accent'
          : 'bg-bg-sunken text-ink-faint',
      )}
    >
      {SOURCE_LABEL[source]}
    </span>
  )
}

function readError(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const error = (payload as { error?: unknown }).error
    if (typeof error === 'object' && error !== null) {
      const message = (error as { message?: unknown }).message
      if (typeof message === 'string' && message.length > 0) {
        return message
      }
    }
  }
  return fallback
}

function readSettings(payload: unknown): LlmSettingsView | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const settings = (payload as { settings?: unknown }).settings
  if (typeof settings !== 'object' || settings === null) {
    return null
  }
  return settings as LlmSettingsView
}

export function LlmSettingsForm({ initial }: { initial: LlmSettingsView }) {
  const { refresh } = useModelStatus()
  const [view, setView] = useState(initial)
  const [values, setValues] = useState({
    apiKey: '',
    baseUrl: initial.baseUrl.value,
    modelGenerate: initial.modelGenerate.value,
    modelOptimize: initial.modelOptimize.value,
    generateTemperature: String(initial.params.generate.temperature.value),
    generateMaxTokens: String(initial.params.generate.maxTokens.value),
    optimizeTemperature: String(initial.params.optimize.temperature.value),
    optimizeMaxTokens: String(initial.params.optimize.maxTokens.value),
  })
  const [touched, setTouched] = useState<ReadonlySet<FieldKey>>(new Set())
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldKey, string>>
  >({})
  const [saving, setSaving] = useState(false)
  // 端点地址默认隐藏，避免网关地址常驻屏幕；展开后可编辑（FR-8.2）。
  const [baseUrlVisible, setBaseUrlVisible] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const markTouched = (field: FieldKey) => {
    setTouched((prev) => new Set(prev).add(field))
    setFieldErrors((prev) => {
      if (!(field in prev)) {
        return prev
      }
      const next = { ...prev }
      delete next[field]
      return next
    })
    setMessage(null)
    setError(null)
    setTestResult(null)
    setTestError(null)
  }

  /** 提交前本地校验：错误贴在字段下，不等服务端往返 */
  const validate = (): boolean => {
    const next: Partial<Record<FieldKey, string>> = {}
    if (touched.has('baseUrl')) {
      const value = values.baseUrl.trim()
      if (value.length > 0) {
        let ok = false
        try {
          const parsed = new URL(value)
          ok = parsed.protocol === 'http:' || parsed.protocol === 'https:'
        } catch {
          ok = false
        }
        if (!ok) {
          next.baseUrl =
            '填完整的 http(s) 地址，例如 https://opencode.ai/inference/go/openai/v1。'
        }
      }
    }
    const modelRe = /^[A-Za-z0-9._:-]{1,120}$/
    if (touched.has('modelGenerate')) {
      const value = values.modelGenerate.trim()
      if (value.length > 0 && !modelRe.test(value)) {
        next.modelGenerate = '只能用字母、数字、点、下划线、冒号或连字符。'
      }
    }
    if (touched.has('modelOptimize')) {
      const value = values.modelOptimize.trim()
      if (value.length > 0 && !modelRe.test(value)) {
        next.modelOptimize = '只能用字母、数字、点、下划线、冒号或连字符。'
      }
    }

    const numberField = (
      key: FieldKey,
      min: number,
      max: number,
      integer: boolean,
      label: string,
    ) => {
      if (!touched.has(key)) {
        return
      }
      const raw = values[key].trim()
      if (raw.length === 0) {
        return
      }
      const parsed = Number(raw)
      if (integer) {
        if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
          next[key] = `${label}必须是 ${min} 到 ${max} 的整数。`
        }
      } else if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        next[key] = `${label}必须是 ${min} 到 ${max} 之间的数字。`
      }
    }
    numberField('generateTemperature', 0, 2, false, '生成温度')
    numberField('generateMaxTokens', 1, 65536, true, '生成最大输出 token')
    numberField('optimizeTemperature', 0, 2, false, '优化温度')
    numberField('optimizeMaxTokens', 1, 65536, true, '优化最大输出 token')

    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  const hasOverrides =
    view.apiKey.source === 'settings' ||
    view.baseUrl.source === 'settings' ||
    view.modelGenerate.source === 'settings' ||
    view.modelOptimize.source === 'settings' ||
    view.params.generate.temperature.source === 'settings' ||
    view.params.generate.maxTokens.source === 'settings' ||
    view.params.optimize.temperature.source === 'settings' ||
    view.params.optimize.maxTokens.source === 'settings'

  const submit = async (payload: Record<string, string | number | null>) => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(readError(body, '保存失败，请稍后重试。'))
      }
      const next = readSettings(body)
      if (!next) {
        throw new Error('保存成功但返回数据不完整。')
      }
      setView(next)
      setValues({
        apiKey: '',
        baseUrl: next.baseUrl.value,
        modelGenerate: next.modelGenerate.value,
        modelOptimize: next.modelOptimize.value,
        generateTemperature: String(next.params.generate.temperature.value),
        generateMaxTokens: String(next.params.generate.maxTokens.value),
        optimizeTemperature: String(next.params.optimize.temperature.value),
        optimizeMaxTokens: String(next.params.optimize.maxTokens.value),
      })
      setTouched(new Set())
      setTestResult(null)
      setTestError(null)
      setMessage('设置已保存，立即生效。')
      refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败。')
    } finally {
      setSaving(false)
    }
  }

  const onSave = () => {
    const payload: Record<string, string | number | null> = {}
    if (touched.has('apiKey')) {
      payload.apiKey = values.apiKey.trim()
    }
    if (touched.has('baseUrl')) {
      payload.baseUrl = values.baseUrl.trim()
    }
    if (touched.has('modelGenerate')) {
      payload.modelGenerate = values.modelGenerate.trim()
    }
    if (touched.has('modelOptimize')) {
      payload.modelOptimize = values.modelOptimize.trim()
    }
    const numberValue = (key: FieldKey) => {
      if (!touched.has(key)) {
        return
      }
      const raw = values[key].trim()
      payload[key] = raw.length === 0 ? null : Number(raw)
    }
    numberValue('generateTemperature')
    numberValue('generateMaxTokens')
    numberValue('optimizeTemperature')
    numberValue('optimizeMaxTokens')
    if (Object.keys(payload).length === 0) {
      setMessage('没有改动需要保存。')
      return
    }
    if (!validate()) {
      setError(null)
      return
    }
    void submit(payload)
  }

  const onReset = () => {
    void submit({
      apiKey: null,
      baseUrl: null,
      modelGenerate: null,
      modelOptimize: null,
      generateTemperature: null,
      generateMaxTokens: null,
      optimizeTemperature: null,
      optimizeMaxTokens: null,
    })
  }

  /** 只测已保存的配置，避免测的和保存的不是同一份。 */
  const onTest = async () => {
    setTesting(true)
    setTestError(null)
    setTestResult(null)
    try {
      const response = await fetch('/api/settings/test', { method: 'POST' })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(readError(body, '连通性测试没有完成，请稍后重试。'))
      }
      const result = readTestResult(body)
      if (!result) {
        throw new Error('测试返回数据不完整。')
      }
      setTestResult(result)
    } catch (cause) {
      setTestError(cause instanceof Error ? cause.message : '连通性测试没有完成。')
    } finally {
      setTesting(false)
    }
  }

  const hasUnsavedChanges = touched.size > 0

  const field = (
    key: FieldKey,
    label: string,
    hint: string,
    source: SettingSource,
    input: React.ReactNode,
  ) => (
    fieldBody(key, label, hint, source, input)
  )

  const fieldBody = (
    key: FieldKey,
    label: string,
    hint: string,
    source: SettingSource,
    input: React.ReactNode,
  ) => (
    <div className="flex flex-col gap-1.5 py-3">
      <div className="flex items-center gap-2">
        <label
          htmlFor={`setting-${key}`}
          className="text-label font-medium text-ink"
        >
          {label}
        </label>
        <SourceBadge source={source} />
      </div>
      {input}
      {fieldErrors[key] ? (
        <p
          id={`setting-${key}-error`}
          role="alert"
          className="text-caption text-danger"
        >
          {fieldErrors[key]}
        </p>
      ) : null}
      <p id={`setting-${key}-hint`} className="text-caption text-ink-faint">{hint}</p>
    </div>
  )

  const inputClass = cn(inputStyles, 'h-9')

  const numberField = (
    key: FieldKey,
    label: string,
    hint: string,
    source: SettingSource,
    step: number,
    min: number,
    max: number,
  ) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label
          htmlFor={`setting-${key}`}
          className="text-caption font-medium text-ink"
        >
          {label}
        </label>
        <SourceBadge source={source} />
      </div>
      <input
        id={`setting-${key}`}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={values[key]}
        aria-invalid={fieldErrors[key] ? true : undefined}
        aria-describedby={
          fieldErrors[key]
            ? `setting-${key}-error`
            : `setting-${key}-hint`
        }
        onChange={(event) => {
          markTouched(key)
          setValues((prev) => ({ ...prev, [key]: event.target.value }))
        }}
        className={cn(inputClass, 'tnum')}
      />
      {fieldErrors[key] ? (
        <p
          id={`setting-${key}-error`}
          role="alert"
          className="text-caption text-danger"
        >
          {fieldErrors[key]}
        </p>
      ) : null}
      <p id={`setting-${key}-hint`} className="text-caption text-ink-faint">
        {hint}
      </p>
    </div>
  )

  const allUnconfigured =
    testResult !== null && testResult.models.every((model) => !model.configured)

  return (
    <div className="rounded-panel border border-line bg-surface">
      <div className="divide-y divide-line-subtle px-4 sm:px-5">
        {field(
          'apiKey',
          'API Key',
          view.apiKey.configured
            ? `已配置（${view.apiKey.hint ?? '末位不可见'}）。留空则继续使用当前密钥；填入新值会覆盖。密钥只存在本机数据库，不会回传浏览器。`
            : '未配置密钥时生成与优化禁用，先在设置里接入模型。密钥只存在本机数据库。',
          view.apiKey.source,
          <input
            id="setting-apiKey"
            type="password"
            autoComplete="off"
            value={values.apiKey}
            placeholder={
              view.apiKey.configured ? '已配置，留空则不修改' : '粘贴 API Key'
            }
            onChange={(event) => {
              markTouched('apiKey')
              setValues((prev) => ({ ...prev, apiKey: event.target.value }))
            }}
            className={inputClass}
          />,
        )}

        {field(
          'baseUrl',
          '数据面端点',
          '默认走 opencode 推理网关，OpenAI 兼容端点以 /openai/v1 结尾。换成方舟、代理或自建网关时改这里，必须是 http(s) 完整地址。地址默认隐藏，点「显示并编辑」后才可见。',
          view.baseUrl.source,
          baseUrlVisible || fieldErrors.baseUrl ? (
            <div className="flex items-center gap-2">
              <input
                id="setting-baseUrl"
                aria-invalid={fieldErrors.baseUrl ? true : undefined}
                aria-describedby={
                  fieldErrors.baseUrl ? 'setting-baseUrl-error' : 'setting-baseUrl-hint'
                }
                value={values.baseUrl}
                onChange={(event) => {
                  markTouched('baseUrl')
                  setValues((prev) => ({ ...prev, baseUrl: event.target.value }))
                }}
                className={cn(inputClass, 'flex-1 font-mono')}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBaseUrlVisible(false)}
              >
                隐藏
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                id="setting-baseUrl"
                readOnly
                value={
                  view.baseUrl.source === 'settings'
                    ? '自定义端点，地址已隐藏'
                    : '默认网关，地址已隐藏'
                }
                aria-describedby="setting-baseUrl-hint"
                className={cn(inputClass, 'flex-1 bg-bg-sunken text-ink-muted')}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBaseUrlVisible(true)}
              >
                显示并编辑
              </Button>
            </div>
          ),
        )}

        <div>
          {field(
            'modelGenerate',
            '生成模型',
            '生成阶段使用。填模型 ID 或 ep- 接入点 ID。',
            view.modelGenerate.source,
            <input
              id="setting-modelGenerate"
              aria-invalid={fieldErrors.modelGenerate ? true : undefined}
              aria-describedby={
                fieldErrors.modelGenerate
                  ? 'setting-modelGenerate-error'
                  : 'setting-modelGenerate-hint'
              }
              value={values.modelGenerate}
              onChange={(event) => {
                markTouched('modelGenerate')
                setValues((prev) => ({
                  ...prev,
                  modelGenerate: event.target.value,
                }))
              }}
              className={cn(inputClass, 'font-mono')}
            />,
          )}
          <div className="grid gap-x-4 pb-3 sm:grid-cols-2">
            {numberField(
              'generateTemperature',
              '温度',
              '0 到 2，默认 0.7。',
              view.params.generate.temperature.source,
              0.1,
              0,
              2,
            )}
            {numberField(
              'generateMaxTokens',
              '最大输出 token',
              '1 到 65536 的整数，默认 8192。',
              view.params.generate.maxTokens.source,
              1,
              1,
              65536,
            )}
          </div>
        </div>

        <div>
          {field(
            'modelOptimize',
            '优化模型',
            '留空或与生成模型相同。填模型 ID 或 ep- 接入点 ID。',
            view.modelOptimize.source,
            <input
              id="setting-modelOptimize"
              aria-invalid={fieldErrors.modelOptimize ? true : undefined}
              aria-describedby={
                fieldErrors.modelOptimize
                  ? 'setting-modelOptimize-error'
                  : 'setting-modelOptimize-hint'
              }
              value={values.modelOptimize}
              onChange={(event) => {
                markTouched('modelOptimize')
                setValues((prev) => ({
                  ...prev,
                  modelOptimize: event.target.value,
                }))
              }}
              className={cn(inputClass, 'font-mono')}
            />,
          )}
          <div className="grid gap-x-4 pb-3 sm:grid-cols-2">
            {numberField(
              'optimizeTemperature',
              '温度',
              '未单独设置时沿用生成模型的参数。',
              view.params.optimize.temperature.source,
              0.1,
              0,
              2,
            )}
            {numberField(
              'optimizeMaxTokens',
              '最大输出 token',
              '未单独设置时沿用生成模型的参数。',
              view.params.optimize.maxTokens.source,
              1,
              1,
              65536,
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle px-4 py-3 sm:px-5">
        <Button variant="primary" size="md" onClick={onSave} disabled={saving}>
          {saving ? '保存中' : '保存设置'}
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => void onTest()}
          disabled={saving || testing || hasUnsavedChanges}
          title={
            hasUnsavedChanges
              ? '有未保存的改动，保存后再测试'
              : '用已保存的配置各发一次最小请求'
          }
        >
          {testing ? '测试中' : '测试连接'}
        </Button>
        {hasUnsavedChanges ? (
          <span className="text-caption text-ink-faint">
            有未保存的改动，保存后再测试
          </span>
        ) : null}
        {hasOverrides ? (
          <Button
            variant="ghost"
            size="md"
            onClick={onReset}
            disabled={saving}
            title="清除设置页的覆盖值，全部回落到环境变量"
          >
            清除全部覆盖
          </Button>
        ) : null}
        {message ? (
          <span
            role="status"
            className="inline-flex items-center gap-1 text-caption text-success"
          >
            <Icon name="spark" size={13} />
            {message}
          </span>
        ) : null}
        {error ? (
          <span role="alert" className="text-caption text-danger">
            {error}
          </span>
        ) : null}
      </div>

      {testError ? (
        <p
          role="alert"
          className="border-t border-line-subtle px-4 py-3 text-caption text-danger sm:px-5"
        >
          {testError}
        </p>
      ) : null}

      {testResult ? (
        <div
          role="status"
          className="border-t border-line-subtle px-4 py-3 sm:px-5"
        >
          {allUnconfigured ? (
            <p className="flex items-start gap-1.5 text-caption text-warning">
              <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
              未配置 API Key，无法测试真实连通性。
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {testResult.models.map((model) => (
                <li
                  key={model.role}
                  className={cn(
                    'flex items-start gap-1.5 text-caption',
                    model.ok ? 'text-success' : 'text-danger',
                  )}
                >
                  <Icon
                    name={model.ok ? 'spark' : 'alert'}
                    size={13}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    {model.roleLabel}
                    {model.modelLabel ? ` · ${model.modelLabel}` : ''}
                    {model.ok
                      ? ` 连通 ${formatLatency(model.latencyMs)}`
                      : ` 失败：${model.error ?? '未返回原因'}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-caption text-ink-faint tnum">
            测试时间{' '}
            {new Date(testResult.checkedAt).toLocaleTimeString('zh-CN', {
              hour12: false,
            })}
            ，只验证已保存的配置。
          </p>
        </div>
      ) : null}
    </div>
  )
}
