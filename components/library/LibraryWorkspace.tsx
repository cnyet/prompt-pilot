'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button, IconButton, buttonStyles } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/Section'
import {
  FIELD_KEYS,
  FIELD_LABELS,
  type Assumption,
  type FieldKey,
  type PromptSchema,
} from '@/lib/engine/schema'
import { buildSchemaFromFields } from '@/lib/engine/paths'
import { renderFieldText } from '@/lib/engine/render'
import { cn } from '@/lib/utils'
import type {
  PromptDetail,
  PromptListItem,
  PromptVersionDetail,
  PromptVersionOrigin,
} from '@/lib/db/prompts'

const ORIGIN_LABELS: Record<PromptVersionOrigin, string> = {
  user_input: '用户首次输入',
  ai_generated: 'AI 生成',
  ai_refined: 'AI 优化',
  human_edited: '人工编辑',
  imported: '导入',
  rollback: '回滚',
}

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '未知时间' : dateTimeFormatter.format(date)
}

interface ListPayload {
  prompts: PromptListItem[]
  total: number
}

interface DetailPayload {
  prompt: PromptDetail
}

type LoadState = 'loading' | 'ready' | 'error'
type SaveState = 'idle' | 'saving' | 'error'

interface EditorState {
  baseVersionId: string
  baseVersionNo: number
  title: string
  fields: Record<FieldKey, string>
  changeSummary: string
  taskType: PromptSchema['meta']['taskType']
  templateId: string | undefined
  assumptions: Assumption[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload.message === 'string') {
    return payload.message
  }
  return fallback
}

function readListPayload(payload: unknown): ListPayload | null {
  if (!isRecord(payload) || !Array.isArray(payload.prompts)) {
    return null
  }
  return {
    prompts: payload.prompts as PromptListItem[],
    total:
      typeof payload.total === 'number' ? payload.total : payload.prompts.length,
  }
}

function readDetailPayload(payload: unknown): PromptDetail | null {
  if (!isRecord(payload) || !isRecord(payload.prompt)) {
    return null
  }
  const prompt = payload.prompt
  if (typeof prompt.id !== 'string' || !Array.isArray(prompt.versions)) {
    return null
  }
  return prompt as unknown as PromptDetail
}

async function requestJson(
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      readErrorMessage(payload, `请求失败，状态码 ${response.status}。`),
    )
  }
  return payload
}

function splitTags(tags: string): string[] {
  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}

