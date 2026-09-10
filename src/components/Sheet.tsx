"use client";

import { useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";

interface SheetProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Sheet({
  isOpen,
  onClose,
  title,
  children,
  className = "",
}: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs md:items-center md:justify-center p-0 md:p-6"
    >
      <div
        ref={sheetRef}
        className={`w-full md:max-w-xl max-h-[90vh] flex flex-col bg-[var(--surface-raised)] border-t md:border border-[var(--line-subtle)] rounded-t-[var(--radius-md)] md:rounded-[var(--radius-md)] shadow-[var(--elevation-sheet)] pb-[env(safe-area-inset-bottom,16px)] overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-200 ${className}`}
      >
        {/* Grab Handle */}
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--line-strong)]" />
        </div>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--line-subtle)] flex items-center justify-between shrink-0">
          <h2 className="text-[16px] font-semibold text-[var(--ink-primary)] tracking-[-0.01em]">
            {title ?? ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sheet"
            className="p-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
