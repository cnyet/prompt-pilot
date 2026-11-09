import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { POST } from '@/app/api/engine/field/route'
import {
  applyFieldOp,
  applyFieldOpSafely,
} from '@/components/studio/fieldOps'
import { FIELD_OPS, FIELD_OP_LABELS } from '@/components/studio/types'
import { composePrompt } from '@/lib/engine/compose'
import { auditFieldContent, matchFieldLinePrefix } from '@/lib/engine/paths'
import { renderFieldText } from '@/lib/engine/render'
import type { FieldKey } from '@/lib/engine/schema'
import { apiErrorSchema, parseSseStream } from '@/lib/engine/sse'

const requirement =
  '帮我写一份产品需求评审周报，给业务负责人看，输出 Markdown，800 字左右'
const schema = composePrompt(requirement)
const context = { requirement, title: schema.meta.title }

/** 工单 16 的原始复现输入。 */
const NON_CANONICAL = [
  '格式：Markdown',
  '章节：标题、正文、要点摘要',
  '长度：400 到 800 字',
  '语言：中文',
  '语气：专业、克制、直接',
].join('\n')

/** 在正常标签之间夹一行完全没有标签的手写内容。 */
const WITH_FREE_LINE = [
  '格式：Markdown',
  '这一行没有标签，是我手写的约束。',
  '章节：标题、正文、要点摘要',
  '语言：中文',
].join('\n')

/** 游离行是多行叶子值的续行，缩短只应改第一行。 */
const MULTILINE_LEAF = [
  '格式：Markdown',
  '结构：保留第一句的判断依据。第二句是可以删掉的展开说明。',
  '手写续行，没有标签。',
  '语言：中文',
].join('\n')

const FREE_LINE = '这一行没有标签，是我手写的约束。'

function nonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * 内容行集合的包含关系：带标签的行只要对应的标签行还在就算保留，
 * 没有标签的游离行必须逐字出现在结果里。
 */
function lineAnchorsSurvive(
  field: FieldKey,
  originalLines: readonly string[],
  resultText: string,
): boolean {
  const resultLines = nonEmptyLines(resultText)
  return originalLines.every((line) => {
    const prefix = matchFieldLinePrefix(field, line)
    if (prefix === null) {
      return resultLines.includes(line)
    }
    return resultLines.some((candidate) => candidate.startsWith(prefix))
  })
}

describe('工单 16 复现：非规范格式的缩短不得静默丢行', () => {
  it('五行输入执行缩短时拒绝执行，并列出全部无法处理的行', () => {
    const outcome = applyFieldOpSafely(
      'output',
      NON_CANONICAL,
      'shorten',
      context,
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) {
      throw new Error('缩短不应成功')
    }
    expect(outcome.code).toBe('NO_SAFE_CHANGE')
    expect(outcome.lines).toEqual(nonEmptyLines(NON_CANONICAL))
    for (const line of nonEmptyLines(NON_CANONICAL)) {
      expect(outcome.message).toContain(line)
    }
    expect(outcome.message).toContain('发生了什么：')
    expect(outcome.message).toContain('为什么：')
    expect(outcome.message).toContain('怎么办：')
    expect(outcome.message).not.toMatch(/[！!]/u)
    expect(outcome.message).not.toContain('——')
  })

  it('字符串入口遇到拒绝时原样返回入参，不会返回截断后的文本', () => {
    expect(applyFieldOp('output', NON_CANONICAL, 'shorten', context)).toBe(
      NON_CANONICAL,
    )
  })

  it('审计能指出原文五行里被重渲染丢掉的是章节行', () => {
    const audit = auditFieldContent('output', NON_CANONICAL)

    expect(audit.rerenderLostLines).toEqual(['章节：标题、正文、要点摘要'])
    expect(audit.canonical).toBe(false)
  })
})

describe('四种操作在非规范输入上的内容保全', () => {
  it('五种带标签的输入：三种操作成功且行锚点都在，缩短被拒绝', () => {
    for (const op of FIELD_OPS) {
      const outcome = applyFieldOpSafely('output', NON_CANONICAL, op, context)
      if (!outcome.ok) {
        expect(outcome.code, op).toBe('NO_SAFE_CHANGE')
        expect(outcome.lines, op).toEqual(nonEmptyLines(NON_CANONICAL))
        continue
      }
      expect(
        lineAnchorsSurvive('output', nonEmptyLines(NON_CANONICAL), outcome.text),
        op,
      ).toBe(true)
      expect(nonEmptyLines(outcome.text), op).toHaveLength(
        nonEmptyLines(NON_CANONICAL).length,
      )
    }
    expect(applyFieldOpSafely('output', NON_CANONICAL, 'shorten', context).ok).toBe(
      false,
    )
  })

  it('中间夹手写行：四种操作都不丢这一行（或整次拒绝）', () => {
    for (const op of FIELD_OPS) {
      const outcome = applyFieldOpSafely('output', WITH_FREE_LINE, op, context)
      if (!outcome.ok) {
        expect(outcome.code, op).toBe('NO_SAFE_CHANGE')
        expect(outcome.lines, op).toContain(FREE_LINE)
        continue
      }
      expect(outcome.preservedLines, op).toContain(FREE_LINE)
      expect(outcome.text.split('\n'), op).toContain(FREE_LINE)
      expect(
        lineAnchorsSurvive('output', nonEmptyLines(WITH_FREE_LINE), outcome.text),
        op,
      ).toBe(true)
    }
  })

  it('手写行是多行叶子续行时，缩短只改第一行并保留续行', () => {
    const outcome = applyFieldOpSafely(
      'output',
      MULTILINE_LEAF,
      'shorten',
      context,
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) {
      throw new Error(`缩短应能在行内完成，实际拒绝：${outcome.code}`)
    }
    expect(outcome.preservedLines).toContain('手写续行，没有标签。')
    expect(outcome.text.split('\n')).toContain('手写续行，没有标签。')
    expect(outcome.text.length).toBeLessThan(MULTILINE_LEAF.length)
    expect(
      lineAnchorsSurvive('output', nonEmptyLines(MULTILINE_LEAF), outcome.text),
    ).toBe(true)
  })

  it('字符串写回入口：四种操作后原文内容行集合都是结果的子集', () => {
    const originalLines = nonEmptyLines(WITH_FREE_LINE)
    for (const op of FIELD_OPS) {
      const next = applyFieldOp('output', WITH_FREE_LINE, op, context)
      expect(lineAnchorsSurvive('output', originalLines, next), op).toBe(true)
      expect(next.split('\n'), op).toContain(FREE_LINE)
    }
    // 缩短无法安全改动时保持原文，而不是截断到第一行。
    expect(applyFieldOp('output', WITH_FREE_LINE, 'shorten', context)).toBe(
      WITH_FREE_LINE,
    )
  })

  it('完全没有结构字段时加长改为追加新行，原行逐字保留', () => {
    const text = '这是一段用户随手写的文本。\n第二行也随手写。'
    const outcome = applyFieldOpSafely('output', text, 'lengthen', context)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) {
      throw new Error('加长应成功')
    }
    const lines = outcome.text.split('\n')
    expect(lines.slice(0, 2)).toEqual(['这是一段用户随手写的文本。', '第二行也随手写。'])
    expect(lines).toHaveLength(3)
    expect(lines[2]?.trim().length).toBeGreaterThan(0)
    expect(outcome.text.startsWith(text)).toBe(true)
    expect(outcome.preservedLines).toHaveLength(2)
  })
})

