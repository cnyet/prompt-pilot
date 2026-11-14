import { describe, expect, it } from 'vitest'
import {
  buildCoverModel,
  countTemplatesByCategory,
  filterTemplatesByStyle,
  originTemplateIdForMode,
  resolveStyleSelection,
  resolveTemplatePrefill,
  stylesInCategory,
  templateHref,
  templatesInCategory,
  toTemplateCard,
  toTemplateCategory,
  toTemplateMode,
  type TemplateCard,
} from '@/lib/templates-v3'

function card(overrides: Partial<TemplateCard> = {}): TemplateCard {
  return {
    id: 'tpl-1',
    slug: 'weekly-report',
    category: 'text',
    style: '公文',
    title: '周报助手',
    description: '把零散记录整理成周报',
    mode: 'generate',
    exampleInput: '帮我写个周报',
    featured: false,
    builtin: true,
    ...overrides,
  }
}

describe('template normalization', () => {
  it('keeps known categories and modes, falls back on unknown values', () => {
    expect(toTemplateCategory('text')).toBe('text')
    expect(toTemplateCategory('image')).toBe('image')
    expect(toTemplateCategory('video')).toBe('video')
    expect(toTemplateCategory('bogus')).toBe('text')

    expect(toTemplateMode('generate')).toBe('generate')
    expect(toTemplateMode('optimize')).toBe('optimize')
    expect(toTemplateMode('repair')).toBe('generate')
  })

  it('maps a source row to a template card without dropping flags', () => {
    const mapped = toTemplateCard({
      ...card(),
      category: 'video',
      mode: 'optimize',
      featured: true,
      builtin: false,
    })

    expect(mapped).toEqual({
      id: 'tpl-1',
      slug: 'weekly-report',
      category: 'video',
      style: '公文',
      title: '周报助手',
      description: '把零散记录整理成周报',
      mode: 'optimize',
      exampleInput: '帮我写个周报',
      featured: true,
      builtin: false,
    })
  })
})

describe('resolveTemplatePrefill', () => {
  it('prefills generate mode from the example input', () => {
    expect(
      resolveTemplatePrefill({ ...card(), body: '你是一名行政助理。' }),
    ).toEqual({
      originTemplateId: 'tpl-1',
      mode: 'generate',
      sourceInput: '帮我写个周报',
      targetType: 'text',
    })
  })

  it('trims the generate example input', () => {
    expect(
      resolveTemplatePrefill({
        ...card({ exampleInput: '  写一份周报  ' }),
        body: '正文',
      })?.sourceInput,
    ).toBe('写一份周报')
  })

  it('falls back to the description, then the title, for legacy custom templates', () => {
    expect(
      resolveTemplatePrefill({ ...card({ exampleInput: null }), body: '正文' })
        ?.sourceInput,
    ).toBe('把零散记录整理成周报')

    expect(
      resolveTemplatePrefill({
        ...card({ exampleInput: '   ', description: '   ' }),
        body: '正文',
      })?.sourceInput,
    ).toBe('周报助手')
  })

  it('prefills optimize mode from the body and keeps the category', () => {
    expect(
      resolveTemplatePrefill({
        ...card({ category: 'video', mode: 'optimize', exampleInput: null }),
        body: '  镜头慢慢推近，最后拉远。  ',
      }),
    ).toEqual({
      originTemplateId: 'tpl-1',
      mode: 'optimize',
      sourceInput: '镜头慢慢推近，最后拉远。',
      targetType: 'video',
    })
  })

  it('falls back to description when an optimize body is blank', () => {
    expect(
      resolveTemplatePrefill({
        ...card({ mode: 'optimize', exampleInput: null }),
        body: '   ',
      })?.sourceInput,
    ).toBe('把零散记录整理成周报')
  })

  it('returns null when there is nothing usable to prefill', () => {
    expect(
      resolveTemplatePrefill({
        ...card({ exampleInput: null, description: '  ', title: '  ' }),
        body: '  ',
      }),
    ).toBeNull()
  })
})

