# Repro

Repro turns 400 raw playtest reports into 12 issues a developer can actually fix.

> **Status: in build.** This README is a skeleton. It gets written properly at
> Phase 8, when the product is real — see `SPEC.md` §11 for what it must contain.

## Quick start

```bash
pnpm install          # Node 20 — see .nvmrc
pnpm db:up            # Postgres in Docker, host port 5434
pnpm dev
```

Copy `.env.example` to `.env` first and fill in the three secrets. The fourth,
`ANTHROPIC_API_KEY`, is optional: without it the app runs identically and only
issue-title enrichment is disabled.

The whole stack runs with the Wi-Fi off. That is a hard requirement, not a
nice-to-have — see `SPEC.md` §0.

## Development

| Command           | What it does                            |
| ----------------- | --------------------------------------- |
| `pnpm dev`        | Next dev server                         |
| `pnpm test`       | Vitest — the `domain` and `ui` projects |
| `pnpm typecheck`  | `tsc --noEmit`, strict, zero `any`      |
| `pnpm lint`       | ESLint                                  |
| `pnpm format`     | Prettier, write                         |
| `pnpm db:migrate` | Prisma migrate dev                      |
| `pnpm db:studio`  | Prisma Studio                           |

## Architecture

`src/domain/` is pure: no Prisma, no React, no I/O. Every interesting decision
in this product — clustering, watermarking, the reward ledger, access tokens —
lives there and is tested in milliseconds. The boundary is enforced by a test,
not by convention: see `tests/domain.purity.test.ts`.

Full plan and the decisions behind it: [`SPEC.md`](./SPEC.md).
