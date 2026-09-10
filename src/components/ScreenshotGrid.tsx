"use client";

import { useState } from "react";
import { Lightbox } from "@/components/Lightbox";

export interface ScreenshotItem {
  readonly id: string;
  readonly url: string;
  readonly caption?: string;
  readonly scene?: string;
}

interface ScreenshotGridProps {
  readonly screenshots: readonly ScreenshotItem[];
  readonly className?: string;
}

export function ScreenshotGrid({
  screenshots,
  className = "",
}: ScreenshotGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (screenshots.length === 0) return null;

  return (
    <>
      <div
        className={`grid grid-cols-1 gap-[var(--space-3)] sm:grid-cols-2 lg:grid-cols-3 ${className}`}
      >
        {screenshots.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setLightboxIndex(idx)}
            aria-label={`View screenshot from scene ${item.scene ?? "unknown"}`}
            className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-[var(--radius-xs)] border border-[var(--line-subtle)] bg-[var(--surface-sunken)] text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={
                item.caption ||
                `Report screenshot from scene ${item.scene ?? "unknown"}`
              }
              loading="lazy"
              className="h-full w-full object-cover"
            />
            {item.scene && (
              <span className="absolute bottom-[var(--space-2)] left-[var(--space-2)] rounded-[var(--radius-xs)] bg-[var(--surface-page)]/80 px-[var(--space-2)] py-[2px] text-[length:var(--type-meta-size)] text-[var(--ink-secondary)]">
                {item.scene}
              </span>
            )}
          </button>
        ))}
      </div>

      <Lightbox
        isOpen={lightboxIndex !== null}
        currentIndex={lightboxIndex ?? 0}
        onIndexChange={(idx) => setLightboxIndex(idx)}
        onClose={() => setLightboxIndex(null)}
        images={screenshots.map((s) => ({
          url: s.url,
          alt: s.caption || `Report screenshot from ${s.scene ?? "game"}`,
          caption: s.caption || s.scene,
        }))}
      />
    </>
  );
}
