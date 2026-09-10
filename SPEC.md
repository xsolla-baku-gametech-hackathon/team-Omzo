# REPRO — Build Specification for Claude Code

> **How to use this file.** Put it in the repo root as `SPEC.md`. Start Claude Code in the repo and say:
> _"Read SPEC.md fully. Do not write any code yet. Summarise the plan back to me in 20 lines and list anything ambiguous. Then wait."_
> After you approve the summary, work through the phases in order. Never skip ahead.

---

## 0. Hard rules (read these before anything else)

1. **Nothing is mocked in the demo path.** Every number on screen comes from the database. No `Math.random()`, no hardcoded arrays rendered as if they were data. Seed data is written to the DB through the real ingest API, not injected into React state.
2. **The build must run offline.** The judging venue Wi-Fi will fail. Every core feature — ingest, clustering, watermark encode/decode, reward ledger — must work with zero external network calls. LLM enrichment is optional and must degrade silently.
3. **No secrets in the repo.** `.env.example` is committed, `.env` is not. If a key is missing, the app starts anyway and disables only the optional feature.
4. **TypeScript strict mode on. Zero `any`.** If you need an escape hatch, use `unknown` plus a Zod parse.
5. **Every commit compiles.** Run `pnpm typecheck && pnpm lint && pnpm test` before every commit. A broken commit is worse than no commit.
6. **Small commits, conventional format.** See §10. Commit after every logical unit, not once per phase.
7. **Do not add libraries not listed in §2** without asking first. Every extra dependency is a new failure mode.
8. **When something is ambiguous, ask. Do not invent product decisions.**

---

## 0.5 Resolved decisions (settled 2026-09-10, before Phase 0)

Twenty open questions were put to the product owner and answered. Where an answer
contradicts an earlier line in this file, **the answer wins** and the section has been
edited to match. Recorded here so a reviewer can see what was decided rather than assumed.

**Environment.** Node 20 LTS, installed and pinned with fnm plus a committed `.nvmrc`;
CI uses the same version. pnpm via `corepack`. Postgres in Docker on host port **5434**
(container 5432), and `DATABASE_URL` uses 5434. (5433 was the decision; it is
occupied on the build machine by an unrelated container, so the next free port
was taken. The reason for the decision — never collide with a default 5432 —
is unchanged.) Repo is the public team repo
`xsolla-baku-gametech-hackathon/team-Omzo`, commits straight to `main`.

**Scope.** Role is self-selected at register; a STUDIO registration also takes a studio
name and creates the `Studio` row in the same transaction. One studio per user. No
invites, no teams — out of scope.

**Coins** are fictional claim tokens: no payment path, no cash out, described in copy as
redeemable for the studio's own rewards (keys, in-game items, credits mention) and never
as money. See §6.4 for the pool assertion.

**Demo game** is plain Canvas 2D, roughly 300 lines, no Phaser. **Type** is the `geist`
npm package, self-hosted, so nothing is fetched at runtime.

**Fixture scale.** The seed writes ~400 reports collapsing to ~12 issues, plus ~25 noise
reports, so the numbers on screen match the pitch. ~14 bug templates with 20–40 natural
paraphrases each, varied scenes, coordinates, GPUs and log tails. The quality of this
fixture determines how good the demo looks; it is written by hand, not generated as
mechanical variations.

**Realtime.** SSE is the mechanism, with an automatic 3-second polling fallback when the
connection errors or closes. Local realtime is the must-have — the demo runs on a laptop
with the Wi-Fi off. Realtime on deployed Vercel is best-effort, not a blocker.

**Component tests** are exactly two: `IssueRow` (severity drives left-rule colour and
ordering) and the overlay panel (fills state, submits, shows optimistic confirmation,
retries on failure).

**Schema deltas**, all shipped in one migration:

| Model         | Delta                                                                                   |
| ------------- | --------------------------------------------------------------------------------------- |
| `User`        | **+** `birthDate DateTime?`                                                             |
| `Campaign`    | **+** `revokedAt DateTime?`                                                             |
| `AccessGrant` | **+** `issuanceCount Int @default(1)`, **+** `windowStartedAt DateTime @default(now())` |
| `Report`      | **−** `screenshotPath`, **+** `screenshotData String? @db.Text`                         |
| `Issue`       | **−** `centroid Float[]`                                                                |

---

## 1. What we are building

**Repro** is a pre-release playtesting platform for small game studios.

The problem: a studio sends a build to 200 testers, receives 400 reports, and a developer loses two days reading them. Most of those reports describe the same handful of bugs. The studio has no QA lead to triage them.

Repro does three things:

