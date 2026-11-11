import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PromptPilot',
  description: '把一句话变成结构完整、边界清晰的标准提示词',
}

/**
 * 没有 viewport 声明时，移动端会按 980px 布局再缩放，
 * 窄屏适配等于没生效。这里显式声明，并给两套主题各自的地址栏色。
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3EAD8' },
    { media: '(prefers-color-scheme: dark)', color: '#1A0F0A' },
  ],
}

/**
 * 在首屏绘制前定主题，避免浅色闪一下再变深色。
 * 只读 localStorage 与系统偏好，不含任何用户内容。
 */
const themeScript = `(function(){try{var s=localStorage.getItem('pp-theme')||'system';var d=s==='dark'||(s==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
