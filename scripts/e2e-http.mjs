/**
 * PromptPilot v3 HTTP 端到端冒烟
 *
 * 跑法：
 *   pnpm e2e
 *
 * 约定：
 * - 纯 fetch，不 import 源码模块，不直接读写数据库；用 HTTP 接口验证主路径。
 * - 不依赖 ARK_API_KEY：用 3260 端口起 `next dev`，`MOCK_LLM_FAULT=valid`
 *   让生成与优化都走确定性 Mock。
 * - 使用隔离的 `data/e2e.db`：启动前删除旧库，`prisma db push` + seed 建库；
 *   结束后删库，绝不读写 `data/app.db`。
 * - 依次验证：设置 → 生成 SSE → 优化 SSE → 继续优化 → 收藏评分与搜索
 *   → 删除记录 → 模板增删 → 预算与成本统计。
 * - 只删除本次脚本创建的记录与模板；失败时也执行清理。
 *
 * 这个脚本就是合并门槛，任何一个断言失败都会返回非零退出码。
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { connect } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = 3260
const BASE = `http://127.0.0.1:${PORT}`
const DATABASE_URL = 'file:../data/e2e.db'
const DB_PATH = path.join(ROOT, 'data/e2e.db')
const RUN_TAG = `e2e-${Date.now().toString(36)}`
const META_SEPARATOR = '<<<PROMPTPILOT_META>>>'
const REQUIREMENT = `帮我写个周报 ${RUN_TAG}`
const OPTIMIZE_SOURCE = `你是一名助理，请根据要点写一份周报。${RUN_TAG}`

const createdRecordIds = []
const createdTemplateIds = []
let server = null
let serverReady = false

function log(step, detail = '') {
  console.log(`[e2e] ${step}${detail.length > 0 ? `：${detail}` : ''}`)
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function removeE2eDb() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    rmSync(`${DB_PATH}${suffix}`, { force: true })
  }
}

function runPnpm(args) {
  execFileSync('pnpm', args, {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL,
      ARK_API_KEY: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: 'inherit',
  })
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    const finish = (value) => {
      socket.destroy()
      resolve(value)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(500, () => finish(false))
  })
}

function startServer() {
  const nextBin = path.join(ROOT, 'node_modules/next/dist/bin/next')
  const child = spawn(
    process.execPath,
    [nextBin, 'dev', '-p', String(PORT)],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        ARK_API_KEY: '',
        MOCK_LLM_FAULT: 'valid',
        DATABASE_URL,
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

async function waitForServer() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(
        `next dev 提前退出（code=${server.child.exitCode}）：\n${server.logs()}`,
      )
    }
    try {
      const response = await fetch(`${BASE}/api/settings`, { cache: 'no-store' })
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

async function stopServer() {
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

function errorMessage(payload, text) {
  if (payload !== null && typeof payload === 'object') {
    const nested = payload.error
    if (
      nested !== null &&
      typeof nested === 'object' &&
      typeof nested.message === 'string'
    ) {
      return nested.message
    }
    if (typeof payload.message === 'string') {
      return payload.message
    }
  }
  return text.slice(0, 300)
}

async function request(pathname, init) {
  const response = await fetch(`${BASE}${pathname}`, init)
  const text = await response.text()
  let payload = null
  try {
    payload = text.length > 0 ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  return { response, payload, text }
}

async function requestJson(pathname, init, expectedStatus = 200) {
  const { response, payload, text } = await request(pathname, init)
  if (response.status !== expectedStatus) {
    throw new Error(
      `${pathname} 返回 ${response.status}，期望 ${expectedStatus}：${errorMessage(payload, text)}`,
    )
  }
  return payload
}

async function requestNoContent(pathname, init, expectedStatus = 204) {
  const { response, payload, text } = await request(pathname, init)
  if (response.status !== expectedStatus) {
    throw new Error(
      `${pathname} 返回 ${response.status}，期望 ${expectedStatus}：${errorMessage(payload, text)}`,
    )
  }
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

async function drainStream(response, label) {
  let start = null
  let meta = null
  let usage = null
  let done = null
  let error = null
  let output = ''
  let deltaCount = 0

  for await (const message of readSse(response)) {
    switch (message.event) {
      case 'start':
        start = message.data
        break
      case 'delta':
        deltaCount += 1
        output += String(message.data.text)
        break
      case 'meta':
        meta = message.data
        break
      case 'usage':
        usage = message.data
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

  assert.equal(error, null, `${label}返回错误：${JSON.stringify(error)}`)
  assert.ok(start !== null, `${label}缺少 start 事件`)
  assert.ok(done !== null, `${label}缺少 done 事件`)
  assert.equal(done.status, 'completed', `${label}应以 completed 结束`)
  assert.ok(deltaCount > 0, `${label}应至少收到一段 delta`)
  assert.ok(output.trim().length > 0, `${label}正文不能为空`)
  assert.equal(
    output.includes(META_SEPARATOR),
    false,
    `${label}正文不能包含元数据分隔符`,
  )
  assert.ok(meta !== null, `${label}缺少 meta 事件`)
  assert.equal(
    typeof meta.title,
    'string',
    `${label}的 meta.title 应为字符串`,
  )
  assert.ok(meta.title.trim().length > 0, `${label}的 meta.title 不能为空`)
  assert.ok(Array.isArray(meta.notes), `${label}的 meta.notes 应为数组`)
  assert.ok(usage !== null, `${label}应返回 usage`)
  assert.ok(usage.tokensIn > 0, `${label}输入 token 应大于 0`)
  assert.ok(usage.tokensOut > 0, `${label}输出 token 应大于 0`)

  return { start, meta, usage, done, output, deltaCount }
}

async function postSse(pathname, body, label) {
  const response = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${pathname} 返回 ${response.status}：${text.slice(0, 300)}`)
  }
  return drainStream(response, label)
}

async function putSettings(body) {
  return requestJson('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function cleanupHttp() {
  if (!serverReady) {
    return
  }
  for (const id of createdRecordIds) {
    try {
      await fetch(`${BASE}/api/records/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    } catch {
      // 服务可能已经退出；隔离库随后整体删除
    }
  }
  for (const id of createdTemplateIds) {
    try {
      await fetch(`${BASE}/api/templates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    } catch {
      // 同上
    }
  }
  try {
    await fetch(`${BASE}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budgetMonthlyCny: null }),
    })
  } catch {
    // 同上
  }
}

try {
  log('准备', `隔离数据库 ${DATABASE_URL}`)
  removeE2eDb()
  runPnpm(['exec', 'prisma', 'db', 'push', '--skip-generate'])
  runPnpm(['db:seed'])

  if (await portInUse(PORT)) {
    throw new Error(`端口 ${PORT} 已被占用，先停掉占用进程再跑 E2E。`)
  }

  log('启动', `next dev :${PORT}，MOCK_LLM_FAULT=valid`)
  server = startServer()
  await waitForServer()
  serverReady = true

  const settings = await requestJson('/api/settings')
  assert.ok(settings?.settings, '设置接口应返回 settings')
  assert.ok(settings.settings.modelGenerate, '应包含生成模型槽位')
  assert.ok(settings.settings.modelOptimize, '应包含优化模型槽位')
  assert.equal(
    'modelEvaluate' in settings.settings,
    false,
    '设置接口不应再返回 modelEvaluate',
  )
  assert.equal(
    settings.settings.apiKey.configured,
    false,
    '干净的 E2E 库不应带密钥',
  )
  assert.ok(
    'budget' in settings,
    '设置接口应返回 budget',
  )
  log('设置', '生成与优化槽位存在，modelEvaluate 已移除')

  const generated = await postSse(
    '/api/generate',
    {
      mode: 'generate',
      targetType: 'text',
      sourceInput: REQUIREMENT,
      requestId: randomUUID(),
    },
    '生成',
  )
  createdRecordIds.push(generated.start.recordId)
  assert.ok(
    generated.meta.title.includes(RUN_TAG),
    `生成标题应包含运行标记：${generated.meta.title}`,
  )

  const library = await requestJson(
    `/api/records?q=${encodeURIComponent(RUN_TAG)}`,
  )
  assert.ok(Array.isArray(library?.records), '库列表应返回 records 数组')
  const listed = library.records.find(
    (record) => record.id === generated.start.recordId,
  )
  assert.ok(listed, '库列表应能查到刚生成的记录')
  assert.equal(listed.status, 'completed', '新记录应为 completed')
  assert.equal(listed.iterationCount, 1, '新记录应有一条迭代')
  log(
    '生成完成',
    `${generated.deltaCount} 段 delta，标题「${listed.title}」，库列表命中`,
  )

  const optimized = await postSse(
    '/api/generate',
    {
      mode: 'optimize',
      sourceInput: OPTIMIZE_SOURCE,
      instruction: '补上输出格式',
      requestId: randomUUID(),
    },
    '优化',
  )
  createdRecordIds.push(optimized.start.recordId)

  const continued = await postSse(
    `/api/records/${encodeURIComponent(optimized.start.recordId)}/optimize`,
    {
      instruction: '更简洁，保留数字',
      requestId: randomUUID(),
    },
    '继续优化',
  )
  assert.equal(
    continued.start.recordId,
    optimized.start.recordId,
    '继续优化应追加到同一条记录',
  )
  assert.notEqual(
    continued.start.iterationId,
    optimized.start.iterationId,
    '继续优化应创建新迭代',
  )

  const detail = await requestJson(
    `/api/records/${encodeURIComponent(optimized.start.recordId)}`,
  )
  const iterations = detail?.record?.iterations
  assert.ok(Array.isArray(iterations), '记录详情应包含迭代时间线')
  assert.equal(iterations.length, 2, '优化记录应有两条迭代')
  assert.deepEqual(
    iterations.map((iteration) => iteration.seq),
    [1, 2],
    '迭代序号应从 1 连续递增',
  )
  assert.equal(iterations[0].kind, 'optimize', '首轮应为优化')
  assert.equal(
    iterations[0].instruction,
    '补上输出格式',
    '首轮应保留优化要求',
  )
  assert.equal(iterations[1].kind, 'optimize', '第二轮应为继续优化')
  assert.equal(
    iterations[1].instruction,
    '更简洁，保留数字',
    '第二轮应保留继续优化要求',
  )
  assert.ok(iterations[0].output.trim().length > 0, '首轮正文不能为空')
  assert.ok(iterations[1].output.trim().length > 0, '第二轮正文不能为空')
  assert.equal(detail.record.iterationCount, 2, '记录应累计两条迭代')
  log('优化完成', '首轮优化 + 继续优化，详情包含两条迭代')

  const patched = await requestJson(
    `/api/records/${encodeURIComponent(generated.start.recordId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: true, rating: 5 }),
    },
  )
  assert.equal(patched?.record?.favorite, true, '收藏应即时生效')
  assert.equal(patched?.record?.rating, 5, '评分应即时生效')

  const favorites = await requestJson(
    `/api/records?q=${encodeURIComponent(RUN_TAG)}&filter=favorite`,
  )
  assert.ok(
    favorites.records.some(
      (record) => record.id === generated.start.recordId,
    ),
    '收藏筛选应命中刚收藏的记录',
  )

  await requestNoContent(
    `/api/records/${encodeURIComponent(generated.start.recordId)}`,
    { method: 'DELETE' },
  )
  const deletedDetail = await request(
    `/api/records/${encodeURIComponent(generated.start.recordId)}`,
  )
  assert.equal(deletedDetail.response.status, 404, '删除后详情应返回 404')
  log('收藏评分与删除', 'PATCH 即时生效，搜索命中，删除后详情 404')

  const templates = await requestJson('/api/templates')
  assert.ok(Array.isArray(templates?.templates), '模板列表应返回 templates 数组')
  assert.ok(templates.templates.length >= 12, '内置模板应至少 12 个')
  for (const category of ['text', 'image', 'video']) {
    assert.ok(
      templates.templates.filter((template) => template.category === category)
        .length >= 4,
      `${category} 类模板应至少 4 个`,
    )
  }

  const createdTemplate = await requestJson(
    '/api/templates',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'text',
        style: '测试',
        title: `${RUN_TAG} 自定义模板`,
        description: '端到端冒烟创建的临时模板。',
        body: '你是一名助理，请根据要点写周报，缺失信息写「未提供」。',
        mode: 'optimize',
      }),
    },
    201,
  )
  const templateId = createdTemplate?.template?.id
  assert.equal(typeof templateId, 'string', '创建模板应返回 id')
  assert.equal(
    createdTemplate.template.builtin,
    false,
    '自定义模板 builtin 应为 false',
  )
  createdTemplateIds.push(templateId)

  await requestNoContent(
    `/api/templates/${encodeURIComponent(templateId)}`,
    { method: 'DELETE' },
  )
  const templatesAfterDelete = await requestJson('/api/templates')
  assert.equal(
    templatesAfterDelete.templates.some(
      (template) => template.id === templateId,
    ),
    false,
    '删除后模板列表不应再出现该模板',
  )
  log('模板', `内置 ${templates.templates.length} 个，自定义模板创建后可删除`)

  const budget = await putSettings({ budgetMonthlyCny: 100 })
  assert.equal(budget?.budget?.monthlyCny, 100, '预算应保存为 100')

  const stats = await requestJson('/api/stats')
  assert.ok(stats?.month, '成本接口应返回本月 KPI')
  assert.equal(stats.month.budgetCny, 100, '统计应读到刚保存的预算')
  assert.ok(stats.month.calls >= 3, '三次模型调用都应进入本月账本')
  assert.ok(
    stats.byStage.some(
      (bucket) => bucket.key === 'generate' && bucket.calls > 0,
    ),
    '按阶段统计应包含生成',
  )
  assert.ok(
    stats.byStage.some(
      (bucket) => bucket.key === 'optimize' && bucket.calls > 0,
    ),
    '按阶段统计应包含优化',
  )
  assert.equal(stats.daily.length, 14, '趋势应返回 14 天')

  const clearedBudget = await putSettings({ budgetMonthlyCny: null })
  assert.equal(
    clearedBudget?.budget?.monthlyCny,
    null,
    '预算应可清除回未设置',
  )
  log(
    '成本',
    `本月调用 ${stats.month.calls} 次，预算 100 元可保存并清除`,
  )

  console.log('')
  console.log(
    '[e2e] 通过：设置 → 生成 → 优化 → 继续优化 → 收藏评分搜索 → 删除 → 模板增删 → 预算与统计',
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
  await cleanupHttp()
  await stopServer()
  removeE2eDb()
}
