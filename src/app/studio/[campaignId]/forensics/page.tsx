import { notFound, redirect } from "next/navigation";

import { ConsoleNavLink, ConsoleShell } from "@/components/ConsoleShell";
import { ForensicsUpload } from "@/components/ForensicsUpload";
import { getStudioCampaign } from "@/server/services/campaignService";
import { getSession } from "@/server/session";

export default async function ForensicsPage(props: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await props.params;
  const session = await getSession();

  if (!session || session.role !== "STUDIO" || !session.studioId) {
    redirect("/login");
  }

  const campaign = await getStudioCampaign(campaignId, session.studioId);
  if (campaign === null) notFound();

  return (
    <ConsoleShell
      campaignName={campaign.title}
      actions={
        <ConsoleNavLink href={`/studio/${campaignId}`}>Board</ConsoleNavLink>
      }
    >
      <div className="max-w-[var(--stage-container)]">
        <h1 className="text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] font-semibold text-[var(--ink-primary)]">
          Trace a leaked frame
        </h1>
        <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
          Every build session embeds the tester&rsquo;s identifier into pixel
          brightness. Upload a lossless PNG to recover their identity.
        </p>

        <div className="mt-[var(--space-8)]">
          <ForensicsUpload />
        </div>

        <section className="mt-[var(--space-12)] border-t border-[var(--line-subtle)] pt-[var(--space-8)]">
          <h2 className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]">
            What forensic watermarking can and cannot do
          </h2>
          {/* The limits are stated in the same size as the claims — not
              smaller, not greyer (V2 §4.5). */}
          <p className="mt-[var(--space-3)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
            The watermark survives lossless PNG capture, high-DPI scaling, and
            2x or 3x downscales. It cannot survive lossy JPEG compression, heavy
            filters, or photographing a physical screen with a phone camera.
            When the mark is unrecoverable, this screen states so plainly rather
            than guessing.
          </p>
        </section>
      </div>
    </ConsoleShell>
  );
}
