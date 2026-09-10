import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ForensicsUpload } from "@/components/ForensicsUpload";
import { getStudioCampaign } from "@/server/services/campaignService";
import { getSession } from "@/server/session";

/**
 * Forensics (SPEC.md §6.2).
 *
 * The page is reached from a campaign, but the search is not scoped to one:
 * watermark ids are globally unique, so there is nothing to pick from. Upload
 * a frame, get a name back — and only ever a name from one of your own
 * campaigns.
 */
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
    <main className="min-h-screen bg-paper">
      <header className="border-b border-hairline px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-baseline gap-3">
          <Link href="/studio" className="font-semibold tracking-tight">
            Repro
          </Link>
          <span className="text-hairline">/</span>
          <Link
            href={`/studio/${campaignId}`}
            className="text-label text-slate hover:text-ink"
          >
            {campaign.title}
          </Link>
          <span className="text-hairline">/</span>
          <span className="text-label text-ink">Forensics</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Trace a leaked frame
          </h1>
          <p className="mt-3 text-body text-slate max-w-measure">
            Every build session is watermarked with the tester&rsquo;s own
            identifier, invisibly, in the brightness of the frame. Upload an
            image and this reads it back.
          </p>
        </div>

        <ForensicsUpload />

        <section className="border-t border-hairline pt-6">
          <h2 className="text-label-lg text-ink">
            What this can and cannot do
          </h2>
          <p className="mt-2 text-label text-slate max-w-measure">
            The mark survives a lossless screenshot and a two- or three-fold
            reduction, which covers a frame captured on a high-density display
            and shared as a PNG. It does not survive re-encoding as JPEG, a
            filter, a crop, or a photograph of a monitor. When the pattern is
            gone this page says so rather than guessing, because the cost of a
            confident wrong answer here is an accusation against the wrong
            person.
          </p>
        </section>
      </div>
    </main>
  );
}
