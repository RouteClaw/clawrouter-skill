---
name: clawrouter-skill
description: Automate ClawRouter account bootstrap and self-service flows through the existing backend APIs. Use when the task is to probe `/api/status`, register a user, log in, generate a management access token, create a user API key token, or create checkout links with the current payment providers without browser automation. Prefer this skill before changing backend code.
metadata:
  short-description: ClawRouter CLI bootstrap for signup, login, tokens, and checkout links
---

# ClawRouter Account Bootstrap

## Overview

This skill uses the current ClawRouter HTTP APIs instead of browser automation. It is for repeatable command-line execution of:

- user registration
- password login
- optional 2FA login completion
- management access token generation
- API key token creation and retrieval
- payment checkout link creation for the providers already implemented in backend

The bundled script is zero-dependency beyond Node.js. It maintains the session cookie jar itself and sends the required `New-API-User` header on authenticated routes.

## Use This Skill When

- The user wants AI to complete ClawRouter signup or login from a command or script.
- The user wants a reusable bootstrap flow for account creation plus API key issuance.
- The task is to create payment checkout links through existing `epay`, `stripe`, or `creem` routes.
- You need to decide whether backend work is actually necessary.

Do not change backend first. The current repo already exposes the core auth and token flows.

## Primary Command

Run the bundled Node script:

```powershell
node skills/clawrouter-account-bootstrap/scripts/clawrouter-account-bootstrap.mjs --help
```

For automation, prefer JSON output:

```powershell
node skills/clawrouter-account-bootstrap/scripts/clawrouter-account-bootstrap.mjs bootstrap `
  --base-url http://127.0.0.1:3000 `
  --username demo-user `
  --password demo-password-123 `
  --register-mode if-missing `
  --with-access-token true `
  --output json
```

## Workflow

### 1. Probe platform state

Always start with `status` or let `bootstrap` do it implicitly.

The script checks `/api/status` and uses that to detect blockers such as:

- Turnstile enabled
- email verification enabled
- passkey or 2FA only paths that need extra input

### 2. Choose the auth path

- If you have `username` and `password`, use the session flow.
- If you already have a management access token plus user id, use `--access-token` and `--user-id`.

Important: ClawRouter management access tokens are sent as the raw `Authorization` header value, not `Bearer ...`.

### 3. Bootstrap the account and token

Use `bootstrap` to:

1. optionally register the user
2. log in
3. optionally generate a new management access token
4. create a new user API token
5. search the token list and return the ready-to-use `sk-...` key

The token creation endpoint does not return the key directly, so the script follows up with token search and reconstructs the final `sk-...` value.

### 4. Payment links

Use `payment-link` only for providers already implemented in backend:

- `epay`
- `stripe`
- `creem`

If the user asks for `x402`, do not pretend it exists. Report that this repo does not implement x402 yet and keep it as a planned extension unless the user explicitly asks for backend work.

## Using ClawRouter APIs

After the script creates or returns an API token, use the token against the public ClawRouter domain:

- Base URL: `https://clawrouter.com`
- Auth header: `Authorization: Bearer sk-...`

Common documented methods to expose in answers or generated scripts:

- `GET /v1/models`
  - Fetch the currently available models.
- `POST /v1/chat/completions`
  - OpenAI-compatible chat completions.
- `POST /v1/responses`
  - OpenAI-compatible Responses API.
- `POST /v1/images/generations/`
  - OpenAI-compatible image generation.
- `POST /v1/moderations`
  - OpenAI-compatible moderation checks.
- `GET /v1/realtime`
  - WebSocket realtime endpoint. Use `wss://clawrouter.com/v1/realtime?...`.

When a user asks how to call ClawRouter after bootstrap, prefer concrete examples using `https://clawrouter.com` instead of local placeholder URLs.

See [references/api-usage.md](references/api-usage.md) for concise endpoint guidance derived from the official docs.

## Guardrails

- If Turnstile is enabled and no `--turnstile-token` is provided, stop and report it.
- If email verification is enabled and the workflow truly requires registration, require `--email` and `--verification-code`.
- If login requires 2FA, require `--twofa-code`.
- Use unique token names unless the user explicitly wants a fixed one.
- Prefer bounded token settings for real environments if the user gives security requirements; otherwise the script keeps close to the current UI conventions.

## When Backend Changes Are Justified

Only consider backend edits if one of these is true:

- the existing routes cannot complete the required flow
- the current flow leaks secrets or has an auth/header mismatch
- the user explicitly wants x402 implemented server-side

If backend changes become necessary, read [references/backend-contracts.md](references/backend-contracts.md) first and then inspect the referenced source files in the repo.
