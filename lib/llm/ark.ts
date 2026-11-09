import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions'
import type { ChatRequest, ThinkingMode } from './types'
import {
  OpenAICompatProvider,
  type OpenAICompatConfig,
  type OpenAIRequestParams,
} from './openai-compat'

/**
 * 火山方舟 provider。
 *
 * 数据面走 OpenAI 兼容协议，但方舟有四个扩展点必须在这里收口：
 * thinking、stream_options.include_usage、prompt_cache_key、service_tier。
 * 另外思维链字段 reasoning_content 也只在这一层出现，映射到 reasoningDelta，
 * 绝不进入正文。
 */

export interface ArkProviderConfig extends OpenAICompatConfig {}

interface ArkThinking {
  type: 'enabled' | 'disabled' | 'auto'
}

interface ArkRequestExtras {
  thinking?: ArkThinking
  prompt_cache_key?: string
  service_tier?: 'default' | 'fast' | 'flex' | 'scale'
  reasoning_effort?: string
}

interface ArkDelta {
  content?: string | null
  reasoning_content?: string | null
}

interface ArkChoice {
  delta?: ArkDelta
}

/** 业务层的 ThinkingMode 映射到方舟 thinking.type。默认显式关闭。 */
function mapThinking(mode: ThinkingMode | undefined): ArkThinking['type'] {
  switch (mode) {
    case 'on':
      return 'enabled'
    case 'auto':
      return 'auto'
    default:
      // 2.1 全系默认开启思维链；不显式 disabled 会让延迟和 token 翻倍。
      return 'disabled'
  }
}

export class ArkProvider extends OpenAICompatProvider {
  constructor(config: ArkProviderConfig) {
    super(config)
  }

  protected override buildBody(
    req: ChatRequest,
    stream: boolean,
  ): OpenAIRequestParams {
    const body = super.buildBody(req, stream)
    const extras = body as OpenAIRequestParams & ArkRequestExtras
    const thinkingType = mapThinking(req.thinking)

    extras.thinking = { type: thinkingType }
    if (req.reasoningEffort && thinkingType !== 'disabled') {
      extras.reasoning_effort = req.reasoningEffort
    }
    if (req.cacheKey) {
      extras.prompt_cache_key = req.cacheKey
    }
    extras.service_tier = req.serviceTier ?? 'default'

    return body
  }

  protected override extractReasoningDelta(
    chunk: ChatCompletionChunk,
  ): string | undefined {
    const choices = chunk.choices as unknown as readonly ArkChoice[] | undefined
    const reasoning = choices?.[0]?.delta?.reasoning_content
    return typeof reasoning === 'string' && reasoning.length > 0 ? reasoning : undefined
  }

  protected override extractReasoningFromMessage(
    message: ChatCompletion['choices'][number]['message'],
  ): string | undefined {
    const reasoning = (
      message as unknown as { reasoning_content?: unknown }
    ).reasoning_content
    return typeof reasoning === 'string' && reasoning.length > 0 ? reasoning : undefined
  }
}