describe('规范格式下的行为不回退', () => {
  it('output 仍然只删一项，65 个字符缩到 58 个字符', () => {
    const canonical = renderFieldText(schema, 'output')
    const outcome = applyFieldOpSafely('output', canonical, 'shorten', context)

    expect(canonical.length).toBe(65)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) {
      throw new Error('规范格式的缩短不应被拒绝')
    }
    expect(outcome.text.length).toBe(58)
    expect(outcome.text).toBe(
      [
        '格式：Markdown',
        '章节：',
        '- 标题',
        '- 正文',
        '长度：400 到 800 字',
        '语言：中文',
        '语气：专业、克制、直接',
      ].join('\n'),
    )
    expect(outcome.text).not.toContain('- 要点摘要')
  })

  it('规范格式的四种操作仍然各自产生变化', () => {
    const canonical = renderFieldText(schema, 'constraints')
    const results = FIELD_OPS.map(
      (op) => applyFieldOpSafely('constraints', canonical, op, context),
    )

    for (const [index, outcome] of results.entries()) {
      expect(outcome.ok, FIELD_OPS[index]).toBe(true)
    }
    const texts = results.flatMap((outcome) => (outcome.ok ? [outcome.text] : []))
    expect(new Set(texts).size).toBe(FIELD_OPS.length)
  })
})

describe('路由：拒绝时不返回 delta，成功时流式内容不丢行', () => {
  it('缩短非规范字段返回 422 结构化错误，并说明每一行', async () => {
    const response = await POST(
      new Request('http://localhost/api/engine/field?fast=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: 'output',
          action: 'shorten',
          text: NON_CANONICAL,
          requirement,
        }),
      }),
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = apiErrorSchema.parse(await response.json())
    expect(body.code).toBe('NO_SAFE_CHANGE')
    expect(body.retryable).toBe(false)

    const detailSchema = z.object({
      field: z.string(),
      action: z.string(),
      lines: z.array(z.string()),
    })
    const detail = detailSchema.parse(body.detail)
    expect(detail.field).toBe('output')
    expect(detail.action).toBe('shorten')
    expect(detail.lines).toEqual(nonEmptyLines(NON_CANONICAL))
    for (const line of detail.lines) {
      expect(body.message).toContain(line)
    }
  })

  it('加长带手写行的字段时，流式结果仍包含那一行', async () => {
    const response = await POST(
      new Request('http://localhost/api/engine/field?fast=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: 'output',
          action: 'lengthen',
          text: WITH_FREE_LINE,
          requirement,
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    if (!response.body) {
      throw new Error('响应缺少事件流')
    }

    let text = ''
    let sawDone = false
    for await (const message of parseSseStream(response.body)) {
      if (message.event === 'delta') {
        text += message.data.text
      }
      if (message.event === 'done') {
        sawDone = true
      }
    }

    expect(sawDone).toBe(true)
    expect(text.split('\n')).toContain(FREE_LINE)
    expect(
      lineAnchorsSurvive('output', nonEmptyLines(WITH_FREE_LINE), text),
    ).toBe(true)
  })
})

describe('拒绝提示文案约束', () => {
  it('四种操作的拒绝文案都遵循三段式且不含感叹号与破折号', () => {
    for (const op of FIELD_OPS) {
      const outcome = applyFieldOpSafely('output', NON_CANONICAL, op, context)
      if (outcome.ok) {
        continue
      }
      expect(outcome.message, op).toContain(
        `「${FIELD_OP_LABELS[op]}」`,
      )
      expect(outcome.message, op).toContain('发生了什么：')
      expect(outcome.message, op).toContain('为什么：')
      expect(outcome.message, op).toContain('怎么办：')
      expect(outcome.message, op).not.toMatch(/[！!]/u)
      expect(outcome.message, op).not.toContain('—')
    }
  })
})
