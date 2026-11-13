/**
 * 全站中文文案字典（NFR-9）。
 *
 * 扁平键对象，`t(key)` 按原键取值，不做嵌套查找；键名稳定，后续任务只追加，
 * 不改写已有值。`{name}` 形式是占位符，缺少对应参数时保留占位符原文。
 *
 * 文案约束：不用感叹号、emoji 与 em dash（未知值 `—` 是唯一例外），
 * 不写「强大」「智能」这类空词。
 */
export const zh = {
  'common.unknown': '—',
  'common.copy': '复制',
  'common.copied': '已复制',
  'common.download': '下载',
  'common.cancel': '取消',
  'common.retry': '重试',
  'common.close': '关闭',
  'common.unrated': '未评分',
  'rating.label': '评分',
  'rating.clear': '清除评分',
  'rating.starAria': '{value} 星',
  'download.defaultTitle': '提示词',
  'error.network': '网络连接失败，请检查网络后重试',
  'error.requestFailed': '请求失败，请重试',
  'error.noModel': '尚未配置可用模型，请到设置页配置',
  'error.inFlight': '已有请求进行中，请等待完成',
  'error.notReady': '当前内容还不能操作，请稍后再试',
} as const

export type MessageKey = keyof typeof zh

export function t(
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template: string = zh[key]
  if (!params) {
    return template
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}
