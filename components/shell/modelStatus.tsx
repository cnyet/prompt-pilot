'use client'

import Link from 'next/link'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { readModelStatus } from './modelStatusModel'

export type ModelStatusState = 'loading' | 'available' | 'unavailable' | 'error'

export interface ModelStatusValue {
  status: ModelStatusState
  available: boolean
  /** 不可用时服务端给出的原因，界面直接展示，不再另写一套。 */
  reason: string
  modelLabel: string | null
  providerId: string | null
  refresh: () => void
}

const INITIAL: ModelStatusValue = {
  status: 'loading',
  available: false,
  reason: '正在确认可用模型。',
  modelLabel: null,
  providerId: null,
  refresh: () => {},
}

const ModelStatusContext = createContext<ModelStatusValue>(INITIAL)

/**
 * 模型可用性只在布局层探测一次，所有页面共用同一份结果。
 *
 * 数据源是 `GET /api/settings`：只看密钥是否已配置与生成模型 ID，
 * 不在壳层复刻生成路由的可用性判定。
 */
export function ModelStatusProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [value, setValue] = useState<ModelStatusValue>(INITIAL)
  const [token, setToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setValue((previous) => ({
      ...previous,
      status: 'loading',
      reason: '正在确认可用模型。',
    }))
    fetch('/api/settings', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`设置接口返回了 ${response.status} 状态。`)
        }
        const payload: unknown = await response.json()
        const parsed = readModelStatus(payload)
        if (!parsed) {
          throw new Error('设置接口返回的数据格式不符合预期。')
        }
        setValue({
          status: parsed.status,
          available: parsed.status === 'available',
          reason: parsed.reason,
          modelLabel: parsed.modelLabel,
          providerId: parsed.providerId,
          refresh: () => setToken((current) => current + 1),
        })
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return
        }
        setValue({
          status: 'error',
          available: false,
          reason: '无法确认模型是否可用，检查网络后重试。',
          modelLabel: null,
          providerId: null,
          refresh: () => setToken((current) => current + 1),
        })
      })
    return () => controller.abort()
  }, [token])

  const refresh = useCallback(() => {
    setToken((current) => current + 1)
  }, [])

  const contextValue = useMemo<ModelStatusValue>(
    () => ({ ...value, refresh }),
    [value, refresh],
  )

  return (
    <ModelStatusContext.Provider value={contextValue}>
      {children}
    </ModelStatusContext.Provider>
  )
}

export function useModelStatus(): ModelStatusValue {
  return useContext(ModelStatusContext)
}

/**
 * 顶栏之外的第二层状态条：只在没有可用模型或状态未知时出现。
 * 它要一直挂着，不能做成 toast，用户随时能看见当前为什么不能生成。
 */
export function ModelStatusBanner() {
  const { status, reason, refresh } = useModelStatus()
  if (status !== 'unavailable' && status !== 'error') {
    return null
  }

  const title = status === 'error' ? '模型状态未知' : '未配置模型'
  const explanation =
    status === 'error'
      ? '无法确认模型是否可用，检查网络后重试。'
      : reason.length > 0
        ? reason
        : '未配置模型凭据，先在设置里接入模型。'

  return (
    <div
      data-testid="model-status"
      data-state={status}
      className="border-b border-line bg-bg-sunken"
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-caption lg:px-6">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-warning"
        />
        <span className="font-medium text-ink">{title}</span>
        <span className="min-w-0 text-ink-muted">{explanation}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {status === 'error' ? (
            <button
              type="button"
              onClick={refresh}
              className="rounded-control border border-line px-2 py-0.5 text-caption text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              重新确认
            </button>
          ) : null}
          <Link
            href="/settings"
            className="text-accent underline-offset-2 transition-colors hover:underline"
          >
            查看设置
          </Link>
        </span>
      </div>
    </div>
  )
}

/**
 * 顶栏的状态徽标。只显示在线与确认中；离线/异常由常驻横幅说明，
 * 避免顶栏和横幅同屏说同一件事。
 */
export function ModelStatusBadge() {
  const value = useModelStatus()
  const { status } = value
  if (status !== 'available' && status !== 'loading') {
    return null
  }
  const label = status === 'available' ? '在线模型' : modelStatusLabel(value)
  const title =
    status === 'loading'
      ? '正在确认模型服务是否可用'
      : '已配置模型服务，生成与优化都走真实模型'
  return (
    <span
      data-testid="model-status-badge"
      data-state={status === 'available' ? 'online' : 'loading'}
      title={title}
      className="rounded-chip border border-line px-2 py-0.5 text-caption text-ink-muted"
    >
      {label}
    </span>
  )
}

/** 工作台左栏与空态共用的短标签，避免各写一份模型状态文案。 */
export function modelStatusLabel(value: ModelStatusValue): string {
  if (value.status === 'loading') {
    return '模型状态确认中'
  }
  if (value.status === 'available') {
    return '在线模型'
  }
  if (value.status === 'error') {
    return '模型状态未知'
  }
  return '未配置模型'
}
