# Development

Back to the [README](../README.md).

## Tech stack

| Layer     | Technology                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Framework | [Next.js 16](https://nextjs.org) (App Router) + TypeScript                                                                                |
| API       | [tRPC v11](https://trpc.io) (end-to-end type-safe)                                                                                        |
| Database  | [Prisma 7](https://www.prisma.io) + PostgreSQL 16 (Docker and CI; `npm run dev:full` runs embedded PostgreSQL 18)                         |
| Auth      | [NextAuth v5](https://authjs.dev) (credentials + magic link + OIDC; optional Google provider with no login-page button)                   |
| UI        | [TailwindCSS 4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) + [next-themes](https://github.com/pacocoursey/next-themes) |
| AI        | Pluggable providers: OpenAI, OpenAI-Codex, Claude, Meridian, Ollama                                                                       |
| Testing   | [Vitest](https://vitest.dev) (unit) + [Playwright](https://playwright.dev) (e2e)                                                          |

## Setup

```bash
# Install dependencies (the committed .npmrc sets legacy-peer-deps=true, because
# next-auth's optional nodemailer peer range is older than the nodemailer Splitbon pins)
npm install

# Generate Prisma client
npx prisma generate

# Copy and configure environment
cp .env.example .env  # Then edit .env as needed

# Option A: All-in-one (embedded PostgreSQL + schema push + seed + dev server)
npm run dev:full

# Option B: Manual setup (bring your own PostgreSQL)
# Set DATABASE_URL in .env pointing to your PostgreSQL instance
npx prisma db push
npm run db:seed    # optional -- creates demo data
npm run dev
```

Demo accounts after seeding: `alice@example.com`, `bob@example.com`, `charlie@example.com` (password: `password123`).

## Running Tests

```bash
# Unit tests (Vitest)
npm test

# E2E tests (requires dev server running; install the browser once first, with
# --with-deps on Linux; see ../CONTRIBUTING.md for the settings the full suite expects)
npx playwright install chromium
BASE_URL=http://localhost:3000 npx playwright test

# E2E with visible browser
BASE_URL=http://localhost:3000 npx playwright test --headed

# Include AI-dependent tests (requires configured AI provider)
BASE_URL=http://localhost:3000 RUN_AI_TESTS=1 npx playwright test

# Build the Docker image and smoke test it (fresh install, upgrade restarts,
# Meridian). Run before pushing Docker, entrypoint, SQL, or dependency changes.
npm run test:docker
# Same, against a remote Docker daemon
DOCKER_HOST=ssh://user@host npm run test:docker
```

Set `AUTH_RATE_LIMIT_MAX=9999`, `AUTH_IP_RATE_LIMIT_MAX=9999`, `REGISTER_RATE_LIMIT_MAX=9999`, and `GUEST_RATE_LIMIT_MAX=9999` in `.env` to lift the per-email and per-IP limits during repeated test runs (the global guest caps and the fixed guest limits still apply). Every local request counts against one IP, because Next.js adds an `x-forwarded-for` header to local requests.

## Releases

There are no version bumps or release branches. Each push to `main` is released automatically:

- [auto-release.yml](../.github/workflows/auto-release.yml) tags the commit `build/YYYY.MM.DD.N` and creates a GitHub release listing the commits since the previous build.
- [docker.yml](../.github/workflows/docker.yml) builds the image, runs `scripts/docker-smoke.sh` against it (the same checks as `npm run test:docker`), and pushes it as `ghcr.io/cyborcc/splitbon:latest` and `:<short-sha>` only if they pass.

To promote a build to `stable` (the tag the Unraid template uses), run the **Promote to Stable** workflow ([promote-stable.yml](../.github/workflows/promote-stable.yml)) with a build tag or commit SHA; it defaults to the head of `main`. It moves the `stable` git tag, then retags that commit's image as `:stable`. If that commit has no image, the run fails after the git tag has already moved, so the `stable` git tag and the `:stable` image then point at different commits until a later promotion succeeds.

```bash
gh workflow run promote-stable.yml -f ref=build/YYYY.MM.DD.N
```

## Helper scripts

```bash
# Open a PR for the current branch with gh (prints the existing PR's URL if there is one)
npm run pr:create -- [--base main] [--title "..."] [--body "..." | --body-file path]

# Push the current HEAD to origin/main (refuses if the working tree has uncommitted or untracked files)
npm run push:main
```
