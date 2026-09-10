import { Fragment } from "react";

/**
 * TraitSentence — UI_SPEC.md §3.3, restyled to UI_SPEC_V2_DARK.md §5.3
 *
 * The aggregation stated as a sentence, not a chart. It is generated from
 * real aggregation and it is the most useful thing on the page, so it gets
 * its own block with nothing competing beside it.
 *
 * No card, no border, no fill: V2 §5 has no cards in the product. The
 * emphasis comes from weight, not from a box — numbers at --ink-primary
 * weight 550, the connecting words at --ink-secondary. That contrast makes
 * the sentence scannable as data while it still reads as English.
 */

/** Numbers, including decimals, and coordinate groups like (128, 0, 96). */
const FIGURE = /(\(\s*-?\d[\d.,\s-]*\)|-?\d+(?:\.\d+)?)/g;

interface TraitSentenceProps {
  readonly sentence: string;
  readonly className?: string;
}

export function TraitSentence({
  sentence,
  className = "",
}: TraitSentenceProps) {
  if (!sentence) return null;

  // split() with a capturing group keeps the separators, so the odd indices
  // are the figures and the even ones the prose between them.
  const parts = sentence.split(FIGURE);

  return (
    <p
      data-testid="trait-sentence"
      className={`my-[var(--space-8)] max-w-[var(--body-measure)] text-[length:var(--type-body-size)] leading-[var(--type-body-lh)] text-[var(--ink-secondary)] ${className}`}
    >
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span
            key={index}
            data-testid="trait-figure"
            className="font-[550] text-[var(--ink-primary)] tabular-nums"
          >
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
