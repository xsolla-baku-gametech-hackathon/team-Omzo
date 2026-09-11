# Nightly Development Log

Branch `nightly-mvp-build`, built on top of `backup-pre-nightly` (43094fe).
Twenty-one commits, 41 files, +2466 / −98 lines.

The original pre-nightly state is preserved on both the `backup-pre-nightly`
branch and its remote copy. `backup-pre-nightly` is an ancestor of this
branch, so nothing was rewritten — every change is additive history.

---

## 1. What changed, and why

### 1.1 The two findings that mattered

Everything else on this branch is incremental. These two were exploitable.

**Anyone could file a report as anyone.** `POST /api/ingest` read `reporterId`
straight out of the request body. A comment above the field claimed the
overlay took it from the authenticated session; nothing on the server checked
that, and the route performed no session lookup at all. Middleware serves that
same route with `Access-Control-Allow-Origin: *`, so it was reachable and
forgeable from any origin on the internet.

That is not merely spam, because the reporter id is wired into the economics:

| Path                                                | Consequence of a forged reporter                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ingestService` → `penaliseNoise(reporterId)`       | File junk in a tester's name and destroy their standing                                                   |
| `rewardService` verification + corroboration awards | Farm coins into an attacker-controlled account                                                            |
| The product's core claim                            | A report is offered as evidence; evidence a stranger can author under someone else's name is not evidence |

Identity is now always derived server-side, from a signed build access token
(bearer) or the first-party session cookie. `reporterId` is gone from the
request schema entirely rather than merely ignored, and when a grant token is
present the campaign comes from its signature too, so a body cannot redirect a
report outside the grant's scope.

**Every secret had a public fallback.** All three were read as
`process.env.NAME ?? "hardcoded-fallback"`, and those fallback strings are
committed to a public repository. A deploy that forgot a variable did not
break — it silently signed with a key any reader of the repo already had.

| Secret           | What holding it grants                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET` | Forge a session for any user; the payload carries `role` and `studioId`, so that includes STUDIO access to any campaign                                                    |
| `ACCESS_SECRET`  | Mint build access grants for any campaign, bypassing the 15-minute TTL and single-use nonce, and pin the resulting forensic watermark on a tester who never held the build |
| `APP_SALT`       | Reverse every stored IP hash — IPv4 is ~4 billion values, trivially enumerable against a known salt                                                                        |

Separately, `??` substitutes only `null` and `undefined`. `.env.example` shipped
`SESSION_SECRET=""`, so copying the template verbatim produced an _empty_
signing key rather than the fallback.

`requireSecret` now refuses to return anything outside development when a
secret is unset, blank, whitespace, or under 32 characters, and treats anything
that is not explicitly `development` or `test` as production — so a deploy that
forgets `NODE_ENV` also fails closed. Errors name the variable and never echo
its value.

### 1.2 Correctness

**The watermark ECC decoder rejected recoverable frames.** The (8,4) extended
Hamming decoder treated a flip of the overall parity bit `p4` as an
uncorrectable double error. `p4` is the one bit no syndrome covers, so a hit
there leaves the syndrome clean while breaking total parity — exactly the
combination that fell through. The four data bits are untouched in that case.

`p4` is one of eight bits, so this discarded roughly one in eight otherwise
recoverable frames. In a forensics product a frame wrongly declared unreadable
is a leak that goes unattributed.

The existing test looped `bit < 7`, stopping one position short of the broken
case — it locked the defect in rather than catching it. It now sweeps all 8
positions across all 16 nibbles, and double-error detection is verified
exhaustively across all 28 bit pairs per nibble (448 cases), each one refused
rather than guessed at.

### 1.3 Hardening

- **Layered login throttling.** Login was bounded only per-address, which does
  not bound credential stuffing at all: a pool of addresses yields a fresh
  budget from each one while grinding a single account. A second bucket now
  follows the account, keyed on a SHA-256 of the normalised email — raw keys
  would let an attacker grow the in-memory map with arbitrary strings and would
  turn that map into a list of who holds an account here. Capacity is
  deliberately generous, because a throttle keyed on the victim's identity is
  also a denial-of-service primitive if it is tight.
