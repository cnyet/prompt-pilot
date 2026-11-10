'use client'

import { FIELD_LABELS, type FieldKey } from '@/lib/engine/schema'
import {
  parseField,
  type FieldLeaf,
  type ParsedField,
} from '@/lib/engine/paths'
import { cn } from '@/lib/utils'

/**
 * 字段的异构预览形态（编辑部 bento，ADR 0004）。
 *
 * 八个字段不再共用同一种「编号 + 标题 + textarea」文档节。
 * 预览态按数据形态各选 UI：objective 巨型衬线陈述、role 头像行、
 * constraints 做/不做双栏、input 等宽表格、examples 编号列表。
 * 编辑态仍由调用方统一回退到 FieldBlock 的 textarea。
 *
 * 各预览函数是纯函数（无 hook），返回 null 表示无法结构化；
 * FieldPreview 据此整体返回 null，调用方回退到原 FieldBlock。
 * 以普通函数形式在父组件里调用是安全的，因为整条路径没有 hook。
 */

interface PreviewProps {
  field: FieldKey
  index: number
  /** 预览用的字段文本（流式 pending 优先，同三视图口径） */
  text: string
}

function leafFirstValue(
  leaves: readonly FieldLeaf[],
  path: string,
): string | null {
  const leaf = leaves.find((item) => item.path === path)
  return leaf ? leaf.value : null
}

function leafListValues(
  leaves: readonly FieldLeaf[],
  basePath: string,
): string[] {
  const values: string[] = []
  for (const leaf of leaves) {
    if (
      leaf.path.startsWith(`${basePath}[`) &&
      leaf.path.endsWith(']')
    ) {
      values.push(leaf.value)
    }
  }
  return values
}

/** objective：目标陈述 + 成功标准计数。巨型衬线一句话是页面第二主角。 */
function ObjectivePreview({ text }: { text: string }) {
  const parsed = parseField('objective', text)
  const goal =
    leafFirstValue(parsed.leaves, 'objective.goal')?.trim() ?? ''
  const criteria = leafListValues(parsed.leaves, 'objective.successCriteria')
  const nonGoals = leafListValues(parsed.leaves, 'objective.nonGoals')
  if (goal.length === 0) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="numeral text-balance text-h2 font-semibold leading-[1.28] text-ink">
        {goal}
      </p>
      {(criteria.length > 0 || nonGoals.length > 0) && (
        <p className="text-caption text-ink-faint tnum">
          {criteria.length > 0 ? `${criteria.length} 条成功标准` : null}
          {criteria.length > 0 && nonGoals.length > 0 ? ' · ' : null}
          {nonGoals.length > 0 ? `${nonGoals.length} 条不做` : null}
        </p>
      )}
    </div>
  )
}

