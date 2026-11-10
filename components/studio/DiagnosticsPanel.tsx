'use client'

import { useState } from 'react'
import type { FieldKey } from '@/lib/engine/schema'
import type { LintIssue, LintLevel } from '@/lib/engine/lint/engine'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'
import {
  LINT_LEVEL_TEXT_CLASS,
  buildIssueExcerpt,
  formatIssueLocation,
  issueField,
  issueIgnoreKey,
  type DiagnosticsGroups,
  type DiagnosticsSummary,
} from './useDiagnostics'

const LEVEL_ORDER = ['error', 'warn', 'info'] as const

const LEVEL_META: Readonly<
  Record<LintLevel, { label: string; countClass: string; headerClass: string }>
> = {
  error: {
    label: '错误',
    countClass: 'border-danger text-danger',
    headerClass: 'bg-tint-coral',
  },
  warn: {
    label: '警告',
    countClass: 'border-warning text-warning',
    headerClass: 'bg-tint-butter',
  },
  info: {
    label: '提示',
    countClass: 'border-line text-ink-muted',
    headerClass: 'bg-tint-lavender',
  },
}

export interface DiagnosticsPanelProps {
  groups: DiagnosticsGroups
  summary: DiagnosticsSummary
  fieldTexts: Partial<Record<FieldKey, string>>
  dirtyFields: ReadonlySet<FieldKey>
  ignoredCount: number
  fixableCount: number
  skippedIssueCount: number
  activeIssueKey: string | null
  busy: boolean
  notice: string | null
  onSelect: (issue: LintIssue) => void
  onFix: (issue: LintIssue, options?: { confirmed?: boolean }) => void
  onFixAll: () => void
  onIgnore: (issue: LintIssue) => void
  onRestoreIgnored: () => void
  onCollapse: () => void
}

/**
 * 右栏诊断面板。
 *
 * 分组顺序固定为 error、warn、info，计数徽标在存在 error 时切到 danger 色。
 * 每条问题展示级别、规则编号、位置、原因与建议，点击正文跳到字段并选中命中词。
 * 修复分单项与全部两种；目标字段被手改过时，单项修复先展开二次确认。
 */
