import Link from "next/link";

/**
 * The Stage chrome — UI_SPEC_V2_DARK.md §4.
 *
 * Shared by every marketing surface so the navigation cannot drift between
 * them. It did: /pricing shipped without a link to itself because the header
 * was copied markup rather than a component.
 */
const NAV: ReadonlyArray<readonly [string, string]> = [
  ["Play", "/play"],
  ["Studio", "/studio"],
  ["Pricing", "/pricing"],
  ["Sign in", "/login"],
];

export function StageHeader() {
  return (
    <header className="sticky top-0 z-30 h-[var(--console-topbar-h)] border-b border-[var(--line-subtle)] bg-[var(--surface-page)]/85 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[var(--stage-container)] items-center justify-between px-[var(--space-6)]">
        <Link
          href="/"
          className="text-[length:var(--type-ui-size)] font-semibold tracking-[var(--type-heading-ls)] text-[var(--ink-primary)]"
        >
          Repro
        </Link>
        <nav className="flex items-center gap-[var(--space-5)] text-[length:var(--type-meta-size)] sm:gap-[var(--space-6)]">
          {NAV.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
