import Link from "next/link";

import { CollapseFigure } from "@/components/stage/CollapseFigure";
import { EyebrowPill } from "@/components/stage/EyebrowPill";
import { StageSection } from "@/components/stage/StageSection";
import { getLandingStats } from "@/server/services/landingStats";

/**
 * Landing — UI_SPEC_V2_DARK.md §4.
 *
 * A Stage surface: centred, very airy, and the only place in the product
 * where anything glows. At most two halos on the whole page — one above
 * the hero, one at the closing call to action. A third makes it a
 * screensaver.
 */

/* Icons are inline SVG, not a package. V2 §4.4 asks for 20px lucide icons,
   but UI_SPEC.md §0.7 says do not add a UI library, and §8 has a
   payload budget. Six 20px glyphs are not worth a dependency. */
function Icon({ path }: { readonly path: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-[var(--accent)] opacity-80"
    >
      <path d={path} />
    </svg>
  );
}

const FEATURES: ReadonlyArray<{
  readonly icon: string;
  readonly title: string;
  readonly body: string;
}> = [
  {
    icon: "M3 6h18M7 12h10M10 18h4",
    title: "Four signals, one decision",
    body: "Wording, position in the scene, console signature and hardware are scored separately. When they disagree, the report waits for a human.",
  },
  {
    icon: "M12 3v18M5 8l7-5 7 5",
    title: "Duplicates collapse on arrival",
    body: "A report joins an existing issue as it lands. Nobody triages a backlog of the same bug written twenty ways.",
  },
  {
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    title: "Every frame carries its source",
    body: "A build session embeds the tester's identifier in pixel luminance. A leaked lossless frame names who it came from.",
  },
  {
    icon: "M4 4h16v12H5.2L4 18.4z",
    title: "Noise is caught, not counted",
    body: "Questions, chat and empty submissions are scored as noise and kept out of the occurrence counts rewards are paid against.",
  },
  {
    icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    title: "One bug, one payout",
    body: "Rewards attach to a verified issue, not to a submission. Ten testers finding the same crash split one verification.",
  },
  {
    icon: "M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zM12 7v5l3 3",
    title: "Runs with the Wi-Fi off",
    body: "Clustering, watermarking and scoring are all local. There is no model to call and nothing to wait for.",
  },
];

const SECURITY_LAYERS: ReadonlyArray<{
  readonly claim: string;
  readonly limit: string;
}> = [
  {
    claim:
      "Access tokens are signed with HMAC-SHA256, expire after 15 minutes, and bind to the tester's browser.",
    limit:
      "A tester who shares their screen while playing has shared the build. Binding proves who held the link, not who watched it.",
  },
  {
    claim:
      "Exported frames carry a 16-bit watermark in pixel luminance that survives 2x and 3x downscaling.",
    limit:
      "It does not survive lossy JPEG, heavy filters, or a phone photographing a monitor. When the mark is gone this is said plainly rather than guessed.",
  },
  {
    claim:
      "The NDA is recorded against a legal name and a timestamp before a build is ever served.",
    limit:
      "It is a record of agreement, not a technical control. It establishes accountability; it does not stop a capture card.",
  },
];

