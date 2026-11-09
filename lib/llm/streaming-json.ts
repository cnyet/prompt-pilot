/**
 * 增量 JSON 解析器。
 *
 * 服务端消费 provider.stream() 的文本增量时，需要在一段 JSON 还没写完时
 * 就尽可能早地拿到「已经完整闭合的字符串字段」。本解析器按字符推进状态机：
 *
 * - 只对已经闭合的标量发事件，未闭合的字符串不会提前吐出半个值；
 * - 每次 push 返回从上次以来新完成的事件，done 之前不重复发；
 * - 遇到无法恢复的语法错误立即失败，由调用方回退到整段解析；
 * - 不依赖 JSON.parse 之外的第三方库，也不修改输入。
 *
 * 事件里的 path 是 JSON 结构路径，例如 role.persona 对应
 * ['role', 'persona']，objective.successCriteria 的第一项对应
 * ['objective', 'successCriteria', 0]。
 */

export type JsonPathSegment = string | number

export interface StreamingJsonValueEvent {
  kind: 'value'
  path: readonly JsonPathSegment[]
  /** 已完成闭合的标量；字符串字段是这里最常见的形态。 */
  value: string | number | boolean | null
}

export interface StreamingJsonContainerEvent {
  kind: 'container'
  path: readonly JsonPathSegment[]
  /** 已完成闭合的对象或数组。 */
  value: unknown
}

export type StreamingJsonEvent =
  | StreamingJsonValueEvent
  | StreamingJsonContainerEvent

export type StreamingJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string }

type ObjectState = 'key' | 'colon' | 'value' | 'comma'
type ArrayState = 'value' | 'comma'

interface ObjectFrame {
  kind: 'object'
  path: readonly JsonPathSegment[]
  value: Record<string, unknown>
  state: ObjectState
  key: string | null
}

interface ArrayFrame {
  kind: 'array'
  path: readonly JsonPathSegment[]
  value: unknown[]
  state: ArrayState
  index: number
}

type Frame = ObjectFrame | ArrayFrame

function isWhitespace(char: string | undefined): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t'
}

function isValueDelimiter(char: string | undefined): boolean {
  return (
    char === undefined ||
    isWhitespace(char) ||
    char === ',' ||
    char === '}' ||
    char === ']'
  )
}

function describeChar(char: string | undefined): string {
  if (char === undefined) {
    return '输入结束'
  }
  return `字符 ${JSON.stringify(char)}`
}

export class StreamingJsonParser {
  private buffer = ''
  private cursor = 0
  private stack: Frame[] = []
  private rootValue: unknown
  private rootComplete = false
  private failure: string | null = null

  get failed(): boolean {
    return this.failure !== null
  }

  get error(): string | null {
    return this.failure
  }

  get text(): string {
    return this.buffer
  }

  /** 追加一段文本，返回这次新完成的事件。 */
  push(chunk: string): StreamingJsonEvent[] {
    if (this.failure !== null) {
      return []
    }
    this.buffer += chunk
    return this.run(false)
  }

  /** 结束输入。只有根值完整闭合且没有多余字符时才算成功。 */
  finish(): StreamingJsonResult {
    if (this.failure === null) {
      this.run(true)
    }
    if (this.failure !== null) {
      return { ok: false, error: this.failure }
    }
    if (!this.rootComplete) {
      return { ok: false, error: 'JSON 在根值闭合前结束。' }
    }
    return { ok: true, value: this.rootValue }
  }

  private fail(message: string): void {
    if (this.failure === null) {
      this.failure = `${message}（第 ${this.cursor + 1} 个字符附近）`
    }
  }

  private current(): string | undefined {
    return this.buffer[this.cursor]
  }

  private top(): Frame | undefined {
    return this.stack[this.stack.length - 1]
  }

  private skipWhitespace(): void {
    while (isWhitespace(this.current())) {
      this.cursor += 1
    }
  }