/** role：人物行。头像 + persona 一句话 + 专长/视角元信息。 */
function RolePreview({ text }: { text: string }) {
  const parsed = parseField('role', text)
  const persona = leafFirstValue(parsed.leaves, 'role.persona')?.trim() ?? ''
  const expertise =
    leafFirstValue(parsed.leaves, 'role.expertise')?.trim() ?? ''
  const stance = leafFirstValue(parsed.leaves, 'role.stance')?.trim() ?? ''
  if (persona.length === 0) {
    return null
  }
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-subtle numeral text-h3 font-semibold text-accent"
      >
        {persona.slice(0, 1)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-body font-medium text-ink">{persona}</p>
        {(expertise.length > 0 || stance.length > 0) && (
          <p className="truncate text-caption text-ink-muted">
            {[expertise, stance].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}

/** context：摘录块。inset 底色 + 两行摘要，结构化叶子数做注脚。 */
function ContextPreview({ text }: { text: string }) {
  const parsed = parseField('context', text)
  const background =
    leafFirstValue(parsed.leaves, 'context.background')?.trim() ?? ''
  const audience =
    leafFirstValue(parsed.leaves, 'context.audience')?.trim() ?? ''
  const facts = leafListValues(parsed.leaves, 'context.knownFacts')
  if (background.length === 0 && facts.length === 0) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-control bg-surface-inset px-3 py-2.5">
      {background.length > 0 && (
        <p className="text-body-sm line-clamp-2 text-ink-muted">{background}</p>
      )}
      {audience.length > 0 && (
        <p className="truncate text-caption text-ink-faint">受众：{audience}</p>
      )}
      {facts.length > 0 && (
        <p className="text-caption text-ink-faint tnum">
          {facts.length} 条已知事实
        </p>
      )}
    </div>
  )
}

/** input：等宽表格。变量名/类型/默认值三列，{{}} 高亮。 */
function InputPreview({ text }: { text: string }) {
  const parsed = parseField('input', text) as ParsedField<'input'>
  const variables = parsed.value.variables ?? []
  if (variables.length === 0) {
    // 空数组或序列化端的「变量：无」固定文案都算「确实无变量」；
    // 只有连 input 节都识别不出来才回退 FieldBlock。
    const noVar = leafFirstValue(parsed.leaves, 'input.variables')
    if (
      noVar !== null ||
      Array.isArray(parsed.value.variables) ||
      text.trimStart().startsWith('变量：无')
    ) {
      return (
        <p className="text-body-sm text-ink-faint">
          无外部变量，可直接使用。
        </p>
      )
    }
    return null
  }
  return (
    <table className="w-full border-collapse text-caption">
      <thead>
        <tr className="border-b border-line-subtle text-left text-ink-faint">
          <th scope="col" className="py-1.5 pr-3 font-normal">变量名</th>
          <th scope="col" className="py-1.5 pr-3 font-normal">类型</th>
          <th scope="col" className="py-1.5 font-normal">默认值</th>
        </tr>
      </thead>
      <tbody>
        {variables.map((variable) => (
          <tr key={variable.name} className="border-b border-line-subtle last:border-b-0">
            <td className="py-1.5 pr-3 font-mono text-ink">
              <span className="text-ink-faint">{'{{'}</span>
              {variable.name}
              <span className="text-ink-faint">{'}}'}</span>
            </td>
            <td className="py-1.5 pr-3 text-ink-muted">{variable.type}</td>
            <td className="max-w-[24ch] truncate py-1.5 text-ink-muted">
              {variable.defaultValue ?? (variable.required ? '必填' : '可选')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** constraints：做/不做双栏。tint-do / tint-dont 浅底对照。 */
function ConstraintsPreview({ text }: { text: string }) {
  const parsed = parseField('constraints', text)
  const must = leafListValues(parsed.leaves, 'constraints.must')
  const mustNot = leafListValues(parsed.leaves, 'constraints.mustNot')
  const scopeIn = leafListValues(parsed.leaves, 'constraints.boundaries.scopeIn')
  const scopeOut = leafListValues(
    parsed.leaves,
    'constraints.boundaries.scopeOut',
  )
  const doItems = [...must, ...scopeIn]
  const dontItems = [...mustNot, ...scopeOut]
  if (doItems.length === 0 && dontItems.length === 0) {
    return null
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <TintList label="做" items={doItems} tone="do" />
      <TintList label="不做" items={dontItems} tone="dont" />
    </div>
  )
}

/** 做/不做单栏列表：预览只展示前 4 条全文，余量收进计数行。 */
function TintList({
  label,
  items,
  tone,
}: {
  label: string
  items: readonly string[]
  tone: 'do' | 'dont'
}) {
  const shown = items.slice(0, 4)
  const rest = items.length - shown.length
  return (
    <ul
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-control px-3 py-2.5',
        tone === 'do' ? 'bg-tint-do' : 'bg-tint-dont',
      )}
    >
      <li className="mb-0.5 text-caption font-medium text-ink">{label}</li>
      {items.length === 0 ? (
        <li className="text-body-sm text-ink-faint">未声明</li>
      ) : (
        <>
          {shown.map((item, i) => (
            <li key={i} className="text-body-sm text-ink-muted">
              {item}
            </li>
          ))}
          {rest > 0 ? (
            <li className="text-caption text-ink-faint tnum">
              还有 {rest} 条
            </li>
          ) : null}
        </>
      )}
    </ul>
  )
}

/** output：格式骨架。目标格式 + 章节灰字骨架示意。 */
function OutputPreview({ text }: { text: string }) {
  const parsed = parseField('output', text)
  const leaves = parsed.leaves
  const format = leafFirstValue(leaves, 'output.format')
  const length = leafFirstValue(leaves, 'output.length')
  const language = leafFirstValue(leaves, 'output.language')
  const tone = leafFirstValue(leaves, 'output.tone')
  const sections = leafListValues(leaves, 'output.sections')
  if (format === null && sections.length === 0) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-caption text-ink-muted">
        {[format, length, language, tone].filter(Boolean).join(' · ')}
      </p>
      {sections.length > 0 && (
        <ol className="flex flex-col gap-1">
          {sections.map((section, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span aria-hidden className="numeral text-caption text-ink-faint">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-body-sm text-ink-muted">{section}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** examples：编号样本。正例/反例衬线序号分组。 */
function ExamplesPreview({ text }: { text: string }) {
  const parsed = parseField('examples', text) as ParsedField<'examples'>
  const items = parsed.value.items ?? []
  const negative = parsed.value.negative ?? []
  if (items.length === 0 && negative.length === 0) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {items.length > 0 && (
        <ol className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-baseline gap-3">
              <span
                aria-hidden
                className="numeral shrink-0 text-h3 font-semibold text-ink"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <p className="truncate text-body-sm text-ink">
                  {item.input || '（无输入）'}
                </p>
                <p className="truncate text-caption text-ink-faint">
                  → {item.output || '（无输出）'}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {negative.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-caption font-medium text-ink">反例</p>
          {negative.slice(0, 2).map((item, i) => (
            <div key={i} className="min-w-0">
              <p className="truncate text-body-sm text-ink-muted">
                {item.input || '（无输入）'}
              </p>
              <p className="truncate text-caption text-ink-faint">
                ✕ {item.badOutput || '（无输出）'}
              </p>
            </div>
          ))}
          {negative.length > 2 ? (
            <p className="text-caption text-ink-faint tnum">
              还有 {negative.length - 2} 条反例
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** selfCheck：可勾选判定列表。评估时直接变成 verdict 行。 */
function SelfCheckPreview({ text }: { text: string }) {
  const parsed = parseField('selfCheck', text)
  const checklist = leafListValues(parsed.leaves, 'selfCheck.checklist')
  const onFail = leafFirstValue(parsed.leaves, 'selfCheck.onFail')
  if (checklist.length === 0 && onFail === null) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {checklist.map((item, i) => (
        <p key={i} className="flex items-baseline gap-2 text-body-sm text-ink-muted">
          <span
            aria-hidden
            className="mt-1 size-2.5 shrink-0 rounded-[3px] border border-line-strong"
          />
          <span className="line-clamp-2">{item}</span>
        </p>
      ))}
      {onFail !== null && onFail.trim().length > 0 && (
        <p className="text-caption text-ink-faint">
          不通过时：{onFail.trim()}
        </p>
      )}
    </div>
  )
}

const PREVIEW_COMPONENTS: Partial<
  Record<FieldKey, (props: { text: string }) => React.ReactNode | null>
> = {
  role: RolePreview,
  objective: ObjectivePreview,
  context: ContextPreview,
  input: InputPreview,
  constraints: ConstraintsPreview,
  output: OutputPreview,
  examples: ExamplesPreview,
  selfCheck: SelfCheckPreview,
}

/** 渲染一个字段的预览；解析不出内容时返回 null，调用方回退 FieldBlock。 */
export function FieldPreview({ field, index, text }: PreviewProps) {
  const Preview = PREVIEW_COMPONENTS[field]
  if (!Preview || text.trim().length === 0) {
    return null
  }
  const node = Preview({ text })
  if (node === null) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-caption tracking-[0.08em] text-ink-faint">
        <span className="numeral">{String(index).padStart(2, '0')}</span>
        <span className="mx-1.5">·</span>
        {FIELD_LABELS[field]}
      </p>
      {node}
    </div>
  )
}
