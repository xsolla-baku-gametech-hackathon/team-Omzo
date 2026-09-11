import type { Metadata } from "next";
import Link from "next/link";

import { EyebrowPill } from "@/components/stage/EyebrowPill";
import { StageHeader } from "@/components/stage/StageHeader";
import { StageSection } from "@/components/stage/StageSection";
import { PLANS, formatUsd, resolvePlan } from "@/domain/billing/plans";
import type { Plan } from "@/domain/billing/plans";

/**
 * Pricing — a Stage surface (UI_SPEC_V2_DARK.md §0, §4).
 *
 * Centred, airy, one halo. Card grids are permitted here by §0's third
 * reversal and this is what they are for: four tiers compared at a glance.
 *
 * Every figure comes from the plan catalogue rather than being typed into the
 * markup, so the page and the studio's own billing panel cannot disagree
 * about what a plan costs.
 */

export const metadata: Metadata = {
  title: "Pricing — Repro",
  description:
    "Repro is priced per active tester: the people who take your build. Free on a link you already have, $49 a month for a studio running closed betas, self-hosted for builds that cannot leave your network.",
};

function priceLine(plan: Plan): { amount: string; qualifier: string } {
  if (plan.monthlyCents === null) {
    return { amount: "Talk to us", qualifier: "annual licence" };
  }
  if (plan.monthlyCents === 0) {
    return { amount: "Free", qualifier: "no card required" };
  }
  return { amount: formatUsd(plan.monthlyCents), qualifier: "per month" };
}

