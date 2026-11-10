/**
 * PromptPilot HTTP 端到端冒烟（工单 14）
 *
 * 跑法：
 *   node scripts/e2e-http.mjs
 *
 * 约定：
 * - 不依赖 ARK_API_KEY，也不装 Playwright。服务用 3260 端口启动，
 *   `MOCK_LLM_FAULT=valid` 让试运行与评估都走 Mock；生成仍走离线模板。
 * - 依次验证：生成 SSE → 八字段流 → 导出 Markdown / OpenAI messages
 *   → 试运行 SSE → 保存基线 v0 → 库列表能查到。
 * - 无论成功失败都会杀掉服务，并清理本次创建的提示词与运行记录，避免污染本地库。
 * - 如果 3260 已被占用，脚本会在等待超时后带着 next dev 日志退出。
 * - 需要 Node 24+：导出步骤直接 import `lib/engine/export.ts`，
 *   使用 Node 内置的 TypeScript type stripping，不引入 tsx 依赖。
 *
 * 这个脚本就是合并门槛，任何一个断言失败都会返回非零退出码。
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire, register } from 'node:module'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = 3260
const BASE = `http://127.0.0.1:${PORT}`
const REQUIREMENT = '帮我写个周报'
const SESSION_KEY = `e2e-http-${Date.now()}`

const require = createRequire(import.meta.url)

register('./ts-loader.mjs', import.meta.url)

const {
  buildMarkdownExport,
  buildOpenAIMessagesExport,
} = await import('../lib/engine/export.ts')
const { buildSchemaFromFields } = await import('../lib/engine/paths.ts')
const { renderFieldText, renderMarkdownDocument } = await import(
  '../lib/engine/render.ts'
)
const { FIELD_KEYS } = await import('../lib/engine/schema.ts')
const { classifyTaskType } = await import('../lib/engine/compose.ts')

function log(step, detail = '') {
  console.log(`[e2e] ${step}${detail.length > 0 ? `：${detail}` : ''}`)
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function requestJson(pathname, init) {
  const response = await fetch(`${BASE}${pathname}`, init)
  const text = await response.text()
  let payload = null
  try {
    payload = text.length > 0 ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok) {
    const message =
      payload !== null && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : text.slice(0, 300)
    throw new Error(
      `${pathname} 返回 ${response.status}：${message || '没有响应正文'}`,
    )
  }
  return payload
}

function parseBlock(block) {
  let event = 'message'
  const dataLines = []
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line.length === 0 || line.startsWith(':')) {
      continue
    }
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) {
      value = value.slice(1)
    }
    if (field === 'event') {
      event = value
    } else if (field === 'data') {
      dataLines.push(value)
    }
  }
  if (dataLines.length === 0) {
    return null
  }
  return { event, data: JSON.parse(dataLines.join('\n')) }
}

async function* readSse(response) {
  const contentType = response.headers.get('content-type') ?? ''
  assert.match(contentType, /text\/event-stream/, '响应必须返回 SSE')
  assert.ok(response.body, 'SSE 响应必须有 body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const message = parseBlock(block)
      if (message !== null) {
        yield message
      }
      boundary = buffer.indexOf('\n\n')
    }
  }
  buffer += decoder.decode()
  if (buffer.trim().length > 0) {
    const message = parseBlock(buffer)
    if (message !== null) {
      yield message
    }
  }
}

function startServer() {
  const nextBin = path.join(ROOT, 'node_modules/next/dist/bin/next')
  if (!existsSync(nextBin)) {
    throw new Error(`找不到 Next.js：${nextBin}`)
  }
  const child = spawn(
    process.execPath,
    [nextBin, 'dev', '-p', String(PORT)],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        ARK_API_KEY: '',
        MOCK_LLM_FAULT: 'valid',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  )
  let logs = ''
  const collect = (chunk) => {
    logs += chunk.toString()
    if (logs.length > 20_000) {
      logs = logs.slice(-20_000)
    }
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  return { child, logs: () => logs }
}

async function waitForServer(server) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(
        `next dev 提前退出（code=${server.child.exitCode}）：\n${server.logs()}`,
      )
    }
    try {
      const response = await fetch(`${BASE}/api/run`, {
        cache: 'no-store',
      })
      if (response.ok) {
        return
      }
    } catch {
      // 还没监听端口，继续等
    }
    await sleep(500)
  }
  throw new Error(`等待 ${BASE} 就绪超时：\n${server.logs()}`)
}

function waitExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(true)
      return
    }
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

async function stopServer(server) {
  if (!server || server.child.exitCode !== null) {
    return
  }
  const pid = server.child.pid
  if (!pid) {
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    server.child.kill('SIGTERM')
  }
  const exited = await waitExit(server.child, 6_000)
  if (!exited) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      server.child.kill('SIGKILL')
    }
    await waitExit(server.child, 3_000)
  }
}

async function readGeneration() {
  const response = await fetch(`${BASE}/api/engine/generate?fast=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: REQUIREMENT,
      requestId: `e2e-generate-${Date.now()}`,
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`生成路由返回 ${response.status}：${text.slice(0, 300)}`)
  }

  const fields = {}
  let currentField = null
  let fieldStarts = 0
  let deltaCount = 0
  let done = null
  let error = null

  for await (const message of readSse(response)) {
    switch (message.event) {
      case 'field':
        if (message.data.status === 'start') {
          currentField = message.data.path
          fieldStarts += 1
        } else {
          currentField = null
        }
        break
      case 'delta':
        deltaCount += 1
        if (currentField !== null && FIELD_KEYS.includes(currentField)) {
          fields[currentField] =
            (fields[currentField] ?? '') + String(message.data.text)
        }
        break
      case 'error':
        error = message.data
        break
      case 'done':
        done = message.data
        break
      default:
        break
    }
  }

  assert.equal(error, null, `生成流返回错误：${JSON.stringify(error)}`)
  assert.equal(fieldStarts, FIELD_KEYS.length, '八个字段都应有 start 事件')
  assert.ok(deltaCount > FIELD_KEYS.length, '字段内容应分多段流式到达')
  for (const field of FIELD_KEYS) {
    const text = fields[field]
    assert.equal(
      typeof text,
      'string',
      `字段 ${field} 没有收到文本流`,
    )
    assert.ok(text.trim().length > 0, `字段 ${field} 内容为空`)
  }
  return { fields, done, deltaCount }
}

function buildExportArtifacts(schema) {
  const markdown = buildMarkdownExport({ schema })
  assert.equal(
    markdown.ok,
    true,
    `Markdown 导出失败：${JSON.stringify(markdown.issues)}`,
  )
  if (!markdown.ok) {
    throw new Error('Markdown 导出失败')
  }
  assert.match(markdown.content, /^# /, 'Markdown 导出应有标题')
  assert.match(markdown.content, /## /, 'Markdown 导出应有字段标题')

  const messages = buildOpenAIMessagesExport({ schema })
  assert.equal(
    messages.ok,
    true,
    `OpenAI messages 导出失败：${JSON.stringify(messages.issues)}`,
  )
  if (!messages.ok) {
    throw new Error('OpenAI messages 导出失败')
  }
  const payload = JSON.parse(messages.content)
  assert.ok(Array.isArray(payload.messages), '导出 JSON 应包含 messages 数组')
  assert.ok(payload.messages.length > 0, '导出 messages 不能为空')
  assert.ok(
    payload.messages.some((message) => message.role === 'system'),
    '导出 messages 应包含 system 角色',
  )
  assert.ok(
    payload.messages.some((message) => message.role === 'user'),
    '导出 messages 应包含 user 角色',
  )
  return { markdown, messages }
}

function trialVariables(schema) {
  return schema.input.variables.map((variable) => ({
    name: variable.name,
    label: variable.label,
    type: variable.type,
    required: variable.required,
    value:
      variable.defaultValue ??
      variable.options?.[0] ??
      (variable.type === 'boolean' ? 'false' : '示例值'),
    ...(variable.options !== undefined ? { options: variable.options } : {}),
    ...(variable.description !== undefined
      ? { description: variable.description }
      : {}),
  }))
}

async function runTrial(prompt, variables) {
  const response = await fetch(`${BASE}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      variables,
      sessionKey: SESSION_KEY,
      requestId: `e2e-run-${Date.now()}`,
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`试运行路由返回 ${response.status}：${text.slice(0, 300)}`)
  }

  let output = ''
  let done = null
  let error = null
  let usage = null
  for await (const message of readSse(response)) {
    if (message.event === 'delta') {
      output += String(message.data.text)
    } else if (message.event === 'usage') {
      usage = message.data
    } else if (message.event === 'error') {
      error = message.data
    } else if (message.event === 'done') {
      done = message.data
    }
  }

  assert.equal(error, null, `试运行返回错误：${JSON.stringify(error)}`)
  assert.ok(done !== null, '试运行应收到 done 事件')
  assert.equal(done.finishReason, 'stop', '试运行应正常结束')
  assert.ok(output.trim().length > 0, '试运行输出不能为空')
  assert.ok(usage !== null, '试运行应返回用量')
  assert.ok(usage.tokensIn > 0, '输入 token 应大于 0')
  assert.ok(usage.tokensOut > 0, '输出 token 应大于 0')
  return { output, usage }
}

async function saveV0(schema) {
  const saved = await requestJson('/api/prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: schema.meta.title,
      sourceInput: REQUIREMENT,
      schema,
    }),
  })
  const prompt = saved?.prompt
  assert.equal(typeof prompt?.id, 'string', '保存接口应返回 prompt.id')
  return prompt
}

async function readLibrary(promptId, title) {
  const list = await requestJson(
    `/api/prompts?q=${encodeURIComponent(title)}`,
  )
  assert.ok(Array.isArray(list?.prompts), '库列表应返回 prompts 数组')
  const found = list.prompts.find((item) => item.id === promptId)
  assert.ok(found, '库列表应能查到刚保存的提示词')
  assert.ok(found.versionCount >= 1, '刚保存的提示词至少应有一个版本')
  assert.equal(found.latestVersionNo, 0, '首次保存的最新版本应为基线 v0')

  const detail = await requestJson(`/api/prompts/${encodeURIComponent(promptId)}`)
  assert.equal(detail?.prompt?.versions?.length >= 1, true, '详情应包含版本')
  assert.equal(
    detail.prompt.versions[0].isBaseline,
    true,
    '第一个版本应为只读基线 v0',
  )
  return found
}

async function runEval(promptId) {
  const payload = await requestJson('/api/eval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      promptId,
      samples: ['帮我写个周报', '帮我写一份产品评审议程'],
    }),
  })
  const result = payload?.result
  assert.equal(typeof result?.taskId, 'string', '评估应返回 taskId')
  assert.equal(result.samples.length, 2, '两条样本都应跑出输出')
  assert.ok(
    result.samples.every((sample) => sample.targetOutput.length > 0),
    '每条样本都应有模型输出',
  )
  // 没有评委模型时必须是 needs_review，不能假装判定成功
  assert.equal(
    result.status,
    'needs_review',
    '无评委模型时应标为待人工判定',
  )
  const list = await requestJson('/api/eval')
  assert.ok(
    list?.tasks?.some((task) => task.id === result.taskId),
    '评估列表应包含刚创建的任务',
  )
  const detail = await requestJson(`/api/eval/${encodeURIComponent(result.taskId)}`)
  assert.equal(
    detail?.task?.id,
    result.taskId,
    '评估详情应能按 id 读取',
  )
  return result
}

async function cleanupArtifacts(promptId, sessionKey, evalTaskIds = []) {
  const { PrismaClient } = require('@prisma/client')
  const databaseUrl =
    process.env.DATABASE_URL ?? (await readEnvDatabaseUrl()) ?? 'file:../data/app.db'
  const relative = databaseUrl.replace(/^file:/, '')
  const databasePath = path.isAbsolute(relative)
    ? relative
    : path.resolve(ROOT, 'prisma', relative)
  if (!existsSync(databasePath)) {
    log('清理跳过', `找不到数据库 ${databasePath}`)
    return
  }
  const prisma = new PrismaClient({
    datasourceUrl: `file:${databasePath}`,
  })
  try {
    const runs = await prisma.run.findMany({
      where: { sessionKey },
      select: { id: true, traceId: true },
    })
    const traceIds = runs
      .map((run) => run.traceId)
      .filter((traceId) => typeof traceId === 'string')
    if (runs.length > 0) {
      await prisma.run.deleteMany({ where: { sessionKey } })
    }
    if (traceIds.length > 0) {
      await prisma.llmCall.deleteMany({
        where: { traceId: { in: traceIds } },
      })
    }
    if (evalTaskIds.length > 0) {
      await prisma.evalTask.deleteMany({ where: { id: { in: evalTaskIds } } })
    }
    if (promptId !== null) {
      await prisma.prompt.delete({ where: { id: promptId } })
    }
    log(
      '清理',
      `已删除${promptId === null ? '' : '提示词、'}${runs.length} 条运行记录与对应调用账本`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

async function readEnvDatabaseUrl() {
  try {
    const text = await readFile(path.join(ROOT, '.env'), 'utf8')
    const match = text.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m)
    return match?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

let server = null
let createdPromptId = null
const createdEvalTaskIds = []

try {
  log('启动', `next dev :${PORT}，MOCK_LLM_FAULT=valid`)
  server = startServer()
  await waitForServer(server)

  const availability = await requestJson('/api/run')
  assert.equal(availability?.available, true, 'Mock 试运行应报告可用')
  assert.ok(
    availability?.model?.label?.includes('Mock'),
    '可用性响应应点名 Mock 模型',
  )
  log('可用性', availability.model.label)

  log('生成', REQUIREMENT)
  const generated = await readGeneration()
  log(
    '字段流',
    `${FIELD_KEYS.length} 个字段，${generated.deltaCount} 段 delta`,
  )

  const fields = generated.fields
  const title =
    typeof generated.done?.title === 'string' && generated.done.title.length > 0
      ? generated.done.title
      : '周报生成'
  const schema = buildSchemaFromFields(fields, {
    title,
    taskType: classifyTaskType(REQUIREMENT),
    assumptions: Array.isArray(generated.done?.assumptions)
      ? generated.done.assumptions
      : [],
  })
  assert.equal(schema.schemaVersion, 'pp-schema-v1')

  const renderedFields = {}
  for (const field of FIELD_KEYS) {
    renderedFields[field] = renderFieldText(schema, field)
  }
  const prompt = renderMarkdownDocument({
    title: schema.meta.title,
    fields: renderedFields,
  })
  assert.ok(prompt.includes('## '), '渲染文本应包含字段小标题')

  const exported = buildExportArtifacts(schema)
  log(
    '导出',
    `Markdown ${exported.markdown.content.length} 字符，OpenAI messages ${exported.messages.content.length} 字符`,
  )

  const variables = trialVariables(schema)
  log('试运行', `${variables.length} 个变量`)
  const trial = await runTrial(prompt, variables)
  log(
    '试运行完成',
    `输出 ${trial.output.length} 字符，输入 ${trial.usage.tokensIn} / 输出 ${trial.usage.tokensOut} token`,
  )

  const saved = await saveV0(schema)
  createdPromptId = saved.id
  log('保存 v0', `${saved.title}（${saved.id}）`)

  const libraryItem = await readLibrary(saved.id, schema.meta.title)
  log(
    '库列表',
    `命中「${libraryItem.title}」，${libraryItem.versionCount} 个版本，最新 v${libraryItem.latestVersionNo}`,
  )

  const evalResult = await runEval(saved.id)
  createdEvalTaskIds.push(evalResult.taskId)
  log(
    '评估',
    `${evalResult.samples.length} 条样本，状态 ${evalResult.status}，通过率 ${evalResult.passRate ?? '未判定'}`,
  )

  console.log('')
  console.log(
    '[e2e] 通过：生成 8 字段 → 导出 2 种格式 → 试运行 → 保存 v0 → 库列表 → 评估',
  )
} catch (error) {
  console.error('')
  console.error('[e2e] 失败')
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  if (server) {
    console.error('')
    console.error('[e2e] next dev 日志尾部')
    console.error(server.logs().split('\n').slice(-40).join('\n'))
  }
  process.exitCode = 1
} finally {
  await stopServer(server)
  if (server !== null) {
    try {
      await cleanupArtifacts(createdPromptId, SESSION_KEY, createdEvalTaskIds)
    } catch (error) {
      console.warn(
        `[e2e] 清理失败，请手动删除本次测试数据（sessionKey=${SESSION_KEY}）：${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}