1. **Distributes the build under control** — per-tester signed access, a platform-enforced NDA, and a forensic watermark so a leak can be traced to one account.
2. **Collects structured reports** — an in-game overlay captures a screenshot, system info, game state and console logs so the tester only writes one sentence.
3. **Collapses reports into issues** — this is the product. 400 raw reports become ~12 ranked issues, each with its occurrences, shared system patterns, and severity.

Then it closes the loop: the studio verifies an issue, the first reporter is paid from the studio's own reward pool, exactly once, even if the verification event is delivered twice.

**One sentence for the README:** Repro turns 400 raw playtest reports into 12 issues a developer can actually fix.

### Two user roles

- **Studio** — creates a campaign, uploads or links a build, reads the triaged issue board, verifies issues, funds the reward pool, checks a leaked screenshot against the watermark registry.
- **Tester** — browses open campaigns, signs the NDA, gets personal access, plays, submits reports with one hotkey, earns rewards and a signal score.

---

## 2. Stack

Locked. Do not substitute.

| Layer          | Choice                                                                                   | Why                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Framework      | Next.js 15, App Router, TypeScript strict                                                | One deployable, server actions + route handlers, no separate API service to keep alive |
| Runtime        | Node 20 LTS, pinned via fnm + `.nvmrc`; pnpm via `corepack`                              | Node 26 is unproven against Next 15 + Prisma; do not gamble the build on it            |
| DB             | PostgreSQL via Prisma                                                                    | Local Docker in dev, Neon in prod                                                      |
| Auth           | Custom session: `jose` JWT in httpOnly cookie + `bcryptjs`                               | ~150 lines, fully testable, no provider outage risk                                    |
| Validation     | `zod` on every boundary                                                                  | —                                                                                      |
| Styling        | Tailwind CSS v4 + a small token layer                                                    | —                                                                                      |
| Icons          | `lucide-react`                                                                           | —                                                                                      |
| Fonts          | `geist`, self-hosted                                                                     | The offline rule applies to type too — no Google Fonts request at runtime              |
| Charts         | none — build the two small visualisations by hand in SVG                                 | A chart library for two visuals is dead weight                                         |
| Realtime       | Server-Sent Events via a route handler                                                   | Simpler and more reliable than WebSockets on serverless                                |
| Tests          | `vitest` + `@testing-library/react` for two components: `IssueRow` and the overlay panel | —                                                                                      |
| LLM (optional) | Anthropic Messages API, `claude-sonnet-4-6`                                              | Enrichment only. Never on the critical path                                            |

**Deliberately not used:** pgvector (adds infra risk; at hackathon scale in-process similarity over a few hundred vectors is microseconds), Redis, any UI kit, NextAuth, any state management library beyond React state and server components. Also not used: Phaser — the demo game is ~300 lines of plain Canvas 2D; any server-side image library such as `sharp` — report screenshots are downscaled and encoded on the client; and any persisted vector store, `centroid` column or vocabulary table — see §5.2.

---

## 3. Repository layout

