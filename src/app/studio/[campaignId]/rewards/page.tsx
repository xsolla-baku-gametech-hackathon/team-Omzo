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
      <div className="max-w-[var(--stage-container)]">
        <h1 className="text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] font-semibold text-[var(--ink-primary)]">
          What coins are worth
        </h1>
        <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
          You fund this shelf out of your own inventory. A credits line costs
          you nothing and a spare key costs you one unit — and both are worth
          real money to a tester, which is why the economy works without anyone
          buying coins.
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
    </ConsoleShell>
  );
}
