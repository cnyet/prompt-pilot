/**
 * 内置模板 seed。
 *
 * 12 条内置模板按 slug 幂等 upsert：重复执行只恢复内容，不新增行；
 * 自定义模板（slug=null）不受影响。
 *
 * Node >= 24 可直接执行本文件（原生 TS 类型擦除）：
 *   pnpm db:seed
 * 被测试导入时 main guard 不触发。
 */
import { PrismaClient } from '@prisma/client'
import { pathToFileURL } from 'node:url'

export type BuiltinTemplateCategory = 'text' | 'image' | 'video'
export type BuiltinTemplateMode = 'generate' | 'optimize'

export interface BuiltinTemplateSeed {
  slug: string
  category: BuiltinTemplateCategory
  style: string
  title: string
  description: string
  body: string
  mode: BuiltinTemplateMode
  exampleInput: string | null
  featured: boolean
}

export const BUILTIN_TEMPLATES: BuiltinTemplateSeed[] = [
  {
    slug: 'weekly-report',
    category: 'text',
    style: '公文',
    title: '周报助手',
    description: '把一周零散记录整理成结构清楚、有结果数字的周报。',
    body: '你是一名注重事实的行政助理。根据我提供的一周工作记录写一份中文周报，结构固定：本周完成（3 到 5 条，动词开头，带可核对的数字）、进行中、下周计划、风险与需要的支持。只使用我给出的信息，缺失写「未提供」，不编造。语言简洁，不用感叹号，不写空话。',
    mode: 'generate',
    exampleInput:
      '本周完成新版落地页上线，转化率提升 12%；排查支付回调超时并修复；和设计确认国庆活动物料。下周计划活动页联调。',
    featured: true,
  },
  {
    slug: 'xiaohongshu-seeding',
    category: 'text',
    style: '营销',
    title: '小红书种草',
    description: '把产品卖点写成自然口语、有具体场景的种草笔记。',
    body: '你是小红书内容编辑。围绕我给出的产品与卖点写一篇 300 字以内的种草笔记：用具体使用场景开头，正文给 2 到 3 个可验证的体验点，结尾给一条选购建议。语气自然口语，不用夸张网络词，不堆表情符号，不写绝对化与医疗功效表述。',
    mode: 'generate',
    exampleInput: '产品：便携榨汁杯。卖点：一次充电榨 8 杯、可拆洗、350ml。',
    featured: false,
  },
  {
    slug: 'data-insight',
    category: 'text',
    style: '分析',
    title: '数据分析结论',
    description: '把数字整理成一句话结论、支撑事实和下一步建议。',
    body: '你是数据分析师。根据我提供的数据写结论：先给一句话核心发现，再列 2 到 4 条支撑事实（每条带数值与对比基准），最后给一条可执行的下一步建议。区分相关与因果；样本不足或数据缺失时明确写「数据不足」，不外推。',
    mode: 'generate',
    exampleInput: '近 4 周注册转化率：3.1%、3.4%、2.2%、2.4%；同期投放预算减半。',
    featured: false,
  },
  {
    slug: 'code-review',
    category: 'text',
    style: '代码',
    title: '代码评审助手',
    description: '一份粗糙的代码评审提示词，用它开始做结构化优化。',
    body: '你是一个程序员，帮我评审下面的代码，发现问题就指出来，并给出修改建议。',
    mode: 'optimize',
    exampleInput: null,
    featured: false,
  },
  {
    slug: 'cinematic-portrait',
    category: 'image',
    style: '摄影',
    title: '电影感人像',
    description: '雨夜旧城区的电影剧照质感人像提示词。',
    body: '电影感人像，35 岁亚洲女性，米色风衣，站在雨后的旧城区街道，侧逆光，色温 3200K，浅景深，85mm 镜头，胶片颗粒，低饱和，电影剧照质感。',
    mode: 'generate',
    exampleInput: '想拍一张有故事感的雨夜人像，人物是三十多岁的女性，偏文艺。',
    featured: false,
  },
  {
    slug: 'product-hero',
    category: 'image',
    style: '摄影',
    title: '电商产品主图',
    description: '干净高级的白底产品主图提示词。',
    body: '电商产品主图，白色磨砂瓶身护肤品居中，浅灰无缝背景，柔光箱主光加右侧轮廓光，产品占画面 60%，底部自然投影，画面干净，商业摄影，8k 细节。',
    mode: 'generate',
    exampleInput: '给一款白色磨砂瓶身的护肤精华做电商主图，要干净高级。',
    featured: false,
  },
  {
    slug: 'isometric-3d',
    category: 'image',
    style: '3D',
    title: '3D 等距插画',
    description: '暖色圆润造型的等距场景插画提示词。',
    body: '等距视角 3D 插画，小型移动咖啡馆摊位，奶油色与木色配色，圆润几何造型，柔和环境光，浅色背景，细节丰富，C4D 渲染质感。',
    mode: 'generate',
    exampleInput: '做一个移动咖啡馆的 3D 等距插画，风格温暖可爱。',
    featured: false,
  },
  {
    slug: 'minimal-poster',
    category: 'image',
    style: '海报',
    title: '极简海报',
    description: '黑白红、大留白的极简活动海报提示词。',
    body: '极简海报，大面积留白，居中对齐两行中文标题，黑红双色，网格构图，纸张纹理，细线边框，无渐变，无装饰图标。',
    mode: 'generate',
    exampleInput: '给一场周末爵士音乐会做极简海报，主色黑红，需要放两行标题。',
    featured: true,
  },
  {
    slug: 'product-ad-15s',
    category: 'video',
    style: '广告',
    title: '15 秒产品广告',
    description: '四段式节奏的短视频广告分镜提示词。',
    body: '15 秒产品广告分镜：0-3 秒特写产品质感，4-8 秒使用场景，9-12 秒效果对比，13-15 秒产品与品牌名收尾。镜头运动简洁，光线统一，节奏由慢到快，结尾留 1 秒定格。',
    mode: 'generate',
    exampleInput: '给一款无线降噪耳机写 15 秒广告分镜，主打通勤场景。',
    featured: true,
  },
  {
    slug: 'storyboard',
    category: 'video',
    style: '分镜',
    title: '分镜脚本',
    description: '按表格输出镜号、景别、画面、运镜与时长。',
    body: '分镜脚本，输出表格：镜号、景别、画面内容、运镜、时长、音效或台词。全片 30 秒，6 到 8 个镜头，开场 3 秒内出现主体，避免超过 3 个连续静态镜头。',
    mode: 'generate',
    exampleInput: '给一段城市清晨跑步的 30 秒短片写分镜。',
    featured: false,
  },
  {
    slug: 'camera-move',
    category: 'video',
    style: '运镜',
    title: '运镜描述',
    description: '一份口语化运镜描述，用它开始优化成可执行的镜头指令。',
    body: '镜头慢慢推近人物，然后绕着他转一圈，最后拉远。',
    mode: 'optimize',
    exampleInput: null,
    featured: false,
  },
  {
    slug: 'narrative-short',
    category: 'video',
    style: '叙事',
    title: '叙事短片',
    description: '用主角、目标、阻碍、转折、结尾搭出短片骨架。',
    body: '叙事短片提示词：主角、目标、阻碍、转折、结尾各一句；画面描述包含时间、地点、光线与关键道具；镜头语言服务情绪，不用旁白解释已经拍到的内容。',
    mode: 'generate',
    exampleInput: '写一个 60 秒短片：外卖员在暴雨夜送最后一单，发现收件人是多年未见的父亲。',
    featured: false,
  },
]

/**
 * 按 slug upsert 全部内置模板，返回写入条数。
 * 自定义模板（slug=null）不参与匹配，保持原样。
 */
export async function seedBuiltinTemplates(prisma: PrismaClient): Promise<number> {
  for (const template of BUILTIN_TEMPLATES) {
    await prisma.template.upsert({
      where: { slug: template.slug },
      create: {
        slug: template.slug,
        category: template.category,
        style: template.style,
        title: template.title,
        description: template.description,
        body: template.body,
        mode: template.mode,
        exampleInput: template.exampleInput,
        coverKind: 'programmatic',
        featured: template.featured,
        builtin: true,
      },
      update: {
        category: template.category,
        style: template.style,
        title: template.title,
        description: template.description,
        body: template.body,
        mode: template.mode,
        exampleInput: template.exampleInput,
        coverKind: 'programmatic',
        featured: template.featured,
        builtin: true,
      },
    })
  }
  return BUILTIN_TEMPLATES.length
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient()
  try {
    const count = await seedBuiltinTemplates(prisma)
    console.log(`内置模板已写入 ${count} 条。`)
  } finally {
    await prisma.$disconnect()
  }
}
