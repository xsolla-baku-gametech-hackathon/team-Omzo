import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

/**
 * Button — UI_SPEC.md §4
 * Three variants (primary, secondary, quiet).
 * One size on desktop, minimum 44px/48px height on touch targets.
 * Strict focus-visible state and token adherence.
 */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "alert";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", className = "", children, ...props }, ref) => {
    let variantStyles = "";

    switch (variant) {
      case "primary":
        variantStyles =
          "bg-[var(--color-accent)] text-white hover:opacity-90 active:opacity-95";
        break;
      case "secondary":
        variantStyles =
          "bg-[var(--color-surface-raised)] text-[var(--color-ink-primary)] border border-[var(--color-line-hairline)] hover:border-[var(--color-line-strong)] active:bg-[var(--color-surface-sunken)]";
        break;
      case "quiet":
        variantStyles =
          "bg-transparent text-[var(--color-ink-primary)] hover:bg-[var(--color-surface-sunken)] active:opacity-80";
        break;
      case "alert":
        variantStyles =
          "bg-[var(--color-alert)] text-white hover:opacity-90 active:opacity-95";
        break;
    }

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] md:min-h-[36px] rounded-[var(--radius-sm)] text-[14px] font-[450] tracking-[0] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2 ${variantStyles} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
