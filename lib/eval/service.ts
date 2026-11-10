import { getPrisma } from '@/lib/db/prisma'
import { getPromptDetail, type PromptVersionDetail } from '@/lib/db/prompts'
import { renderSchemaMarkdown } from '@/lib/engine/render'
import { instrumentProvider, resolveTraceId } from '@/lib/llm/ledger'
import {
  DEFAULT_EVALUATE_MODEL_CONFIG_ID,
  DEFAULT_GENERATE_MODEL_CONFIG_ID,
  createProvider,
  getDefaultModelConfig,
  getGenerateProvider,
} from '@/lib/llm/registry'
import { getEffectiveLlmEnv } from '@/lib/settings/store'
import type { ChatRequest, LLMProvider } from '@/lib/llm/types'
import {
  buildJudgeMessages,
  parseJudgeResult,
  summarizeEval,
  type Comparison,
  type CriterionInput,
  type Verdict,
} from './judge'

export const MIN_SAMPLES = 1
export const MAX_SAMPLES = 5

export class EvalError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status: number, message: string) {
    super(message)
    this.name = 'EvalError'
    this.code = code
    this.status = status
  }
}

export interface EvalProviders {
  generate: LLMProvider
  judge: LLMProvider | null
}

export interface EvalInput {
  promptId: string
  versionId?: string
  samples: readonly string[]
  name?: string
}

export interface EvalSampleResult {
  input: string
  targetOutput: string
  baselineOutput: string | null
  comparison: Comparison | null
  tokensIn: number | null
  tokensOut: number | null
}

export interface EvalResult {
  taskId: string
  name: string
  status: 'completed' | 'needs_review'
  versionId: string
  baselineVersionId: string | null
  criteria: string[]
  samples: EvalSampleResult[]
  passRate: number | null
  winRate: number | null
  counts: Record<string, number>
  judgedSamples: number
  createdAt: string
}

function normalizeSamples(samples: readonly string[]): string[] {
  const cleaned = samples
    .map((sample) => sample.trim())
    .filter((sample) => sample.length > 0)
  if (cleaned.length < MIN_SAMPLES) {
    throw new EvalError('NO_SAMPLES', 400, '至少需要 1 条样本输入。')
  }
  if (cleaned.length > MAX_SAMPLES) {
    throw new EvalError(
      'TOO_MANY_SAMPLES',
      400,
      `一次最多 ${MAX_SAMPLES} 条样本，多了成本和等待都会失控。`,
    )
  }
  return cleaned
}

function systemPromptOf(version: PromptVersionDetail): string {
  if (version.schema) {
    return renderSchemaMarkdown(version.schema)
  }
  return version.renderedText
}

async function buildProviders(): Promise<EvalProviders> {
  const env = await getEffectiveLlmEnv()
  const generate = getGenerateProvider(env, {
    fetch: globalThis.fetch,
  })
  if (!generate) {
    throw new EvalError(
      'NO_MODEL',
      503,
      '没有可用模型：配置 ARK_API_KEY 后再跑评估。',
    )
  }

  const evaluateConfig = getDefaultModelConfig('evaluate', env)
  const judge = evaluateConfig
    ? createProvider(evaluateConfig, env, { fetch: globalThis.fetch })
    : null

  return { generate, judge }
}

function evalChatRequest(
  modelConfigId: string,
  messages: ChatRequest['messages'],
): ChatRequest {
  return {
    modelConfigId,
    messages,
    temperature: 0.7,
    maxTokens: 1200,
    thinking: 'off',
  }
}

/** 跑一条样本：把版本正文作为 system，样本输入作为 user */
async function runSample(
  provider: LLMProvider,
  version: PromptVersionDetail,
  sample: string,
): Promise<{ output: string; tokensIn: number | null; tokensOut: number | null }> {
  const result = await provider.chat(
    evalChatRequest(DEFAULT_GENERATE_MODEL_CONFIG_ID, [
      { role: 'system', content: systemPromptOf(version) },
      { role: 'user', content: sample },
    ]),
  )
  return {
    output: result.text,
    tokensIn: result.usage?.tokensIn ?? null,
    tokensOut: result.usage?.tokensOut ?? null,
  }
}

