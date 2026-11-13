'use client'

import { useId, useState, type ReactElement } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import {
  checkPrompt,
  type CheckIssue,
  type CheckLevel,
} from '@/lib/engine/check'
import { t } from '@/lib/i18n/zh'
import { cn } from '@/lib/utils'

const LEVELS: readonly CheckLevel[] = ['error', 'warn', 'info']

const LEVEL_LABEL_KEYS = {
  error: 'studio.check.level.error',
  warn: 'studio.check.level.warn',
  info: 'studio.check.level.info',
} as const

const LEVEL_TONES = {
  error: 'error',
  warn: 'warning',
  info: 'info',
} as const

/** 与 `postRepair` 的 issues 元素同形；由父层负责发请求与流式状态。 */
export interface RepairIssueInput {
  id: string
  level: CheckLevel
  message: string
  suggestion: string | null
}

export interface CheckPanelProps {
  source: string
  recordId: string | null
  /** 任何进行中的流：修复按钮禁用。 */
  busy: boolean
  /** 优化模型是否可用。 */
  repairAvailable: boolean
  onRepair: (issues: RepairIssueInput[]) => void
}

function messageOf(issue: CheckIssue): string {
  return t(issue.messageKey, issue.messageParams)
}

function positionOf(issue: CheckIssue): string {
  if (issue.span.end === 0) return t('studio.check.positionFull')
  return t('studio.check.position', { position: issue.span.start + 1 })
}

/** fixable 项按 error → warn → info 取前 20 条，映射为修复接口的入参。 */
export function buildRepairIssues(issues: readonly CheckIssue[]): RepairIssueInput[] {
  const fixable = LEVELS.flatMap((level) =>
    issues.filter((issue) => issue.level === level && issue.fixable),
  )
  return fixable.slice(0, 20).map((issue) => ({
    id: issue.id,
    level: issue.level,
    message: messageOf(issue),
    suggestion: issue.suggestionKey
      ? t(issue.suggestionKey, issue.messageParams)
      : null,
  }))
}

/**
 * 本地检查（FR-5）。只在点击「检查」后渲染结果，按 error / warn / info 分组。
 *
 * 每次展开都重新执行 `checkPrompt`，不实时刷新；父层用 output 作 key，
 * 正文变化时整个组件卸载，旧检查结果随之丢弃。「一键修复」只提交前 20 条
 * 可修复项，由父层调用 `postRepair` 生成新迭代。
 */
export function CheckPanel({
  source,
  recordId,
  busy,
  repairAvailable,
  onRepair,
}: CheckPanelProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<ReturnType<typeof checkPrompt> | null>(
    null,
  )
  const panelId = useId()

  function toggle() {
    if (open) {
      setOpen(false)
      setResult(null)
      return
    }
    setResult(checkPrompt(source))
    setOpen(true)
  }

  const groups = result
    ? LEVELS.map((level) => ({
        level,
        issues: result.issues.filter((issue) => issue.level === level),
      })).filter((group) => group.issues.length > 0)
    : []
  const repairIssues = result ? buildRepairIssues(result.issues) : []
  const canRepair =
    recordId !== null && repairAvailable && !busy && repairIssues.length > 0
  const hasOutput = source.trim().length > 0

  return (
    <div className="border-t border-line-subtle px-5 py-3">
      <Button
        variant="ghost"
        size="sm"
        icon="search"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        disabled={!hasOutput}
      >
        {open ? t('studio.check.actionClose') : t('studio.check.action')}
      </Button>

      {open && result ? (
        <div
          id={panelId}
          role="region"
          aria-label={t('studio.check.title')}
          className="mt-3 rounded-panel border border-line bg-bg-sunken p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-label font-medium text-ink">
              {t('studio.check.title')}
            </h3>
            <p
              role="status"
              className="text-caption tabular-nums text-ink-faint"
            >
              {t('studio.check.duration', {
                ms: Math.round(result.durationMs),
              })}
            </p>
          </div>

          {result.issues.length === 0 ? (
            <p className="mt-3 text-label text-success">
              {t('studio.check.empty')}
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {groups.map((group) => (
                <section
                  key={group.level}
                  aria-label={t(LEVEL_LABEL_KEYS[group.level])}
                >
                  <Chip tone={LEVEL_TONES[group.level]}>
                    {t(LEVEL_LABEL_KEYS[group.level])}
                    <span className="tabular-nums">{group.issues.length}</span>
                  </Chip>
                  <ul className="mt-2 flex flex-col gap-2">
                    {group.issues.map((issue) => (
                      <CheckIssueItem key={issue.id} issue={issue} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle pt-3">
            <p
              className={cn(
                'text-caption',
                repairAvailable ? 'text-ink-faint' : 'text-warning',
              )}
            >
              {!repairAvailable
                ? t('studio.check.fixUnavailable')
                : repairIssues.length === 0
                  ? t('studio.check.noFixable')
                  : t('studio.check.fixHint')}
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon="wand"
              disabled={!canRepair}
              onClick={() => onRepair(repairIssues)}
            >
              {t('studio.check.fix')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CheckIssueItem({ issue }: { issue: CheckIssue }): ReactElement {
  return (
    <li className="rounded-control border border-line bg-surface p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-label font-medium text-ink">{messageOf(issue)}</p>
        <span className="text-caption tabular-nums text-ink-faint">
          {positionOf(issue)}
        </span>
        {issue.fixable ? (
          <Chip tone="accent">{t('studio.check.fixable')}</Chip>
        ) : null}
      </div>
      <p className="mt-1 text-caption text-ink-muted">
        {t(issue.reasonKey, issue.messageParams)}
      </p>
      {issue.suggestionKey ? (
        <p className="mt-1.5 rounded-chip bg-tint-gold px-2 py-1 text-caption text-warning">
          {t('studio.check.suggestionPrefix')}
          {t(issue.suggestionKey, issue.messageParams)}
        </p>
      ) : null}
    </li>
  )
}
