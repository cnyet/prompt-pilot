/**
 * 模型 ID 到界面显示名的映射；未知 ID 原样显示。
 *
 * 单独成模块，避免客户端组件为了显示一个模型名而引入 registry 的
 * `node:crypto` 与 provider 依赖。
 */
export const MODEL_DISPLAY_LABELS: Readonly<Record<string, string>> = {
  'deepseek-v4.1-flash': 'DeepSeek V4.1 Flash',
  'gpt-5.6-luna': 'GPT 5.6 Luna',
}

export function modelDisplayLabel(modelId: string): string {
  return MODEL_DISPLAY_LABELS[modelId] ?? modelId
}
