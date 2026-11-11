'use client'

import { useState } from 'react'
import { diffLines } from '@/components/studio/diff'
import { Select } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import type { PromptVersionDetail } from '@/lib/db/prompts'

/**
 * 任意两个版本的渲染文本行级对比（FR-7.5）。
 * 组件以 detail.id 为 key 挂载，切换提示词时选择自动回到 v0 与最新版本。
 */
export function VersionDiff({ versions }: { versions: PromptVersionDetail[] }) {
  const ordered = [...versions].sort(
    (left, right) => left.versionNo - right.versionNo,
  )
  const first = ordered[0]
  const latest = ordered[ordered.length - 1]
  const [baseId, setBaseId] = useState(first?.id ?? '')
  const [targetId, setTargetId] = useState(latest?.id ?? '')

  if (!first || !latest) {
    return null
  }

  const base = ordered.find((version) => version.id === baseId) ?? first
  const target = ordered.find((version) => version.id === targetId) ?? latest
  const lines = diffLines(base.renderedText, target.renderedText)
  const added = lines.filter((line) => line.kind === 'add').length
  const removed = lines.filter((line) => line.kind === 'remove').length
  const empty =
    base.renderedText.trim().length === 0 && target.renderedText.trim().length === 0

  return (
    <div className="border-b border-line-subtle px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-label font-medium text-ink">版本对比</p>
        <p className="text-caption text-ink-faint tnum">
          {empty
            ? '无可比较文本'
            : `新增 ${added} 行 · 删除 ${removed} 行`}
        </p>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="text-caption text-ink-faint">基准</span>
          <Select
            className="mt-1 h-8 text-caption"
            value={base.id}
            onChange={(event) => setBaseId(event.target.value)}
          >
            {ordered.map((version) => (
              <option key={version.id} value={version.id}>
                v{version.versionNo}
              </option>
            ))}
          </Select>
        </label>
        <label className="block min-w-0">
          <span className="text-caption text-ink-faint">目标</span>
          <Select
            className="mt-1 h-8 text-caption"
            value={target.id}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {ordered.map((version) => (
              <option key={version.id} value={version.id}>
                v{version.versionNo}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {empty ? (
        <p className="mt-2 text-caption text-ink-muted">
          这两个版本没有可比较的文本内容。
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-caption text-ink-faint">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full bg-danger" />
              删除
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              新增
            </span>
            <span>左列是基准，右列是目标</span>
          </div>
          <ol className="mt-2 max-h-72 overflow-auto rounded-control border border-line-subtle bg-surface py-1 font-mono text-caption">
            {lines.map((line, index) => (
              <li
                key={`${index}-${line.kind}`}
                className={cn(
                  'whitespace-pre-wrap break-words px-3 py-0.5',
                  line.kind === 'same' && 'text-ink-muted',
                  line.kind === 'add' && 'bg-diff-add text-ink',
                  line.kind === 'remove' && 'bg-diff-del text-ink',
                )}
              >
                <span
                  aria-hidden
                  className="mr-2 inline-block w-3 select-none text-ink-faint"
                >
                  {line.kind === 'add'
                    ? '+'
                    : line.kind === 'remove'
                      ? '-'
                      : ' '}
                </span>
                {line.kind === 'add' ? (
                  <span className="sr-only">新增：</span>
                ) : line.kind === 'remove' ? (
                  <span className="sr-only">删除：</span>
                ) : null}
                {line.text.length > 0 ? line.text : ' '}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}