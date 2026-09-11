import { notFound, redirect } from "next/navigation";

import { CampaignAnalyticsReport } from "@/components/CampaignAnalyticsReport";
import { ConsoleNavLink, ConsoleShell } from "@/components/ConsoleShell";
import { getStudioCampaign } from "@/server/services/campaignService";
import {
  UnauthorizedIssueMutationError,
  getBoardForStudio,
} from "@/server/services/issueService";
import { getSession } from "@/server/session";

export default async function CampaignAnalyticsPage(props: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await props.params;
  const session = await getSession();

  if (!session || session.role !== "STUDIO" || !session.studioId) {
    redirect("/login");
  }

  let board;
  let campaign;
  try {
    [board, campaign] = await Promise.all([
      getBoardForStudio(campaignId, session.studioId),
      getStudioCampaign(campaignId, session.studioId),
    ]);
  } catch (error) {
    if (error instanceof UnauthorizedIssueMutationError) notFound();
    throw error;
  }

  return (
    <ConsoleShell
      campaignName={campaign.title}
      actions={
        <>
          <ConsoleNavLink href={`/studio/${campaignId}`}>Board</ConsoleNavLink>
          <ConsoleNavLink href={`/studio/${campaignId}/rewards`}>
            Rewards
          </ConsoleNavLink>
          <ConsoleNavLink href={`/studio/${campaignId}/forensics`}>
            Forensics
          </ConsoleNavLink>
        </>
      }
    >
      <CampaignAnalyticsReport
        campaignTitle={campaign.title}
        stats={board.stats}
        issues={board.issues.map((issue) => ({
          id: issue.id,
          title: issue.title,
          category: issue.category,
          severity: issue.severity,
          status: issue.status,
          occurrenceCount: issue.occurrenceCount,
        }))}
      />
    </ConsoleShell>
  );
}
