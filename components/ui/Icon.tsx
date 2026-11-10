import { cn } from '@/lib/utils'

/**
 * 全站图标。内联 SVG，不引第三方图标包。
 * 统一：24 viewBox、stroke 1.5、圆头圆角、currentColor。
 * 默认 aria-hidden：图标只做视觉锚点，语义由文字或外部 aria-label 承担。
 */
export type IconName =
  | 'studio'
  | 'library'
  | 'eval'
  | 'template'
  | 'settings'
  | 'search'
  | 'plus'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'download'
  | 'bookmark'
  | 'alert'
  | 'wand'
  | 'eye-off'
  | 'play'
  | 'stop'
  | 'close'
  | 'panel'
  | 'chevron-right'
  | 'spark'
  | 'terminal'

const PATHS: Record<IconName, React.ReactNode> = {
  studio: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  library: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </>
  ),
  eval: (
    <>
      <path d="M12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  template: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
  bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />,
  alert: (
    <>
      <path d="M12 9v5" />
      <path d="M12 17.5h.01" />
      <path d="M10.3 3.9 2.4 18a1.5 1.5 0 0 0 1.3 2.2h16.6a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z" />
    </>
  ),
  wand: (
    <>
      <path d="m4 20 10-10" />
      <path d="m14 4 1.2 2.8L18 8l-2.8 1.2L14 12l-1.2-2.8L10 8l2.8-1.2Z" />
      <path d="M18 14l.8 1.7L20.5 16l-1.7.8L18 18.5l-.8-1.7L15.5 16l1.7-.8Z" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c5 0 9 4.5 9 7a9.9 9.9 0 0 1-2.3 3.3" />
      <path d="M6.4 6.5A11.6 11.6 0 0 0 3 12c0 2.5 4 7 9 7a9.7 9.7 0 0 0 4-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  play: <path d="M7 4.5v15l13-7.5Z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  spark: (
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8" />
  ),
  terminal: (
    <>
      <path d="m5 7 5 5-5 5" />
      <path d="M13 17h6" />
    </>
  ),
}

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 1.5,
  label,
}: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
  /** 传了就是有语义的图标；不传则对读屏隐藏 */
  label?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
