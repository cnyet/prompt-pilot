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
  // 工作台（Task 5）
  'studio.mode.label': '处理模式',
  'studio.mode.generate': '生成',
  'studio.mode.optimize': '优化',
  'studio.target.label': '目标类型',
  'studio.target.text': '文本',
  'studio.target.image': '图片',
  'studio.target.video': '视频',
  'studio.source.generateLabel': '需求',
  'studio.source.optimizeLabel': '已有提示词',
  'studio.source.generatePlaceholder': '描述你想要的结果，例如：帮我写个周报',
  'studio.source.optimizePlaceholder': '粘贴已有提示词，生成优化后的版本',
  'studio.instruction.label': '优化要求',
  'studio.instruction.placeholder': '可选，说明这次想改什么，例如：更严格',
  'studio.count': '{count} / {limit} 字',
  'studio.count.over': '已超出上限，请删减到 {limit} 字以内',
  'studio.hint.shortcuts': '⌘Enter 提交，Esc 停止',
  'studio.primary.generate': '生成',
  'studio.primary.optimize': '优化',
  'studio.stop': '停止',
  'studio.unavailable.generate': '未配置可用的生成模型，先到设置页接入模型',
  'studio.unavailable.optimize': '未配置可用的优化模型，先到设置页接入模型',
  'studio.settingsLink': '去设置',
  'studio.result.label': '结果',
  'studio.result.empty': '给出需求或粘贴提示词，结果会显示在这里。',
  'studio.result.status.starting': '正在生成',
  'studio.result.status.streaming': '正在生成',
  'studio.result.status.canceling': '正在停止',
  'studio.result.status.canceled': '已中断，已生成的内容保留在这里',
  'studio.result.status.completed': '已完成',
  'studio.result.status.failed': '这次没有生成成功，可以重试',
  'studio.result.status.settling': '正在读取用量',
  'studio.result.view.label': '结果视图',
  'studio.result.view.rendered': '渲染',
  'studio.result.view.source': '源码',
  'studio.meta.model': '模型',
  'studio.meta.latency': '耗时',
  'studio.meta.tokensIn': '输入 token',
  'studio.meta.tokensOut': '输出 token',
  'studio.meta.cost': '估算费用',
  'studio.meta.saveFailed': '收藏或评分没有保存成功，请重试',
  'studio.actions.copy': '复制 Markdown',
  'studio.actions.copyPlain': '复制纯文本',
  'studio.actions.download': '下载 .md',
  'studio.actions.regenerate': '重新生成',
  'studio.actions.favorite': '收藏',
  'studio.actions.unfavorite': '取消收藏',
  'studio.actions.copied': '已复制 Markdown',
  'studio.actions.copiedPlain': '已复制纯文本',
  'studio.actions.downloaded': '已下载 .md',
  'studio.actions.copyFailed': '复制失败，请手动选择文本',
  'studio.actions.downloadFailed': '下载失败，请稍后重试',
  'studio.saved': '已存入提示词库',
  'studio.saved.libraryLink': '查看提示词库',
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
