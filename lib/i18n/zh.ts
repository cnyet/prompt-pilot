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
  'check.r101.message': '模糊要求「{term}」',
  'check.r101.reason': '模糊词没有给出可判断的标准，模型只能自行猜测。',
  'check.r101.suggestion': '把「{term}」换成具体数值、范围或可核对的标准。',
  'check.r102.message': '约束互相矛盾：{a} 与 {b}',
  'check.r102.reason': '同一份提示词给出互斥要求，模型只能满足其中一条。',
  'check.r102.suggestion': '删掉其中一条，或写明两条各自的适用条件。',
  'check.r103.message': '缺少输出格式要求',
  'check.r103.reason': '没有说明输出结构，模型会自行决定用什么格式。',
  'check.r103.suggestion': '补充输出格式，例如分点、表格或 Markdown 小节。',
  'check.r104.message': '缺少角色或背景',
  'check.r104.reason': '没有说明以什么身份处理什么任务，回答容易停留在通用层面。',
  'check.r104.suggestion': '补充角色或背景，例如「你是一名运营，读者是管理层」。',
  'check.r105.message': '缺少边界与信息不足时的处理方式',
  'check.r105.reason': '没有说明禁止事项，也没有说明信息不足时该提问还是先假设。',
  'check.r105.suggestion': '补充边界，并写明信息不足时先提问还是按假设继续。',
  'check.r106.message': '存在提示词注入风险',
  'check.r106.reason': '内容要求忽略既有指令或泄露系统提示，执行时可能被带偏。',
  'check.r107.message': '重复要求',
  'check.r107.reason': '同一条要求出现多次，模型可能重复执行或误判权重。',
  'check.r108.message': '篇幅异常：{length} 字',
  'check.r108.reason': '长度明显偏离常见范围，过短缺少信息，过长会稀释重点并增加成本。',
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
