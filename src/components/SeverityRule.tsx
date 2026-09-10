import type { Severity } from "@/domain/triage/types";

/**
 * SeverityRule — UI_SPEC.md §4
 * The 3px vertical indicator bar.
 * This is the ONLY component authorized to read alert and warn tokens.
 */
interface SeverityRuleProps {
  readonly severity: Severity;
  readonly className?: string;
}

export function SeverityRule({ severity, className = "" }: SeverityRuleProps) {
  const colorMap: Record<Severity, string> = {
    CRITICAL: "var(--color-alert)",
    HIGH: "var(--color-warn)",
    MEDIUM: "var(--color-neutral-mark)",
    LOW: "var(--color-line-strong)",
  };

  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: colorMap[severity] }}
      className={`w-[3px] self-stretch shrink-0 ${className}`}
    />
  );
}
