/**
 * EyebrowPill — UI_SPEC_V2_DARK.md §4.2
 *
 * The signature device on marketing surfaces, and V2 §0's second explicit
 * reversal of UI_SPEC.md §2, which forbade eyebrow text above headings.
 *
 * It stays forbidden inside the product. That is enforced by the lint rule
 * on this directory, not by memory.
 *
 * Sentence case, one or two words. Not all-caps, not a category label, not
 * a fake badge.
 */
export function EyebrowPill({ children }: { readonly children: string }) {
  return (
    <span className="inline-flex items-center rounded-[var(--radius-full)] border border-[var(--line-medium)] bg-[var(--accent-wash)] px-[var(--space-3)] py-[5px] text-[length:var(--type-pill-size)] leading-[var(--type-pill-lh)] tracking-[var(--type-pill-ls)] font-medium text-[var(--ink-secondary)]">
      {children}
    </span>
  );
}
