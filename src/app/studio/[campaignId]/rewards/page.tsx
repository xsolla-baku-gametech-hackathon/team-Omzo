import { redirect } from "next/navigation";

import { ConsoleNavLink, ConsoleShell } from "@/components/ConsoleShell";
import { RewardShelfManager } from "@/components/RewardShelfManager";
import { getStudioCampaign } from "@/server/services/campaignService";
import { getRewardShelf } from "@/server/services/rewardClaimService";
import { getSession } from "@/server/session";

export default async function RewardsPage(props: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await props.params;
  const session = await getSession();

  if (!session || session.role !== "STUDIO" || !session.studioId) {
    redirect("/login");
  }

  const campaign = await getStudioCampaign(campaignId, session.studioId);
  const shelf = await getRewardShelf(campaignId, session.studioId);

  return (
    <ConsoleShell
      campaignName={campaign.title}
      actions={
        <ConsoleNavLink href={`/studio/${campaignId}`}>Board</ConsoleNavLink>
      }
    >
      <div className="relative max-w-[var(--stage-container)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full opacity-60 blur-3xl"
          style={{ background: "rgba(240, 166, 60, 0.12)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-8 h-40 w-40 rounded-full opacity-50 blur-3xl"
          style={{ background: "var(--accent-wash)" }}
        />

        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--line-subtle)] bg-[var(--surface-raised)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sev-high)]">
            <span
              aria-hidden
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                background: "rgba(240, 166, 60, 0.18)",
                color: "var(--sev-high)",
              }}
            >
              ¢
            </span>
            Reward shelf
          </div>
          <h1 className="text-[length:var(--type-title-size)] font-semibold leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] text-[var(--ink-primary)]">
            What coins are worth
          </h1>
          <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
            You fund this shelf out of your own inventory. A credits line costs
            you nothing and a spare key costs you one unit — and both are worth
            real money to a tester, which is why the economy works without
            anyone buying coins.
          </p>

          <div className="mt-[var(--space-8)]">
            <RewardShelfManager
              campaignId={campaignId}
              items={shelf.items.map((item) => ({ ...item }))}
              claims={shelf.claims.map((claim) => ({
                ...claim,
                createdAt: claim.createdAt.toISOString(),
              }))}
            />
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}
