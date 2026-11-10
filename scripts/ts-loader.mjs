/**
 * Node ESM loader：让 `node scripts/e2e-http.mjs` 能直接 import
 * `lib/engine/*.ts`，不需要 tsx 或别的依赖。
 *
 * 只做两件事：把 `@/` 映射到仓库根目录，把无扩展名的相对导入补成 .ts。
 * 类型由 Node 24 内置的 type stripping 处理。
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('../', import.meta.url)
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js']
const INDEX_FILES = ['/index.ts', '/index.tsx', '/index.js']

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (existsSync(fileURLToPath(candidate))) {
      return candidate
    }
  }
  return null
}

function resolveFile(url) {
  const pathname = url.pathname
  const hasExtension = /\.[a-z0-9]+$/i.test(pathname)
  const candidates = []
  if (!hasExtension) {
    for (const extension of EXTENSIONS) {
      candidates.push(new URL(`${url.href}${extension}`))
    }
    for (const index of INDEX_FILES) {
      candidates.push(new URL(`${url.href.replace(/\/$/, '')}${index}`))
    }
  } else {
    candidates.push(url)
  }
  return firstExisting(candidates) ?? url
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return {
      url: resolveFile(new URL(specifier.slice(2), ROOT)).href,
      shortCircuit: true,
    }
  }
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL
  ) {
    return {
      url: resolveFile(new URL(specifier, context.parentURL)).href,
      shortCircuit: true,
    }
  }
  return nextResolve(specifier, context)
}
