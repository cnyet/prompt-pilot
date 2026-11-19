'use client'

import type { ReactElement } from 'react'
import { Button } from '@/components/ui/Button'
import { t } from '@/lib/i18n/zh'
import type { StreamPhase } from './stream-reducer'
import { isRequestActive } from './stream-reducer'

export interface ResultActionsProps {
  phase: StreamPhase
  hasOutput: boolean
  canRegenerate: boolean
  /** 重新生成被禁用时的说明（例如优化记录），悬停可见。 */
  regenerateHint?: string
  onCopy: () => void
  onCopyPlain: () => void
  onDownload: () => void
  onRegenerate: () => void
  onStop: () => void
}

/**
 * 结果工具栏（DESIGN.md Workspace Result Surface）。
 * 复制 / 复制纯文本 / 下载 / 重新生成是次要动作；流式进行中把重新生成换成停止。
 * 收藏与评分是记录级动作，由 ResultPanel 底部渲染。
 */
export function ResultActions({
  phase,
  hasOutput,
  canRegenerate,
  regenerateHint,
  onCopy,
  onCopyPlain,
  onDownload,
  onRegenerate,
  onStop,
}: ResultActionsProps): ReactElement {
  const active = isRequestActive(phase)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="secondary"
        size="sm"
        icon="copy"
        onClick={onCopy}
        disabled={!hasOutput}
      >
        {t('studio.actions.copy')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onCopyPlain}
        disabled={!hasOutput}
      >
        {t('studio.actions.copyPlain')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon="download"
        onClick={onDownload}
        disabled={!hasOutput}
      >
        {t('studio.actions.download')}
      </Button>
      {active ? (
        <Button variant="destructive" size="sm" icon="stop" onClick={onStop}>
          {t('studio.stop')}
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          icon="refresh"
          onClick={onRegenerate}
          disabled={!canRegenerate}
          title={canRegenerate ? undefined : regenerateHint}
        >
          {t('studio.actions.regenerate')}
        </Button>
      )}
    </div>
  )
}
