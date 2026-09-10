import type { ReactNode } from "react";

/**
 * EmptyState — UI_SPEC.md §4
 * Heading, one line, one action.
 * "An empty screen is an instruction, not an apology."
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
    <div
      className={`border border-[var(--color-line-hairline)] bg-[var(--color-surface-sunken)] p-8 md:p-12 text-center rounded-[var(--radius-md)] ${className}`}
    >
      <h3 className="text-[16px] font-semibold text-[var(--color-ink-primary)] tracking-[-0.01em]">
        {title}
      </h3>
      <p className="text-[14px] text-[var(--color-ink-secondary)] mt-1.5 max-w-sm mx-auto leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
