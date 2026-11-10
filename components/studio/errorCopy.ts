/**
 * 模型错误的界面文案。
 *
 * 服务端会把错误码与厂商原始信息一起送上来，但「失败」两个字对用户没有
 * 用。这里按错误码收敛成三类固定结构：发生了什么、为什么、怎么办。
 * 网络失败、限流、额度用尽是最常见的三种，文案必须能直接指导下一步。
 *
 * 纯函数，不读环境、不发请求，生成与试运行共用同一套口径。
 */

export type ModelErrorKind =
  | 'network'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'auth'
  | 'forbidden'
  | 'overloaded'
  | 'server'
  | 'timeout'
  | 'content_filter'
  | 'invalid_output'
  | 'unknown'

export interface ModelErrorCopy {
  kind: ModelErrorKind
  /** 一句话说清发生了什么，用作标题。 */
  title: string
  /** 为什么发生。 */
  detail: string
  /** 用户现在可以做什么。 */
  action: string
  /** 原因与下一步合成的一段，给只有 message/hint 两栏的旧组件用。 */
  hint: string
  /** 标题、原因与下一步拼成的一行文案，用于只有单行位置。 */
  line: string
  retryable: boolean
}

interface CopyParts {
  title: string
  detail: string
  action: string
  retryable: boolean
}

const COPY: Readonly<Record<Exclude<ModelErrorKind, 'unknown'>, CopyParts>> = {
  network: {
    title: '连接模型服务失败',
    detail: '请求没有抵达模型服务，可能是网络中断、代理拦截或服务没有启动。',
    action: '检查网络连接后重试；已经生成的内容会保留，不需要从头再来。',
    retryable: true,
  },
  rate_limited: {
    title: '请求被限流',
    detail: '当前请求频率超过了账号或模型的限流阈值，模型暂时没有处理这次请求。',
    action: '等待约 30 秒后重试；持续失败时降低并发生成频率，或在方舟控制台提升配额。',
    retryable: true,
  },
  quota_exceeded: {
    title: '调用额度已用尽',
    detail: '当前账号的模型调用额度不足或已到期，继续重试不会成功。',
    action: '在方舟控制台充值或调整配额，然后回来点「重试未生成字段」。',
    retryable: true,
  },
  auth: {
    title: '模型认证失败',
    detail: 'ARK_API_KEY 缺失、写错或已经过期。',
    action: '在设置页确认密钥已经配置，然后重新生成或试运行。',
    retryable: true,
  },
  forbidden: {
    title: '无权访问该模型',
    detail: '模型没有开通，或账号存在欠费。',
    action: '在方舟控制台确认模型已开通并结清欠费，然后重试。',
    retryable: true,
  },
  overloaded: {
    title: '模型服务繁忙',
    detail: '当前时段请求量过高，服务暂时无法承接这次请求。',
    action: '稍等片刻后重试；持续失败时放缓生成节奏。',
    retryable: true,
  },
  server: {
    title: '模型服务端错误',
    detail: '服务端出现临时故障，本次请求没有完成。',
    action: '稍后重试；如果持续失败，检查服务端日志与模型配置。',
    retryable: true,
  },
  timeout: {
    title: '模型响应超时',
    detail: '等待超过预期时间仍没有收到新内容，连接可能已经卡住。',
    action: '重试本次操作；已经生成的内容会保留。',
    retryable: true,
  },
  content_filter: {
    title: '内容触发安全策略',
    detail: '输入或输出命中了平台的内容安全规则，模型没有返回结果。',
    action: '改写需求中可能敏感的表述后重试。',
    retryable: false,
  },
  invalid_output: {
    title: '模型没有返回可用内容',
    detail: '模型输出为空，或格式不符合约定。',
    action: '重试本次操作；反复失败时换用支持结构化输出的模型。',
    retryable: true,
  },
}

function unknownCopy(fallback: string | undefined): CopyParts {
  const title = fallback?.trim()
  const hasGuidance = title?.includes('怎么办') === true
  return {
    title: title && title.length > 0 ? title : '模型调用失败',
    detail:
      title && title.length > 0
        ? ''
        : '服务返回了未归类的错误，本次请求没有完成。',
    action: hasGuidance
      ? ''
      : '稍后重试；如果持续失败，检查服务端日志与模型配置。',
    retryable: true,
  }
}

function buildCopy(kind: ModelErrorKind, parts: CopyParts): ModelErrorCopy {
  const line = parts.detail.length > 0
    ? `${parts.title}。${parts.detail}${parts.action}`
    : `${parts.title}。${parts.action}`
  return {
    kind,
    title: parts.title,
    detail: parts.detail,
    action: parts.action,
    hint: `${parts.detail}${parts.action}`,
    line,
    retryable: parts.retryable,
  }
}

/** 错误码可能来自 SSE 的 LLM_*、厂商 code 或本地兜底码，统一按关键词归档。 */
export function modelErrorKind(
  code: string | null | undefined,
  status?: number,
): ModelErrorKind {
  const normalized = (code ?? '').toLowerCase()
  // NO_MODEL 不是服务端故障，保留服务端给出的原因，不要误报成 5xx。
  if (/no.?model|no.?available/.test(normalized)) {
    return 'unknown'
  }
  if (/quota|insufficient|balance|arrear/.test(normalized)) {
    return 'quota_exceeded'
  }
  if (/rate|throttl|too.?many|burst/.test(normalized)) {
    return 'rate_limited'
  }
  if (/network|connect|offline|econn|fetch/.test(normalized)) {
    return 'network'
  }
  if (/auth|unauthor|api.?key|401/.test(normalized)) {
    return 'auth'
  }
  if (/forbidden|permission|403/.test(normalized)) {
    return 'forbidden'
  }
  if (/overload|busy|serveroverload|model.?loading/.test(normalized)) {
    return 'overloaded'
  }
  if (/timeout|timed.?out|stall|超时/.test(normalized)) {
    return 'timeout'
  }
  if (/content.?filter|sensitive|安全/.test(normalized)) {
    return 'content_filter'
  }
  if (/invalid.?output|empty.?output|截断/.test(normalized)) {
    return 'invalid_output'
  }
  if (/server|internal|5\d\d/.test(normalized)) {
    return 'server'
  }

  if (status === 401) {
    return 'auth'
  }
  if (status === 403) {
    return 'forbidden'
  }
  if (status === 408 || status === 504) {
    return 'timeout'
  }
  if (status === 429) {
    return 'rate_limited'
  }
  if (status !== undefined && status >= 500) {
    return 'server'
  }
  if (status === 0) {
    return 'network'
  }
  return 'unknown'
}

/**
 * 按 SSE 错误码或 HTTP 状态生成文案。
 * `detail` 只在无法归类时作为标题兜底，避免把厂商原文重复说两遍。
 */
export function describeModelError(
  code: string | null | undefined,
  fallback?: string,
  status?: number,
): ModelErrorCopy {
  const kind = modelErrorKind(code, status)
  if (kind === 'unknown') {
    const parts = unknownCopy(fallback)
    if (status === 400 || status === 422) {
      parts.action = '检查输入内容后重试。'
    } else if (status === 409) {
      parts.action = '刷新当前内容后重试。'
    }
    return buildCopy(kind, parts)
  }
  return buildCopy(kind, COPY[kind])
}

/** 网络请求在 fetch 阶段就失败时使用，不带厂商 code。 */
export function describeNetworkFailure(): ModelErrorCopy {
  return buildCopy('network', COPY.network)
}