- **Per-principal ingest rate limiting.** Per-address alone punished testers
  behind a shared NAT and handed a fresh budget to anyone rotating addresses.
- **SSE teardown.** Every path that can discover a disconnected client now runs
  one idempotent `release()`, including `request.signal`'s abort event and the
  race where a request aborts before `start()` runs.
- **Tenancy on mutations.** The suite proved one studio could not _read_
  another's campaign but did not cover the state-changing paths, which carry
  the larger consequence — `verify` moves coins into balances.

### 1.4 Tests

269 passing (from 197 at the start of the branch), across 28 files.

New suites: `secrets` (13), `ingestAuth` (10), `tenancyMutations` (12),
`watermarkEcc` (5, two of them exhaustive sweeps), plus `rateLimiter`,
`sanitize`, `passwordRules`, `auditLog`, `fuzzyMatch`, `stackTrace`,
`apiResponse` from earlier in the night.

---

## 2. Presentation guide

Total runtime about eight minutes. Every number below is real and reproducible
from the seeded database, not a mock.

### Setup (before judges arrive)

```bash
pnpm db:up && pnpm db:migrate dev
pnpm dev                 # leave running on :3000
pnpm seed                # 328 reports → 21 issues, takes a few minutes
```

The seed posts every fixture through the real authenticated `POST /api/ingest`,
minting a genuine grant token per tester. It gets no server-side backdoor, so
a successful seed is itself a demonstration that the auth path works.

Studio login: `studio@repro.dev` / `playtest-demo-2026`

### The demo

**1. The collapse (90s) — `/`**
Open the landing page. 400 scattered marks resolve once into 12 blocks. That
animation is the product's argument, not decoration: raw reports in, fixable
issues out. The headline quotes the live database.

**2. The board (2 min) — `/studio/seed-campaign`**
The asymmetry is the point: decisions on the left, chaos on the right. 21 issues
from 328 reports. Rows carry severity as a 3px rule _and_ as a word, because
severity is never conveyed by colour alone. The right column is the raw stream
with no severity colour at all — nothing there has been judged yet.

Say plainly: **248 reports attached to an existing issue, 57 were held as
possible duplicates, 23 were scored as noise.** The held ones are the honest
part — the engine scored them between "same bug" and "different bug" and
declined to guess.

**3. The judgement call (90s)** — open an issue with held duplicates.
The shared traits render as a sentence, not a chart, with the figures weighted
so it scans as data while still reading as English. Confirm one duplicate,
split another. Both paths are tenancy-checked before any write is attempted.

**4. Forensics (2 min) — `/studio/seed-campaign/forensics`**
Export a frame from a session, drop it in, recover the tester. Then show the
honest half: re-encode the same frame as JPEG and drop it in again. It says
what it cannot do rather than guessing.

**5. The security story (2 min)** — this is the differentiator for a technical
judge. Run it live:

```bash
# Anyone could file a report as anyone. Now:
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/ingest \
  -H 'content-type: application/json' \
  -d '{"campaignId":"seed-campaign","reporterId":"tester-04","body":"forged", ...}'
# → 401
```

Then the one that lands hardest: with a _valid_ token for `tester-07`, a body
claiming `reporterId: tester-04` still records against `tester-07`. The client
does not get to say who it is.

And the credential-stuffing demo — 25 wrong passwords, each from a different
`X-Forwarded-For`, still trips the per-account bucket at attempt 20.

### Questions to expect

- _"Why does the board not look like the landing page?"_ Deliberate split. The
  landing page is a Stage surface: centred, airy, one moment of motion. The
  board is a Console: left-aligned, dense, nothing glows. A developer stares at
  it for twenty minutes looking for one row among twenty-three.
- _"Is the watermark real?"_ Yes — 16-bit identity in pixel luminance, ±2
  delta, surviving 2× and 3× downscale. It does not survive lossy JPEG, and the
  UI says so rather than guessing.
- _"Does this need the internet?"_ No. Clustering, watermarking and scoring are
  all local and deterministic. There is no model on the critical path.

---

## 3. Git history

### Commits, in order

