"use client";

import { useEffect, useCallback } from "react";

interface LightboxProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly images: readonly { url: string; alt?: string; caption?: string }[];
  readonly currentIndex: number;
  readonly onIndexChange: (index: number) => void;
}

export function Lightbox({
  isOpen,
  onClose,
  images,
  currentIndex,
  onIndexChange,
}: LightboxProps) {
  const current = images[currentIndex];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        onIndexChange((currentIndex - 1 + images.length) % images.length);
      } else if (e.key === "ArrowRight") {
        onIndexChange((currentIndex + 1) % images.length);
      }
    },
    [isOpen, onClose, currentIndex, images.length, onIndexChange],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen || !current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot lightbox"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
    >
      <div className="relative max-w-5xl w-full flex flex-col items-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close lightbox"
          className="absolute -top-10 right-0 text-white/80 hover:text-white text-lg font-mono p-2 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        >
          ✕
        </button>

        <div className="relative w-full aspect-video bg-black flex items-center justify-center rounded-[var(--radius-md)] overflow-hidden shadow-[var(--elevation-modal)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={current.alt || "Report screenshot"}
            className="max-h-full max-w-full object-contain"
          />

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() =>
                  onIndexChange((currentIndex - 1 + images.length) % images.length)
                }
                aria-label="Previous screenshot"
                className="absolute left-3 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white bg-black/50 hover:bg-black/80 rounded-full focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() =>
                  onIndexChange((currentIndex + 1) % images.length)
                }
                aria-label="Next screenshot"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-3 text-white/70 hover:text-white bg-black/50 hover:bg-black/80 rounded-full focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              >
                ›
              </button>
            </>
          )}
        </div>

        <div className="mt-3 text-center text-[13px] text-white/80 flex items-center gap-4">
          <span>
            {currentIndex + 1} of {images.length}
          </span>
          {current.caption && <span>· {current.caption}</span>}
        </div>
      </div>
    </div>
  );
}
