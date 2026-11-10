import { AppShell } from '@/components/shell/AppShell'
import { MobileNav } from '@/components/studio/MobileNav'
import {
  ModelStatusBanner,
  ModelStatusProvider,
} from '@/components/studio/modelStatus'

export default function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-1.5 focus:text-label focus:text-ink"
      >
        跳到主要内容
      </a>
      <ModelStatusProvider>
        <div id="workspace-shell" className="contents">
          <AppShell>
            <div id="workspace-main" tabIndex={-1} className="min-h-full">
              <MobileNav />
              <ModelStatusBanner />
              {children}
            </div>
          </AppShell>
        </div>
      </ModelStatusProvider>
    </>
  )
}
