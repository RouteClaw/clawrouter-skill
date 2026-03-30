---
name: clawrouter-skill
description: Automate ClawRouter self-service flows through the existing backend and public APIs. Use when the task is to probe `/api/status`, register or log in a user, generate a management access token, create a user API key token, list visible models through `/api/user/models` or `/v1/models`, inspect account or token quota through `/api/user/self`, `/api/usage/token/`, or `/v1/dashboard/billing/*`, explain per-request model switching, or create checkout links with the current payment providers without browser automation. Prefer this skill before changing backend code.
---

# ClawRouter Self-Service

## Overview

Use the current ClawRouter HTTP APIs instead of browser automation. This skill is for repeatable command-line execution of:

- user registration
- password login
- optional 2FA login completion
- account profile and quota lookup
- account-visible model lookup
- API-token-visible model lookup
- token usage and dashboard billing lookup
- management access token generation
- API key token creation and retrieval
- payment checkout link creation for the providers already implemented in backend

The bundled script is zero-dependency beyond Node.js. It maintains the session cookie jar itself and sends the required `New-API-User` header on authenticated management routes.

## Primary Command

Run the bundled Node script:

```powershell
node scripts/clawrouter-account-bootstrap.mjs --help
```

For automation, prefer JSON output:

```powershell
node scripts/clawrouter-account-bootstrap.mjs bootstrap `
  --base-url https://clawrouter.com `
  --username demo-user `
  --password demo-password-123 `
  --register-mode if-missing `
  --with-access-token true `
  --output json
```

For the official hosted service, you can also omit `--base-url` because the script already defaults to `https://clawrouter.com`.

Useful subcommands:

- `status` to inspect runtime gates before attempting auth
- `account` to inspect `/api/user/self` and optional account-visible models
- `models` to inspect either `/api/user/models` or `/v1/models`
- `billing` to inspect token usage and OpenAI-compatible dashboard billing endpoints
- `bootstrap` to register, log in, mint access tokens, and create user API keys
- `payment-link` to create checkout links for existing payment providers

## Workflow

### 1. Probe platform state

Always start with `status` or let `bootstrap` do it implicitly.

The script checks `/api/status` and uses that to detect blockers such as:

- Turnstile enabled
- email verification enabled
- passkey or 2FA-only paths that need extra input
- quota display mode for later billing interpretation

### 2. Choose the auth path

- If you have `username` and `password`, use the session flow.
- If you already have a management access token plus user id, use `--access-token` and `--user-id`.
- If you already have a user API key and only need relay-model or billing inspection, use `--api-key`.

Important: ClawRouter management access tokens are sent as the raw `Authorization` header value, not `Bearer ...`.

### 3. Inspect account state, models, and quota

Use the dedicated commands before assuming backend work is needed:

- `account`
  - Calls `/api/user/self` and returns quota, used quota, profile metadata, and optional `--include-models`.
- `models`
  - Without `--api-key`, calls `/api/user/models` and returns account-visible model ids.
  - With `--api-key`, calls `/v1/models` and returns the models visible to that token.
- `billing`
  - Calls `/api/usage/token/` plus `/v1/dashboard/billing/subscription` and `/v1/dashboard/billing/usage`.
  - Use this when the user asks for token balance, dashboard billing, or remaining token allowance.

Distinguish user quota from token quota:

- `/api/user/self` returns user-level `quota` and `used_quota`.
- `/api/usage/token/` always returns token-level totals.
- `/v1/dashboard/billing/*` may reflect token quota or user quota depending on `DisplayTokenStatEnabled`.

### 4. Bootstrap the account and token

Use `bootstrap` to:

1. optionally register the user
2. log in
3. optionally generate a new management access token
4. create a new user API token
5. search the token list and return the ready-to-use `sk-...` key

The token creation endpoint does not return the key directly, so the script follows up with token search and reconstructs the final `sk-...` value.

### 5. Payment links

Use `payment-link` only for providers already implemented in backend:

- `epay`
- `stripe`
- `creem`

If the user asks for `x402`, do not pretend it exists. Report that this repo does not implement x402 yet and keep it as a planned extension unless the user explicitly asks for backend work.

### 6. Use public APIs and switch models

ClawRouter does not expose a dedicated persistent "switch default model" endpoint in the public relay APIs. Switch models per request instead:

1. use `models` to discover visible model ids
2. choose the target id
3. send the next `/v1/chat/completions` or `/v1/responses` request with a different `model` value

When the user asks to "switch models", interpret that as changing the request payload unless they explicitly want new backend or UI behavior.

## Using ClawRouter APIs

After the script creates or returns an API token, use the token against the public ClawRouter domain:

