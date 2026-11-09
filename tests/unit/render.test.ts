import { describe, expect, it } from 'vitest'
import { composePrompt } from '@/lib/engine/compose'
import {
  fieldHeading,
  renderFieldSegments,
  renderFieldText,
  renderMarkdownDocument,
  renderSchemaMarkdown,
} from '@/lib/engine/render'
import { FIELD_KEYS, createSkeletonSchema } from '@/lib/engine/schema'

describe('结构化提示词渲染', () => {
  const schema = composePrompt('帮我写一份产品评审会议程')

  it('每个字段都有非空片段，路径不重复', () => {
    for (const field of FIELD_KEYS) {
      const segments = renderFieldSegments(schema, field)
      expect(segments.length).toBeGreaterThan(0)

      const paths = segments.map((segment) => segment.path)
      expect(new Set(paths).size).toBe(paths.length)
      for (const path of paths) {
        expect(path === field || path.startsWith(`${field}.`)).toBe(true)
      }
    }
  })

  it('片段拼接结果与字段文本一致', () => {
    for (const field of FIELD_KEYS) {
      const joined = renderFieldSegments(schema, field)
        .map((segment) => segment.text)
        .join('')
        .trimEnd()
      expect(renderFieldText(schema, field)).toBe(joined)
    }
  })

  it('叶子路径使用点号形式', () => {
    const rolePaths = renderFieldSegments(schema, 'role').map(
      (segment) => segment.path,
    )
    expect(rolePaths).toContain('role.persona')

    const criteriaPaths = renderFieldSegments(schema, 'objective').map(
      (segment) => segment.path,
    )
    expect(criteriaPaths).toContain('objective.successCriteria.0')

    const boundaryPaths = renderFieldSegments(schema, 'constraints').map(
      (segment) => segment.path,
    )
    expect(boundaryPaths).toContain('constraints.boundaries.scopeOut')
    expect(boundaryPaths).toContain('constraints.boundaries.knowledgePolicy')
  })

  it('Markdown 含标题与八个编号字段，顺序稳定', () => {
    const markdown = renderSchemaMarkdown(schema)
    expect(markdown.startsWith(`# ${schema.meta.title}`)).toBe(true)

    let previousIndex = -1
    for (const field of FIELD_KEYS) {
      const heading = `## ${fieldHeading(field)}`
      const index = markdown.indexOf(heading)
      expect(index).toBeGreaterThan(previousIndex)
      previousIndex = index
    }

    expect(markdown.endsWith('\n')).toBe(true)
    expect(markdown.endsWith('\n\n')).toBe(false)
    expect(markdown).not.toContain('undefined')
  })

  it('变量以 {{name}} 形式保留，可直接粘贴后替换', () => {
    const doc = createSkeletonSchema('变量渲染测试')
    doc.input.variables.push({
      name: 'source_text',
      label: '待抽取文本',
      type: 'longtext',
      required: true,
      description: '原始文本',
    })

    const fieldText = renderFieldText(doc, 'input')
    expect(fieldText).toContain('{{source_text}}')
    expect(fieldText).toContain('待抽取文本')

    const markdown = renderSchemaMarkdown(doc)
    expect(markdown).toContain('{{source_text}}')
  })

  it('未生成字段不进入 Markdown，标题为空时有兜底', () => {
    const markdown = renderMarkdownDocument({
      title: '   ',
      fields: {
        role: '你是谁：编辑',
        objective: '',
        context: undefined,
      },
    })

    expect(markdown.startsWith('# 未命名提示词')).toBe(true)
    expect(markdown).toContain('## 1. 角色')
    expect(markdown).not.toContain('## 2. 目标')
    expect(markdown).not.toContain('## 3. 上下文')
  })

  it('字段编号从 1 开始且与八字段顺序一致', () => {
    expect(fieldHeading('role')).toBe('1. 角色')
    expect(fieldHeading('objective')).toBe('2. 目标')
    expect(fieldHeading('selfCheck')).toBe('8. 自检')
  })
})
