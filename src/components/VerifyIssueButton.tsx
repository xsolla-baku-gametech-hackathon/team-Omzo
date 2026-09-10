"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VerifyIssueButton({ issueId }: { readonly issueId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/issues/${issueId}/verify`, {
        method: "POST",
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      // Say what happened and what to do about it, never a status code.
      setError(
        response.status === 401
          ? "Your session has expired. Sign in again to verify this issue."
          : "That did not save. Try again in a moment.",
      );
    } catch {
      setError("No connection to the server. Your work is not lost — retry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void verify()}
        disabled={busy}
        className="border border-verified px-3 py-1.5 text-label text-verified transition-colors hover:bg-verified hover:text-paper disabled:opacity-50"
      >
        {busy ? "Verifying…" : "Verify this issue"}
      </button>
      {error !== null && (
        <p role="alert" className="mt-2 text-label text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
