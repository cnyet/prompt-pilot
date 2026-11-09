'use client'

/**
 * 可折叠的「思考」区。
 *
 * 只展示 provider 通过 reasoning 事件送来的思维链增量，正文永远不读这里，
 * 所以折叠与否都不影响提示词内容。默认收起，避免生成时抢走注意力。
 */

export interface ThinkingPanelProps {
  text: string
  streaming: boolean
}

export function ThinkingPanel({ text, streaming }: ThinkingPanelProps) {
  if (text.trim().length === 0) {
    return null
  }

  const chars = Array.from(text).length

  return (
    <details className="mb-4 rounded-panel border border-line bg-bg-sunken">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-label text-ink-muted">
        <span>思考</span>
        <span className="text-caption text-ink-faint tnum">
          {streaming ? '生成中' : '已结束'} · {chars} 字
        </span>
      </summary>
      <div className="border-t border-line px-4 py-3">
        <p className="mb-2 text-caption text-ink-faint">
          仅用于查看模型的推理过程，不会写入提示词正文。
        </p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-caption text-ink-muted">
          {text}
        </pre>
      </div>
    </details>
  )
}
