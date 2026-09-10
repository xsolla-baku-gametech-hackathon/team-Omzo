import Link from "next/link";

/**
 * Custom 404 page (SPEC.md §8 — "errors that say what happened and how to fix it").
 */
export default function NotFound() {
  return (
    <main className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <div className="text-figure tabular-nums text-ink mb-2">404</div>
        <h1 className="text-lg font-semibold tracking-tight mb-2">
          Page not found
        </h1>
        <p className="text-label text-slate mb-8 max-w-measure mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          If you followed a link, it may have expired.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/"
            className="py-2 px-4 bg-ink text-paper text-label font-medium rounded-sm hover:opacity-90 transition-opacity"
          >
            Go home
          </Link>
          <Link
            href="/play"
            className="py-2 px-4 border border-hairline text-label font-medium rounded-sm hover:bg-raised transition-colors"
          >
            Browse playtests
          </Link>
        </div>
      </div>
    </main>
  );
}