  private run(final: boolean): StreamingJsonEvent[] {
    const events: StreamingJsonEvent[] = []

    while (this.failure === null) {
      this.skipWhitespace()
      if (!final && this.cursor >= this.buffer.length) {
        // 当前分块正好停在结构中间，等下一块再继续判断。
        break
      }
      const frame = this.top()

      if (!frame) {
        if (this.rootComplete) {
          if (this.cursor < this.buffer.length) {
            this.fail('根值闭合后还有多余内容')
          }
          break
        }
        const outcome = this.consumeValue([], final, events)
        if (outcome.status === 'need-more' || outcome.status === 'failed') {
          break
        }
        if (outcome.status === 'container') {
          continue
        }
        this.rootValue = outcome.value
        this.rootComplete = true
        events.push({ kind: 'value', path: [], value: outcome.value })
        continue
      }

      if (frame.kind === 'object') {
        if (frame.state === 'key') {
          const char = this.current()
          if (char === '}') {
            this.cursor += 1
            this.closeFrame(events)
            continue
          }
          if (char !== '"') {
            this.fail(`对象键需要双引号，实际是${describeChar(char)}`)
            break
          }
          const key = this.consumeString()
          if (key.status === 'need-more' || key.status === 'failed') {
            break
          }
          frame.key = key.value
          frame.state = 'colon'
          continue
        }

        if (frame.state === 'colon') {
          if (this.current() !== ':') {
            this.fail(`对象键后需要冒号，实际是${describeChar(this.current())}`)
            break
          }
          this.cursor += 1
          frame.state = 'value'
          continue
        }

        if (frame.state === 'value') {
          const key = frame.key
          if (key === null) {
            this.fail('对象值缺少键名')
            break
          }
          const outcome = this.consumeValue([...frame.path, key], final, events)
          if (outcome.status === 'need-more' || outcome.status === 'failed') {
            break
          }
          if (outcome.status === 'container') {
            continue
          }
          frame.value[key] = outcome.value
          frame.key = null
          frame.state = 'comma'
          events.push({ kind: 'value', path: [...frame.path, key], value: outcome.value })
          continue
        }

        if (this.current() === ',') {
          this.cursor += 1
          frame.state = 'key'
          continue
        }
        if (this.current() === '}') {
          this.cursor += 1
          this.closeFrame(events)
          continue
        }
        this.fail(`对象成员之间需要逗号或右括号，实际是${describeChar(this.current())}`)
        break
      }

      if (frame.state === 'value') {
        if (this.current() === ']') {
          this.cursor += 1
          this.closeFrame(events)
          continue
        }
        const outcome = this.consumeValue(
          [...frame.path, frame.index],
          final,
          events,
        )
        if (outcome.status === 'need-more' || outcome.status === 'failed') {
          break
        }
        if (outcome.status === 'container') {
          continue
        }
        frame.value[frame.index] = outcome.value
        events.push({
          kind: 'value',
          path: [...frame.path, frame.index],
          value: outcome.value,
        })
        frame.index += 1
        frame.state = 'comma'
        continue
      }

      if (this.current() === ',') {
        this.cursor += 1
        frame.state = 'value'
        continue
      }
      if (this.current() === ']') {
        this.cursor += 1
        this.closeFrame(events)
        continue
      }
      this.fail(`数组元素之间需要逗号或右括号，实际是${describeChar(this.current())}`)
      break
    }

    return events
  }

  /** 消费一个值；容器只压栈，标量返回解析结果。 */
  private consumeValue(
    path: readonly JsonPathSegment[],
    final: boolean,
    events: StreamingJsonEvent[],
  ):
    | { status: 'ok'; value: string | number | boolean | null }
    | { status: 'container' }
    | { status: 'need-more' }
    | { status: 'failed' } {
    const char = this.current()

    if (char === '{') {
      this.cursor += 1
      this.stack.push({ kind: 'object', path, value: {}, state: 'key', key: null })
      return { status: 'container' }
    }
    if (char === '[') {
      this.cursor += 1
      this.stack.push({ kind: 'array', path, value: [], state: 'value', index: 0 })
      return { status: 'container' }
    }
    if (char === '"') {
      const parsed = this.consumeString()
      if (parsed.status === 'need-more') {
        return { status: 'need-more' }
      }
      if (parsed.status === 'failed') {
        return { status: 'failed' }
      }
      return { status: 'ok', value: parsed.value }
    }

    const token = this.consumeBareToken(final)
    if (token === 'need-more') {
      return { status: 'need-more' }
    }
    if (token === 'failed') {
      return { status: 'failed' }
    }

    if (token === 'true') {
      return { status: 'ok', value: true }
    }
    if (token === 'false') {
      return { status: 'ok', value: false }
    }
    if (token === 'null') {
      return { status: 'ok', value: null }
    }
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)) {
      this.fail(`无法识别的字面量 ${JSON.stringify(token)}`)
      return { status: 'failed' }
    }
    const number = Number(token)
    if (Number.isNaN(number)) {
      this.fail(`无法解析的数字 ${JSON.stringify(token)}`)
      return { status: 'failed' }
    }
    return { status: 'ok', value: number }
  }

  private consumeString():
    | { status: 'ok'; value: string }
    | { status: 'need-more' }
    | { status: 'failed' } {
    let escaped = false
    for (let index = this.cursor + 1; index < this.buffer.length; index += 1) {
      const char = this.buffer[index]
      if (char === undefined) {
        break
      }
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') {
        const raw = this.buffer.slice(this.cursor, index + 1)
        try {
          const value: unknown = JSON.parse(raw)
          if (typeof value !== 'string') {
            this.fail('字符串解析结果不是字符串')
            return { status: 'failed' }
          }
          this.cursor = index + 1
          return { status: 'ok', value }
        } catch {
          this.fail('字符串包含无法解析的转义序列')
          return { status: 'failed' }
        }
      }
    }
    return { status: 'need-more' }
  }

  private consumeBareToken(final: boolean): string | 'need-more' | 'failed' {
    let end = this.cursor
    while (end < this.buffer.length) {
      const char = this.buffer[end]
      if (isValueDelimiter(char)) {
        break
      }
      end += 1
    }

    if (end >= this.buffer.length && !final) {
      return 'need-more'
    }

    const token = this.buffer.slice(this.cursor, end)
    if (token.length === 0) {
      this.fail('这里需要一个值')
      return 'failed'
    }
    this.cursor = end
    return token
  }

  private closeFrame(events: StreamingJsonEvent[]): void {
    const frame = this.stack.pop()
    if (!frame) {
      return
    }
    events.push({ kind: 'container', path: frame.path, value: frame.value })

    const parent = this.top()
    if (!parent) {
      this.rootValue = frame.value
      this.rootComplete = true
      return
    }

    if (parent.kind === 'object') {
      const key = parent.key
      if (key === null) {
        this.fail('对象值缺少键名')
        return
      }
      parent.value[key] = frame.value
      parent.key = null
      parent.state = 'comma'
      return
    }

    parent.value[parent.index] = frame.value
    parent.index += 1
    parent.state = 'comma'
  }
}
