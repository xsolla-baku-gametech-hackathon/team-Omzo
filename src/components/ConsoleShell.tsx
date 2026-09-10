import Link from "next/link";
import type { ReactNode } from "react";

/**
 * ConsoleShell — UI_SPEC_V2_DARK.md §5.1
 *
 * The whole product chrome: a 56px top bar and nothing else. Repro has
 * four product screens and a sidebar for four screens is furniture.
 *
 * No bloom, no centred text, no pills. This is the quiet back room of the
 * same building as the landing page — the palette is recognisable, but
 * nothing here glows.
 */
interface ConsoleShellProps {
  /** Shown after the wordmark, separated by a slash. */
  readonly campaignName?: string;
  /** Right side of the bar: campaign nav, user menu. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  /** Session and other full-bleed screens opt out of the padded container. */
  readonly bleed?: boolean;
}

export function ConsoleShell({
  campaignName,
  actions,
  children,
  bleed = false,
}: ConsoleShellProps) {
  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--ink-primary)] font-sans">
      <header className="h-[var(--console-topbar-h)] border-b border-[var(--line-subtle)] bg-[var(--surface-raised)]">
        <div className="mx-auto flex h-full max-w-[var(--console-max)] items-center justify-between gap-[var(--space-4)] px-[var(--console-pad)]">
          <div className="flex min-w-0 items-center gap-[var(--space-3)]">
            <Link
              href="/studio"
              className="shrink-0 text-[length:var(--type-ui-size)] font-semibold tracking-[var(--type-heading-ls)] text-[var(--ink-primary)]"
            >
              Repro
            </Link>
            {campaignName && (
              <>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-[var(--ink-tertiary)]"
                >
                  /
                </span>
                <span className="truncate text-[length:var(--type-meta-size)] text-[var(--ink-secondary)]">
                  {campaignName}
                </span>
              </>
            )}
          </div>
          {actions && (
            <nav className="flex shrink-0 items-center gap-[var(--space-4)] text-[length:var(--type-meta-size)]">
              {actions}
            </nav>
          )}
        </div>
      </header>

      {bleed ? (
        children
      ) : (
        <main className="mx-auto max-w-[var(--console-max)] px-[var(--console-pad)] py-[var(--console-pad)]">
          {children}
        </main>
      )}
    </div>
  );
}

/** A link in the top bar's right-hand nav. */
export function ConsoleNavLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-[var(--ink-secondary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--ink-primary)]"
    >
      {children}
    </Link>
  );
}
