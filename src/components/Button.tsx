import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

/**
 * Button — UI_SPEC_V2_DARK.md §6
 *
 * Three variants. Flat: no gradient, no glow. The reference's buttons are
 * flat and that restraint is why the page's actual bloom reads as light
 * rather than as styling.
 *
 * Focus is a 2px --accent ring at 2px offset on all three, never removed
 * and never replaced by a background change (UI_SPEC.md §5).
 */
export type ButtonVariant = "primary" | "secondary" | "quiet";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

const VARIANT: Record<ButtonVariant, string> = {
  // --accent-on-fill rather than #FFFFFF: white on #8B5CF6 is 4.23:1,
  // under AA for text at this size. See the audit in tokens.css.
  primary:
    "bg-[var(--accent)] text-[var(--accent-on-fill)] hover:bg-[var(--accent-hover)]",
  secondary:
    "bg-transparent text-[var(--ink-primary)] border border-[var(--line-medium)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover-subtle)]",
  quiet:
    "bg-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", className = "", children, ...props }, ref) => (
    <button
      ref={ref}
      className={[
        "inline-flex items-center justify-center gap-2 cursor-pointer",
        "h-[var(--control-h-touch)] md:h-[var(--control-h)] px-[var(--control-pad-x)]",
        "rounded-[var(--radius-sm)]",
        "text-[length:var(--type-ui-size)] leading-[var(--type-ui-lh)] font-medium",
        "transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)]",
        // Active drops 1px (§6). Translate, not a colour change.
        "active:translate-y-px",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0",
        // Focus ring comes from the global :focus-visible rule so it cannot
        // be dropped by a variant or overridden by a caller's className.
        VARIANT[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  ),
);

Button.displayName = "Button";
