'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useModelStatus } from '@/components/studio/modelStatus'
import { cn } from '@/lib/utils'
import type { LlmSettingsView, SettingSource } from '@/lib/settings/store'

type FieldKey = 'apiKey' | 'baseUrl' | 'modelGenerate' | 'modelEvaluate'

const SOURCE_LABEL: Record<SettingSource, string> = {
  settings: '设置',
  env: '环境变量',
  default: '默认值',
  none: '未配置',
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
    modelEvaluate: initial.modelEvaluate.value,
  })
  const [touched, setTouched] = useState<ReadonlySet<FieldKey>>(new Set())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const markTouched = (field: FieldKey) => {
    setTouched((prev) => new Set(prev).add(field))
    setMessage(null)
    setError(null)
  }

  const hasOverrides =
    view.apiKey.source === 'settings' ||
    view.baseUrl.source === 'settings' ||
    view.modelGenerate.source === 'settings' ||
    view.modelEvaluate.source === 'settings'

  const submit = async (payload: Record<string, string | null>) => {
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
        modelEvaluate: next.modelEvaluate.value,
      })
      setTouched(new Set())
      setMessage('设置已保存，立即生效。')
      refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败。')
    } finally {
      setSaving(false)
    }
  }

  const onSave = () => {
    const payload: Record<string, string | null> = {}
    if (touched.has('apiKey')) {
      payload.apiKey = values.apiKey.trim()
    }
    if (touched.has('baseUrl')) {
      payload.baseUrl = values.baseUrl.trim()
    }
    if (touched.has('modelGenerate')) {
      payload.modelGenerate = values.modelGenerate.trim()
    }
    if (touched.has('modelEvaluate')) {
      payload.modelEvaluate = values.modelEvaluate.trim()
    }
    if (Object.keys(payload).length === 0) {
      setMessage('没有改动需要保存。')
      return
    }
    void submit(payload)
  }

  const onReset = () => {
    void submit({
      apiKey: null,
      baseUrl: null,
      modelGenerate: null,
      modelEvaluate: null,
    })
  }

  const field = (
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
      <p className="text-caption text-ink-faint">{hint}</p>
    </div>
  )

  const inputClass =
    'h-8 w-full rounded-control border border-line bg-surface-inset px-2.5 text-label text-ink transition-colors placeholder:text-ink-faint focus:border-line-strong focus:bg-surface focus:outline-none'

  return (
    <div className="rounded-panel border border-line bg-surface">
      <div className="divide-y divide-line-subtle px-4 sm:px-5">
        {field(
          'apiKey',
          'API Key',
          view.apiKey.configured
            ? `已配置（${view.apiKey.hint ?? '末位不可见'}）。留空则继续使用当前密钥；填入新值会覆盖。密钥只存在本机数据库，不会回传浏览器。`
            : '未配置密钥时使用离线模板模式。填入后立即切换到真实模型，无需重启。密钥只存在本机数据库。',
          view.apiKey.source,
          <input
            id="setting-apiKey"
            type="password"
            autoComplete="off"
            value={values.apiKey}
            placeholder={
              view.apiKey.configured ? '已配置，留空则不修改' : '粘贴 ARK API Key'
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
          '方舟默认端点。使用自定义网关或代理时改这里，必须是 http(s) 完整地址。',
          view.baseUrl.source,
          <input
            id="setting-baseUrl"
            value={values.baseUrl}
            onChange={(event) => {
              markTouched('baseUrl')
              setValues((prev) => ({ ...prev, baseUrl: event.target.value }))
            }}
            className={cn(inputClass, 'font-mono')}
          />,
        )}

        {field(
          'modelGenerate',
          '生成模型',
          '生成与优化阶段使用。填模型 ID 或 ep- 接入点 ID。',
          view.modelGenerate.source,
          <input
            id="setting-modelGenerate"
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

        {field(
          'modelEvaluate',
          '评估模型',
          '评估阶段使用。建议与生成模型不同族，避免自评偏高。',
          view.modelEvaluate.source,
          <input
            id="setting-modelEvaluate"
            value={values.modelEvaluate}
            onChange={(event) => {
              markTouched('modelEvaluate')
              setValues((prev) => ({
                ...prev,
                modelEvaluate: event.target.value,
              }))
            }}
            className={cn(inputClass, 'font-mono')}
          />,
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle px-4 py-3 sm:px-5">
        <Button variant="primary" size="md" onClick={onSave} disabled={saving}>
          {saving ? '保存中' : '保存设置'}
        </Button>
        {hasOverrides ? (
          <Button
            variant="quiet"
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
    </div>
  )
}