```
repro/
├─ SPEC.md                     ← this file
├─ README.md                   ← §11
├─ docker-compose.yml          ← postgres only
├─ .env.example
├─ .nvmrc                      ← "20"
├─ prisma/
│  ├─ schema.prisma
│  ├─ fixtures/
│  │  ├─ bugTemplates.ts       ← ~14 templates, 20–40 hand-written paraphrases each
│  │  └─ noise.ts              ← ~25 noise reports
│  └─ seed.ts                  ← posts ~400 reports to the real ingest API
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/page.tsx          ← landing
│  │  ├─ (auth)/login/  register/
│  │  ├─ studio/
│  │  │  ├─ page.tsx                   ← campaign list
│  │  │  └─ [campaignId]/
│  │  │     ├─ page.tsx                ← issue board (the core screen)
│  │  │     ├─ issues/[issueId]/page.tsx
│  │  │     ├─ stream/page.tsx         ← raw incoming feed
│  │  │     └─ forensics/page.tsx      ← leak check
│  │  ├─ play/
│  │  │  ├─ page.tsx                   ← open campaigns
│  │  │  └─ [campaignId]/
│  │  │     ├─ nda/page.tsx
│  │  │     └─ session/page.tsx        ← game frame + overlay
│  │  ├─ me/page.tsx                   ← tester rewards + signal score
│  │  └─ api/
│  │     ├─ ingest/route.ts            ← POST report
│  │     ├─ campaigns/[id]/events/route.ts   ← SSE
│  │     ├─ access/[token]/route.ts    ← signed build access
│  │     ├─ issues/[id]/verify/route.ts
│  │     └─ forensics/decode/route.ts
│  ├─ domain/                  ← PURE. No Prisma, no React, no fetch.
│  │  ├─ triage/
│  │  │  ├─ config.ts            ← weights + thresholds, named exports
│  │  │  ├─ normalise.ts
│  │  │  ├─ tfidf.ts
│  │  │  ├─ signature.ts
│  │  │  ├─ similarity.ts
│  │  │  └─ severity.ts
│  │  ├─ watermark/
│  │  │  ├─ encode.ts
│  │  │  └─ decode.ts
│  │  ├─ rewards/
│  │  │  ├─ ledger.ts
│  │  │  └─ signalScore.ts
│  │  └─ access/
│  │     └─ token.ts
│  ├─ server/                  ← Prisma + orchestration. Calls domain/.
│  │  ├─ db.ts
│  │  ├─ session.ts
│  │  ├─ services/
│  │  │  ├─ ingestService.ts
│  │  │  ├─ triageService.ts
│  │  │  ├─ rewardService.ts
│  │  │  └─ forensicsService.ts
│  │  └─ enrich/anthropic.ts   ← optional, wrapped in try/catch
│  ├─ components/
│  ├─ overlay/                 ← the in-game reporter widget
│  │  ├─ overlay.ts            ← builds to a single embeddable script
│  │  └─ capture.ts
│  └─ styles/tokens.css
└─ tests/
   ├─ triage.similarity.test.ts
   ├─ triage.clustering.test.ts
   ├─ watermark.roundtrip.test.ts
   ├─ rewards.idempotency.test.ts
   └─ access.token.test.ts
```

**The `domain/` boundary is the single most important architectural decision in this repo.** Everything in `domain/` is pure functions over plain data: no I/O, no Prisma, no React. That is what makes the interesting logic testable in milliseconds and what a reviewing engineer will look for first. Enforce it: `domain/` may not import from `server/`, `app/`, or `@prisma/client`.

---

## 4. Data model (`prisma/schema.prisma`)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  displayName  String
  role         Role     @default(TESTER)
  signalScore  Int      @default(100)   // 0–200, starts neutral
  birthDate    DateTime?                 // collected at register; age computed server-side at NDA signing
  createdAt    DateTime @default(now())

  studio       Studio?
  ndaSignatures NdaSignature[]
  reports      Report[]
  ledgerEntries LedgerEntry[]
  accessGrants AccessGrant[]
}

enum Role { TESTER STUDIO }

model Studio {
  id        String @id @default(cuid())
  name      String
  ownerId   String @unique
  owner     User   @relation(fields: [ownerId], references: [id])
  campaigns Campaign[]
}

model Campaign {
  id            String   @id @default(cuid())
  studioId      String
  studio        Studio   @relation(fields: [studioId], references: [id])
  title         String
  pitch         String              // one paragraph shown to testers
  testFocus     String              // "what we need you to break"
  buildKind     BuildKind
  buildUrl      String              // internal path or external link
  status        CampaignStatus @default(OPEN)
  maxTesters    Int      @default(200)
  ndaBodyMd     String
  rewardPoolTotal Int    @default(0) // in coins
  rewardPerIssue  Int    @default(50)
  revokedAt     DateTime?           // set → every live grant for this campaign is invalid at once
  createdAt     DateTime @default(now())

  reports       Report[]
  issues        Issue[]
  ndaSignatures NdaSignature[]
  accessGrants  AccessGrant[]
}

enum BuildKind { WEB_EMBED DOWNLOAD EXTERNAL_LINK }
enum CampaignStatus { DRAFT OPEN CLOSED }

model NdaSignature {
  id          String   @id @default(cuid())
  userId      String
  campaignId  String
  typedName   String
  ndaBodyHash String              // sha256 of the exact text signed
  ipHash      String              // sha256(ip + salt) — never store raw IP
  userAgent   String
  signedAt    DateTime @default(now())

  user     User     @relation(fields: [userId], references: [id])
  campaign Campaign @relation(fields: [campaignId], references: [id])

  @@unique([userId, campaignId])
}

model AccessGrant {
  id          String   @id @default(cuid())
  userId      String
  campaignId  String
  nonce       String   @unique      // single use, rewritten on re-issuance
  watermarkId Int      @unique     // 16-bit payload embedded in frames; globally unique, from a sequence
  issuedAt    DateTime @default(now())
  expiresAt   DateTime
  consumedAt  DateTime?
  uaHash      String
  issuanceCount   Int      @default(1)     // re-issuances inside the current window
  windowStartedAt DateTime @default(now()) // rolling 1h rate-limit window

  user     User     @relation(fields: [userId], references: [id])
  campaign Campaign @relation(fields: [campaignId], references: [id])

  @@unique([userId, campaignId])       // one live watermark id per tester per campaign
}

