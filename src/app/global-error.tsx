"use client";

/**
 * Global error boundary (SPEC.md §8 — "errors that say what happened and how to fix it").
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f1f3f2] flex items-center justify-center p-6 font-sans text-[#141a18]">
        <div className="max-w-sm w-full text-center">
          <div className="text-5xl font-semibold tracking-tight mb-2">
            Something broke
          </div>
          <p className="text-sm text-[#6e7b77] mb-2">
            {error.message || "An unexpected error occurred."}
          </p>
          {error.digest && (
            <p className="text-xs text-[#6e7b77] font-mono mb-6">
              Error ID: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="py-2 px-4 bg-[#141a18] text-[#f1f3f2] text-sm font-medium rounded-sm hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