export async function runEvaluation(
  input: EvalInput,
  deps: { providers?: EvalProviders } = {},
): Promise<EvalResult> {
  const prisma = getPrisma()
  if (!prisma) {
    throw new EvalError('NO_DATABASE', 503, '数据库不可用，评估无法保存。')
  }

  const samples = normalizeSamples(input.samples)
  const detail = await getPromptDetail(input.promptId)
  if (!detail) {
    throw new EvalError('PROMPT_NOT_FOUND', 404, '找不到这条提示词。')
  }

  const target =
    detail.versions.find((version) => version.id === input.versionId) ??
    detail.versions.find((version) => version.id === detail.currentVersionId) ??
    detail.versions[detail.versions.length - 1]
  if (!target) {
    throw new EvalError('VERSION_NOT_FOUND', 404, '这条提示词还没有可评估的版本。')
  }

  const baseline =
    target.versionNo === 0
      ? null
      : (detail.versions.find((version) => version.isBaseline) ?? null)

  const criteria: CriterionInput[] = (
    target.schema?.objective.successCriteria ?? []
  ).map((text, index) => ({ index: index + 1, text }))

  const providers = deps.providers ?? (await buildProviders())
  const traceId = resolveTraceId(undefined)

  const generate = instrumentProvider(providers.generate, {
    traceId,
    stage: 'evaluate',
    provider: providers.generate.id,
    modelId: input.promptId,
    thinking: 'off',
  })
  const judge = providers.judge
    ? instrumentProvider(providers.judge, {
        traceId,
        stage: 'evaluate',
        provider: providers.judge.id,
        modelId: `${input.promptId}#judge`,
        thinking: 'off',
      })
    : null

  const results: EvalSampleResult[] = []
  const verdicts: Verdict[] = []
  const comparisons: Comparison[] = []
  const checkRows: Array<{
    sampleIndex: number
    criterionIndex: number
    criterionText: string
    status: Verdict
    note: string | null
  }> = []

  for (const [sampleIndex, sample] of samples.entries()) {
    const targetRun = await runSample(generate, target, sample)
    const baselineRun = baseline
      ? await runSample(generate, baseline, sample)
      : null

    let comparison: Comparison | null = null
    if (judge && criteria.length > 0) {
      // 判定失败不让整次评估失败：记为空判定，页面显示「未判定」
      try {
        const judged = await judge.chat({
          modelConfigId: DEFAULT_EVALUATE_MODEL_CONFIG_ID,
          messages: buildJudgeMessages({
            criteria,
            targetOutput: targetRun.output,
            baselineOutput: baselineRun?.output ?? null,
          }),
          temperature: 0,
          maxTokens: 800,
          thinking: 'off',
        })
        const parsed = parseJudgeResult(judged.text)
        comparison = parsed.comparison
        if (comparison) {
          comparisons.push(comparison)
        }
        for (const verdict of parsed.verdicts) {
          const criterion = criteria.find(
            (item) => item.index === verdict.criterionIndex,
          )
          if (!criterion) {
            continue
          }
          verdicts.push(verdict.verdict)
          checkRows.push({
            sampleIndex,
            criterionIndex: verdict.criterionIndex,
            criterionText: criterion.text,
            status: verdict.verdict,
            note: verdict.note,
          })
        }
      } catch {
        comparison = null
      }
    }

    results.push({
      input: sample,
      targetOutput: targetRun.output,
      baselineOutput: baselineRun?.output ?? null,
      comparison,
      tokensIn:
        targetRun.tokensIn === null && (baselineRun?.tokensIn ?? null) === null
          ? null
          : (targetRun.tokensIn ?? 0) + (baselineRun?.tokensIn ?? 0),
      tokensOut:
        targetRun.tokensOut === null && (baselineRun?.tokensOut ?? null) === null
          ? null
          : (targetRun.tokensOut ?? 0) + (baselineRun?.tokensOut ?? 0),
    })
  }

  const summary = summarizeEval({ verdicts, comparisons })
  const status: EvalResult['status'] =
    verdicts.length === 0 && comparisons.length === 0
      ? 'needs_review'
      : 'completed'

  const resultPayload = {
    versionNo: target.versionNo,
    baselineVersionNo: baseline?.versionNo ?? null,
    samples: results,
    summary,
  }

  const task = await prisma.evalTask.create({
    data: {
      name: input.name?.trim() || `${detail.title} · v${target.versionNo}`,
      mode: baseline ? 'baseline' : 'batch',
      baselineVersionId: baseline?.id ?? null,
      criteriaJson: JSON.stringify(criteria.map((item) => item.text)),
      versionIds: JSON.stringify([target.id]),
      sampleCount: samples.length,
      samplesJson: JSON.stringify(samples),
      status,
      judgeModelId: providers.judge?.id ?? null,
      winRate: summary.winRate,
      resultJson: JSON.stringify(resultPayload),
      finishedAt: new Date(),
    },
  })

  if (checkRows.length > 0) {
    await prisma.criterionCheck.createMany({
      data: checkRows.map((row) => ({
        evalTaskId: task.id,
        versionId: target.id,
        sampleIndex: row.sampleIndex,
        criterionIndex: row.criterionIndex,
        criterionText: row.criterionText,
        status: row.status,
        note: row.note,
      })),
    })
  }

  return {
    taskId: task.id,
    name: task.name,
    status,
    versionId: target.id,
    baselineVersionId: baseline?.id ?? null,
    criteria: criteria.map((item) => item.text),
    samples: results,
    passRate: summary.passRate,
    winRate: summary.winRate,
    counts: summary.counts as unknown as Record<string, number>,
    judgedSamples: summary.judgedSamples,
    createdAt: task.createdAt.toISOString(),
  }
}