model Report {
  id           String   @id @default(cuid())
  campaignId   String
  reporterId   String
  body         String              // the tester's sentence
  screenshotData String? @db.Text   // data URL: canvas ≤1280px wide, JPEG q0.8, ≤2 MB after encode
  gameState    Json                // scene, coords, playtimeSec, custom
  systemInfo   Json                // os, browser, gpuRenderer, screen, memory
  consoleTail  String[]            // last 50 lines
  signature    String              // deterministic hash, see §5.2
  tokens       String[]            // normalised tokens, cached for tf-idf
  issueId      String?
  isNoise      Boolean  @default(false)
  createdAt    DateTime @default(now())

  campaign Campaign @relation(fields: [campaignId], references: [id])
  reporter User     @relation(fields: [reporterId], references: [id])
  issue    Issue?   @relation(fields: [issueId], references: [id])
}

model Issue {
  id            String   @id @default(cuid())
  campaignId    String
  title         String
  category      IssueCategory
  severity      Severity
  status        IssueStatus @default(OPEN)
  firstReporterId String
  occurrenceCount Int    @default(1)
  signature     String
  sharedTraits  Json               // e.g. {"gpuRenderer":{"AMD":16,"NVIDIA":2}}
  createdAt     DateTime @default(now())
  verifiedAt    DateTime?

  campaign Campaign @relation(fields: [campaignId], references: [id])
  reports  Report[]
}

enum IssueCategory { CRASH VISUAL GAMEPLAY PERFORMANCE AUDIO UX }
enum Severity { CRITICAL HIGH MEDIUM LOW }
enum IssueStatus { OPEN VERIFIED REJECTED FIXED }

model LedgerEntry {
  id             String   @id @default(cuid())
  userId         String
  campaignId     String
  issueId        String?
  amount         Int
  reason         LedgerReason
  idempotencyKey String   @unique     // ← the guarantee
  createdAt      DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}

enum LedgerReason { ISSUE_VERIFIED FIRST_REPORTER_BONUS MANUAL_ADJUSTMENT }
```

Notes for the implementer:

- **Never store a raw IP.** `ipHash = sha256(ip + APP_SALT)`. Say so in the README; a judge will ask about GDPR.
- **`LedgerEntry.idempotencyKey` is `@unique` and that uniqueness _is_ the idempotency mechanism.** Insert, catch the unique-constraint violation, return the existing row. Do not implement this with a `SELECT` then `INSERT` — that races.
- Balance is always `SUM(amount)` over the ledger. Never store a mutable balance column.
- **No TF-IDF state is persisted.** There is no `centroid` column and no vocabulary table. A TF-IDF centroid cannot be interpreted without a fixed vocabulary ordering, and persisting a vocabulary is complexity this product does not need. On each ingest the campaign's vocabulary, IDF and every candidate issue's centroid are rebuilt in memory from the cached `Report.tokens` arrays — sub-millisecond at 400 reports, and it removes a whole class of stale-vector bugs. Record it in the README as a deliberate simplification.
- `AccessGrant.watermarkId` is **globally** unique, allocated from a dedicated Postgres sequence. Forensics therefore needs no campaign picker: a decoded id names one person. The 16-bit payload caps the platform at 65,535 grants — state that ceiling in the README and say production widens the payload.
- `AccessGrant` holds **one row per `(userId, campaignId)` for life.** Re-issuance updates that row; it never inserts a second one. See §6.1.
- Every delta in §0.5 ships in **one** migration.

---

## 5. The triage engine — the heart of the product

Build this **first**, before any UI, and drive it entirely from tests. It lives in `src/domain/triage/` and touches nothing else.

### 5.1 Design principle

Clustering must be **deterministic and local**. It must not require an API key or a network. An LLM may later improve the title and category, but the grouping itself is computed in-process. This is both an engineering choice (the demo cannot fail) and a product argument (studios keep pre-release data in their own boundary).

### 5.2 The signals

For each incoming report, compute four independent signals against every existing issue in that campaign:

**A. Lexical similarity (`tfidf.ts`, `similarity.ts`), weight 0.45**
Normalise the body: lowercase, strip punctuation, collapse whitespace, remove a small English stopword list, apply a light game-domain synonym map (`crashed|froze|hung → crash`, `fps|lag|stutter → performance`, `clipped|stuck in|fell through → collision`). Build a TF-IDF vector over the campaign corpus. Compare with cosine similarity against the issue centroid.

IDF is recomputed **per campaign, on every ingest**, over all of that campaign's reports using the cached `Report.tokens` arrays; each candidate issue's centroid is computed in the same pass from its own reports. Nothing about the vector space is persisted (see §4 notes). Adding a report shifts every existing vector slightly, and that is correct — IDF is a property of the corpus, not of a row.

**B. State proximity, weight 0.25**
Same `scene`, plus Euclidean distance between world coordinates bucketed to a configurable grid (default 5 units). Same scene + same bucket → 1.0. Same scene, adjacent bucket → 0.6. Same scene only → 0.3. Different scene → 0.

**C. Log signature, weight 0.20**
From `consoleTail`, extract lines matching error patterns, strip volatile parts (numbers, hex addresses, timestamps, cuids), sort, and hash. Identical signature is very strong evidence — if signatures match exactly and are non-empty, the combined score is floored at 0.9.

**D. Environment correlation, weight 0.10**
Overlap of `gpuRenderer` family, OS and browser family with the issue's existing occurrences. Weak on its own; it exists so that the shared-traits panel has data and so a GPU-specific bug clusters slightly tighter.

### 5.3 The decision

```
score = 0.45·A + 0.25·B + 0.20·C + 0.10·D

