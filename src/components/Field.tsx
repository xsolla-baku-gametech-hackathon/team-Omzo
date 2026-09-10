import type { ReactNode } from "react";

/**
 * Field — UI_SPEC.md §4, restyled to UI_SPEC_V2_DARK.md §1/§3.
 * Label, input, error and help text in one consistent block.
 *
 * The input itself is passed as children so the caller keeps control of
 * its type and behaviour, but its appearance must not be reinvented per
 * form: apply `fieldInputClass` to it. Before this, every form styled its
 * own input, and several suppressed the focus ring with outline-none,
 * which UI_SPEC.md §5 forbids outright.
 */

/** The one input appearance. A sunken well, --line-medium border, 8px radius. */
export const fieldInputClass = [
  "w-full px-[var(--space-3)] h-[var(--control-h-touch)] md:h-[var(--control-h)]",
  "bg-[var(--surface-sunken)] text-[var(--ink-primary)]",
  "border border-[var(--line-medium)] rounded-[var(--radius-sm)]",
  "text-[length:var(--type-ui-size)] leading-[var(--type-ui-lh)]",
  "placeholder:text-[var(--ink-tertiary)]",
  "hover:border-[var(--line-strong)]",
  "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)]",
].join(" ");

/** Multiline variant — same skin, free height. */
export const fieldTextareaClass = [
  "w-full px-[var(--space-3)] py-[var(--space-2)]",
  "bg-[var(--surface-sunken)] text-[var(--ink-primary)]",
  "border border-[var(--line-medium)] rounded-[var(--radius-sm)]",
  "text-[length:var(--type-ui-size)] leading-[var(--type-body-lh)]",
  "placeholder:text-[var(--ink-tertiary)] resize-y",
  "hover:border-[var(--line-strong)]",
  "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)]",
].join(" ");

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string | null;
  readonly helpText?: string;
  readonly required?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Field({
  id,
  label,
  error,
  helpText,
  required = false,
  children,
  className = "",
}: FieldProps) {
  return (
    <div className={`space-y-[var(--space-2)] ${className}`}>
      <label
        htmlFor={id}
        className="block text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] font-medium text-[var(--ink-primary)]"
      >
        {label}
        {required && (
          <span className="text-[var(--sev-critical)]" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>

      {children}

      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] font-medium text-[var(--sev-critical)]"
        >
          {error}
        </p>
      ) : helpText ? (
        // --ink-tertiary is 3.67:1 and permitted for metadata only. Help text
        // is something a user reads in order to act, so it stays secondary.
        <p
          id={`${id}-help`}
          className="text-[length:var(--type-meta-size)] leading-[var(--type-meta-lh)] text-[var(--ink-secondary)]"
        >
          {helpText}
        </p>
      ) : null}
    </div>
  );
}
