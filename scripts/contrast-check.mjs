#!/usr/bin/env node
/**
 * PromptPilot 令牌对比度检查（DESIGN.md 第二、八节）。
 *
 * 直接读取 app/globals.css 的 :root 与 .dark，避免令牌改了脚本没跟上。
 * 只用 WCAG 2.1 相对亮度公式，无第三方依赖。
 *
 *   node scripts/contrast-check.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const cssPath = resolve(here, '..', 'app', 'globals.css')
const css = readFileSync(cssPath, 'utf8')

const MIN_TEXT = 4.5

/** 所有参与检查的组合。第三项是可选的阈值，默认 4.5:1。 */
const PAIRS = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-raised'],
  ['text', 'surface-inset'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-raised'],
  ['text-faint', 'bg'],
  ['text-faint', 'surface'],
  ['accent', 'bg'],
  ['accent', 'surface'],
  ['accent', 'accent-subtle'],
  ['accent', 'tint-gold'],
  ['on-accent', 'accent'],
  ['success', 'surface'],
  ['success', 'tint-green'],
  ['success', 'diff-add-bg'],
  ['warning', 'surface'],
  ['warning', 'tint-gold'],
  ['danger', 'surface'],
  ['danger', 'tint-red'],
  ['danger', 'diff-del-bg'],
  ['on-danger-fill', 'danger-fill'],
  ['info', 'surface'],
  ['info', 'tint-purple'],
  ['text', 'tint-gold'],
  ['text', 'tint-red'],
  ['text', 'tint-green'],
  ['text', 'tint-purple'],
  ['text', 'tint-do'],
  ['text', 'tint-dont'],
]

const REQUIRED = [
  'bg',
  'bg-sunken',
  'surface',
  'surface-raised',
  'surface-inset',
  'sidebar',
  'border',
  'border-strong',
  'border-subtle',
  'text',
  'text-muted',
  'text-faint',
  'accent',
  'accent-hover',
  'accent-subtle',
  'on-accent',
  'success',
  'warning',
  'danger',
  'danger-fill',
  'on-danger-fill',
  'info',
  'tint-gold',
  'tint-red',
  'tint-green',
  'tint-purple',
  'tint-do',
  'tint-dont',
  'diff-add-bg',
  'diff-add-mark',
  'diff-del-bg',
  'diff-del-mark',
]

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readBlock(selector) {
  const match = new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{`, 'm').exec(
    css,
  )
  if (!match) return null
  const start = css.indexOf('{', match.index)
  let depth = 0
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start + 1, i)
    }
  }
  return null
}

function parseTokens(selector) {
  const block = readBlock(selector)
  if (block === null) {
    throw new Error(`找不到 ${selector} 令牌块（app/globals.css）`)
  }
  const tokens = new Map()
  const declaration = /--([\w-]+)\s*:\s*([^;]+);/g
  let item
  while ((item = declaration.exec(block)) !== null) {
    const [, name, raw] = item
    tokens.set(name, raw.trim())
  }
  return tokens
}

function resolveToken(tokens, name, seen = new Set()) {
  if (seen.has(name)) return null
  seen.add(name)
  const value = tokens.get(name)
  if (!value) return null
  const alias = /^var\(\s*--([\w-]+)\s*\)$/.exec(value)
  if (alias) return resolveToken(tokens, alias[1], seen)
  return value
}

function parseHex(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const int = Number.parseInt(match[1], 16)
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  }
}

function linear(channel) {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance({ r, g, b }) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

function format(value) {
  return `${value.toFixed(2)}:1`
}

function checkTheme(label, selector) {
  const tokens = parseTokens(selector)
  const missing = REQUIRED.filter((name) => !tokens.has(name))
  const failures = []
  const lines = []

  for (const [fgName, bgName, threshold = MIN_TEXT] of PAIRS) {
    const fgRaw = resolveToken(tokens, fgName)
    const bgRaw = resolveToken(tokens, bgName)
    if (!fgRaw || !bgRaw) {
      failures.push(`${fgName} / ${bgName}: 令牌不存在`)
      continue
    }
    const fg = parseHex(fgRaw)
    const bg = parseHex(bgRaw)
    if (!fg || !bg) {
      failures.push(
        `${fgName} / ${bgName}: 不是可解析的十六进制颜色（${fgRaw} / ${bgRaw}）`,
      )
      continue
    }
    const ratio = contrast(fg, bg)
    const ok = ratio >= threshold
    if (!ok) failures.push(`${fgName} / ${bgName}: ${format(ratio)} < ${threshold}:1`)
    lines.push({
      pair: `${fgName} / ${bgName}`,
      ratio,
      ok,
      threshold,
    })
  }

  const minimum = lines.reduce(
    (value, line) => (line.ratio < value.ratio ? line : value),
    lines[0],
  )

  console.log(`\n${label}`)
  for (const line of lines) {
    console.log(
      `  ${line.ok ? 'PASS' : 'FAIL'}  ${line.pair.padEnd(34)} ${format(line.ratio)}`,
    )
  }
  if (minimum) {
    console.log(
      `  最低：${minimum.pair} ${format(minimum.ratio)}（阈值 ${minimum.threshold}:1）`,
    )
  }
  if (missing.length > 0) {
    failures.push(`缺少令牌：${missing.join(', ')}`)
  }
  return { failures, minimum }
}

console.log('PromptPilot 令牌对比度（WCAG 2.1）')
console.log(`来源：${cssPath}`)

const light = checkTheme('浅色 · 羊皮纸日光', ':root')
const dark = checkTheme('深色 · 烛光地下室', '.dark')

const failures = [...light.failures, ...dark.failures]
if (failures.length > 0) {
  console.error('\n对比度检查未通过：')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('\n全部组合通过：浅色与深色均 >= 4.5:1')