| Commit    | Summary                                                       |
| --------- | ------------------------------------------------------------- |
| `8f49bd7` | Password entropy rules, enforced in the auth service          |
| `80377be` | Input sanitisation engine, applied to the ingest pipeline     |
| `5daf192` | In-memory token bucket rate limiter                           |
| `53473d6` | HTTP security headers and CORS middleware                     |
| `b4a129a` | Levenshtein distance and fuzzy keyword matching               |
| `4e61748` | Standardised API response and error helpers                   |
| `44a094f` | Tamper-evident structured audit logging                       |
| `f05e3fa` | Stack trace normaliser for Unity, Unreal and WASM             |
| `a945bd7` | **fix** SECDED decoder rejecting recoverable parity-bit flips |
| `1521e72` | Drop unused `p4` binding, document why it is not read         |
| `0426019` | **feat** fail-closed secret loading                           |
| `608b24e` | **fix** remove committed fallback session signing key         |
| `ac437e8` | **fix** remove committed access-token and IP-salt fallbacks   |
| `d59d525` | **fix** authenticate ingest; stop trusting client identity    |
| `11f3349` | **test** lock the reporter-impersonation vector shut          |
| `e565ae3` | **test** tenancy boundary on state-changing paths             |
| `049dd2a` | **docs** state that the three secrets are required            |
| `110ff41` | **fix** seed honours ingest rate limiting                     |
| `d01705a` | **feat** throttle login per account as well as per address    |
| `0f26d07` | **harden** idempotent SSE teardown on every path              |
| `7c2b4a5` | **docs** correct test count, document the security model      |

### Files added

```
src/server/config/secrets.ts          fail-closed secret loading
src/server/auth/ingestAuth.ts         who is filing this report
src/server/security/rateLimiter.ts    token bucket
src/server/security/auditLog.ts       tamper-evident audit chain
src/server/apiResponse.ts             response/error helpers
src/domain/sanitize.ts                input sanitisation
src/domain/access/passwordRules.ts    entropy rules
src/domain/triage/fuzzyMatch.ts       Levenshtein + keyword matching
src/domain/triage/stackTrace.ts       crash fingerprinting
src/domain/watermark/ecc.ts           (8,4) extended Hamming SECDED
src/middleware.ts                     security headers, CORS
src/app/api/dev/listener-count/       dev-only SSE leak observability
```

### Files changed for the identity fix

`src/app/api/ingest/route.ts`, `src/overlay/overlay.ts`,
`src/components/WatermarkedFrame.tsx`,
`src/app/play/[campaignId]/session/page.tsx`, `prisma/seed.ts` — the whole
chain that used to carry a client-supplied reporter id, removed end to end.

---

## 4. Known limitations

Stated because a judge will find them, and because a list of strengths with no
limits is telling half of something.

- **The rate limiter is in-memory and per-instance.** Correct for a single
  process; behind more than one replica each instance holds its own buckets, so
  effective limits multiply by the replica count. It needs a shared store to be
  a real control at scale.
- **`src/domain/watermark/ecc.ts` is not wired into the live watermark
  pipeline.** It is correct and exhaustively tested, but the shipping format
  still uses the 16-bit id plus 8-bit checksum in `config.ts`. Integrating ECC
  is a wire-format change that would invalidate existing watermarked frames,
  which was not a safe thing to do on demo night. It is a prepared primitive,
  not a live feature, and should not be presented as one.
- **Session-authenticated ingest does not verify campaign enrolment.** A
  logged-in tester can file against any _open_ campaign. Grant-token callers are
  correctly pinned to their campaign. Much narrower than the original hole, but
  not closed.
- **`Access-Control-Allow-Origin: *` remains on `/api/ingest`.** Acceptable now
  that the route authenticates via bearer token rather than ambient cookies —
  this is the standard public-API shape — but it is a deliberate choice, not an
  oversight.
- **The commit count is 21, not the 350 originally targeted.** Every commit here
  is a real, verified change; several were validated against a running server
  before being written. Reaching 350 in one night would have required splitting
  work into fragments too small to verify, and the instruction that no commit be
  empty or nonsensical is the one worth keeping.
