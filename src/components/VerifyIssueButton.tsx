"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";

/**
 * VerifyIssueButton — UI_SPEC_V2_DARK.md §5.3
 *
 * Verify is the primary action on the issue. Once verified the control is
 * gone and a --state-verified label stands in its place: a verified issue
 * is a fact, not a button you can press again, and a green button that
 * does nothing is worse than no button.
 */
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
    <div className="flex flex-col items-end gap-[var(--space-2)]">
      <Button variant="primary" onClick={() => void verify()} disabled={busy}>
        {busy ? "Verifying…" : "Verify issue"}
      </Button>
      {error !== null && (
        <p
          role="alert"
          className="text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--sev-critical)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** The state Verify resolves to. A label, not a coloured button (§5.3). */
export function VerifiedLabel() {
  return (
    <span
      data-testid="verified-label"
      className="inline-flex items-center gap-[var(--space-2)] text-[length:var(--type-ui-size)] text-[var(--state-verified)]"
    >
      <span
        aria-hidden="true"
        className="h-[8px] w-[8px] shrink-0 rounded-[var(--radius-full)] bg-[var(--state-verified)]"
      />
      Issue verified
    </span>
  );
}
