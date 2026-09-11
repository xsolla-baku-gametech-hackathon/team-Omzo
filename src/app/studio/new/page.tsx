"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  DEFAULT_BUILD_KIND,
  DELIVERY_MODE_LABEL,
  capabilitiesOf,
  classifyBuildUrl,
  deliveryModeOf,
  type BuildKind,
} from "@/domain/campaigns/delivery";

const DEFAULT_NDA = `# Playtest Non-Disclosure Agreement

You are being given access to an unreleased build. By signing you agree:

1. Not to share, stream, record or describe the build publicly.
2. Not to distribute the build or any part of it.
3. That your access is personal, uniquely identified, and traceable to you.

This agreement ends on the build's public release.`;

interface Preset {
  name: string;
  icon: string;
  desc: string;
  title: string;
  pitch: string;
  testFocus: string;
  buildKind: BuildKind;
  buildUrl: string;
  rewardPoolTotal: number;
  rewardPerIssue: number;
  maxTesters: number;
}

/**
 * The delivery choice, link-only first. Order is the recommendation: the
 * default is the mode where the studio keeps its binary, and hosting is
 * presented as the upgrade that buys watermarking.
 */
const BUILD_KIND_CARDS: readonly {
  kind: BuildKind;
  icon: string;
  name: string;
  desc: string;
}[] = [
  {
    kind: "EXTERNAL_LINK",
    icon: "🔗",
    name: "Link only",
    desc: "Your URL — itch.io, Steam Playtest, TestFlight. The build never reaches us.",
  },
  {
    kind: "WEB_EMBED",
    icon: "🌐",
    name: "Web Embed",
    desc: "We render in the browser — frame watermark on every frame.",
  },
  {
    kind: "DOWNLOAD",
    icon: "💾",
    name: "Download",
    desc: "Single-use signed download link.",
  },
];

/**
 * The limitation to print next to the mode. The capability booleans stay
 * single-sourced in domain/ — only the wording is local to this form.
 */
const MODE_CAVEATS: Record<string, string> = {
  LINK_ONLY:
    "The binary never reaches us, so we cannot watermark frames or stop a tester forwarding your link. We control who receives it and record who accepted the NDA.",
  HOSTED:
    "We serve the build, so every frame carries the tester's watermark and a leaked screenshot names an account within seconds.",
  SELF_HOSTED:
    "Not available yet. Your infrastructure serves the build and calls us to validate each grant first.",
};

const CAPABILITY_ROWS: readonly {
  key:
    | "gatedByGrant"
    | "ndaRecorded"
    | "accessLogged"
    | "watermarksFrames"
    | "singleUseAccess";
  label: string;
}[] = [
  {
    key: "gatedByGrant",
    label: "Opens only with a live, browser-bound grant",
  },
  { key: "ndaRecorded", label: "Records who signed the NDA" },
  {
    key: "accessLogged",
    label: "Every access attempt logged to an append-only journal",
  },
  { key: "watermarksFrames", label: "Frame watermark identifying the tester" },
  { key: "singleUseAccess", label: "Link expires after first use" },
];

const PRESETS: Preset[] = [
  {
    name: "Indie Steam Alpha",
    icon: "🎮",
    desc: "Quick web or Steam playtest",
    title: "Vault Descent — Alpha Playtest",
    pitch:
      "Testing traversal and physics mechanics in the atrium and bunker zones.",
    testFocus:
      "Physics breaks: elevators, doors, clipping, and FPS drops.",
    buildKind: "EXTERNAL_LINK",
    buildUrl: "https://itch.io/queue/vault-descent-alpha",
    rewardPoolTotal: 5000,
    rewardPerIssue: 50,
    maxTesters: 150,
  },
  {
    name: "Mobile Closed Beta",
    icon: "📱",
    desc: "Touch and UI on mobile devices",
    title: "CyberCity Tactics — Mobile Beta",
    pitch:
      "Testing touch responsiveness and battery usage on Android and iOS.",
    testFocus:
      "Sensor controls, UI layout on small screens, and frame drops.",
    buildKind: "EXTERNAL_LINK",
    buildUrl: "https://testflight.apple.com/join/9fK2mQxA",
    rewardPoolTotal: 10000,
    rewardPerIssue: 80,
    maxTesters: 300,
  },
  {
    name: "AAA Stress Test",
    icon: "🚀",
    desc: "High load and crashes",
    title: "Project Horizon — Stress Test",
    pitch: "Large-scale server and graphics engine load playtest.",
    testFocus:
      "Memory leaks, server desync, and graphical artifacts.",
    buildKind: "WEB_EMBED",
    buildUrl: "/play/demo-session",
    rewardPoolTotal: 25000,
    rewardPerIssue: 120,
    maxTesters: 800,
  },
];

