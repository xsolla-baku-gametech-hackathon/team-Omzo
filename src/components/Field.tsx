import type { ReactNode } from "react";

/**
 * Field — UI_SPEC.md §4
 * Label, input, error, help text in one consistent block.
 */
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
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="block text-[13px] font-medium text-[var(--color-ink-primary)]"
        >
          {label} {required && <span className="text-[var(--color-alert)]">*</span>}
        </label>
      </div>

      {children}

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[12px] font-medium text-[var(--color-alert)] mt-1">
          {error}
        </p>
      ) : helpText ? (
        <p id={`${id}-help`} className="text-[12px] text-[var(--color-ink-secondary)] mt-1">
          {helpText}
        </p>
      ) : null}
    </div>
  );
}
