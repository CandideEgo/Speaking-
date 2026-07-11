import Link from "next/link";

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="text-center">
        <h1 className="text-6xl font-display font-medium text-ink">404</h1>
        <p className="mt-4 text-lg text-muted-foreground">页面不存在</p>
        <p className="mt-2 text-sm text-muted-foreground">你访问的页面可能已被移动或删除。</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500/90 transition-colors"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
