"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem("repro-theme") as Theme | null;
    if (saved === "light" || saved === "dark" || saved === "system") {
      setTheme(saved);
      applyTheme(saved);
    }
  }, []);

  function applyTheme(newTheme: Theme) {
    if (newTheme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
      localStorage.removeItem("repro-theme");
    } else {
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("repro-theme", newTheme);
    }
  }

  function toggle() {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Current theme: ${theme}. Click to toggle.`}
      className="px-2 py-1 min-h-[36px] text-[12px] font-medium text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] border border-[var(--color-line-hairline)] rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)] transition-colors flex items-center gap-1.5"
    >
      <span aria-hidden="true">
        {theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🖥️"}
      </span>
      <span className="capitalize">{theme}</span>
    </button>
  );
}
