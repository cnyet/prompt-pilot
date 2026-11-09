import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PromptPilot',
  description: '把一句话变成结构完整、边界清晰的标准提示词',
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