export default async function Home() {
  const stats = await getLandingStats();

  return (
    <div className="min-h-screen bg-[var(--surface-page)] font-sans text-[var(--ink-primary)]">
      <header className="sticky top-0 z-30 h-[var(--console-topbar-h)] border-b border-[var(--line-subtle)] bg-[var(--surface-page)]/85 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[var(--stage-container)] items-center justify-between px-[var(--space-6)]">
          <span className="text-[length:var(--type-ui-size)] font-semibold tracking-[var(--type-heading-ls)]">
            Repro
          </span>
          <nav className="flex items-center gap-[var(--space-6)] text-[length:var(--type-meta-size)]">
            <Link
              href="/play"
              className="text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
            >
              Play
            </Link>
            <Link
              href="/studio"
              className="text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
            >
              Studio
            </Link>
            <Link
              href="/login"
              className="text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-[var(--space-6)] pt-[var(--stage-section-y)] pb-[var(--stage-section-y)]">
        <div className="bloom-halo top-0" />

        <div className="stage-content mx-auto flex max-w-[var(--stage-container)] flex-col items-center text-center">
          <EyebrowPill>Triage</EyebrowPill>

          <h1 className="mt-[var(--space-6)] text-[length:var(--type-hero-size)] leading-[var(--type-hero-lh)] tracking-[var(--type-hero-ls)] font-semibold text-[var(--ink-primary)]">
            {stats.reports} raw playtest reports.
            <br />
            {stats.issues} issues a developer can fix.
          </h1>

          <p className="mt-[var(--space-6)] max-w-[var(--stage-hero-sub-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
            Repro sits between your testers and your issue tracker. It clusters
            duplicate reports as they arrive, watermarks every build it serves,
            and pays testers once per bug rather than once per message.
          </p>

          <div className="mt-[var(--space-8)] flex w-full flex-col items-center justify-center gap-[var(--space-3)] sm:w-auto sm:flex-row">
            <Link
              href="/studio"
              className="inline-flex h-[var(--control-h-touch)] w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-[var(--control-pad-x)] text-[length:var(--type-ui-size)] font-medium text-[var(--accent-on-fill)] transition-colors hover:bg-[var(--accent-hover)] active:translate-y-px sm:w-auto md:h-[var(--control-h)]"
            >
              Open the board
            </Link>
            <Link
              href="/play"
              className="inline-flex h-[var(--control-h-touch)] w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line-medium)] px-[var(--control-pad-x)] text-[length:var(--type-ui-size)] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover-subtle)] active:translate-y-px sm:w-auto md:h-[var(--control-h)]"
            >
              Playtest a game
            </Link>
          </div>

          <CollapseFigure className="mt-[var(--space-16)] w-full max-w-[580px]" />
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <StageSection
        eyebrow={<EyebrowPill>What it does</EyebrowPill>}
        heading="Six things, done plainly"
        subline="No model calls, no vector database, no dashboard of charts nobody reads."
      >
        {/* No border and no background: six plain columns, and the grid
            gutters already group them (§4.4). */}
        <div className="grid grid-cols-1 gap-x-[var(--space-8)] gap-y-[var(--space-10)] text-left sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <Icon path={feature.icon} />
              <h3 className="mt-[var(--space-3)] text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]">
                {feature.title}
              </h3>
              <p className="mt-[var(--space-2)] line-clamp-3 text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-secondary)]">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </StageSection>

      {/* ── Deep dive 1: triage ──────────────────────────────────────── */}
      <StageSection
        eyebrow={<EyebrowPill>Triage</EyebrowPill>}
        heading="The collapse is the product"
        subline={`In the seeded campaign, ${stats.reports} reports resolve to ${stats.issues} issues. Every one of those merges is a duplicate a developer never has to read twice.`}
        bloom={<div className="bloom-ambient -left-[15%] top-[20%]" />}
      >
        <div className="flex flex-col items-center">
          <CollapseFigure animate={false} className="w-full max-w-[520px]" />
          <dl className="mt-[var(--space-10)] grid w-full max-w-[var(--stage-measure)] grid-cols-3 gap-[var(--space-6)] text-center">
            {[
              [stats.reports, "reports in"],
              [stats.issues, "issues out"],
              [stats.noise, "scored as noise"],
            ].map(([value, label]) => (
              <div key={label as string}>
                <dt className="tabular-nums text-[length:var(--type-section-size)] leading-[var(--type-section-lh)] tracking-[var(--type-section-ls)] font-semibold text-[var(--ink-primary)]">
                  {value}
                </dt>
                <dd className="mt-[var(--space-1)] text-[length:var(--type-meta-size)] text-[var(--ink-secondary)]">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </StageSection>

      {/* ── Deep dive 2: security ────────────────────────────────────── */}
      <StageSection
        eyebrow={<EyebrowPill>Security</EyebrowPill>}
        heading="Three layers, and what each one cannot do"
        subline="Every claim below is followed by its limit, in the same size text. A security page that only lists strengths is telling you half of something."
      >
        <div className="mx-auto max-w-[var(--stage-measure)] text-left">
          {SECURITY_LAYERS.map((layer) => (
            <div
              key={layer.claim}
              className="border-t border-[var(--line-subtle)] py-[var(--space-6)]"
            >
              <p className="text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-primary)]">
                {layer.claim}
              </p>
              {/* Same size, not smaller, not greyer (§4.5). */}
              <p className="mt-[var(--space-3)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
                {layer.limit}
              </p>
            </div>
          ))}
        </div>
      </StageSection>

      {/* ── Deep dive 3: rewards ─────────────────────────────────────── */}
      <StageSection
        eyebrow={<EyebrowPill>Rewards</EyebrowPill>}
        heading="Ten testers, one crash, one payout"
        subline="Rewards attach to a verified issue rather than to a submission. Finding a bug someone already found is still worth something — but it is not worth ten times the bug."
        bloom={<div className="bloom-ambient -right-[15%] top-[10%]" />}
      >
        <div className="mx-auto max-w-[var(--stage-measure)] overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-raised)] text-left">
          {[
            ["Tester 04", "First to report the lift crash", "+120"],
            ["Tester 11", "Same crash, confirmed duplicate", "+15"],
            ["Tester 32", "Same crash, confirmed duplicate", "+15"],
            [
              "Issue verified",
              "One payout, split by contribution",
              "150 total",
            ],
          ].map(([who, what, amount], index, all) => (
            <div
              key={who}
              className={`flex items-baseline justify-between gap-[var(--space-4)] px-[var(--space-5)] py-[var(--space-4)] ${
                index < all.length - 1
                  ? "border-b border-[var(--line-subtle)]"
                  : "bg-[var(--accent-wash)]"
              }`}
            >
              <div className="min-w-0">
                <div className="text-[length:var(--type-ui-size)] text-[var(--ink-primary)]">
                  {who}
                </div>
                <div className="mt-[var(--space-1)] text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
                  {what}
                </div>
              </div>
              <span className="shrink-0 tabular-nums text-[length:var(--type-ui-size)] text-[var(--ink-secondary)]">
                {amount}
              </span>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-[var(--space-4)] max-w-[var(--stage-measure)] text-left text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-tertiary)]">
          Coins are redeemed for rewards the studio provides. They are not money
          and Repro does not exchange them for any.
        </p>
      </StageSection>

      {/* ── Closing call to action ───────────────────────────────────── */}
      <section className="relative overflow-hidden px-[var(--space-6)] py-[var(--stage-section-y)]">
        {/* The mirror of the hero: anchored at the bottom so it curves up. */}
        <div className="bloom-halo bloom-halo-up bottom-0" />

        <div className="stage-content mx-auto max-w-[var(--stage-measure)] text-center">
          <h2 className="text-[length:var(--type-section-size)] leading-[var(--type-section-lh)] tracking-[var(--type-section-ls)] font-semibold text-balance text-[var(--ink-primary)]">
            Point your next playtest at it
          </h2>
          <p className="mx-auto mt-[var(--space-4)] max-w-[var(--stage-hero-sub-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
            The seeded campaign is loaded and the board is live. Nothing here
            needs an account you do not already have.
          </p>
          <div className="mt-[var(--space-8)] flex flex-col items-center justify-center gap-[var(--space-3)] sm:flex-row">
            <Link
              href="/studio"
              className="inline-flex h-[var(--control-h-touch)] w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-[var(--control-pad-x)] text-[length:var(--type-ui-size)] font-medium text-[var(--accent-on-fill)] transition-colors hover:bg-[var(--accent-hover)] active:translate-y-px sm:w-auto md:h-[var(--control-h)]"
            >
              Open the board
            </Link>
            <Link
              href="/play"
              className="inline-flex h-[var(--control-h-touch)] w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line-medium)] px-[var(--control-pad-x)] text-[length:var(--type-ui-size)] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover-subtle)] active:translate-y-px sm:w-auto md:h-[var(--control-h)]"
            >
              Join as a tester
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--line-subtle)] px-[var(--space-6)] py-[var(--space-12)]">
        <div className="mx-auto grid max-w-[var(--stage-container)] grid-cols-2 gap-[var(--space-8)] text-left sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[length:var(--type-ui-size)] font-semibold text-[var(--ink-primary)]">
              Repro
            </div>
            <p className="mt-[var(--space-2)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-tertiary)]">
              Playtest reports in, fixable issues out.
            </p>
          </div>

          {[
            {
              heading: "Product",
              links: [
                ["Studio board", "/studio"],
                ["Tester access", "/play"],
                ["Sign in", "/login"],
              ],
            },
            {
              heading: "Account",
              links: [
                ["Register a studio", "/register"],
                ["Your rewards", "/me"],
              ],
            },
            {
              heading: "Project",
              links: [["Source", "https://github.com"]],
            },
          ].map((column) => (
            <div key={column.heading}>
              <div className="text-[length:var(--type-meta-size)] text-[var(--ink-secondary)]">
                {column.heading}
              </div>
              <ul className="mt-[var(--space-3)] space-y-[var(--space-2)]">
                {column.links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)] transition-colors hover:text-[var(--ink-secondary)]"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