export function DiagnosticsPanel({
  groups,
  summary,
  fieldTexts,
  dirtyFields,
  ignoredCount,
  fixableCount,
  skippedIssueCount,
  activeIssueKey,
  busy,
  notice,
  onSelect,
  onFix,
  onFixAll,
  onIgnore,
  onRestoreIgnored,
  onCollapse,
}: DiagnosticsPanelProps) {
  const [confirmKey, setConfirmKey] = useState<string | null>(null)

  const handleFixClick = (issue: LintIssue) => {
    const field = issueField(issue)
    if (field !== null && dirtyFields.has(field)) {
      setConfirmKey(issueIgnoreKey(issue))
      return
    }
    onFix(issue)
  }

  return (
    <section
      aria-label="诊断面板"
      className="flex min-w-0 flex-col overflow-hidden rounded-panel border border-line bg-surface"
      aria-busy={busy}
    >
      <header className="border-b border-line-subtle px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="text-label font-medium text-ink">诊断</h2>
              <span
                className={cn(
                  'rounded-chip px-1.5 py-0.5 text-caption tnum',
                  summary.hasError
                    ? 'bg-diff-del text-danger'
                    : 'bg-bg-sunken text-ink-muted',
                )}
                title={
                  summary.hasError ? '存在必须处理的问题' : '当前没有错误级问题'
                }
              >
                {summary.total} 条
              </span>
            </div>
            <p className="mt-0.5 text-caption text-ink-faint">
              本地规则检查，输入停顿后刷新 · ⌘J 开关
            </p>
          </div>
          <IconButton
            icon="panel"
            label="收起诊断面板"
            onClick={onCollapse}
            size="sm"
            className="-mr-1 -mt-1"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {LEVEL_ORDER.map((level) => (
            <span
              key={level}
              className={cn(
                'text-caption tnum',
                summary[level] > 0
                  ? LINT_LEVEL_TEXT_CLASS[level]
                  : 'text-ink-faint',
              )}
            >
              {LEVEL_META[level].label} {summary[level]}
            </span>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          icon="wand"
          onClick={onFixAll}
          disabled={busy || fixableCount === 0}
          title={
            fixableCount === 0
              ? '没有可自动修复的问题'
              : '批量修复所有未手改字段里的可修复问题'
          }
        >
          全部修复
          {fixableCount > 0 ? `（${fixableCount}）` : ''}
        </Button>
        {skippedIssueCount > 0 ? (
          <span className="text-caption text-warning tnum">
            {skippedIssueCount} 条在手改字段里，需单条确认
          </span>
        ) : null}
      </div>

      {notice ? (
        <p
          role="status"
          className="border-b border-line-subtle bg-surface-inset px-3 py-1.5 text-caption text-ink-muted"
        >
          {notice}
        </p>
      ) : null}

      <div className="max-h-[min(40vh,480px)] min-h-0 flex-1 overflow-auto">
        {summary.total === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-tint-sage text-ink-muted">
              <Icon name="alert" size={18} />
            </span>
            <p className="text-body text-ink">没有发现问题</p>
            <p className="text-caption text-ink-faint">
              继续编辑字段，诊断会自动刷新
            </p>
          </div>
        ) : (
          LEVEL_ORDER.map((level) => {
            const list = groups[level]
            if (list.length === 0) {
              return null
            }
            const meta = LEVEL_META[level]
            return (
              <section key={level} aria-label={`${meta.label}问题`}>
                <h3
                  className={cn(
                    'flex items-center justify-between border-b border-line-subtle px-3 py-2',
                    meta.headerClass,
                  )}
                >
                  <span
                    className={cn(
                      'text-caption font-medium',
                      LINT_LEVEL_TEXT_CLASS[level],
                    )}
                  >
                    {meta.label}
                  </span>
                  <span className="text-caption text-ink-faint tnum">
                    {list.length}
                  </span>
                </h3>
                <ul>
                  {list.map((issue, issueIndex) => {
                    const key = issueIgnoreKey(issue)
                    const field = issueField(issue)
                    const canFix = issue.fixable && field !== null
                    const dirty = field !== null && dirtyFields.has(field)
                    const location = formatIssueLocation(
                      issue,
                      field === null ? undefined : fieldTexts[field],
                    )
                    const excerpt =
                      field === null
                        ? null
                        : buildIssueExcerpt(issue, fieldTexts[field] ?? '')
                    const confirming = confirmKey === key
                    return (
                      <li
                        key={`${key}-${issueIndex}`}
                        className={cn(
                          'group border-b border-line-subtle last:border-b-0',
                          activeIssueKey === key ? 'bg-bg-sunken' : '',
                        )}
                      >
                        <div className="flex items-start gap-1">
                          <button
                            type="button"
                            onClick={() => onSelect(issue)}
                            aria-label={`定位到${location}，${issue.ruleId}，${issue.message}`}
                            className="min-w-0 flex-1 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-bg-sunken"
                          >
                            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption">
                              <span
                                className={cn(
                                  'font-medium',
                                  LINT_LEVEL_TEXT_CLASS[issue.level],
                                )}
                              >
                                {LEVEL_META[issue.level].label}
                              </span>
                              <span className="font-mono text-ink-faint">
                                {issue.ruleId}
                              </span>
                              <span className="text-ink-muted">
                                {location}
                              </span>
                              {dirty ? (
                                <span className="text-warning">手改字段</span>
                              ) : null}
                            </span>
                            <span className="mt-1 block text-body text-ink">
                              {issue.message}
                            </span>
                            {excerpt ? (
                              <span className="mt-1 block truncate text-caption text-ink-faint">
                                「{excerpt.match}」
                              </span>
                            ) : null}
                            <span className="mt-1.5 block text-caption text-ink-muted">
                              为什么：{issue.why}
                            </span>
                            <span className="mt-0.5 block text-caption text-ink-muted">
                              建议：{issue.suggestion}
                            </span>
                          </button>

                          <div className="flex shrink-0 flex-col items-end gap-1 py-2 pr-2 opacity-0 transition-opacity duration-150 pointer-events-none focus-within:pointer-events-auto focus-within:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
                            {canFix ? (
                              <IconButton
                                icon="wand"
                                label={`修复 ${issue.ruleId}`}
                                onClick={() => handleFixClick(issue)}
                                disabled={busy}
                                size="sm"
                              />
                            ) : (
                              <span className="px-1 text-caption text-ink-faint">
                                手动
                              </span>
                            )}
                            <IconButton
                              icon="eye-off"
                              label={`忽略 ${issue.ruleId}`}
                              onClick={() => onIgnore(issue)}
                              size="sm"
                            />
                          </div>
                        </div>

                        {confirming ? (
                          <div className="border-t border-line-subtle bg-surface-inset px-3 py-2">
                            <p className="text-caption text-warning">
                              该字段你手改过。修复会按诊断结果重写这一字段，可能覆盖你的改动。
                            </p>
                            <div className="mt-1.5 flex items-center gap-1">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  onFix(issue, { confirmed: true })
                                  setConfirmKey(null)
                                }}
                                disabled={busy}
                                className="text-warning"
                              >
                                确认修复
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmKey(null)}
                              >
                                取消
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })
        )}
      </div>

      {ignoredCount > 0 ? (
        <footer className="flex items-center justify-between gap-2 border-t border-line-subtle px-3 py-2">
          <span className="text-caption text-ink-faint tnum">
            已忽略 {ignoredCount} 条
          </span>
          <Button variant="ghost" size="sm" onClick={onRestoreIgnored}>
            恢复
          </Button>
        </footer>
      ) : null}
    </section>
  )
}
