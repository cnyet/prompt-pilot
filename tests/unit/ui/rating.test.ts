import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ratingKeyToValue } from '@/lib/ui/rating'
import { Rating } from '@/components/ui/Rating'

describe('ratingKeyToValue', () => {
  it('方向键按 1 到 5 调整，边界不越界', () => {
    expect(ratingKeyToValue(null, 'ArrowRight')).toBe(1)
    expect(ratingKeyToValue(5, 'ArrowRight')).toBe(5)
    expect(ratingKeyToValue(null, 'ArrowLeft')).toBe(1)
    expect(ratingKeyToValue(3, 'ArrowLeft')).toBe(2)
  })

  it('Home / End 跳到两端', () => {
    expect(ratingKeyToValue(2, 'Home')).toBe(1)
    expect(ratingKeyToValue(2, 'End')).toBe(5)
  })

  it('数字键直接选中对应星数', () => {
    expect(ratingKeyToValue(2, '4')).toBe(4)
  })

  it('Delete 清除评分，其他键不处理', () => {
    expect(ratingKeyToValue(4, 'Delete')).toBeNull()
    expect(ratingKeyToValue(4, 'x')).toBeUndefined()
  })
})

describe('Rating 渲染', () => {
  it('未评分显示文字标签而不是 0 星', () => {
    const html = renderToStaticMarkup(
      createElement(Rating, { value: null, onChange: () => {} }),
    )
    expect(html).toContain('未评分')
    expect(html).toContain('radiogroup')
    expect(html).toContain('aria-checked="false"')
  })

  it('已评分显示星数文字标签', () => {
    const html = renderToStaticMarkup(
      createElement(Rating, { value: 3, onChange: () => {} }),
    )
    expect(html).toContain('3 星')
  })
})
