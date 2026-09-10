import type { Severity } from "@/domain/triage/types";

/**
 * SeverityRule — UI_SPEC.md §4, UI_SPEC_V2_DARK.md §5.2
 *
 * The 3px full-height bar at the left of a row. No radius.
 * This is the ONLY component authorised to read the --sev-* tokens.
 *
 * Medium and low are grey on purpose — the eye should slide past them.
 * The bar never carries severity on its own: the row prints the word too
 * (UI_SPEC.md §5).
 */
interface SeverityRuleProps {
  readonly severity: Severity;
  /** Selected rows brighten the rule, and only the rule (V2 §5.2). */
  readonly selected?: boolean;
  readonly className?: string;
}

const SEVERITY_COLOUR: Record<Severity, string> = {
  CRITICAL: "var(--sev-critical)",
  HIGH: "var(--sev-high)",
  MEDIUM: "var(--sev-medium)",
  LOW: "var(--sev-low)",
};

export function SeverityRule({
  severity,
  selected = false,
  className = "",
}: SeverityRuleProps) {
  return (
    <span
      aria-hidden="true"
      data-testid="severity-rule"
      data-severity={severity}
      style={{
        backgroundColor: SEVERITY_COLOUR[severity],
        filter: selected ? "brightness(1.4)" : undefined,
      }}
      className={`w-[3px] self-stretch shrink-0 rounded-none ${className}`}
    />
  );
}
