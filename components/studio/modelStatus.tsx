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
import { parseTrialRunAvailability } from './useTrialRun'

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
 * 没有 ARK_API_KEY 时也允许生成（离线模板），但试运行必须显式禁用，
 * 所以这里只负责「是不是真的能用模型」，不替代 RunDrawer 的按钮禁用逻辑。
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
    fetch('/api/run', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`可用性检查返回了 ${response.status} 状态。`)
        }
        const payload: unknown = await response.json()
        const parsed = parseTrialRunAvailability(payload)
        if (!parsed) {
          throw new Error('可用性检查返回的数据格式不符合预期。')
        }
        setValue({
          status: parsed.availability.available ? 'available' : 'unavailable',
          available: parsed.availability.available,
          reason: parsed.availability.reason,
          modelLabel: parsed.availability.model?.label ?? null,
          providerId: parsed.availability.model?.providerId ?? null,
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
          reason: '无法确认模型可用性，检查网络后重试。',
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
 * 顶栏之外的第二层状态条：只在没有真实模型可用时出现。
 * 它要一直挂着，不能做成 toast，用户随时能看见当前为什么不能试运行。
 */
export function ModelStatusBanner() {
  const { status, reason, providerId, refresh } = useModelStatus()
  const mockOnly = status === 'available' && providerId === 'mock'
  const visible = status === 'unavailable' || status === 'error' || mockOnly
  if (!visible) {
    return null
  }

  const state = status === 'error' ? 'error' : mockOnly ? 'mock' : 'offline'
  const title =
    status === 'error'
      ? '模型状态未知'
      : mockOnly
        ? '离线模板模式 · Mock 试运行'
        : '离线模板模式'
  const explanation =
    status === 'error'
      ? '无法确认模型是否可用，试运行可能不可用。'
      : mockOnly
        ? '未配置 ARK_API_KEY。生成使用本地模板，试运行使用本地 Mock 模型。'
        : reason.length > 0
          ? reason
          : '未配置 ARK_API_KEY，生成使用本地模板，试运行不可用。'

  return (
    <div
      data-testid="model-status"
      data-state={state}
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
 * 顶栏的状态徽标。原来这里写死「L1 离线模板」，用户配了密钥之后仍然显示，
 * 与真实状态不符。改为读同一份探测结果，文案与 tooltip 都跟着状态走。
 */
export function ModelStatusBadge() {
  const value = useModelStatus()
  const { status, reason, providerId } = value
  const mockOnly = status === 'available' && providerId === 'mock'
  const online = status === 'available' && providerId !== 'mock'
  const label = online ? '在线模型' : modelStatusLabel(value)
  const title =
    status === 'loading'
      ? '正在确认模型服务是否可用'
      : status === 'error'
        ? '无法确认模型状态，试运行可能不可用'
        : online
          ? '已配置模型服务，生成与试运行都走真实模型'
          : mockOnly
            ? '未配置 ARK_API_KEY，当前使用本地 Mock 模型'
            : reason.length > 0
              ? reason
              : '未配置 ARK_API_KEY，当前使用离线模板'
  return (
    <span
      data-testid="model-status-badge"
      data-state={online ? 'online' : 'offline'}
      title={title}
      className="rounded-chip border border-line px-2 py-0.5 text-caption text-ink-muted"
    >
      {label}
    </span>
  )
}

/** 工作台左栏与空态共用的短标签，避免各写一份「离线模板」。 */
export function modelStatusLabel(value: ModelStatusValue): string {
  if (value.status === 'loading') {
    return '模型状态确认中'
  }
  if (value.status === 'available' && value.providerId !== 'mock') {
    return '在线模型'
  }
  if (value.status === 'error') {
    return '模型状态未知'
  }
  return '离线模板'
}
