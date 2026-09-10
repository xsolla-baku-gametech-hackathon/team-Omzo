import type { ReactNode } from "react";

/**
 * StageSection — UI_SPEC_V2_DARK.md §4.1
 *
 * Every marketing section is the same shape: pill, heading, subline,
 * content. Centred. That repetition is what makes a long page feel calm
 * instead of long, so it is worth copying exactly.
 *
 * The section is the wrapper a bloom belongs to — never a content element.
 * Content sits above it via .stage-content.
 */
interface StageSectionProps {
  readonly eyebrow?: ReactNode;
  readonly heading?: string;
  readonly subline?: string;
  readonly children?: ReactNode;
  /** A bloom layer. Rendered behind the content, inside the wrapper. */
  readonly bloom?: ReactNode;
  readonly className?: string;
}

export function StageSection({
  eyebrow,
  heading,
  subline,
  children,
  bloom,
  className = "",
}: StageSectionProps) {
  return (
    <section
      className={`relative overflow-hidden px-[var(--space-6)] py-[var(--stage-section-y)] ${className}`}
    >
      {bloom}
      <div className="stage-content mx-auto max-w-[var(--stage-container)]">
        {(eyebrow || heading || subline) && (
          <div className="mx-auto max-w-[var(--stage-measure)] text-center">
            {eyebrow}
            {heading && (
              <h2 className="mt-[var(--space-5)] text-[length:var(--type-section-size)] leading-[var(--type-section-lh)] tracking-[var(--type-section-ls)] font-semibold text-balance text-[var(--ink-primary)]">
                {heading}
              </h2>
            )}
            {subline && (
              <p className="mx-auto mt-[var(--space-4)] max-w-[var(--stage-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)]">
                {subline}
              </p>
            )}
          </div>
        )}
        {children && <div className="mt-[var(--space-12)]">{children}</div>}
      </div>
    </section>
  );
}