- Base URL: `https://clawrouter.com`
- Auth header: `Authorization: Bearer sk-...`

Common documented methods to expose in answers or generated scripts:

- `GET /v1/models`
  - Fetch the currently available models.
- `GET /v1/dashboard/billing/subscription`
  - Fetch remaining balance in the current display unit.
- `GET /v1/dashboard/billing/usage`
  - Fetch used amount in the current display unit.
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

See [references/api-usage.md](references/api-usage.md) for concise endpoint guidance, including account inspection, quota semantics, and model switching guidance.

## Model Management (Use This When the User Asks About Models)
 
### List available models
 
When the user asks "what models are available", "有什麼模型", "支援哪些模型", run:
 
```bash
curl -s https://clawrouter.com/v1/models \
  -H "Authorization: Bearer $(node -e "const c=require('$HOME/.openclaw/openclaw.json');console.log(c.models.providers.clawrouter.apiKey)")" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const m=JSON.parse(d).data;m.forEach(x=>console.log(x.id))})"
```
 
Present the results in a clean list grouped by provider:
- **Anthropic**: claude-opus-4-6, claude-sonnet-4-20250514, claude-haiku-4-5-20251001
- **OpenAI**: gpt-5, gpt-4o, gpt-4.1-mini
- **Google**: gemini-2.5-flash, gemini-3.1-pro-preview
- **DeepSeek**: deepseek-chat (cheapest option)
 
### Check current model
 
When the user asks "what model am I using", "現在用什麼模型", read the config:
 
```bash
node -e "const c=require('$HOME/.openclaw/openclaw.json');console.log('Current model:', c.agents.defaults.model.primary)"
```
 
### Switch model
 
When the user asks to switch models, "切換到 X", "用 X 模型":
 
1. First verify the requested model exists on ClawRouter (run the list command above)
2. Update the config:
 
```bash
node -e "
const fs=require('fs');
const f=process.env.HOME+'/.openclaw/openclaw.json';
const c=JSON.parse(fs.readFileSync(f,'utf8'));
const MODEL_ID='TARGET_MODEL_ID';
// Add model to provider if not present
const models=c.models.providers.clawrouter.models;
if(!models.find(m=>m.id===MODEL_ID)){
  models.push({id:MODEL_ID,name:MODEL_ID,contextWindow:200000,maxTokens:8192});
}
// Set as primary
c.agents.defaults.model.primary='clawrouter/'+MODEL_ID;
c.agents.defaults.models={'clawrouter/'+MODEL_ID:{}};
fs.writeFileSync(f,JSON.stringify(c,null,2));
console.log('Switched to '+MODEL_ID);
"
```
 
Replace `TARGET_MODEL_ID` with the actual model ID. After switching, tell the user the change will take effect after gateway reload. OpenClaw hot-reloads model config changes automatically.
 
### Check balance and usage
 
When the user asks "how much credit do I have", "還有多少額度", "餘額":
```bash
KEY=$(node -e "const c=require('$HOME/.openclaw/openclaw.json');console.log(c.models.providers.clawrouter.apiKey)")
echo "=== 餘額 ==="
curl -s "https://clawrouter.com/v1/dashboard/billing/subscription" -H "Authorization: Bearer $KEY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log('額度上限: \$'+r.hard_limit_usd)})"
echo "=== 用量 ==="
curl -s "https://clawrouter.com/v1/dashboard/billing/usage" -H "Authorization: Bearer $KEY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log('已使用: \$'+r.total_usage.toFixed(4))})"
```
 
Note: The quota values from the API are in internal units. Divide by 500000 to get approximate USD value.
## Guardrails

- If Turnstile is enabled and no `--turnstile-token` is provided, stop and report it.
- If email verification is enabled and the workflow truly requires registration, require `--email` and `--verification-code`.
- If login requires 2FA, require `--twofa-code`.
- Use unique token names unless the user explicitly wants a fixed one.
- Prefer bounded token settings for real environments if the user gives security requirements; otherwise the script keeps close to the current UI conventions.
- Do not promise a persistent model toggle unless you have inspected code that actually stores one.
- Do not conflate `account` results with `billing` or `token` results; they can intentionally report different scopes.

## When Backend Changes Are Justified

Only consider backend edits if one of these is true:

- the existing routes cannot complete the required flow
- the current flow leaks secrets or has an auth/header mismatch
- the user explicitly wants a persistent default-model switch beyond per-request `model` selection
- the user explicitly wants x402 implemented server-side

If backend changes become necessary, read [references/backend-contracts.md](references/backend-contracts.md) first and then inspect the referenced source files in the repo.
