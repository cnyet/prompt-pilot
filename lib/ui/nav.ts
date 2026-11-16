import type { IconName } from '@/components/ui/Icon'
import type { MessageKey } from '@/lib/i18n/zh'

export interface NavItem {
  href: string
  labelKey: MessageKey
  icon: IconName
}

/**
 * 工作区主导航（DESIGN.md Navigation）。
 *
 * 桌面左轨与窄屏底部标签栏共用同一份常量，避免两处导航漂移。
 * 文案只存键，由调用方经 `t(labelKey)` 解析，本模块不写中文字面量。
 */
export const WORKSPACE_NAV: readonly NavItem[] = [
  { href: '/studio', labelKey: 'nav.studio', icon: 'studio' },
  { href: '/library', labelKey: 'nav.library', icon: 'library' },
  { href: '/templates', labelKey: 'nav.templates', icon: 'template' },
  { href: '/settings', labelKey: 'nav.settings', icon: 'settings' },
]
