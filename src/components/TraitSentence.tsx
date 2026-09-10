/**
 * TraitSentence — UI_SPEC.md §3.3, §4
 * Renders the shared-traits observation as an authoritative sentence.
 * "A sentence a developer can act on beats a pie chart."
 */
interface TraitSentenceProps {
  readonly sentence: string;
  readonly className?: string;
}

export function TraitSentence({ sentence, className = "" }: TraitSentenceProps) {
  if (!sentence) return null;

  return (
    <div
      className={`p-5 md:p-6 bg-[var(--color-surface-raised)] border border-[var(--color-line-hairline)] rounded-[var(--radius-md)] ${className}`}
    >
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-ink-secondary)] font-semibold mb-2">
        Shared Pattern Observation
      </div>
      <p className="text-[15px] leading-[1.6] text-[var(--color-ink-primary)] max-w-[68ch] font-normal">
        {sentence}
      </p>
    </div>
  );
}
