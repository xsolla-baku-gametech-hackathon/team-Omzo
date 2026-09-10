"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const DEFAULT_NDA = `# Playtest Non-Disclosure Agreement

You are being given access to an unreleased build. By signing you agree:

1. Not to share, stream, record or describe the build publicly.
2. Not to distribute the build or any part of it.
3. That your access is personal, uniquely watermarked, and traceable to you.

This agreement ends on the build's public release.`;

export default function NewCampaignPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pitch, setPitch] = useState("");
  const [testFocus, setTestFocus] = useState("");
  const [buildKind, setBuildKind] = useState<
    "WEB_EMBED" | "DOWNLOAD" | "EXTERNAL_LINK"
  >("WEB_EMBED");
  const [buildUrl, setBuildUrl] = useState("/play/demo-session");
  const [ndaBodyMd, setNdaBodyMd] = useState(DEFAULT_NDA);
  const [rewardPoolTotal, setRewardPoolTotal] = useState(5000);
  const [rewardPerIssue, setRewardPerIssue] = useState(50);
  const [maxTesters, setMaxTesters] = useState(200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const issuesMsg = data.issues?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join(", ");
        throw new Error(issuesMsg || data.message || "Failed to create campaign.");
      }

      router.push("/studio");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating campaign.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-hairline bg-raised px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold text-lg tracking-tight">
              Repro
            </Link>
            <span className="text-hairline">/</span>
            <Link
              href="/studio"
              className="text-sm font-medium text-slate hover:text-ink"
            >
              Studio
            </Link>
            <span className="text-hairline">/</span>
            <span className="text-sm font-medium text-slate">New Campaign</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create Playtesting Campaign
          </h1>
          <p className="text-sm text-slate mt-1">
            Configure distribution, NDA protection, and reward pool.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-6 border border-hairline bg-raised p-8 rounded-sm"
        >
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate border-b border-hairline pb-2">
              1. Campaign Overview
            </h2>

            <div>
              <label
                htmlFor="title"
                className="block text-xs font-medium text-slate uppercase mb-1"
              >
                Campaign Title
              </label>
              <input
                id="title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-hairline bg-paper text-ink text-sm rounded-sm focus:outline-none focus:border-ink"
                placeholder="Vault Descent — Technical Playtest"
              />
            </div>

            <div>
              <label
                htmlFor="pitch"
                className="block text-xs font-medium text-slate uppercase mb-1"
              >
                Pitch (Shown to testers)
              </label>
              <textarea
                id="pitch"
                rows={3}
                required
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                className="w-full px-3 py-2 border border-hairline bg-paper text-ink text-sm rounded-sm focus:outline-none focus:border-ink leading-relaxed"
                placeholder="A first-person facility crawler covering the atrium through to the vault..."
              />
            </div>

            <div>
              <label
                htmlFor="testFocus"
                className="block text-xs font-medium text-slate uppercase mb-1"
              >
                Test Focus (&quot;What we need you to break&quot;)
              </label>
              <input
                id="testFocus"
                type="text"
                required
                value={testFocus}
                onChange={(e) => setTestFocus(e.target.value)}
                className="w-full px-3 py-2 border border-hairline bg-paper text-ink text-sm rounded-sm focus:outline-none focus:border-ink"
                placeholder="Break traversal: lift, ramp, doors, physics clipping."
              />
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate border-b border-hairline pb-2">
              2. Build Distribution &amp; Access
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="buildKind"
                  className="block text-xs font-medium text-slate uppercase mb-1"
                >
                  Build Type
                </label>
                <select
                  id="buildKind"
                  value={buildKind}
                  onChange={(e) =>
                    setBuildKind(
                      e.target.value as
                        "WEB_EMBED" | "DOWNLOAD" | "EXTERNAL_LINK",
                    )
                  }
                  className="w-full px-3 py-2 border border-hairline bg-paper text-ink text-sm rounded-sm focus:outline-none focus:border-ink"
                >
                  <option value="WEB_EMBED">
                    Web Embed (in-browser session)
                  </option>
                  <option value="DOWNLOAD">Download (single-use link)</option>
                  <option value="EXTERNAL_LINK">External Link</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="buildUrl"
                  className="block text-xs font-medium text-slate uppercase mb-1"
                >
                  Build URL / Path
                </label>
                <input
                  id="buildUrl"
                  type="text"
                  required
                  value={buildUrl}
                  onChange={(e) => setBuildUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-hairline bg-paper text-ink text-sm rounded-sm focus:outline-none focus:border-ink"
                  placeholder="/play/seed-campaign/session"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="maxTesters"
                  className="block text-xs font-medium text-slate uppercase mb-1"
                >
                  Max Testers
                </label>
                <input
                  id="maxTesters"
                  type="number"
                  min={1}
                  max={5000}
                  required
                  value={maxTesters}
                  onChange={(e) => setMaxTesters(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-hairline bg-paper text-ink text-sm rounded-sm focus:outline-none focus:border-ink"
                />
              </div>

              <div>
                <label
                  htmlFor="rewardPool"
                  className="block text-xs font-medium text-slate uppercase mb-1"
                >
                  Reward Pool (Coins)
                </label>
                <input
                  id="rewardPool"
                  type="number"
                  min={0}
                  required
                  value={rewardPoolTotal}
                  onChange={(e) => setRewardPoolTotal(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-hairline bg-paper text-ink text-sm rounded-sm focus:outline-none focus:border-ink"
                />
              </div>

              <div>
                <label
                  htmlFor="rewardPerIssue"
                  className="block text-xs font-medium text-slate uppercase mb-1"
                >
                  Reward Per Issue (Coins)
                </label>
                <input
                  id="rewardPerIssue"
                  type="number"
                  min={1}
                  required
                  value={rewardPerIssue}
                  onChange={(e) => setRewardPerIssue(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-hairline bg-paper text-ink text-sm rounded-sm focus:outline-none focus:border-ink"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate border-b border-hairline pb-2">
              3. Non-Disclosure Agreement (NDA)
            </h2>

            <div>
              <label
                htmlFor="ndaBody"
                className="block text-xs font-medium text-slate uppercase mb-1"
              >
                NDA Text (Markdown)
              </label>
              <textarea
                id="ndaBody"
                rows={6}
                required
                value={ndaBodyMd}
                onChange={(e) => setNdaBodyMd(e.target.value)}
                className="w-full px-3 py-2 border border-hairline bg-paper text-ink font-mono text-xs rounded-sm focus:outline-none focus:border-ink leading-relaxed"
              />
              <p className="text-xs text-slate mt-1">
                The sha256 of this text is stored with each tester&apos;s
                signature alongside their hashed IP and user agent.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-hairline">
            <Link
              href="/studio"
              className="py-2 px-4 border border-hairline hover:border-ink text-xs font-medium rounded-sm transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="py-2 px-5 bg-ink text-paper text-xs font-medium rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Publishing..." : "Publish Campaign"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