describe('template links and grouping', () => {
  const cards: TemplateCard[] = [
    card({ id: '1', slug: 'a', category: 'text', style: '公文' }),
    card({ id: '2', slug: 'b', category: 'text', style: '营销' }),
    card({ id: '3', slug: 'c', category: 'text', style: '公文' }),
    card({ id: '4', slug: 'd', category: 'image', style: '摄影' }),
    card({ id: '5', slug: 'e', category: 'video', style: '分镜' }),
  ]

  it('builds an encoded studio link', () => {
    expect(templateHref('tpl-1')).toBe('/studio?template=tpl-1')
    expect(templateHref('a b')).toBe('/studio?template=a%20b')
  })

  it('keeps the template origin only for the original mode', () => {
    expect(
      originTemplateIdForMode({ id: 'tpl-1', mode: 'optimize' }, 'optimize'),
    ).toBe('tpl-1')
    expect(
      originTemplateIdForMode({ id: 'tpl-1', mode: 'optimize' }, 'generate'),
    ).toBeUndefined()
    expect(originTemplateIdForMode(null, 'generate')).toBeUndefined()
  })

  it('counts every category, including empty ones', () => {
    expect(countTemplatesByCategory(cards.slice(0, 4))).toEqual({
      text: 3,
      image: 1,
      video: 0,
    })
  })

  it('filters to the active category', () => {
    expect(templatesInCategory(cards, 'text').map((item) => item.id)).toEqual([
      '1',
      '2',
      '3',
    ])
    expect(templatesInCategory(cards, 'video').map((item) => item.id)).toEqual([
      '5',
    ])
  })

  it('lists unique styles in first-seen order for the active category', () => {
    expect(stylesInCategory(cards, 'text')).toEqual(['公文', '营销'])
    expect(stylesInCategory(cards, 'image')).toEqual(['摄影'])
  })

  it('clears a style selection that no longer exists', () => {
    expect(resolveStyleSelection(['公文', '营销'], '公文')).toBe('公文')
    expect(resolveStyleSelection(['公文', '营销'], '摄影')).toBeNull()
    expect(resolveStyleSelection(['公文'], null)).toBeNull()
  })

  it('filters by style only when one is selected', () => {
    expect(filterTemplatesByStyle(cards, null)).toHaveLength(5)
    expect(
      filterTemplatesByStyle(cards, '公文').map((item) => item.id),
    ).toEqual(['1', '3'])
  })
})

describe('buildCoverModel', () => {
  it('keeps short titles on one line and shows the variant and style', () => {
    const model = buildCoverModel(
      card({ category: 'image', title: '极简海报', style: '海报' }),
    )

    expect(model).toMatchObject({
      variant: 'image',
      titleLines: ['极简海报'],
      styleLabel: '海报',
    })
  })

  it('balances longer titles into two lines', () => {
    expect(
      buildCoverModel(card({ title: '15 秒产品广告' })).titleLines,
    ).toEqual(['15 秒', '产品广告'])
  })

  it('truncates very long titles and styles with an ellipsis', () => {
    const model = buildCoverModel(
      card({
        title: '一二三四五六七八九十甲乙丙丁',
        style: '摄影风格很长的自定义标签文字',
      }),
    )

    expect(model.titleLines).toHaveLength(2)
    expect(model.titleLines[1]!.endsWith('…')).toBe(true)
    expect(model.styleLabel.endsWith('…')).toBe(true)
  })

  it('derives a stable seed from the slug, then the id', () => {
    const first = buildCoverModel(card({ slug: 'weekly-report' })).seed
    const same = buildCoverModel(
      card({ id: 'another-id', slug: 'weekly-report' }),
    ).seed
    const different = buildCoverModel(card({ slug: 'weekly-report-2' })).seed

    expect(same).toBe(first)
    expect(different).not.toBe(first)

    const byId = buildCoverModel(card({ id: 'id-a', slug: null })).seed
    const byOtherId = buildCoverModel(card({ id: 'id-b', slug: null })).seed
    expect(byOtherId).not.toBe(byId)
  })
})