export default function NewCampaignPage() {
  const router = useRouter();

  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState("Vault Descent — Alpha Playtest");
  const [pitch, setPitch] = useState(
    "Testing traversal and physics mechanics in the atrium and bunker zones.",
  );
  const [testFocus, setTestFocus] = useState(
    "Physics breaks: elevators, doors, clipping, and FPS drops.",
  );
  // Link-only by default: the studio pastes a URL it already distributes and
  // the binary never reaches us. Hosting is the upgrade, not the entry price.
  const [buildKind, setBuildKind] = useState<BuildKind>(DEFAULT_BUILD_KIND);
  const [buildUrl, setBuildUrl] = useState(
    "https://itch.io/queue/vault-descent-alpha",
  );
  const [ndaBodyMd, setNdaBodyMd] = useState(DEFAULT_NDA);
  const [rewardPoolTotal, setRewardPoolTotal] = useState(5000);
  const [rewardPerIssue, setRewardPerIssue] = useState(50);
  const [maxTesters, setMaxTesters] = useState(200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] =
    useState<string>("Indie Steam Alpha");

  const deliveryMode = deliveryModeOf(buildKind);
  const capabilities = capabilitiesOf(buildKind);
  const urlVerdict = classifyBuildUrl(buildUrl);

  function applyPreset(p: Preset) {
    setSelectedPreset(p.name);
    setTitle(p.title);
    setPitch(p.pitch);
    setTestFocus(p.testFocus);
    setBuildKind(p.buildKind);
    setBuildUrl(p.buildUrl);
    setRewardPoolTotal(p.rewardPoolTotal);
    setRewardPerIssue(p.rewardPerIssue);
    setMaxTesters(p.maxTesters);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          pitch,
          testFocus,
          buildKind,
          buildUrl,
          ndaBodyMd,
          rewardPoolTotal: Number(rewardPoolTotal),
          rewardPerIssue: Number(rewardPerIssue),
          maxTesters: Number(maxTesters),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const issuesMsg = data.issues
          ?.map(
            (i: { path: string; message: string }) => `${i.path}: ${i.message}`,
          )
          .join(", ");
        throw new Error(
          issuesMsg || data.message || "Failed to create campaign.",
        );
      }

      router.push("/studio");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating campaign.");
    } finally {
      setLoading(false);
    }
  }

  // Calculated metrics
  const maxRewardedBugs =
    rewardPerIssue > 0 ? Math.floor(rewardPoolTotal / rewardPerIssue) : 0;

  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--ink-primary)] font-sans relative overflow-x-hidden">
      {/* Subtle Background Glow */}
      <div
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-25 blur-[120px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
        }}
      />

      {/* Header */}
      <header className="border-b border-[var(--line-subtle)] bg-[var(--surface-raised)]/80 backdrop-blur-md px-6 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="font-semibold text-lg tracking-tight text-[var(--ink-primary)]"
            >
              Repro
            </Link>
            <span className="text-[var(--line-subtle)]">/</span>
            <Link
              href="/studio"
              className="text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
            >
              Studio
            </Link>
            <span className="text-[var(--line-subtle)]">/</span>
            <span className="text-sm font-medium text-[var(--accent)]">
              New Campaign
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--accent-wash)] text-[var(--accent)] border border-[var(--accent)]/30 font-mono">
              ⚡ Studio Suite
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 relative z-10">
        {/* Title area */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--surface-raised)] border border-[var(--line-subtle)] text-xs text-[var(--ink-secondary)] mb-3">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            Studio & Campaign Setup
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink-primary)]">
            Create New Playtest Campaign
          </h1>
          <p className="text-sm text-[var(--ink-secondary)] mt-1.5 max-w-2xl leading-relaxed">
            Distribute your build to testers, protect against leaks with frame
            watermarking, and collect reports in an automated triage board.
          </p>
        </div>

        {/* Quick Presets */}
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)] mb-3 flex items-center gap-2">
            <span>✨ Quick Presets</span>
            <span className="text-[10px] text-[var(--ink-tertiary)] font-normal">
              Fill with one click
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PRESETS.map((preset) => {
              const isSelected = selectedPreset === preset.name;
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`p-4 rounded-[var(--radius-md)] text-left border transition-all relative overflow-hidden group ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--surface-raised)] shadow-[0_0_15px_var(--accent-glow)]"
                      : "border-[var(--line-subtle)] bg-[var(--surface-raised)]/60 hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xl">{preset.icon}</span>
                    {isSelected && (
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--accent-on-fill)]">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-sm text-[var(--ink-primary)] group-hover:text-[var(--accent)] transition-colors">
                    {preset.name}
                  </div>
                  <div className="text-xs text-[var(--ink-secondary)] mt-0.5">
                    {preset.desc}
                  </div>
                  <div className="mt-3 pt-2 border-t border-[var(--line-subtle)] flex items-center justify-between text-[11px] font-mono text-[var(--ink-tertiary)]">
                    <span>{preset.rewardPoolTotal} coins</span>
                    <span>{preset.maxTesters} tester</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-[var(--sev-critical-wash)] border border-[var(--sev-critical)]/30 text-[var(--sev-critical)] text-sm rounded-[var(--radius-sm)] flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Interactive Multi-Step Form (8 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Step navigation tabs */}
            <div className="flex border border-[var(--line-subtle)] bg-[var(--surface-raised)] rounded-[var(--radius-md)] p-1 gap-1">
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-[var(--radius-sm)] transition-all flex items-center justify-center gap-1.5 ${
                  activeStep === 1
                    ? "bg-[var(--accent)] text-[var(--accent-on-fill)] shadow-xs"
                    : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                }`}
              >
                <span>1.</span>
                <span>Details</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-[var(--radius-sm)] transition-all flex items-center justify-center gap-1.5 ${
                  activeStep === 2
                    ? "bg-[var(--accent)] text-[var(--accent-on-fill)] shadow-xs"
                    : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                }`}
              >
                <span>2.</span>
                <span>Build & Distribution</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-[var(--radius-sm)] transition-all flex items-center justify-center gap-1.5 ${
                  activeStep === 3
                    ? "bg-[var(--accent)] text-[var(--accent-on-fill)] shadow-xs"
                    : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                }`}
              >
                <span>3.</span>
                <span>Rewards & NDA</span>
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-6 sm:p-8 rounded-[var(--radius-md)] shadow-xs space-y-6"
            >
              {/* STEP 1: Overview */}
              {activeStep === 1 && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="border-b border-[var(--line-subtle)] pb-3">
                    <h3 className="text-base font-semibold text-[var(--ink-primary)]">
                      1. Campaign & Game Details
                    </h3>
                    <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
                      What testers see on the home page and playtest list.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="title"
                      className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1.5"
                    >
                      Campaign Title (Game Name & Stage)
                    </label>
                    <input
                      id="title"
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                      placeholder="e.g. Vault Descent — Technical Playtest"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="pitch"
                      className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1.5"
                    >
                      Short Description (Pitch)
                    </label>
                    <textarea
                      id="pitch"
                      rows={3}
                      required
                      value={pitch}
                      onChange={(e) => setPitch(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)] leading-relaxed transition-colors"
                      placeholder="Brief game summary and main playtest goal..."
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="testFocus"
                      className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1.5"
                    >
                      Test Focus Area (&quot;What to break&quot;)
                    </label>
                    <input
                      id="testFocus"
                      type="text"
                      required
                      value={testFocus}
                      onChange={(e) => setTestFocus(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                      placeholder="e.g. Elevator mechanics, door collisions, physics clipping, audio desync."
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setActiveStep(2)}
                      className="py-2 px-5 bg-[var(--accent)] text-[var(--accent-on-fill)] text-xs font-semibold rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] transition-all"
                    >
                      Next: Build Type →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Build & Distribution */}
              {activeStep === 2 && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="border-b border-[var(--line-subtle)] pb-3">
                    <h3 className="text-base font-semibold text-[var(--ink-primary)]">
                      2. Build Type & Distribution
                    </h3>
                    <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
                      Choose how testers open the game and how watermarking
                      applies.
                    </p>
                  </div>

                  {/* Build Kind Cards */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-2">
                      Build Distribution Model
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {BUILD_KIND_CARDS.map((card) => (
                        <div
                          key={card.kind}
                          onClick={() => setBuildKind(card.kind)}
                          className={`p-3.5 border rounded-[var(--radius-sm)] cursor-pointer transition-all ${
                            buildKind === card.kind
                              ? "border-[var(--accent)] bg-[var(--surface-page)] shadow-[0_0_10px_var(--accent-glow)]"
                              : "border-[var(--line-subtle)] bg-[var(--surface-sunken)] hover:border-[var(--line-strong)]"
                          }`}
                        >
                          <div className="text-lg mb-1">{card.icon}</div>
                          <div className="text-xs font-semibold text-[var(--ink-primary)]">
                            {card.name}
                          </div>
                          <div className="text-[11px] text-[var(--ink-secondary)] mt-0.5">
                            {card.desc}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* What this mode can and cannot do, next to the choice
                        rather than buried in terms. A studio that finds this
                        out after a leak is a studio we have failed. */}
                    <div className="mt-3 p-3.5 border border-[var(--line-subtle)] bg-[var(--surface-sunken)] rounded-[var(--radius-sm)]">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)] mb-2">
                        {DELIVERY_MODE_LABEL[deliveryMode]} — what&apos;s protected
                      </div>
                      <ul className="space-y-1 mb-2.5">
                        {CAPABILITY_ROWS.map((row) => {
                          const on = capabilities[row.key];
                          return (
                            <li
                              key={row.key}
                              className="flex items-start gap-2 text-[11px] leading-relaxed"
                            >
                              <span
                                className={
                                  on
                                    ? "text-[var(--state-verified)]"
                                    : "text-[var(--ink-tertiary)]"
                                }
                              >
                                {on ? "✓" : "✕"}
                              </span>
                              <span
                                className={
                                  on
                                    ? "text-[var(--ink-primary)]"
                                    : "text-[var(--ink-tertiary)]"
                                }
                              >
                                {row.label}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="text-[11px] text-[var(--ink-secondary)] leading-relaxed">
                        {MODE_CAVEATS[deliveryMode]}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="buildUrl"
                      className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1.5"
                    >
                      Build URL or Internal Path
                    </label>
                    <input
                      id="buildUrl"
                      type="text"
                      required
                      value={buildUrl}
                      onChange={(e) => setBuildUrl(e.target.value)}
                      className={`w-full px-3.5 py-2.5 border bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm font-mono rounded-[var(--radius-sm)] focus:outline-none transition-colors ${
                        urlVerdict.safe
                          ? "border-[var(--line-subtle)] focus:border-[var(--accent)]"
                          : "border-[var(--sev-critical)]"
                      }`}
                      placeholder="https://itch.io/queue/your-build"
                    />
                    {/* The server refuses these anyway. Saying so here means
                        the studio finds out while it is still typing. */}
                    {!urlVerdict.safe && (
                      <p className="mt-1.5 text-[11px] text-[var(--sev-critical)] leading-relaxed">
                        {urlVerdict.reason}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="maxTesters"
                      className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1.5"
                    >
                      Maximum Testers (Quota)
                    </label>
                    <input
                      id="maxTesters"
                      type="number"
                      min={1}
                      max={5000}
                      required
                      value={maxTesters}
                      onChange={(e) => setMaxTesters(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] text-sm rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                    />
                  </div>

                  <div className="pt-2 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => setActiveStep(1)}
                      className="py-2 px-4 border border-[var(--line-subtle)] text-[var(--ink-secondary)] text-xs font-medium rounded-[var(--radius-sm)] hover:text-[var(--ink-primary)]"
                    >
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveStep(3)}
                      className="py-2 px-5 bg-[var(--accent)] text-[var(--accent-on-fill)] text-xs font-semibold rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] transition-all"
                    >
                      Next: Rewards & NDA →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Rewards & NDA */}
              {activeStep === 3 && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="border-b border-[var(--line-subtle)] pb-3">
                    <h3 className="text-base font-semibold text-[var(--ink-primary)]">
                      3. Reward Pool & NDA
                    </h3>
                    <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
                      Set the coin budget for verified bug reports and the
                      confidentiality agreement.
                    </p>
                  </div>

                  {/* Coin Pool Calculator */}
                  <div className="p-4 border border-[var(--line-subtle)] bg-[var(--surface-page)] rounded-[var(--radius-sm)] space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="rewardPool"
                          className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1.5"
                        >
                          Total Reward Pool (Coins)
                        </label>
                        <input
                          id="rewardPool"
                          type="number"
                          min={0}
                          required
                          value={rewardPoolTotal}
                          onChange={(e) =>
                            setRewardPoolTotal(Number(e.target.value))
                          }
                          className="w-full px-3.5 py-2.5 border border-[var(--line-subtle)] bg-[var(--surface-raised)] text-[var(--ink-primary)] text-sm font-mono rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="rewardPerIssue"
                          className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1.5"
                        >
                          Reward Per Issue (Coins)
                        </label>
                        <input
                          id="rewardPerIssue"
                          type="number"
                          min={1}
                          required
                          value={rewardPerIssue}
                          onChange={(e) =>
                            setRewardPerIssue(Number(e.target.value))
                          }
                          className="w-full px-3.5 py-2.5 border border-[var(--line-subtle)] bg-[var(--surface-raised)] text-[var(--ink-primary)] text-sm font-mono rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>

                    {/* Visual meter */}
                    <div className="pt-2 border-t border-[var(--line-subtle)] flex items-center justify-between text-xs">
                      <span className="text-[var(--ink-secondary)]">
                        Budget capacity:
                      </span>
                      <span className="font-mono font-semibold text-[var(--accent)]">
                        ~{maxRewardedBugs} verified unique bug payouts
                      </span>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="ndaBody"
                      className="block text-xs font-medium text-[var(--ink-secondary)] uppercase tracking-wider mb-1.5"
                    >
                      NDA Text (Markdown)
                    </label>
                    <textarea
                      id="ndaBody"
                      rows={5}
                      required
                      value={ndaBodyMd}
                      onChange={(e) => setNdaBodyMd(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-[var(--line-subtle)] bg-[var(--surface-page)] text-[var(--ink-primary)] font-mono text-xs rounded-[var(--radius-sm)] focus:outline-none focus:border-[var(--accent)] leading-relaxed"
                    />
                    <p className="text-[11px] text-[var(--ink-tertiary)] mt-1">
                      A record hash of this text is stored alongside the
                      tester&apos;s identity verification and watermark ID.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-[var(--line-subtle)] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setActiveStep(2)}
                      className="py-2 px-4 border border-[var(--line-subtle)] text-[var(--ink-secondary)] text-xs font-medium rounded-[var(--radius-sm)] hover:text-[var(--ink-primary)]"
                    >
                      ← Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !urlVerdict.safe}
                      className="py-2.5 px-6 bg-[var(--accent)] text-[var(--accent-on-fill)] text-xs font-semibold rounded-[var(--radius-sm)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-all shadow-md inline-flex items-center gap-2"
                    >
                      <span>
                        {loading
                          ? "Creating..."
                          : "🚀 Publish Campaign"}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* Right: Real-Time Live Preview Card (5 cols) */}
          <div className="lg:col-span-5 sticky top-24 space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)] flex items-center justify-between">
              <span>Live Preview (Tester View)</span>
              <span className="text-[10px] font-mono text-[var(--accent)]">
                Live Card
              </span>
            </div>

            {/* Campaign Tester Preview Card */}
            <div className="border border-[var(--line-subtle)] bg-[var(--surface-raised)] p-6 rounded-[var(--radius-md)] space-y-4 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent-wash)] rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] border border-[var(--line-subtle)] font-mono text-[var(--ink-secondary)]">
                    {DELIVERY_MODE_LABEL[deliveryMode]}
                  </span>
                  <span className="text-xs font-mono text-[var(--state-verified)]">
                    ● Active
                  </span>
                </div>
                <span className="text-[11px] text-[var(--ink-tertiary)] font-mono">
                  {maxTesters} slots
                </span>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-[var(--ink-primary)] tracking-tight">
                  {title || "Campaign title..."}
                </h3>
                <p className="text-xs text-[var(--ink-secondary)] mt-1.5 line-clamp-2 leading-relaxed">
                  {pitch || "Game description will appear here..."}
                </p>
              </div>

              {/* Test Focus Box */}
              <div className="p-3 bg-[var(--surface-page)] border border-[var(--line-subtle)] rounded-[var(--radius-sm)]">
                <div className="text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider">
                  Test Focus:
                </div>
                <div className="text-xs text-[var(--ink-secondary)] mt-0.5 line-clamp-2">
                  {testFocus || "No test focus specified"}
                </div>
              </div>

              {/* Reward stats */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--line-subtle)]">
                <div className="p-2.5 bg-[var(--surface-sunken)] rounded-[var(--radius-sm)] border border-[var(--line-subtle)]">
                  <div className="text-[10px] text-[var(--ink-tertiary)] uppercase">
                    Reward / Bug
                  </div>
                  <div className="text-base font-bold font-mono text-[var(--accent)]">
                    {rewardPerIssue}{" "}
                    <span className="text-xs font-normal">coins</span>
                  </div>
                </div>
                <div className="p-2.5 bg-[var(--surface-sunken)] rounded-[var(--radius-sm)] border border-[var(--line-subtle)]">
                  <div className="text-[10px] text-[var(--ink-tertiary)] uppercase">
                    Total Pool
                  </div>
                  <div className="text-base font-bold font-mono text-[var(--ink-primary)]">
                    {rewardPoolTotal}{" "}
                    <span className="text-xs font-normal">coins</span>
                  </div>
                </div>
              </div>

              {/* What the tester will actually be told. The badge follows the
                  selected mode: promising a watermark on a build we never
                  render is the one claim a studio must not make. */}
              <div className="pt-2 flex items-center justify-between text-[11px] text-[var(--ink-tertiary)]">
                {capabilities.watermarksFrames ? (
                  <>
                    <span className="flex items-center gap-1.5 text-[var(--state-verified)]">
                      <span>🛡️</span>
                      <span>Frame watermark</span>
                    </span>
                    <span>Anti-Leak Protected</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span>🔗</span>
                      <span>No watermark — link mode</span>
                    </span>
                    <span>NDA + access log</span>
                  </>
                )}
              </div>
            </div>

            {/* Micro Helper */}
            <div className="p-3.5 rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] border border-[var(--line-subtle)] text-xs text-[var(--ink-secondary)] leading-relaxed">
              💡 <strong>Tip:</strong> After creating the campaign, you can
              monitor tester submissions, bug clusters, and watermark IDs in
              real time.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
