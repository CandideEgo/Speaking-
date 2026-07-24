/**
 * ShellSkeleton — layout-aware loading placeholder.
 * Replaces FullPageSpinner in the authenticated shell to avoid jarring
 * full-screen spin → content pop. Shows sidebar + topbar + content area
 * as gray placeholders, preserving spatial continuity (Material Design).
 */
export function ShellSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Sidebar placeholder */}
      <aside className="hidden md:flex w-[248px] flex-col border-r border-hairline bg-canvas">
        <div className="h-16 border-b border-hairline flex items-center px-5">
          <div className="h-5 w-24 rounded bg-surface-card animate-pulse" />
        </div>
        <div className="flex-1 px-3 py-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <div className="w-[18px] h-[18px] rounded bg-surface-card animate-pulse" />
              <div
                className="h-3.5 rounded bg-surface-card animate-pulse"
                style={{ width: `${60 + (i % 3) * 15}%` }}
              />
            </div>
          ))}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* TopBar placeholder */}
        <header className="h-16 border-b border-hairline flex items-center gap-4 px-4 sm:px-7">
          <div className="md:hidden w-9 h-9 rounded bg-surface-card animate-pulse" />
          <div className="flex-1 flex justify-center">
            <div className="w-full max-w-[360px] h-10 rounded-sm bg-surface-card animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-surface-card animate-pulse" />
            <div className="w-8 h-8 rounded-full bg-surface-card animate-pulse" />
          </div>
        </header>

        {/* Content placeholder */}
        <main className="flex-1 overflow-hidden p-6 sm:p-8">
          <div className="max-w-[1320px] mx-auto space-y-6">
            {/* Greeting row */}
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-5 w-32 rounded bg-surface-card animate-pulse" />
                <div className="h-3.5 w-44 rounded bg-surface-card animate-pulse" />
              </div>
              <div className="h-4 w-20 rounded bg-surface-card animate-pulse" />
            </div>
            {/* Card grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 rounded-lg border border-hairline bg-surface-soft animate-pulse"
                />
              ))}
            </div>
            {/* List rows */}
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg border border-hairline bg-surface-soft animate-pulse"
                />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
