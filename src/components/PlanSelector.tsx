"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";
import { PLANS, formatUsd } from "@/domain/billing/plans";
import type { PlanId } from "@/domain/billing/plans";

/**
 * Moves the studio between plans.
 *
 * Only the listed plans appear. Self-hosted is an annual licence negotiated
 * with a person, and a button that granted it would promise something nobody
 * agreed to — so it links to a conversation instead of posting.
 *
 * This records an intent and takes no payment, and the copy says so rather
 * than implying a transaction that did not happen.
 */
export function PlanSelector({ current }: { readonly current: PlanId }) {
  const router = useRouter();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectable = PLANS.filter((plan) => plan.monthlyCents !== null);

  const move = async (planId: PlanId) => {
    setBusy(planId);
    setError(null);
    try {
      const response = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (response.ok) {
        router.refresh();
        return;
      }

      const detail = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(
        detail?.message ?? "The plan did not change. Try again in a moment.",
      );
    } catch {
      setError("No connection to the server. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-3">
        {selectable.map((plan) => {
          const isCurrent = plan.id === current;

          return (
            <div
              key={plan.id}
              className={`rounded-[var(--radius-md)] border p-[var(--space-4)] ${
                isCurrent
                  ? "border-[var(--line-strong)] bg-[var(--accent-wash)]"
                  : "border-[var(--line-subtle)]"
              }`}
            >
              <div className="flex items-baseline justify-between gap-[var(--space-2)]">
                <span className="text-[length:var(--type-ui-size)] text-[var(--ink-primary)]">
                  {plan.name}
                </span>
                <span className="tabular-nums text-[length:var(--type-meta-size)] text-[var(--ink-secondary)]">
                  {plan.monthlyCents === 0
                    ? "Free"
                    : `${formatUsd(plan.monthlyCents ?? 0)}/mo`}
                </span>
              </div>

              <p className="mt-[var(--space-2)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-tertiary)]">
                {plan.limits.activeTestersPerMonth === null
                  ? "Unlimited active testers"
                  : `${plan.limits.activeTestersPerMonth.toLocaleString("en-US")} active testers`}
              </p>

              <div className="mt-[var(--space-4)]">
                {isCurrent ? (
                  <span
                    data-testid="current-plan"
                    className="text-[length:var(--type-meta-size)] text-[var(--state-verified)]"
                  >
                    Current plan
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => void move(plan.id)}
                    disabled={busy !== null}
                    className="w-full"
                  >
                    {busy === plan.id ? "Moving…" : `Move to ${plan.name}`}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error !== null && (
        <p
          role="alert"
          className="mt-[var(--space-4)] text-[length:var(--type-meta-size)] text-[var(--sev-critical)]"
        >
          {error}
        </p>
      )}

      <p className="mt-[var(--space-4)] max-w-[var(--body-measure)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-tertiary)]">
        Changing plan records the change and takes effect immediately. No
        payment is taken here — billing is invoiced separately, and the change
        is recorded against your account with who made it.
      </p>
    </div>
  );
}
