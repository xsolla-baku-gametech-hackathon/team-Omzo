"use client";

import Link from "next/link";

/**
 * Route-level error boundary (SPEC.md §8 — errors that say what happened and how to fix it).
 *
 * This catches errors in nested routes without replacing the root layout,
 * so the navigation and fonts remain intact.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-hairline bg-raised p-8 rounded-sm text-center">
        <div className="w-10 h-10 mx-auto mb-4 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-lg">
          !
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-ink mb-2">
          Something went wrong
        </h1>

        <p className="text-sm text-slate mb-2 max-w-measure mx-auto">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>

        {error.digest && (
          <p className="text-xs text-slate font-mono mb-6">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="py-2 px-4 bg-ink text-paper text-label font-medium rounded-sm hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <Link
            href="/"
            className="py-2 px-4 border border-hairline text-label font-medium rounded-sm hover:bg-raised transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
