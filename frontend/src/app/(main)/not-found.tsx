import Link from "next/link";

export default function MainNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center py-16">
      <div className="text-center">
        <h1 className="text-6xl font-display font-medium text-ink">404</h1>
        <p className="mt-4 text-lg text-muted-foreground">页面不存在</p>
        <p className="mt-2 text-sm text-muted-foreground">
          你访问的页面可能已被移动或删除。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-lg bg-coral px-5 py-2.5 text-sm font-medium text-white hover:bg-coral/90 transition-colors"
        >
          返回首页
        </Link>
      </div>
    </main>
  );
}
