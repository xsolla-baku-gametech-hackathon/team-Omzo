import { NextResponse } from "next/server";

import { db } from "@/server/db";
import {
  getCampaignIssues,
  getCampaignReportsStream,
} from "@/server/services/issueService";

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: campaignId } = await props.params;

  try {
    const [issues, reports, reportCount, noiseCount] = await Promise.all([
      getCampaignIssues(campaignId),
      getCampaignReportsStream(campaignId, 50),
      db.report.count({ where: { campaignId } }),
      db.report.count({ where: { campaignId, isNoise: true } }),
    ]);

    return NextResponse.json({
      issues,
      reports,
      stats: {
        totalReports: reportCount,
        totalIssues: issues.length,
        noiseCount,
      },
    });
  } catch (error) {
    console.error("[getBoardData] error", error);
    return NextResponse.json(
      { error: "server_error", message: "Failed to fetch board data." },
      { status: 500 },
    );
  }
}