function PlanCard({
  plan,
  featured,
}: {
  readonly plan: Plan;
  readonly featured: boolean;
}) {
  const { amount, qualifier } = priceLine(plan);

  return (
    <div
      className={`flex flex-col rounded-[var(--radius-md)] border p-[var(--space-6)] text-left ${
        featured
          ? "edge-lit border-[var(--line-strong)] bg-[var(--surface-raised)]"
          : "border-[var(--line-subtle)]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-[var(--space-3)]">
        <h3 className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]">
          {plan.name}
        </h3>
        {featured && (
          <span className="text-[length:var(--type-meta-size)] text-[var(--accent-text)]">
            Most studios
          </span>
        )}
      </div>

      <div className="mt-[var(--space-4)]">
        <div className="tabular-nums text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] font-semibold text-[var(--ink-primary)]">
          {amount}
        </div>
        <div className="mt-[var(--space-1)] text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
          {qualifier}
        </div>
      </div>

      <p className="mt-[var(--space-4)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-secondary)]">
        {plan.summary}
      </p>

      <ul className="mt-[var(--space-5)] flex-1 space-y-[var(--space-3)]">
        {plan.features.map((feature) => (
          <li
            key={feature}
            className="flex gap-[var(--space-3)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-secondary)]"
          >
            <span
              aria-hidden="true"
              className="mt-[6px] h-[4px] w-[4px] shrink-0 rounded-[var(--radius-full)] bg-[var(--accent)]"
            />
            {feature}
          </li>
        ))}
      </ul>

      <Link
        href={plan.monthlyCents === null ? "/studio" : "/register"}
        className={`mt-[var(--space-6)] inline-flex h-[var(--control-h-touch)] items-center justify-center rounded-[var(--radius-sm)] px-[var(--control-pad-x)] text-[length:var(--type-ui-size)] font-medium transition-colors active:translate-y-px md:h-[var(--control-h)] ${
          featured
            ? "bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)]"
            : "border border-[var(--line-medium)] text-[var(--ink-primary)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover-subtle)]"
        }`}
      >
        {plan.monthlyCents === null ? "Start a conversation" : "Start free"}
      </Link>
    </div>
  );
}

/** Why the meter is what it is. Judges and buyers both ask. */
const REJECTED: ReadonlyArray<{
  readonly option: string;
  readonly why: string;
}> = [
  {
    option: "Per developer seat",
    why: "The value does not move with it. A three-person team gets the same collapse from the same playtest as a fifty-person team, so seats would charge the studios getting least the same as the studios getting most.",
  },
  {
    option: "Per report",
    why: "That charges for the behaviour the engine wants more of. Clustering gets better with volume, so pricing per report would price against the thing that makes it work.",
  },
  {
    option: "A cut of tester rewards",
    why: "There is nothing to take a cut of. Coins are claim tokens for perks the studio provides, with no monetary exchange mechanism — inventing a cash flow there would make a developer tool into something it is not.",
  },
];

export default function PricingPage() {
  const freePlan = resolvePlan("free");

  return (
    <div className="min-h-screen bg-[var(--surface-page)] font-sans text-[var(--ink-primary)]">
      <StageHeader />

      <section className="relative overflow-hidden px-[var(--space-6)] pt-[var(--stage-section-y)] pb-[var(--space-12)]">
        <div className="bloom-halo top-0" />

        <div className="stage-content mx-auto max-w-[var(--stage-measure)] text-center">
          <EyebrowPill>Pricing</EyebrowPill>
          <h1 className="mt-[var(--space-6)] text-[length:var(--type-section-size)] leading-[var(--type-section-lh)] tracking-[var(--type-section-ls)] font-semibold text-balance">
            Priced on the people who take your build
          </h1>
          <p className="mx-auto mt-[var(--space-5)] max-w-[var(--stage-hero-sub-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
            An active tester is someone who took a build this month. Each one is
            a watermark identity, a signed NDA, and a stream of reports to
            cluster — which is to say, each one is the work. Developers on your
            team are unlimited on every tier.
          </p>
        </div>
      </section>

      <section className="px-[var(--space-6)] pb-[var(--stage-section-y)]">
        <div className="mx-auto grid max-w-[var(--stage-container)] grid-cols-1 gap-[var(--space-5)] md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              featured={plan.id === "studio"}
            />
          ))}
        </div>

        <p className="mx-auto mt-[var(--space-8)] max-w-[var(--stage-measure)] text-center text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-tertiary)]">
          Annual billing is ten months for twelve on Studio and Publisher. Going
          over an allowance bills at the rate on the card — it never blocks a
          playtest in progress. A dropped bug report is a worse outcome than a
          late invoice.
        </p>
      </section>

      <StageSection
        eyebrow={<EyebrowPill>The meter</EyebrowPill>}
        heading="Why it is priced this way"
        subline="Three models were considered and dropped first. A price is only credible next to the ones it beat."
        bloom={<div className="bloom-ambient -left-[15%] top-[15%]" />}
      >
        <div className="mx-auto max-w-[var(--stage-measure)] text-left">
          {REJECTED.map((entry) => (
            <div
              key={entry.option}
              className="border-t border-[var(--line-subtle)] py-[var(--space-6)]"
            >
              <p className="text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-primary)]">
                {entry.option}
              </p>
              <p className="mt-[var(--space-3)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
                {entry.why}
              </p>
            </div>
          ))}
        </div>
      </StageSection>

      <section className="relative overflow-hidden px-[var(--space-6)] py-[var(--stage-section-y)]">
        <div className="bloom-halo bloom-halo-up bottom-0" />
        <div className="stage-content mx-auto max-w-[var(--stage-measure)] text-center">
          <h2 className="text-[length:var(--type-section-size)] leading-[var(--type-section-lh)] tracking-[var(--type-section-ls)] font-semibold text-balance">
            Start on the free tier
          </h2>
          <p className="mx-auto mt-[var(--space-4)] max-w-[var(--stage-hero-sub-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
            One campaign, {freePlan.limits.activeTestersPerMonth} testers, and a
            link you already have — nothing of yours reaches our servers. Move
            up when you want the build hosted and watermarked, not before.
          </p>
          <div className="mt-[var(--space-8)] flex flex-col items-center justify-center gap-[var(--space-3)] sm:flex-row">
            <Link
              href="/register"
              className="inline-flex h-[var(--control-h-touch)] w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-[var(--control-pad-x)] text-[length:var(--type-ui-size)] font-medium text-[var(--accent-on-fill)] transition-colors hover:bg-[var(--accent-hover)] active:translate-y-px sm:w-auto md:h-[var(--control-h)]"
            >
              Create a studio account
            </Link>
            <Link
              href="/"
              className="inline-flex h-[var(--control-h-touch)] w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line-medium)] px-[var(--control-pad-x)] text-[length:var(--type-ui-size)] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover-subtle)] active:translate-y-px sm:w-auto md:h-[var(--control-h)]"
            >
              See how triage works
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
