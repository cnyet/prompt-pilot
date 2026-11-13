import type { ReactElement } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

export interface MarkdownViewProps {
  source: string
  className?: string
}

const COMPONENTS: Components = {
  a: ({ node: _node, className, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        'text-accent underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent-hover',
        className,
      )}
    />
  ),
  pre: ({ node: _node, className, ...props }) => (
    <pre
      {...props}
      className={cn(
        'my-4 overflow-x-auto rounded-control border border-line bg-bg-sunken p-4 font-mono text-[0.875rem] leading-6 text-ink',
        className,
      )}
    />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="my-4 w-full overflow-x-auto">
      <table {...props} />
    </div>
  ),
  img: ({ node: _node, className, ...props }) => (
    <img
      {...props}
      className={cn('my-3 h-auto max-w-full rounded-control', className)}
    />
  ),
}

/**
 * 提示词 Markdown 渲染（ARCHITECTURE §6）。
 *
 * 只渲染 Markdown，不执行原始 HTML（`skipHtml`）；链接新窗口打开并带
 * `noreferrer noopener`；代码块与表格横向滚动；正文 16px / 1.75、68ch 上限。
 * 不声明 `'use client'`，服务端与客户端均可渲染。
 */
export function MarkdownView({
  source,
  className,
}: MarkdownViewProps): ReactElement {
  return (
    <div
      className={cn(
        'max-w-[68ch] text-body-lg leading-[1.75] text-ink',
        // 排版细节放在容器上，保持语义标签干净
        '[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-h2 [&_h1]:leading-tight [&_h1]:font-semibold [&_h1:first-child]:mt-0',
        '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-h3 [&_h2]:font-semibold [&_h2:first-child]:mt-0',
        '[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-body-lg [&_h3]:font-semibold [&_h3:first-child]:mt-0',
        '[&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:font-semibold',
        '[&_p]:my-3',
        '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6',
        '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6',
        '[&_li]:my-1',
        '[&_blockquote]:my-3 [&_blockquote]:border-l [&_blockquote]:border-line-strong [&_blockquote]:pl-4 [&_blockquote]:text-ink-muted',
        '[&_strong]:font-semibold',
        '[&_hr]:my-6 [&_hr]:border-line',
        '[&_table]:w-full [&_table]:border-collapse [&_table]:text-body',
        '[&_th]:border [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium',
        '[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top',
        '[&_code]:rounded-chip [&_code]:bg-bg-sunken [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
        '[&_input]:mr-1 [&_input]:align-middle',
        className,
      )}
    >
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={COMPONENTS}>
        {source}
      </Markdown>
    </div>
  )
}
