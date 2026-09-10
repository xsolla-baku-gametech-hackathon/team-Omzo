import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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

  const issues: BoardIssue[] = board.issues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    category: issue.category,
    severity: issue.severity,
    status: issue.status,
    occurrenceCount: issue.occurrenceCount,
  }));

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
    <div className="min-h-screen bg-paper">
      <header className="border-b border-hairline bg-raised px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/studio" className="text-label-lg text-ink">
              Repro
            </Link>
            <span aria-hidden="true" className="text-hairline">
              /
            </span>
            <span className="truncate text-label text-slate">
              {campaign.title}
            </span>
          </div>
          <nav className="flex shrink-0 items-center gap-4 text-label">
            <Link
              href={`/studio/${campaignId}/forensics`}
              className="text-slate hover:text-ink"
            >
              Forensics
            </Link>
            <Link href="/studio" className="text-slate hover:text-ink">
              All campaigns
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <IssueBoard
          campaignId={campaignId}
          initialIssues={issues}
          initialReports={reports}
          initialStats={board.stats}
        />
      </main>
    </div>
  );
}