score ≥ 0.82           → attach to that issue, recompute shared traits and severity
                         (the centroid is not stored; it is rebuilt in memory next ingest)
0.62 ≤ score < 0.82    → attach as "possible duplicate", flagged for one-click
                          confirm/split in the UI
score < 0.62           → create a new issue
```

If several issues clear the threshold, attach to the highest scorer only.

**When in doubt, do not merge.** A wrongly merged report hides a real bug; a wrongly split one costs the developer one click. State this rule in a comment in `similarity.ts` and repeat it in the README — it is the answer to "what if your AI gets it wrong?"

Thresholds live in `src/domain/triage/config.ts` as named exports so they can be tuned without touching logic, and so tests can pin them.

### 5.4 Noise detection

Mark `isNoise = true` when: body is under 12 characters after normalisation, or contains no domain-relevant token, or is byte-identical to a report the same tester filed within 60 seconds. Noise reports never create issues, never earn rewards, and lower the reporter's signal score. They stay visible in the raw stream — do not delete them, the studio should be able to audit.

### 5.5 Severity (`severity.ts`)

Pure rules, no model:

- `CRASH` category, or `occurrenceCount ≥ 15` → `CRITICAL`
- `occurrenceCount ≥ 8`, or blocks progression keywords (`can't continue`, `softlock`, `stuck forever`) → `HIGH`
- `occurrenceCount ≥ 3` → `MEDIUM`
- otherwise → `LOW`

Recompute on every attach. The board sorts by severity then occurrence count.

### 5.6 Optional LLM enrichment

`src/server/enrich/anthropic.ts`, called **after** the issue exists and always inside try/catch. It only rewrites `title` and may refine `category`. If `ANTHROPIC_API_KEY` is unset or the call fails, keep the deterministic fallback title: the first reporter's sentence truncated to 70 characters. The board must look identical in both cases.

### 5.7 Tests that must exist

- Two reports describing the same bug in different words cluster together.
- Two reports about different scenes never cluster, however similar the wording.
- Identical log signatures cluster even when the wording differs completely.
- A borderline pair lands in the "possible duplicate" band, not merged.
- Noise reports create no issue.
- Clustering is order-independent: shuffle the 400-report fixture and assert the same issue count ±1 **and** the same top-3 issues by occurrence count.
- Severity escalates correctly as occurrences accumulate.

---

## 6. Security and IP protection

This is a real part of the product, not a slide. Build the three layers below, and be honest in the README about what they do and do not achieve.

### 6.1 Per-tester signed access (`domain/access/token.ts`)

A grant token is `base64url(payload) + "." + hmacSha256(payload, ACCESS_SECRET)` where payload is `{ grantId, campaignId, userId, watermarkId, exp }`.

Rules:

- TTL 15 minutes, configurable per campaign.
- `nonce` is single-use for `DOWNLOAD` builds: first successful use sets `consumedAt`; later uses are rejected.
- Bind to a UA hash. A mismatch is rejected with a clear message.
- **Re-issuance updates the existing grant row in place.** There is one row per `(userId, campaignId)` and it keeps its `watermarkId` for life — that is what "one live watermark id per tester per campaign" means, and it is what lets a decoded id name a person rather than a session. Re-issuing writes a new `nonce` and `expiresAt` and clears `consumedAt`, so a tester whose download grant was consumed can always request another.
- Rate limit, enforced in the DB on that same row: if `now − windowStartedAt > 1h`, reset `windowStartedAt = now` and `issuanceCount = 1`; otherwise increment `issuanceCount` and reject above 5.
- A grant is invalid the moment `campaign.revokedAt` is set or `campaign.status = CLOSED`. Revocation is immediate by construction and needs no sweep over grant rows.

