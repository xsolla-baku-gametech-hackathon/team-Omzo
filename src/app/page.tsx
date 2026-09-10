"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMounted(true);

    if (!mql.matches) {
      // Allow the DOM to render the scattered state first
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
      // Scatter within a roughly 800x800 area
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 400 + 50; // away from center
      const rx = Math.cos(angle) * radius;
      const ry = Math.sin(angle) * radius;

      arr.push({ id: i, rx, ry });
    }
    return arr;
  }, []);

  const blocks = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      // 12 blocks, 33 or 34 marks each
      const start = Math.floor((i * 400) / 12);
      const end = Math.floor(((i + 1) * 400) / 12);
      return marks.slice(start, end);
    });
  }, [marks]);

  return (
    <div
      style={{
        backgroundColor: "var(--color-paper)",
        color: "var(--color-ink)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-sans)",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1.5rem 2rem",
          borderBottom: "1px solid var(--color-hairline)",
          fontSize: "var(--text-label)",
          lineHeight: "var(--text-label--line-height)",
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontWeight: "bold", fontSize: "1.125rem" }}>
          Repro
        </div>
        <nav style={{ display: "flex", gap: "1.5rem" }}>
          <Link href="/play" style={{ color: "var(--color-slate)", textDecoration: "none" }}>
            Play
          </Link>
          <Link href="/studio" style={{ color: "var(--color-slate)", textDecoration: "none" }}>
            Studio
          </Link>
          <Link href="/login" style={{ color: "var(--color-slate)", textDecoration: "none" }}>
            Log In
          </Link>
          <Link href="/register" style={{ color: "var(--color-slate)", textDecoration: "none" }}>
            Register
          </Link>
        </nav>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: "600px",
            display: "flex",
            flexWrap: "wrap",
            gap: "2rem",
            justifyContent: "center",
            marginBottom: "3rem",
          }}
        >
          {mounted &&
            blocks.map((block, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "2px",
                  width: "48px", // roughly 6x6 grid of 6px items (4px + 2px gap)
                  alignContent: "flex-start",
                }}
              >
                {block.map((mark) => {
                  const transform = animated
                    ? "translate(0px, 0px)"
                    : `translate(${mark.rx}px, ${mark.ry}px)`;

                  return (
                    <div
                      key={mark.id}
                      style={{
                        width: "6px",
                        height: "6px",
                        backgroundColor: "var(--color-verified)",
                        transform,
                        transition: "transform var(--duration-collapse) var(--ease-collapse)",
                        willChange: "transform",
                        borderRadius: "1px",
                      }}
                    />
                  );
                })}
              </div>
            ))}
        </div>

        {mounted && (
          <div
            style={{
              textAlign: "center",
              opacity: animated ? 1 : 0,
              transition: "opacity var(--duration-collapse) var(--ease-collapse)",
            }}
          >
            <p
              style={{
                fontSize: "var(--text-body)",
                lineHeight: "var(--text-body--line-height)",
                color: "var(--color-ink)",
                marginBottom: "2rem",
              }}
            >
              400 raw playtest reports. 12 issues a developer can fix.
            </p>

            <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
              <Link
                href="/studio"
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "var(--color-ink)",
                  color: "var(--color-paper)",
                  borderRadius: "4px",
                  textDecoration: "none",
                  fontSize: "var(--text-label)",
                  fontWeight: 500,
                }}
              >
                I run a studio
              </Link>
              <Link
                href="/play"
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "var(--color-paper)",
                  color: "var(--color-ink)",
                  border: "1px solid var(--color-hairline)",
                  borderRadius: "4px",
                  textDecoration: "none",
                  fontSize: "var(--text-label)",
                  fontWeight: 500,
                }}
              >
                I test games
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
