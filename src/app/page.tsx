"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMounted(true);

    if (!mql.matches) {
      const frame1 = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimated(true);
        });
      });
      return () => {
        cancelAnimationFrame(frame1);
      };
    } else {
      setAnimated(true);
    }
  }, []);

  const marks = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 400; i++) {
      // Scatter within a roughly 600x600 region
      const angle = (i / 400) * Math.PI * 2 + (i % 7);
      const radius = 80 + ((i * 47) % 240);
      const rx = Math.cos(angle) * radius;
      const ry = Math.sin(angle) * radius;
      const delay = (i % 24) * 25; // staggered animation

      arr.push({ id: i, rx, ry, delay });
    }
    return arr;
  }, []);

  const blocks = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const start = Math.floor((i * 400) / 12);
      const end = Math.floor(((i + 1) * 400) / 12);
      return marks.slice(start, end);
    });
  }, [marks]);

  return (
    <div className="min-h-screen bg-[var(--color-surface-page)] text-[var(--color-ink-primary)] font-sans flex flex-col selection:bg-[var(--color-accent-soft)]">
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-[var(--color-line-hairline)] bg-[var(--color-surface-page)]">
        <div className="font-semibold text-lg tracking-tight">
          Repro
        </div>
        <nav className="flex items-center gap-4 text-[14px]">
          <Link
            href="/play"
            className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] transition-colors"
          >
            Play
          </Link>
          <Link
            href="/studio"
            className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] transition-colors"
          >
            Studio
          </Link>
          <Link
            href="/login"
            className="text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] transition-colors"
          >
            Sign in
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      {/* Hero: The Triage Collapse */}
      <section className="flex flex-col items-center justify-center pt-16 pb-20 px-6 overflow-hidden">
        {/* 400 marks collapsing into 12 blocks */}
        <div
          aria-hidden="true"
          className="relative w-full max-w-[580px] h-[220px] flex flex-wrap gap-4 sm:gap-6 justify-center items-center mb-10"
        >
          {mounted &&
            blocks.map((block, i) => (
              <div
                key={i}
                className="grid grid-cols-6 gap-[2px] w-[32px] sm:w-[38px] shrink-0"
              >
                {block.map((mark) => {
                  const transform = animated
                    ? "translate(0px, 0px)"
                    : `translate(${mark.rx}px, ${mark.ry}px)`;

                  return (
                    <span
                      key={mark.id}
                      style={{
                        transform,
                        transition: `transform 1600ms cubic-bezier(0.2, 0, 0, 1) ${animated ? `${mark.delay}ms` : "0ms"}`,
                        willChange: "transform",
                      }}
                      className="w-[3px] h-[3px] rounded-[0.5px] bg-[var(--color-neutral-mark)] block"
                    />
                  );
                })}
              </div>
            ))}
        </div>

        {/* Hero Copy */}
        <div className="text-center max-w-[68ch] mx-auto space-y-4">
          <h1 className="text-[28px] sm:text-[36px] md:text-[44px] leading-[1.08] font-semibold tracking-[-0.03em] text-[var(--color-ink-primary)]">
            400 raw playtest reports. 12 issues a developer can fix.
          </h1>

          <p className="text-[15px] sm:text-[16px] leading-[1.6] text-[var(--color-ink-secondary)] max-w-[54ch] mx-auto">
            Repro turns chaotic playtesting feedback into clustered engineering issues with mathematical triage, forensic leak tracing, and cryptographic build protection.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
            <Link
              href="/studio"
              className="w-full sm:w-auto text-center px-6 py-2.5 min-h-[44px] bg-[var(--color-ink-primary)] text-[var(--color-surface-page)] text-[14px] font-[450] rounded-[var(--radius-sm)] hover:opacity-90 active:opacity-95 transition-opacity"
            >
              Open Studio Board
            </Link>
            <Link
              href="/play"
              className="w-full sm:w-auto text-center px-6 py-2.5 min-h-[44px] border border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] text-[var(--color-ink-primary)] text-[14px] font-[450] rounded-[var(--radius-sm)] hover:border-[var(--color-line-strong)] transition-colors"
            >
              Playtest a Game
            </Link>
          </div>
        </div>
      </section>

      {/* Below the Fold: Three Plain Prose Sections (§3.1) */}
      <section className="border-t border-[var(--color-line-hairline)] bg-[var(--color-surface-raised)] py-16 px-6">
        <div className="max-w-[68ch] mx-auto space-y-14 text-left">
          {/* Section 1: What Repro does */}
          <div className="space-y-3">
            <h2 className="text-[18px] font-[550] tracking-[-0.01em] text-[var(--color-ink-primary)]">
              What Repro does
            </h2>
            <p className="text-[15px] leading-[1.6] text-[var(--color-ink-secondary)]">
              A studio distributing a pre-release build typically receives hundreds of unstructured reports. A developer loses days sorting through duplicates, ambiguous descriptions, and irreproducible noise. Repro sits between testers and studios, receiving reports from an in-game overlay and automatically clustering identical defects into actionable, high-signal issues.
            </p>
          </div>

          {/* Section 2: How the triage works */}
          <div className="space-y-3">
            <h2 className="text-[18px] font-[550] tracking-[-0.01em] text-[var(--color-ink-primary)]">
              How the triage works
            </h2>
            <p className="text-[15px] leading-[1.6] text-[var(--color-ink-secondary)]">
              Triage evaluates four distinct signals: lexical similarity via TF-IDF cosine distance, 3D coordinate proximity with strict scene veto, normalized console log signatures, and hardware environment tallies. The engine enforces one foundational rule: when in doubt, do not merge. Cluster centroids and IDF vocabularies are rebuilt in memory on every ingest to guarantee deterministic reproducibility without vector database overhead.
            </p>
          </div>

          {/* Section 3: What the security layers do and do not do */}
          <div className="space-y-3">
            <h2 className="text-[18px] font-[550] tracking-[-0.01em] text-[var(--color-ink-primary)]">
              Security layers and their limits
            </h2>
            <p className="text-[15px] leading-[1.6] text-[var(--color-ink-secondary)]">
              Every build token is signed with HMAC-SHA256, carries a 15-minute TTL, and binds to the tester’s browser user-agent hash. When an unreleased build frame is exported, a 16-bit forensic watermark is embedded into pixel luminance with tolerance for 2× and 3× downscales. Bug report screenshots attached to tickets are lossy JPEGs and carry no watermark — only lossless forensic frames do. These protections establish accountability; they do not claim to prevent an adversary with hardware capture cards.
            </p>
          </div>

          {/* Entry points */}
          <div className="pt-6 border-t border-[var(--color-line-hairline)] flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-[var(--color-ink-secondary)]">
            <span>Repro — Xsolla GameTech Hackathon</span>
            <div className="flex gap-4">
              <Link href="/studio" className="text-[var(--color-ink-primary)] hover:underline">
                Studio Login
              </Link>
              <Link href="/play" className="text-[var(--color-ink-primary)] hover:underline">
                Tester Access
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
