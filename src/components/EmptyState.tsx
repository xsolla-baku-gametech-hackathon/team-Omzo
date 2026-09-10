import type { ReactNode } from "react";

/**
 * EmptyState — UI_SPEC.md §4, restyled to UI_SPEC_V2_DARK.md §1.
 * Heading, one line, one action.
 *
 * "An empty screen is an instruction, not an apology." Left-aligned and
 * unboxed: this is a Console surface, and V2 §5 has no centred text and
 * no cards in the product. Grouping comes from space, not from a border.
 */
interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`py-[var(--space-12)] ${className}`}>
      <h3 className="text-[length:var(--type-heading-size)] leading-[var(--type-heading-lh)] tracking-[var(--type-heading-ls)] font-[550] text-[var(--ink-primary)]">
        {title}
      </h3>
      <p className="mt-[var(--space-2)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
        {description}
      </p>
      {action && <div className="mt-[var(--space-6)]">{action}</div>}
    </div>
  );
}