export function LibraryWorkspace() {
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [prompts, setPrompts] = useState<PromptListItem[]>([])
  const [total, setTotal] = useState(0)
  const [listState, setListState] = useState<LoadState>('loading')
  const [listError, setListError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PromptDetail | null>(null)
  const [detailState, setDetailState] = useState<LoadState>('ready')
  const [detailError, setDetailError] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')

  const detailRequestRef = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveQuery(query.trim())
    }, 250)
    return () => {
      clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    const controller = new AbortController()
    setListState('loading')
    setListError('')
    void (async () => {
      try {
        const url =
          activeQuery.length > 0
            ? `/api/prompts?q=${encodeURIComponent(activeQuery)}`
            : '/api/prompts'
        const payload = await requestJson(url, { signal: controller.signal })
        const data = readListPayload(payload)
        if (!data) {
          throw new Error('提示词库返回的数据格式不正确。')
        }
        setPrompts(data.prompts)
        setTotal(data.total)
        setListState('ready')
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        setListState('error')
        setListError(
          error instanceof Error ? error.message : '读取提示词库失败。',
        )
      }
    })()
    return () => {
      controller.abort()
    }
  }, [activeQuery, reloadToken])

  const openPrompt = useCallback((id: string) => {
    detailRequestRef.current += 1
    const requestId = detailRequestRef.current
    setSelectedId(id)
    setDetail(null)
    setDetailState('loading')
    setDetailError('')
    setSelectedVersionId(null)
    setEditor(null)
    setSaveError('')
    setNotice('')
    void (async () => {
      try {
        const payload = await requestJson(
          `/api/prompts/${encodeURIComponent(id)}`,
        )
        if (detailRequestRef.current !== requestId) {
          return
        }
        const prompt = readDetailPayload(payload)
        if (!prompt) {
          throw new Error('这条提示词返回的数据格式不正确。')
        }
        setDetail(prompt)
        setSelectedVersionId(
          prompt.currentVersionId ??
            prompt.versions[prompt.versions.length - 1]?.id ??
            null,
        )
        setDetailState('ready')
      } catch (error) {
        if (detailRequestRef.current !== requestId) {
          return
        }
        setDetailState('error')
        setDetailError(
          error instanceof Error ? error.message : '读取提示词详情失败。',
        )
      }
    })()
  }, [])

  const closeDetail = useCallback(() => {
    detailRequestRef.current += 1
    setSelectedId(null)
    setDetail(null)
    setSelectedVersionId(null)
    setEditor(null)
    setSaveError('')
    setNotice('')
  }, [])

  const selectedVersion = useMemo<PromptVersionDetail | null>(() => {
    if (!detail) {
      return null
    }
    return (
      detail.versions.find((version) => version.id === selectedVersionId) ??
      detail.versions[detail.versions.length - 1] ??
      null
    )
  }, [detail, selectedVersionId])

  const startEditing = useCallback(
    (version: PromptVersionDetail | null, title: string) => {
      if (!version) {
        setNotice('先在版本时间线里选中一个版本。')
        return
      }
      const schema = version.schema
      if (!schema) {
        setNotice('这个版本没有可编辑的结构化内容。')
        return
      }
      const fields = {} as Record<FieldKey, string>
      for (const field of FIELD_KEYS) {
        fields[field] = renderFieldText(schema, field)
      }
      setEditor({
        baseVersionId: version.id,
        baseVersionNo: version.versionNo,
        title,
        fields,
        changeSummary:
          version.versionNo === 0
            ? '基于基线 v0 继续编辑'
            : `基于 v${version.versionNo} 继续编辑`,
        taskType: schema.meta.taskType,
        templateId: schema.meta.templateId,
        assumptions: schema.assumptions,
      })
      setSaveError('')
      setNotice('')
    },
    [],
  )

  const updateEditorField = useCallback((field: FieldKey, value: string) => {
    setEditor((previous) =>
      previous === null
        ? null
        : {
            ...previous,
            fields: { ...previous.fields, [field]: value },
          },
    )
  }, [])

  const handleSaveVersion = useCallback(async () => {
    if (!detail || !editor || saveState === 'saving') {
      return
    }
    setSaveState('saving')
    setSaveError('')
    const title = editor.title.trim().length > 0 ? editor.title.trim() : detail.title
    const schema = buildSchemaFromFields(editor.fields, {
      title,
      taskType: editor.taskType,
      ...(editor.templateId !== undefined
        ? { templateId: editor.templateId }
        : {}),
      assumptions: editor.assumptions,
    })
    try {
      const payload = await requestJson(
        `/api/prompts/${encodeURIComponent(detail.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            version: {
              schema,
              origin: 'human_edited',
              changeSummary: editor.changeSummary,
              parentVersionId: editor.baseVersionId,
            },
          }),
        },
      )
      const updated = readDetailPayload(payload)
      if (!updated) {
        throw new Error('保存后的返回数据格式不正确。')
      }
      setDetail(updated)
      const latest = updated.versions[updated.versions.length - 1]
      setSelectedVersionId(latest?.id ?? null)
      setEditor(null)
      setSaveState('idle')
      setNotice(
        latest
          ? `已保存为 v${latest.versionNo}，基线 v0 仍在`
          : '已保存新版本，基线 v0 仍在',
      )
      setReloadToken((token) => token + 1)
    } catch (error) {
      setSaveState('error')
      setSaveError(error instanceof Error ? error.message : '保存新版本失败。')
    }
  }, [detail, editor, saveState])

  const showEmptyLibrary =
    listState === 'ready' && prompts.length === 0 && activeQuery.length === 0
  const showEmptySearch =
    listState === 'ready' && prompts.length === 0 && activeQuery.length > 0

  const versionTotal = prompts.reduce(
    (sum, prompt) => sum + prompt.versionCount,
    0,
  )
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentCount = prompts.filter(
    (prompt) => new Date(prompt.updatedAt).getTime() >= sevenDaysAgo,
  ).length

  return (
    <div className="mx-auto w-full max-w-[1180px] px-6 py-8 lg:px-10">
      <PageHeader
        title="提示词库"
        description="首次生成会自动保存基线 v0。基线只读，后续编辑会另存为新版本。"
        actions={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint">
                <Icon name="search" size={14} />
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && query.length > 0) {
                    event.preventDefault()
                    setQuery('')
                  }
                }}
                aria-label="搜索提示词"
                placeholder="搜索标题、描述、标签、正文"
                className={cn(
                  'h-8 w-full rounded-control border border-line bg-surface pl-8 text-label text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:outline-none',
                  query.length > 0 ? 'pr-8' : 'pr-2',
                )}
              />
              {query.length > 0 ? (
                <IconButton
                  icon="close"
                  label="清空搜索"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-ink-faint"
                  onClick={() => setQuery('')}
                />
              ) : null}
            </div>
            <Link href="/studio" className={buttonStyles({ variant: 'primary', size: 'md' })}>
              <Icon name="plus" size={15} />
              新建
            </Link>
          </div>
        }
      />

      <div
        className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-caption text-ink-muted tnum"
        aria-live="polite"
      >
        {listState === 'ready' ? (
          activeQuery.length > 0 ? (
            <span>找到 {total} 条匹配「{activeQuery}」的提示词</span>
          ) : (
            <>
              <span>{total} 条提示词</span>
              <span>{versionTotal} 个版本</span>
              <span>{recentCount} 条在最近七天更新</span>
            </>
          )
        ) : listState === 'loading' ? (
          <span>正在读取提示词库</span>
        ) : null}
      </div>

      <div
        className={cn(
          'mt-5 grid items-start gap-6',
          selectedId !== null
            ? 'xl:grid-cols-[minmax(0,1fr)_440px]'
            : 'grid-cols-1',
        )}
      >
        <section aria-label="提示词列表" className="min-w-0">
          {listState === 'loading' ? (
            <div className="rounded-panel border border-line-subtle bg-surface p-6">
              <p className="text-body text-ink-muted">正在读取提示词库。</p>
            </div>
          ) : listState === 'error' ? (
            <div className="rounded-panel border border-line-subtle bg-surface p-6">
              <p className="text-h3 text-ink">暂时读不到提示词库</p>
              <p className="mt-2 text-body text-ink-muted">{listError}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                重新读取
              </Button>
            </div>
          ) : showEmptyLibrary ? (
            <div className="rounded-panel border border-line-subtle bg-surface">
              <EmptyState
                icon="library"
                title="还没有保存的提示词"
                hint="去工作台输入一句话并生成，首个版本会作为基线 v0 自动保存。之后可以在这里打开、继续编辑并另存为新版本。"
                action={
                  <Link href="/studio" className={buttonStyles({ variant: 'primary', size: 'md' })}>
                    去工作台生成第一份
                  </Link>
                }
              />
            </div>
          ) : showEmptySearch ? (
            <div className="rounded-panel border border-line-subtle bg-surface">
              <EmptyState
                icon="search"
                title="没有匹配的提示词"
                hint={`标题、描述、标签与正文里都没有「${activeQuery}」。换个关键词，或者清空搜索查看全部。`}
                action={
                  <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                    清空搜索
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {prompts.map((prompt) => {
                const active = prompt.id === selectedId
                const tags = splitTags(prompt.tags)
                return (
                  <li key={prompt.id}>
                    <button
                      type="button"
                      onClick={() => openPrompt(prompt.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'rise flex h-full w-full flex-col gap-2 rounded-panel border p-4 text-left transition-colors duration-150',
                        active
                          ? 'border-accent bg-surface'
                          : 'border-line-subtle bg-surface hover:border-line-strong',
                      )}
                    >
                      <span className="line-clamp-2 text-body-lg font-medium text-ink">
                        {prompt.title}
                      </span>
                      <span className="line-clamp-2 text-caption text-ink-muted">
                        {prompt.description?.trim() || '暂无描述'}
                      </span>
                      {tags.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-chip bg-bg-sunken px-1.5 py-0.5 text-caption text-ink-muted"
                            >
                              {tag}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-caption text-ink-faint tnum">
                        <span>
                          {prompt.versionCount} 个版本 · 最新 v
                          {prompt.latestVersionNo ?? 0}
                        </span>
                        <span className="ml-auto">
                          {formatDateTime(prompt.updatedAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {selectedId !== null ? (
          <aside
            aria-label="提示词详情"
            className="min-w-0 rounded-panel border border-line bg-surface xl:sticky xl:top-6 xl:max-h-[calc(100dvh-6rem)] xl:overflow-auto"
          >
            {detailState === 'loading' ? (
              <div className="p-5">
                <p className="text-body text-ink-muted">正在读取提示词详情。</p>
              </div>
            ) : detailState === 'error' ? (
              <div className="p-5">
                <p className="text-h3 text-ink">读不到这条提示词</p>
                <p className="mt-2 text-body text-ink-muted">{detailError}</p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openPrompt(selectedId)}
                    className="rounded-control border border-line px-2.5 py-1.5 text-label text-ink-muted hover:border-line-strong hover:text-ink"
                  >
                    重试
                  </button>
                  <button
                    type="button"
                    onClick={closeDetail}
                    className="rounded-control border border-line px-2.5 py-1.5 text-label text-ink-muted hover:border-line-strong hover:text-ink"
                  >
                    关闭
                  </button>
                </div>
              </div>
            ) : detail === null ? (
              <div className="p-5">
                <p className="text-body text-ink-muted">没有可展示的详情。</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-line-subtle px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-caption text-ink-faint">提示词详情</p>
                    <h2 className="mt-0.5 break-words text-h3 font-medium text-ink">
                      {detail.title}
                    </h2>
                  </div>
                  <IconButton
                    icon="close"
                    label="关闭详情"
                    size="sm"
                    className="shrink-0"
                    onClick={closeDetail}
                  />
                </div>

                <div className="border-b border-line-subtle px-4 py-3">
                  <p className="text-caption text-ink-faint tnum">
                    {detail.versionCount} 个版本 · 更新于{' '}
                    {formatDateTime(detail.updatedAt)}
                  </p>
                  {detail.description ? (
                    <p className="mt-2 whitespace-pre-wrap break-words text-body text-ink-muted">
                      {detail.description}
                    </p>
                  ) : null}
                  {splitTags(detail.tags).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {splitTags(detail.tags).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-chip border border-line bg-bg-sunken px-1.5 py-0.5 text-caption text-ink-muted"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      icon="studio"
                      onClick={() =>
                        startEditing(selectedVersion, detail.title)
                      }
                      disabled={
                        selectedVersion === null ||
                        selectedVersion.schema === null
                      }
                    >
                      {selectedVersion
                        ? `基于 v${selectedVersion.versionNo} 继续编辑`
                        : '继续编辑'}
                    </Button>
                    {notice.length > 0 ? (
                      <span className="text-caption text-success" aria-live="polite">
                        {notice}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="border-b border-line-subtle px-4 py-3">
                  <p className="text-label font-medium text-ink">版本时间线</p>
                  <ol className="mt-2 space-y-1">
                    {[...detail.versions].reverse().map((version) => {
                      const active = version.id === selectedVersion?.id
                      return (
                        <li key={version.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVersionId(version.id)
                              setEditor(null)
                              setNotice('')
                              setSaveError('')
                              setSaveState('idle')
                            }}
                            aria-current={active ? 'true' : undefined}
                            className={cn(
                              'flex w-full flex-wrap items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors',
                              active
                                ? 'bg-accent-subtle'
                                : 'hover:bg-bg-sunken',
                            )}
                          >
                            <span className="text-label font-medium text-ink tnum">
                              v{version.versionNo}
                            </span>
                            {version.isBaseline ? (
                              <span className="rounded-chip bg-bg px-1.5 py-0.5 text-caption text-accent">
                                基线
                              </span>
                            ) : null}
                            <span className="text-caption text-ink-muted">
                              {ORIGIN_LABELS[version.origin]}
                            </span>
                            <time
                              dateTime={version.createdAt}
                              className="ml-auto text-caption text-ink-faint tnum"
                            >
                              {formatDateTime(version.createdAt)}
                            </time>
                            {version.changeSummary ? (
                              <span className="w-full truncate text-caption text-ink-faint">
                                {version.changeSummary}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                </div>

                {selectedVersion ? (
                  <div className="border-b border-line-subtle px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-label font-medium text-ink">
                        v{selectedVersion.versionNo} 内容
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          startEditing(selectedVersion, detail.title)
                        }
                        className="rounded-control border border-line px-2 py-0.5 text-caption text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                      >
                        基于此版本编辑
                      </button>
                    </div>
                    {selectedVersion.isBaseline ? (
                      <p className="mt-2 rounded-panel border border-line bg-bg-sunken px-3 py-2 text-caption text-ink-muted">
                        基线 v0 保存的是首次输入的原文，服务端锁定为只读。继续编辑会生成新版本，v0 不会被覆盖。
                      </p>
                    ) : null}
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-panel border border-line bg-bg-sunken px-3 py-2 font-mono text-caption text-ink">
                      {selectedVersion.renderedText}
                    </pre>
                    {detail.variables.length > 0 ? (
                      <div className="mt-3">
                        <p className="text-caption text-ink-faint">变量</p>
                        <ul className="mt-1 flex flex-wrap gap-1">
                          {detail.variables.map((variable) => (
                            <li
                              key={variable.name}
                              className="rounded-chip border border-line bg-bg-sunken px-1.5 py-0.5 text-caption text-ink-muted"
                              title={
                                variable.description ??
                                (variable.required ? '必填' : '可选')
                              }
                            >
                              {variable.label}
                              <span className="ml-1 text-ink-faint">
                                {variable.name}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {editor ? (
                  <div className="px-4 py-3">
                    <p className="text-label font-medium text-ink">
                      基于 v{editor.baseVersionNo} 另存为新版本
                    </p>
                    <p className="mt-1 text-caption text-ink-faint">
                      修改下方字段后保存，服务端会把版本号加一，基线 v0 保持不变。
                    </p>
                    <label className="mt-3 block">
                      <span className="text-caption text-ink-muted">标题</span>
                      <input
                        type="text"
                        value={editor.title}
                        onChange={(event) =>
                          setEditor((previous) =>
                            previous === null
                              ? null
                              : { ...previous, title: event.target.value },
                          )
                        }
                        className="mt-1 h-8 w-full rounded-control border border-line bg-bg px-2 text-label text-ink"
                      />
                    </label>
                    <div className="mt-3 flex flex-col gap-3">
                      {FIELD_KEYS.map((field) => (
                        <label key={field} className="block">
                          <span className="text-caption text-ink-muted">
                            {FIELD_LABELS[field]}
                          </span>
                          <textarea
                            value={editor.fields[field]}
                            onChange={(event) =>
                              updateEditorField(field, event.target.value)
                            }
                            rows={3}
                            className="mt-1 w-full resize-y rounded-control border border-line bg-bg px-2 py-1.5 font-mono text-caption text-ink"
                          />
                        </label>
                      ))}
                    </div>
                    <label className="mt-3 block">
                      <span className="text-caption text-ink-muted">
                        变更摘要
                      </span>
                      <input
                        type="text"
                        value={editor.changeSummary}
                        onChange={(event) =>
                          setEditor((previous) =>
                            previous === null
                              ? null
                              : {
                                  ...previous,
                                  changeSummary: event.target.value,
                                },
                          )
                        }
                        className="mt-1 h-8 w-full rounded-control border border-line bg-bg px-2 text-label text-ink"
                      />
                    </label>
                    {saveError.length > 0 ? (
                      <p role="alert" className="mt-2 text-caption text-danger">
                        {saveError}
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveVersion()}
                        disabled={saveState === 'saving'}
                        className="rounded-control bg-accent px-3 py-1.5 text-label text-bg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
                      >
                        {saveState === 'saving' ? '正在保存' : '保存为新版本'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditor(null)
                          setSaveError('')
                          setSaveState('idle')
                        }}
                        disabled={saveState === 'saving'}
                        className="rounded-control border border-line px-3 py-1.5 text-label text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="px-4 py-3">
                  <p className="text-caption text-ink-faint">
                    基线 v0 由服务端保护，删除与覆盖请求都会返回 409。首版不提供标签编辑与批量操作。
                  </p>
                </div>
              </>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
