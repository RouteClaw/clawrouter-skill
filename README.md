# ClawRouter Skill

This repository contains a Codex skill package for ClawRouter. Its job is to let another Codex instance work with ClawRouter through the existing HTTP APIs instead of relying on browser automation or guessing undocumented flows.

The skill is designed for practical self-service tasks such as account bootstrap, login, access-token generation, API-key creation, model discovery, quota inspection, billing inspection, and payment-link creation. It also explains an important product behavior: model switching in ClawRouter is a per-request API choice, not a separate persistent toggle in the public relay APIs.

## What This Skill Is For

Use this skill when the task is about operating ClawRouter as a user or API consumer, especially when the goal is to:

- inspect platform status before authentication
- register a user or log in with username and password
- complete a 2FA login flow when required
- generate a management access token
- create or retrieve a user API key
- query account-level profile and quota information
- query token-level model visibility or billing information
- create checkout links for supported payment providers
- explain how to switch models correctly in requests

The skill intentionally prefers existing backend and public endpoints before proposing backend changes.

## How The Skill Works

The package combines three pieces:

- a `SKILL.md` file that tells Codex when to trigger the skill and how to reason about the workflow
- reference notes that describe the relevant ClawRouter APIs and backend contracts
- a zero-dependency Node.js helper CLI that can execute the common flows directly

The helper CLI keeps its own cookie jar, supports management-access-token auth and API-key auth, and defaults to the official service at `https://clawrouter.com`.

## Auth Model

The skill works with two different auth scopes, and keeping them separate is important:

- Management auth
  - Used for dashboard-style account actions such as `/api/user/self`, `/api/user/models`, and user token creation.
  - Can come from a logged-in session or from a management access token plus user id.
- API key auth
  - Used for relay-style endpoints such as `/v1/models`, `/v1/dashboard/billing/*`, `/api/usage/token/`, `/v1/chat/completions`, and `/v1/responses`.
  - Uses a normal ClawRouter API key such as `sk-...`.

This distinction matters because account quota and token quota are not always the same thing.

## Main Capabilities

### 1. Account bootstrap

The skill can probe `/api/status`, detect blockers such as Turnstile or email verification, register a user when appropriate, log in, and create a ready-to-use API key.

### 2. Account inspection

The skill can inspect `/api/user/self` to return user profile data, remaining quota, used quota, and related account metadata.

### 3. Model discovery

The skill supports both scopes of model inspection:

- account-visible models through `/api/user/models`
- token-visible models through `/v1/models`

This is useful because a user may be allowed to see more models in the account context than a specific token can use.

### 4. Billing and quota inspection

The skill can query:

- `/api/usage/token/` for token-level totals
- `/v1/dashboard/billing/subscription`
- `/v1/dashboard/billing/usage`

It also documents that dashboard billing semantics may reflect token quota or user quota depending on server settings such as `DisplayTokenStatEnabled`.

### 5. Payment-link creation

The skill can generate checkout links through the payment providers that already exist in the backend:

- `epay`
- `stripe`
- `creem`

It explicitly does not pretend that `x402` already exists in this repo.

### 6. Model switching guidance

One of the most useful parts of the skill is that it prevents a common mistake: searching for a dedicated "switch model" endpoint. In ClawRouter, model selection is normally done by changing the `model` field in the next `/v1/chat/completions` or `/v1/responses` request after confirming the model id is available.

## CLI Commands

The bundled helper script is at `clawrouter-skill/scripts/clawrouter-account-bootstrap.mjs`.

Available subcommands:

- `status`
  - Inspect runtime gates such as Turnstile, email verification, and quota display mode.
- `account`
  - Query account profile and optional account-visible models.
- `models`
  - Query models in either account scope or API-key scope.
- `billing`
  - Query token usage plus OpenAI-compatible billing endpoints.
- `bootstrap`
  - Register, log in, optionally mint a management access token, and create a user API key.
- `payment-link`
  - Create supported checkout links through the existing payment providers.

## Typical Workflows

### Bootstrap a new usable token

1. Probe server state with `status`.
2. Register or log in with `bootstrap`.
3. Return a usable `sk-...` token.
4. Use that token with `/v1/models`, `/v1/chat/completions`, or `/v1/responses`.

### Inspect a user account

1. Authenticate with a management access token and user id.
2. Run `account`.
3. Optionally include `--include-models true` to inspect account-visible model ids.

### Inspect token scope and billing

1. Provide an API key.
2. Run `models` to see what the token can use.
3. Run `billing` to inspect token usage and dashboard billing endpoints.

## Quick Start

Show CLI help:

```powershell
node clawrouter-skill/scripts/clawrouter-account-bootstrap.mjs --help
```

Inspect an account:

```powershell
node clawrouter-skill/scripts/clawrouter-account-bootstrap.mjs account `
  --access-token YOUR_ACCESS_TOKEN `
  --user-id YOUR_USER_ID `
  --include-models true
```

Inspect token-visible models:

```powershell
node clawrouter-skill/scripts/clawrouter-account-bootstrap.mjs models `
  --api-key sk-YOUR_TOKEN
```

Inspect token usage and billing:

```powershell
node clawrouter-skill/scripts/clawrouter-account-bootstrap.mjs billing `
  --api-key sk-YOUR_TOKEN
```

Bootstrap a new token against the official hosted service:

```powershell
node clawrouter-skill/scripts/clawrouter-account-bootstrap.mjs bootstrap `
  --username YOUR_USERNAME `
  --password YOUR_PASSWORD `
  --register-mode if-missing `
  --with-access-token true `
  --output json
```

The script defaults to `https://clawrouter.com`, so `--base-url` is only needed for another deployment target.

## Repository Layout

- `clawrouter-skill/`
  - The actual skill package that Codex should load.
- `clawrouter-skill/SKILL.md`
  - Main trigger description, workflow, guardrails, and usage guidance.
- `clawrouter-skill/references/api-usage.md`
  - Endpoint-level guidance for account inspection, model discovery, billing, and relay usage.
- `clawrouter-skill/references/backend-contracts.md`
  - Backend route map and implementation notes used when validating whether backend changes are necessary.
- `clawrouter-skill/scripts/clawrouter-account-bootstrap.mjs`
  - Helper CLI used to execute the repeatable flows directly.
- `clawrouter-skill/agents/openai.yaml`
  - UI-facing metadata for the skill.

## Editing Notes

If you update this package, keep the repository root `README.md` as the human-facing overview and keep the actual skill behavior in `clawrouter-skill/SKILL.md` plus the reference files. That separation keeps the skill package clean while still giving the repo a useful landing page.
