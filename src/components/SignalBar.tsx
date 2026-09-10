/**
 * SignalBar — UI_SPEC_V2_DARK.md §5.4
 *
 * One of the four component signals behind a similarity score. 4px tall,
 * --surface-sunken track, --accent fill, label left and value right.
 *
 * Shown honestly, including when it is low. A studio that can see *why* the
 * system thinks two issues are related trusts it more than one shown a
 * confident verdict.
 */
export function SignalBar({
  label,
  value,
}: {
  readonly label: string;
  /** 0–1. Clamped, because a score above 1 would silently overflow the track. */
  readonly value: number;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-[var(--space-2)] text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)]">
        <span className="text-[var(--ink-secondary)]">{label}</span>
        <span className="tabular-nums text-[var(--ink-primary)]">
          {percent}%
        </span>
      </div>
      <div
        role="img"
        aria-label={`${label}: ${percent} percent`}
        className="mt-[var(--space-2)] h-[4px] w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--surface-sunken)]"
      >
        <div
          className="h-full bg-[var(--accent)]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
