import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'
import {
  buildCoverModel,
  type CoverModel,
  type TemplateCard,
} from '@/lib/templates-v3'

/**
 * 程序化封面（ROADMAP-V3 §2.6）。
 *
 * 三类封面共用一块 5:3 画布，卡片尺寸一致；分类只决定构图语言：文本类用
 * 排版构成，图片类用平面色块，视频类用画幅与序列。全部内联 SVG，只用 CSS
 * 变量取色，不依赖外部图片、不使用渐变。封面是装饰层，标题与说明在卡片
 * 正文，因此对读屏隐藏。
 */
export const COVER_ASPECT = 'aspect-[5/3]'
const VIEWBOX = '0 0 400 240'

export function TemplateCover({
  template,
  className,
}: {
  template: TemplateCard
  className?: string
}): ReactElement {
  const model = buildCoverModel(template)

  return (
    <div
      aria-hidden="true"
      className={cn(
        'overflow-hidden border-b border-line-subtle bg-bg-sunken',
        COVER_ASPECT,
        className,
      )}
    >
      <svg
        viewBox={VIEWBOX}
        className="block h-full w-full"
        focusable="false"
      >
        {template.category === 'text' ? <TextCover model={model} /> : null}
        {template.category === 'image' ? <ImageCover model={model} /> : null}
        {template.category === 'video' ? <VideoCover model={model} /> : null}
      </svg>
    </div>
  )
}

const BODY_FONT = { fontFamily: 'var(--font-body)' }
const DISPLAY_FONT = { fontFamily: 'var(--font-display)' }
const MONO_FONT = { fontFamily: 'var(--font-mono)' }

function TextCover({ model }: { model: CoverModel }): ReactElement {
  const inset = 28 + (model.seed % 12)
  const titleStart = model.titleLines.length > 1 ? 100 : 120

  return (
    <>
      <rect
        width="400"
        height="240"
        style={{ fill: 'var(--surface)' }}
      />
      <rect
        width="400"
        height="240"
        style={{ fill: 'var(--surface-inset)', opacity: 0.55 }}
      />
      <rect
        x={inset}
        y="28"
        width="2"
        height="24"
        style={{ fill: 'var(--accent)' }}
      />
      <text
        x={inset + 12}
        y="46"
        fontSize="12"
        style={{ ...BODY_FONT, fill: 'var(--text-muted)' }}
      >
        {model.styleLabel}
      </text>

      {model.titleLines.map((line, index) => (
        <text
          key={`${line}-${index}`}
          x={inset}
          y={titleStart + index * 42}
          fontSize="34"
          fontWeight="600"
          style={{ ...DISPLAY_FONT, fill: 'var(--text)' }}
        >
          {line}
        </text>
      ))}

      <g style={{ fill: 'var(--border-strong)', opacity: 0.65 }}>
        <rect x={inset} y="180" width="260" height="2" rx="1" />
        <rect x={inset} y="192" width="210" height="2" rx="1" />
        <rect x={inset} y="204" width="150" height="2" rx="1" />
      </g>

      <text
        x="372"
        y="216"
        textAnchor="end"
        fontSize="12"
        style={{ ...MONO_FONT, fill: 'var(--text-muted)' }}
      >
        {String((model.seed % 99) + 1).padStart(2, '0')}
      </text>
    </>
  )
}

function ImageCover({ model }: { model: CoverModel }): ReactElement {
  const circleX = 268 + (model.seed % 44)
  const rectX = 28 + (model.seed % 24)
  const titleStart = model.titleLines.length > 1 ? 208 : 222
  const titleSize = model.titleLines.length > 1 ? 16 : 20

  return (
    <>
      <rect
        width="400"
        height="240"
        style={{ fill: 'var(--surface-inset)' }}
      />
      <circle
        cx={circleX}
        cy="100"
        r="80"
        style={{ fill: 'var(--surface)' }}
      />
      <rect
        x={rectX}
        y="80"
        width="150"
        height="96"
        rx="2"
        style={{
          fill: 'var(--surface-raised)',
          stroke: 'var(--border-strong)',
          strokeWidth: 1,
        }}
      />
      <rect
        x="300"
        y="158"
        width="52"
        height="10"
        style={{ fill: 'var(--accent)' }}
      />
      <line
        x1="24"
        y1="190"
        x2="376"
        y2="190"
        style={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
      />

      <text
        x="28"
        y="36"
        fontSize="12"
        style={{ ...MONO_FONT, fill: 'var(--text-muted)' }}
      >
        {String((model.seed % 99) + 1).padStart(2, '0')}
      </text>
      <text
        x="372"
        y="36"
        textAnchor="end"
        fontSize="12"
        style={{ ...BODY_FONT, fill: 'var(--text-muted)' }}
      >
        {model.styleLabel}
      </text>

      {model.titleLines.map((line, index) => (
        <text
          key={`${line}-${index}`}
          x="28"
          y={titleStart + index * 22}
          fontSize={titleSize}
          fontWeight="600"
          style={{ ...DISPLAY_FONT, fill: 'var(--text)' }}
        >
          {line}
        </text>
      ))}
    </>
  )
}

function VideoCover({ model }: { model: CoverModel }): ReactElement {
  const active = model.seed % 3
  const playX = 28 + active * 122 + 38

  return (
    <>
      <rect
        width="400"
        height="240"
        style={{ fill: 'var(--bg-sunken)' }}
      />
      <rect
        width="400"
        height="26"
        style={{ fill: 'var(--surface-inset)' }}
      />
      <rect
        y="214"
        width="400"
        height="26"
        style={{ fill: 'var(--surface-inset)' }}
      />

      <text
        x="24"
        y="17"
        fontSize="12"
        style={{ ...BODY_FONT, fill: 'var(--text-muted)' }}
      >
        {model.styleLabel}
      </text>
      <text
        x="376"
        y="17"
        textAnchor="end"
        fontSize="12"
        style={{ ...BODY_FONT, fill: 'var(--text-muted)' }}
      >
        {model.titleLines.join(' ')}
      </text>

      {[0, 1, 2].map((index) => {
        const x = 28 + index * 122
        const selected = index === active
        return (
          <g key={index}>
            <rect
              x={x}
              y="48"
              width="96"
              height="124"
              rx="2"
              style={{
                fill: 'var(--surface)',
                stroke: selected ? 'var(--accent)' : 'var(--border-strong)',
                strokeWidth: selected ? 2 : 1,
              }}
            />
            <rect
              x={x + 8}
              y="56"
              width="80"
              height="108"
              style={{ fill: 'var(--surface-inset)' }}
            />
            <text
              x={x + 2}
              y="188"
              fontSize="12"
              style={{ ...MONO_FONT, fill: 'var(--text-muted)' }}
            >
              {index === 0 ? '00:00' : index === 1 ? '00:07' : '00:15'}
            </text>
          </g>
        )
      })}

      <path
        d={`M${playX} 98l20 12-20 12Z`}
        style={{ fill: 'var(--text-muted)' }}
      />
    </>
  )
}
