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
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 ${className}`}
      >
        {screenshots.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setLightboxIndex(idx)}
            aria-label={`View screenshot from scene ${item.scene ?? "unknown"}`}
            className="group relative aspect-video w-full overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-line-hairline)] bg-[var(--color-surface-sunken)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] cursor-pointer text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={item.caption || `Report screenshot from scene ${item.scene ?? "unknown"}`}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            />
            {item.scene && (
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-[var(--radius-sm)] bg-black/60 text-white text-[11px] font-mono backdrop-blur-xs">
                {item.scene}
              </div>
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
