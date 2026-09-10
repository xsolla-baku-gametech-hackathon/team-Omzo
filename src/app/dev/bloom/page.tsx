/**
 * A proving page for the three bloom primitives — UI_SPEC_V2_DARK.md §8.4.
 *
 * Not linked from anywhere and not part of the product. It exists so the
 * primitives can be looked at in isolation, because a halo is very easy to
 * get subtly wrong (a blob instead of an arc) and impossible to judge once
 * it is behind real content.
 */
export const metadata = { robots: { index: false, follow: false } };

function Label({ children }: { readonly children: string }) {
  return (
    <p className="stage-content mb-[var(--space-4)] text-[length:var(--type-meta-size)] text-[var(--ink-tertiary)]">
      {children}
    </p>
  );
}

export default function BloomProofPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-page)] px-[var(--console-pad)] py-[var(--space-12)] text-[var(--ink-primary)]">
      <h1 className="text-[length:var(--type-title-size)] leading-[var(--type-title-lh)] tracking-[var(--type-title-ls)] font-semibold">
        Bloom primitives
      </h1>
      <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
        Stage surfaces only. Each of these is a section wrapper with one bloom
        layer inside it and the content above at z-index 1.
      </p>

      <section className="relative mt-[var(--space-12)] overflow-hidden border-t border-[var(--line-subtle)] pt-[var(--space-16)] pb-[var(--space-16)]">
        <div className="bloom-halo top-0" />
        <Label>bloom-halo — the arc, anchored at the top of the section</Label>
        <p className="stage-content max-w-[var(--stage-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
          The arc should read as light coming from behind the top edge, not as
          an ellipse floating in the page. If you can see where it ends, the
          blur is too low.
        </p>
      </section>

      <section className="relative mt-[var(--space-12)] overflow-hidden border-t border-[var(--line-subtle)] pt-[var(--space-16)] pb-[var(--space-16)]">
        <div className="bloom-halo bloom-halo-up bottom-0" />
        <Label>
          bloom-halo-up — the mirror, curving upward from the bottom edge
        </Label>
      </section>

      <section className="relative mt-[var(--space-12)] overflow-hidden border-t border-[var(--line-subtle)] pt-[var(--space-16)] pb-[var(--space-16)]">
        <div className="bloom-ambient -left-[10%] top-[10%]" />
        <Label>
          bloom-ambient — off-axis, so it does not read as decoration
        </Label>
      </section>

      <section className="mt-[var(--space-12)] border-t border-[var(--line-subtle)] pt-[var(--space-16)] pb-[var(--space-16)]">
        <Label>edge-lit — a rim on a raised surface, the one Console use</Label>
        <div className="edge-lit max-w-[var(--stage-measure)] rounded-[var(--radius-xl)] bg-[var(--surface-overlay)] p-[var(--space-6)]">
          <p className="text-[length:var(--type-body-size)] text-[var(--ink-secondary)]">
            The rim should brighten the top edge at its centre and fade to
            nothing at both corners.
          </p>
        </div>
      </section>
    </main>
  );
}
