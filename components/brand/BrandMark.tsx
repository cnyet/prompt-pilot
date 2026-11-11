import { cn } from '@/lib/utils'

/**
 * PromptPilot 品牌印记。
 *
 * 一枚羊皮纸印章式的 P，右上角顶一颗导引星：P 是 Prompt，
 * 星是 Pilot 的方位。只用 currentColor，跟随主题的金色。
 */
export function BrandMark({
  size = 40,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="PromptPilot"
      className={cn('shrink-0', className)}
    >
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
      <path
        d="M11.5 31V9.5h7.8a6.8 6.8 0 0 1 0 13.6h-7.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M31.5 5.2l1.5 3.3 3.3 1.5-3.3 1.5-1.5 3.3-1.5-3.3-3.3-1.5 3.3-1.5z"
        fill="currentColor"
      />
    </svg>
  )
}