The demo depends on this: copying the URL into another browser must visibly fail. Make the rejection page explicit — _"This access link belongs to another tester. Request your own from the campaign page."_

### 6.2 Forensic watermark (`domain/watermark/`)

Pure functions, no canvas API, operating on `{ width, height, data: Uint8ClampedArray }` so they are testable in Node.

**Encode.** Tile the frame into an 8×8 grid of blocks. Encode the globally unique 16-bit `watermarkId` plus an 8-bit checksum across 24 blocks (redundantly across the remaining 40). For a bit set to 1, add a luminance delta of `+2`; for 0, `−2`. Clamp. The result is invisible at normal viewing and survives a lossless screenshot.

**Decode.** Take an uploaded image. For each block, compute the mean luminance and compare against the median of its neighbours. Recover bits by sign, majority-vote across redundant copies, verify the checksum. Return `{ watermarkId, confidence }` or `null`.

The decoder must also tolerate **integer downscaling by 2× and 3×** — average block means over the corresponding source blocks — so that an OS screenshot taken on a HiDPI display still decodes.

**The forensic path and the report path are separate, and must not be conflated.** Report screenshots are downscaled and JPEG-encoded on the client (§7); a ±2 luminance delta does not survive lossy re-encoding, so those images carry no recoverable watermark and the product never claims they do. The demo instead uses an explicit **"Export frame for forensics"** button on the session page, which composites the game frame with the watermark overlay and downloads a lossless PNG via `canvas.toBlob('image/png')` — never re-encoded, never downscaled. That file is what step 8 of §12 uploads. Because `watermarkId` is globally unique, the forensics page needs no campaign picker: upload an image, get a name back.

Be honest about the limits in the README: this survives a PNG screenshot and mild scaling. It does not survive heavy re-encoding, filters, or a phone photo of a monitor. Production would use a frequency-domain scheme. **Do not claim more than it does** — a judge who works in this field will test the claim, not the demo.

Wire it into the session page: an overlay canvas composited over the game frame, redrawing the pattern once per second with the tester's `watermarkId`.

### 6.3 NDA

Render the exact markdown, store its sha256 alongside the typed name, hashed IP, UA and timestamp. Show the tester their own signature record on `/me`. Block campaign access without a signature. Add an age gate at registration: under 18 cannot sign an NDA or join NDA-gated campaigns.

### 6.4 Reward abuse controls

- Reward is paid to the **first reporter** of a verified issue only.
- Every payout writes one ledger row with `idempotencyKey = "verify:" + issueId`. Verifying twice pays once. Prove it with a test that calls the endpoint 50 times in parallel and asserts exactly one row.
- Signal score: `+3` for a verified unique issue, `+1` for a report attached to an issue later verified, `−2` for noise, `−1` for a report attached to an already-known issue in bulk. Clamp 0–200. Testers below 40 are rate-limited to 5 reports per hour.
- Reward pool cannot go negative. Inside the same transaction as the payout, assert that `SUM(amount)` over `ISSUE_VERIFIED` + `FIRST_REPORTER_BONUS` entries for that campaign, plus the new amount, is `<= campaign.rewardPoolTotal`; otherwise fail with a typed `PoolExhausted` error.
- **Coins are fictional claim tokens.** No payment path, no cash out. `rewardPoolTotal` is an integer the studio types when creating the campaign. User-facing copy describes coins as redeemable for the studio's own rewards — keys, in-game items, credits mention — and never as money.

### 6.5 Baseline hygiene

- bcrypt cost 12. Session JWT: 7 days, httpOnly, sameSite lax, secure in production.
- Every route handler validates input with Zod and returns typed errors. Never echo a raw exception to the client.
- Authorisation is checked in the service layer, not only in the page. Write one test that a studio cannot read another studio's campaign.
- Screenshots capture **only the game canvas**, never the full screen. Say this in the tester consent copy — it is a real privacy property and it is a good answer to a GDPR question.
- Uploaded images: size cap 4 MB, MIME sniffed, re-encoded before storage, served from a path that never executes.

---

## 7. The in-game overlay (`src/overlay/`)

Builds to one standalone script a studio can drop into a WebGL build.

