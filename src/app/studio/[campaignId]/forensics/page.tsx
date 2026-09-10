import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ForensicsUpload } from "@/components/ForensicsUpload";
import { ThemeToggle } from "@/components/ThemeToggle";
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
    <main className="min-h-screen bg-[var(--color-surface-page)] text-[var(--color-ink-primary)] font-sans">
      <header className="border-b border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/studio" className="font-semibold text-sm text-[var(--color-ink-primary)]">
              Repro
            </Link>
            <span className="text-[var(--color-line-hairline)]">/</span>
            <Link
              href={`/studio/${campaignId}`}
              className="text-xs text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)]"
            >
              {campaign.title}
            </Link>
            <span className="text-[var(--color-line-hairline)]">/</span>
            <span className="text-xs text-[var(--color-ink-primary)] font-medium">Forensics</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink-primary)]">
            Trace a leaked frame
          </h1>
          <p className="mt-2 text-[15px] text-[var(--color-ink-secondary)] max-w-[68ch] leading-relaxed">
            Every build session embeds the tester&rsquo;s identifier into pixel brightness. Upload a lossless PNG to recover their identity.
          </p>
        </div>

        <ForensicsUpload />

        <section className="border-t border-[var(--color-line-hairline)] pt-8 space-y-4">
          <h2 className="text-[14px] font-semibold text-[var(--color-ink-primary)]">
            What forensic watermarking can and cannot do
          </h2>
          <p className="text-[13px] text-[var(--color-ink-secondary)] max-w-[68ch] leading-relaxed">
            The watermark survives lossless PNG capture, high-DPI scaling, and 2× or 3× downscales. It cannot survive lossy JPEG compression, heavy Instagram-style filters, or photographing a physical screen with a phone camera. When the mark is unrecoverable, this screen states so plainly rather than guessing.
          </p>
        </section>
      </div>
    </main>
  );
}
