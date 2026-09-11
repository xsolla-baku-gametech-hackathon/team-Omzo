import { notFound, redirect } from "next/navigation";

import { ConsoleNavLink, ConsoleShell } from "@/components/ConsoleShell";
import { toBoardIssue } from "@/components/boardIssue";
import { IssueBoard } from "@/components/IssueBoard";
import type { BoardIssue } from "@/components/IssueBoard";
import type { StreamReport } from "@/components/RawStream";
import { getStudioCampaign } from "@/server/services/campaignService";
import {
  UnauthorizedIssueMutationError,
  getBoardForStudio,
} from "@/server/services/issueService";
import { getSession } from "@/server/session";

export default async function CampaignBoardPage(props: {
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

  const issues: BoardIssue[] = board.issues.map(toBoardIssue);

  const reports: StreamReport[] = board.reports.map((report) => {
    const state = report.gameState as { scene?: string } | null;
    return {
      id: report.id,
      body: report.body,
      scene: state?.scene ?? "unknown",
      isNoise: report.isNoise,
      issueTitle: null,
      createdAt: report.createdAt.getTime(),
    };
  });

  return (
    <ConsoleShell
      campaignName={campaign.title}
      actions={
        <>
          <ConsoleNavLink href={`/studio/${campaignId}/rewards`}>
            Rewards
          </ConsoleNavLink>
          <ConsoleNavLink href={`/studio/${campaignId}/forensics`}>
            Forensics
          </ConsoleNavLink>
          <ConsoleNavLink href="/studio">Campaigns</ConsoleNavLink>
        </>
      }
    >
      <IssueBoard
        campaignId={campaignId}
        initialIssues={issues}
        initialReports={reports}
        initialStats={board.stats}
      />
    </ConsoleShell>
  );
}