- Binds `F1` and renders a small panel over the canvas.
- Captures: a **canvas-only** screenshot — downscaled to at most 1280px wide and encoded with `toDataURL('image/jpeg', 0.8)`, typically 150–250 KB — plus `navigator.userAgent`, WebGL `UNMASKED_RENDERER_WEBGL`, `deviceMemory`, screen size, and the last 50 console lines through a lightweight console proxy installed at load. The data URL goes into `Report.screenshotData`; anything still over 2 MB after encoding is rejected client-side with a clear message. No filesystem writes, so this behaves identically offline and on Vercel.
- Reads game state from `window.__repro.getState()` if the host game defines it, otherwise falls back to a demo state provider.
- One text field, one submit button. Optimistic confirmation, retry with exponential backoff, queue in memory if offline.
- Must never crash the host page. Wrap everything; on internal error, fail silently and log once.
- The session page — not the overlay — carries the **"Export frame for forensics"** button described in §6.2.

For the demo build a small **plain Canvas 2D** sample game — roughly 300 lines, no Phaser, no engine — with three deliberately planted bugs (a collision trap near a lift, an audio dropout in one room, a frame-rate spike when many entities spawn) so live reports genuinely cluster onto seeded issues.

---

## 8. Design direction

Do not produce a generic SaaS dashboard. Read `src/styles/tokens.css` as the only source of colour and type; no ad-hoc hex values in components.

**The idea.** The subject is _collapsing many into few_ — noise into signal. The interface should make that collapse visible rather than decorative. The board's job is to look like a place where a decision gets made, not a place where data is displayed.

**Palette.** Cool paper `#F1F3F2`; ink `#141A18`; a muted slate `#6E7B77` for secondary text; hairline `#D5DAD8`; one alert vermilion `#D2452B` reserved exclusively for CRITICAL; one deep teal `#0F5E58` reserved exclusively for verified/clustered state. Those last two colours appear nowhere else — that restraint is what makes the board readable at a glance.

**Type.** One family, Geist Sans, in three deliberate roles: occurrence counts and the collapse figures set large and tight (weight 600, negative tracking); interface labels at 13–14px regular; body copy at 15px with generous leading, max 68 characters per line. No all-caps labels. No monospace for anything except the raw log tail, where it is functional.

**Hero.** The landing page opens with the collapse itself: 400 small marks animating into 12 grouped blocks, once, on load, then still. One sentence under it. No gradient, no card grid, no three-column feature strip.

**The issue board.** Two columns, asymmetric. Left 62%: issues as full-width rows, not cards — severity as a 3px left rule, title, occurrence count set large on the right, category as plain text. Right 38%: the live raw stream, quieter, smaller, monochrome, so the eye is drawn left. The contrast between the two columns is the whole argument of the product, so let the layout make it.

**Issue detail.** Screenshot grid at the top. Below it, the shared-traits panel stated as a sentence, not a chart: _"16 of 18 occurrences on AMD GPUs. 17 of 18 in Chrome. All within 4 units of (128, 0, 96)."_ A sentence a developer can act on beats a pie chart.

**Motion.** One orchestrated moment only: the triage collapse. Everything else is instant. Respect `prefers-reduced-motion`.

**Quality floor, unannounced.** Responsive to 380px, visible keyboard focus, real empty states that tell the user what to do next, errors that say what happened and how to fix it.

---

## 9. Build phases

Commit continuously inside each phase. Do not start a phase before the previous one's exit criteria pass.

**Phase 0 — Foundation (~90 min)**
Node 20 pinned via fnm + `.nvmrc`, pnpm via corepack, Next.js + TS strict, Tailwind v4, ESLint, Prettier, Vitest, Prisma, docker-compose (Postgres on host port **5434**, container 5432), `.env.example`, GitHub Actions running typecheck + lint + test on Node 20, README skeleton, tokens.css.
_Exit:_ CI green on an empty app.

**Phase 1 — Triage domain (~3 h). Build this before any UI.**
All of `src/domain/triage/` plus the full test suite from §5.7. No database, no React.
_Exit:_ all triage tests pass; the 400-report fixture collapses to ~12 issues, order-independent by count ±1 and by top-3.

**Phase 2 — Data + ingest (~2 h)**
Prisma schema, one migration carrying every §0.5 delta, `ingestService`, `POST /api/ingest`, seed script that posts ~400 fixture reports and ~25 noise reports through the real endpoint.
_Exit:_ `pnpm seed` produces ~12 issues in the DB; re-running is idempotent.

