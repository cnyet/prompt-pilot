import { describe, expect, it } from 'vitest'
import {
  formatRecordCost,
  formatRecordModel,
  formatRecordTime,
  isValidRecordTitle,
  recordExcerpt,
  toProcessMode,
  toTargetType,
} from '@/lib/library/format'

describe('recordExcerpt', () => {
  it('折叠空白并截断到 80 个码点', () => {
    expect(recordExcerpt('  第一行\n\n第二行  ')).toBe('第一行 第二行')
    expect(recordExcerpt('a'.repeat(81))).toBe(`${'a'.repeat(80)}…`)
    expect(recordExcerpt('😀'.repeat(81))).toBe(`${'😀'.repeat(80)}…`)
  })
})

describe('formatRecordModel / formatRecordCost', () => {
  it('未知显示 —，已知 0 费用不被当成未知', () => {
    expect(formatRecordModel(null)).toBe('—')
    expect(formatRecordModel('')).toBe('—')
    expect(formatRecordModel('mock')).toBe('mock')
    expect(formatRecordCost(null)).toBe('—')
    expect(formatRecordCost(0)).toBe('¥0.0000')
    expect(formatRecordCost(0.0123)).toBe('¥0.0123')
  })
})

describe('formatRecordTime', () => {
  it('按上海固定偏移输出 YYYY-MM-DD HH:mm', () => {
    expect(formatRecordTime('2026-11-13T16:05:00.000Z')).toBe('2026-11-14 00:05')
  })
})

describe('isValidRecordTitle', () => {
  it('trim 后 1 到 120 字', () => {
    expect(isValidRecordTitle('  周报  ')).toBe(true)
    expect(isValidRecordTitle('   ')).toBe(false)
    expect(isValidRecordTitle('a'.repeat(120))).toBe(true)
    expect(isValidRecordTitle('a'.repeat(121))).toBe(false)
  })
})

describe('toProcessMode / toTargetType', () => {
  it('已知值原样返回，未知值回落到默认', () => {
    expect(toProcessMode('generate')).toBe('generate')
    expect(toProcessMode('optimize')).toBe('optimize')
    expect(toProcessMode('other')).toBe('generate')
    expect(toTargetType('image')).toBe('image')
    expect(toTargetType('other')).toBe('text')
  })
})
