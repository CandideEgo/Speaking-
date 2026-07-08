import Link from "next/link";

/**
 * Shared outer shell for the auth pages (login / register / forgot-password /
 * reset-password): brand logo + title + subtitle, centered on the canvas.
 * Polished to the design-system style anchor (coral/cream/brand, mobile-first).
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 bg-canvas">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <Link
            href="/"
            aria-label="SeeWord 首页"
            className="font-display text-2xl font-bold text-ink tracking-tight"
          >
            SeeWord
          </Link>
          <h1 className="mt-4 font-display text-3xl font-bold text-ink tracking-display-md">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </main>
  );
}