**Phase 3 — Auth, campaigns, NDA (~2.5 h)**
Session, register/login (role self-selected; a STUDIO registration also takes a studio name and creates the `Studio` in the same transaction; `birthDate` collected), role split, studio campaign CRUD, NDA sign flow with a server-side age check, access grant issuance, in-place re-issuance and validation.
_Exit:_ copying an access link to another browser is rejected; the authorisation test passes.

**Phase 4 — Studio board (~3 h)**
Issue board, issue detail with shared traits, raw stream, SSE live updates with an automatic 3-second polling fallback when SSE errors or closes, verify action.
_Exit:_ a report posted by curl appears on the board within a second and lands in the right issue.

**Phase 5 — Rewards (~1.5 h)**
Ledger, first-reporter payout, idempotency, signal score, `/me` page, leaderboard.
_Exit:_ the 50-parallel-verify test yields exactly one ledger row.

**Phase 6 — Watermark + forensics (~2 h)**
Encode/decode domain functions including 2×/3× downscale tolerance, session overlay compositing, the "Export frame for forensics" button, `/studio/[id]/forensics` upload-and-identify page with no campaign picker.
_Exit:_ round-trip test passes; a frame exported from the running session page decodes to the right tester by name.

**Phase 7 — Overlay + demo game (~2 h)**
Overlay script, console proxy, plain Canvas 2D demo game with three planted bugs, embed on the session page.
_Exit:_ F1 in the demo game produces a report that clusters onto a seeded issue.

**Phase 8 — Polish (~2.5 h)**
Landing page and hero, empty states, error states, mobile, keyboard focus, README, architecture diagram, deploy to Vercel + Neon.
_Exit:_ a fresh clone runs from `README.md` in under five minutes.

**Freeze.** Three hours before the deadline, stop writing features. Only bug fixes, README, and rehearsal.

---

## 10. Commits

The GitHub award at this event counts **accepted commits**, and Best Code is reviewed by engineers reading the actual code. Those two facts point the same way: many small, real, compiling commits.

- Conventional Commits: `feat(triage): weight log signature above lexical score`. Scope is the module.
- One logical change per commit. A new pure function plus its test is one commit. A schema change is its own commit.
- Never `git add -A` blindly. Stage deliberately.
- Never commit generated output, `node_modules`, `.env`, or `.next`.
- Push after every commit, not in one batch at the end.
- Rough target: 150–250 commits across the build. That falls out naturally from the rule above; do not manufacture empty commits — a reviewer reading `chore: update` forty times will mark the repo down, and it undercuts the Best Code entry.
- Commit straight to `main`. Branch-per-phase with PRs was considered and rejected: solo build, and the overhead buys nothing here. Push after every commit.

---

## 11. README requirements

The README is judged. Write it last, when the product is real, and keep it under two screens before the fold.

Must contain, in this order:

1. One sentence: what Repro does.
2. A GIF, 10 seconds: F1 in the game → report appears → 40 collapse to 6 → verify → coin paid.
3. Live demo link.
4. Quick start: three commands, working from a cold clone.
5. Architecture diagram (Mermaid) showing overlay → ingest → triage domain → issue board, with the `domain/` purity boundary drawn explicitly.
6. **How the triage works** — the four signals, the weights, the thresholds, and the "when in doubt, do not merge" rule. Say that IDF and centroids are rebuilt in memory on every ingest and that nothing about the vector space is persisted, and why that is a deliberate simplification rather than a shortcut.
7. **What the security layers do and do not do** — signed access, NDA record, forensic watermark, and an honest paragraph on the limits of client-side protection. Include the 65,535-grant ceiling of the 16-bit payload, and state plainly that report screenshots are lossy and carry no watermark: only exported forensic frames do.
8. Privacy: hashed IPs, canvas-only screenshots, what `birthDate` is used for and when, retention. Coins are claim tokens redeemable against the studio's own rewards, not money.
9. Test coverage summary and how to run it.
10. Team, with who built what.

---

## 12. Definition of done

The demo runs end to end, on a laptop, with the Wi-Fi switched off:

1. Studio creates a campaign and sets a reward pool.
2. Tester signs the NDA and receives personal, expiring access.
3. The same link pasted into a second browser is rejected on screen.
4. Tester plays the embedded game, presses F1, submits a report.
5. The report appears in the live stream within a second and attaches to the correct existing issue, occurrence count incrementing on screen.
6. Board shows ~12 issues from 400+ reports, sorted by severity, with a shared-traits sentence on the top issue.
7. Studio verifies the issue; the first reporter's balance increases; verifying again pays nothing.
8. Studio uploads a frame exported from the session page; forensics names the tester, with no campaign picker.

If any one of these eight fails, that is the only thing being worked on.
