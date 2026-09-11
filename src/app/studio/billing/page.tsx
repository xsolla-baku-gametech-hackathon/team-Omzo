import Link from "next/link";
import { redirect } from "next/navigation";

import { ConsoleNavLink, ConsoleShell } from "@/components/ConsoleShell";
import { PlanSelector } from "@/components/PlanSelector";
import { SignalBar } from "@/components/SignalBar";
import {
  formatUsd,
  meter,
  monthlyTotalCents,
  overageCents,
  recommendPlan,
} from "@/domain/billing/plans";
import {
  getBillingSnapshot,
  getPlanHistory,
} from "@/server/services/billingService";
import { getSession } from "@/server/session";

/**
 * Billing — a Console surface (UI_SPEC_V2_DARK.md §5).
 *
 * No bloom, no centred text, no pills. Left-aligned and dense, like the
 * board: this is a working screen, not a sales one.
 *
 * Every number is counted from rows that already exist, so a studio can
 * reconcile this against their own board. Nothing is projected or estimated.
 */
export const dynamic = "force-dynamic";

const PERIOD_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export default async function BillingPage() {
  const session = await getSession();
  if (!session || session.role !== "STUDIO" || !session.studioId) {
    redirect("/login");
  }

  const [{ usage, plan }, history] = await Promise.all([
    getBillingSnapshot(session.studioId),
    getPlanHistory(session.studioId),
  ]);
  const readings = meter(usage, plan);
  const overage = overageCents(usage, plan);
  const total = monthlyTotalCents(plan, usage);
  const recommended = recommendPlan(usage);
  const shouldMove = recommended.id !== plan.id;

  // end is exclusive, so the last day of the period is the day before it.
  const lastDay = new Date(usage.period.end.getTime() - 86_400_000);

  return (
    <ConsoleShell
      campaignName="Billing"
      actions={<ConsoleNavLink href="/studio">Campaigns</ConsoleNavLink>}
    >
      <div className="max-w-[var(--console-max)]">
        <h1 className="text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] font-semibold text-[var(--ink-primary)]">
          Plan and usage
        </h1>
        <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
          {PERIOD_FORMAT.format(usage.period.start)} to{" "}
          {PERIOD_FORMAT.format(lastDay)}. Counted from your own campaigns, so
          every figure here reconciles against the board.
        </p>

        {/* Current plan and what it costs this period. */}
        <section
          aria-labelledby="plan-heading"
          className="mt-[var(--space-8)] border-t border-[var(--line-subtle)] pt-[var(--space-6)]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-4)]">
            <div>
              <h2
                id="plan-heading"
                className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]"
              >
                {plan.name}
              </h2>
              <p className="mt-[var(--space-1)] text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
                {plan.summary}
              </p>
            </div>

            <div className="text-right">
              <div className="tabular-nums text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] font-semibold text-[var(--ink-primary)]">
                {total === null ? "Negotiated" : formatUsd(total)}
              </div>
              <div className="mt-[var(--space-1)] text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
                this period
              </div>
            </div>
          </div>

          {overage > 0 && (
            <dl className="mt-[var(--space-5)] max-w-[var(--body-measure)] space-y-[var(--space-2)] text-[length:var(--type-meta-size)]">
              <div className="flex justify-between gap-[var(--space-4)]">
                <dt className="text-[var(--ink-secondary)]">Plan</dt>
                <dd className="tabular-nums text-[var(--ink-primary)]">
                  {formatUsd(plan.monthlyCents ?? 0)}
                </dd>
              </div>
              <div className="flex justify-between gap-[var(--space-4)] border-t border-[var(--line-subtle)] pt-[var(--space-2)]">
                <dt className="text-[var(--ink-secondary)]">
                  Usage above the allowance
                </dt>
                <dd className="tabular-nums text-[var(--ink-primary)]">
                  {formatUsd(overage)}
                </dd>
              </div>
            </dl>
          )}
        </section>

        {/* The three metered axes. */}
        <section
          aria-labelledby="usage-heading"
          className="mt-[var(--space-8)] border-t border-[var(--line-subtle)] pt-[var(--space-6)]"
        >
          <h2
            id="usage-heading"
            className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]"
          >
            Usage
          </h2>

          <div className="mt-[var(--space-5)] grid max-w-[var(--console-max)] grid-cols-1 gap-[var(--space-6)] md:grid-cols-3">
            {readings.map((r) => (
              <div key={r.id}>
                <SignalBar
                  label={r.label}
                  value={r.included === null ? 0 : r.ratio}
                />
                <p className="mt-[var(--space-2)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-tertiary)]">
                  <span className="tabular-nums text-[var(--ink-secondary)]">
                    {r.used.toLocaleString("en-US")}
                  </span>{" "}
                  {r.included === null ? (
                    "used, unlimited on this plan"
                  ) : (
                    <>
                      of {r.included.toLocaleString("en-US")} included
                      {r.over > 0 && (
                        <>
                          {" — "}
                          <span className="text-[var(--sev-high)]">
                            {r.over.toLocaleString("en-US")} over
                          </span>
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-[var(--space-6)] max-w-[var(--body-measure)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-tertiary)]">
            An active tester is someone who took a build this period, counted
            once however many times they played. Going over bills at the plan
            rate; it never blocks a report mid-playtest.
          </p>
        </section>

        {/* Change plan. */}
        <section
          aria-labelledby="change-heading"
          className="mt-[var(--space-8)] border-t border-[var(--line-subtle)] pt-[var(--space-6)]"
        >
          <h2
            id="change-heading"
            className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]"
          >
            Change plan
          </h2>
          <div className="mt-[var(--space-5)]">
            <PlanSelector current={plan.id} />
          </div>
        </section>

        {history.length > 0 && (
          <section
            aria-labelledby="history-heading"
            className="mt-[var(--space-8)] border-t border-[var(--line-subtle)] pt-[var(--space-6)]"
          >
            <h2
              id="history-heading"
              className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]"
            >
              Plan history
            </h2>
            {/* Usage accrues across a period but a plan can change inside
                one, so the current plan alone cannot rebuild an invoice. */}
            <ul className="mt-[var(--space-4)] border-t border-[var(--line-subtle)]">
              {history.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-baseline justify-between gap-[var(--space-3)] border-b border-[var(--line-subtle)] py-[var(--space-3)] text-[length:var(--type-meta-size)]"
                >
                  <span className="text-[var(--ink-secondary)]">
                    {event.fromPlanId === null
                      ? `Started on ${event.toPlanId}`
                      : `${event.fromPlanId} to ${event.toPlanId}`}
                  </span>
                  <span className="tabular-nums text-[var(--ink-tertiary)]">
                    {PERIOD_FORMAT.format(event.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Only shown when it is actually true. */}
        {shouldMove && (
          <section
            aria-labelledby="move-heading"
            className="mt-[var(--space-8)] border-t border-[var(--line-subtle)] pt-[var(--space-6)]"
          >
            <h2
              id="move-heading"
              className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]"
            >
              {recommended.name} fits this usage
            </h2>
            <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
              {overage > 0
                ? `This period's usage costs ${formatUsd(overage)} above the plan. ${recommended.name} includes it at ${formatUsd(recommended.monthlyCents ?? 0)} a month.`
                : `Your usage has moved past what ${plan.name} covers.`}
            </p>
            <Link
              href="/pricing"
              className="mt-[var(--space-5)] inline-flex h-[var(--control-h-touch)] items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-[var(--control-pad-x)] text-[length:var(--type-ui-size)] font-medium text-[var(--accent-on-fill)] transition-colors hover:bg-[var(--accent-hover)] active:translate-y-px md:h-[var(--control-h)]"
            >
              Compare plans
            </Link>
          </section>
        )}
      </div>
    </ConsoleShell>
  );
}
