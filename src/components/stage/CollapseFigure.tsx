"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * CollapseFigure — UI_SPEC.md §3.1, restyled per UI_SPEC_V2_DARK.md §4.3
 *
 * 400 scattered marks resolving once into 12 blocks over 1.6s, staggered,
 * then still. No loop, no scroll-triggered replay.
 *
 * This is the page's one moment, and it earns that place by being the
 * product's actual argument rendered as motion rather than a decorative
 * glow. Under prefers-reduced-motion it renders the end state immediately.
 */

const MARK_COUNT = 400;
const BLOCK_COUNT = 12;
/** 20 x 20 = MARK_COUNT. The loose grid the marks scatter across. */
const GRID = 20;

interface CollapseFigureProps {
  /** Static renders the collapsed end state with no motion at all (§4.5). */
  readonly animate?: boolean;
  readonly className?: string;
}

export function CollapseFigure({
  animate = true,
  className = "",
}: CollapseFigureProps) {
  // Server and first client paint must agree, so start collapsed and scatter
  // only once we know motion is wanted. Rendering scattered first would flash
  // the noise state for a reader who asked for no motion.
  const [phase, setPhase] = useState<"collapsed" | "scattered">("collapsed");

  useEffect(() => {
    if (!animate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setPhase("scattered");
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => setPhase("collapsed")),
    );
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const marks = useMemo(
    () =>
      Array.from({ length: MARK_COUNT }, (_, i) => {
        // A loose grid, not an explosion (UI_SPEC.md §3.1): 20 x 20 with a
        // deterministic jitter, so the scatter stays inside the figure's own
        // band instead of flying across the headline, and so the server and
        // the client render the identical figure.
        const col = i % GRID;
        const row = Math.floor(i / GRID);
        return {
          id: i,
          x: (col - (GRID - 1) / 2) * 26 + (((i * 37) % 11) - 5),
          y: (row - (GRID - 1) / 2) * 9 + (((i * 53) % 7) - 3),
          delay: (i % 24) * 25,
        };
      }),
    [],
  );

  const blocks = useMemo(
    () =>
      Array.from({ length: BLOCK_COUNT }, (_, i) =>
        marks.slice(
          Math.floor((i * MARK_COUNT) / BLOCK_COUNT),
          Math.floor(((i + 1) * MARK_COUNT) / BLOCK_COUNT),
        ),
      ),
    [marks],
  );

  const collapsed = phase === "collapsed";

  return (
    <div
      aria-hidden="true"
      // 12 blocks on a 4- or 6-column grid so they land in even rows. Left
      // to wrap freely they broke 9 + 3, which reads as a mistake.
      className={`relative mx-auto grid grid-cols-4 justify-items-center gap-[var(--space-4)] sm:grid-cols-6 sm:gap-[var(--space-6)] ${className}`}
    >
      {blocks.map((block, index) => (
        <div
          key={index}
          className="grid w-[32px] shrink-0 grid-cols-6 gap-[2px] sm:w-[38px]"
        >
          {block.map((mark) => (
            <span
              key={mark.id}
              className="block h-[3px] w-[3px]"
              style={{
                // Collapsed marks resolve to --accent at 60% with a small
                // glow; scattered ones are the unsorted noise (§4.3).
                backgroundColor: collapsed
                  ? "color-mix(in srgb, var(--accent) 60%, transparent)"
                  : "var(--mark-scatter)",
                boxShadow: collapsed
                  ? "0 0 4px color-mix(in srgb, var(--accent) 40%, transparent)"
                  : "none",
                transform: collapsed
                  ? "translate(0px, 0px)"
                  : `translate(${mark.x}px, ${mark.y}px)`,
                // Only the collapse animates. Transitioning *into* the
                // scattered state would spend the whole 1.6s budget flying
                // outward and then get interrupted, which is why the marks
                // barely moved: the scatter must be instant.
                transition: collapsed
                  ? `transform var(--dur-collapse) var(--ease-standard) ${mark.delay}ms, background-color var(--dur-collapse) var(--ease-standard) ${mark.delay}ms, box-shadow var(--dur-collapse) var(--ease-standard) ${mark.delay}ms`
                  : "none",
                willChange: collapsed ? "transform" : undefined,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
