# ClawRouter API Usage

This file summarizes the account, token, and public relay APIs that are useful after auth or bootstrap.

## Base Rules

- Public relay domain: `https://clawrouter.com`
- API key auth header: `Authorization: Bearer sk-...`
- Management access token auth requires both:
  - `Authorization: <access_token>`
  - `New-API-User: <user_id>`
- Most relay endpoints are OpenAI-compatible.
- Realtime uses WebSocket and should use `wss://clawrouter.com/...`.

## Account and Token Inspection

### Get account profile and quota

- Method: `GET`
- Path: `/api/user/self`
- Auth: management access token or logged-in session
- Purpose: inspect user metadata, remaining quota, used quota, and account settings

Example:

```bash
curl https://clawrouter.com/api/user/self \
  -H "Authorization: ACCESS_TOKEN_REPLACE_ME" \
  -H "New-API-User: 123"
```

Important: `quota` and `used_quota` here are user-level values.

### Get account-visible models

- Method: `GET`
- Path: `/api/user/models`
- Auth: management access token or logged-in session
- Purpose: list model ids visible to the authenticated account across its usable groups

Example:

```bash
curl https://clawrouter.com/api/user/models \
  -H "Authorization: ACCESS_TOKEN_REPLACE_ME" \
  -H "New-API-User: 123"
```

### Get token usage and quota

- Method: `GET`
- Path: `/api/usage/token/`
- Auth: API key token
- Purpose: inspect token-level total granted, total used, remaining quota, expiry, and model limits

Example:

```bash
curl https://clawrouter.com/api/usage/token/ \
  -H "Authorization: Bearer sk-REPLACE_ME"
```

Important: this endpoint always reports token quota, not user quota.

## Public Relay Inspection

### List token-visible models

- Method: `GET`
- Path: `/v1/models`
- Auth: API key token
- Purpose: discover which model ids the token can use before sending requests

Example:

```bash
curl https://clawrouter.com/v1/models \
  -H "Authorization: Bearer sk-REPLACE_ME"
```

### Get billing subscription summary

- Method: `GET`
- Path: `/v1/dashboard/billing/subscription`
- Auth: API key token
- Purpose: inspect remaining balance in the current display unit

Example:

```bash
curl https://clawrouter.com/v1/dashboard/billing/subscription \
  -H "Authorization: Bearer sk-REPLACE_ME"
```

### Get billing usage summary

- Method: `GET`
- Path: `/v1/dashboard/billing/usage`
- Auth: API key token
- Purpose: inspect used amount in the current display unit

Example:

```bash
curl "https://clawrouter.com/v1/dashboard/billing/usage?start_date=2026-03-01&end_date=2026-03-29" \
  -H "Authorization: Bearer sk-REPLACE_ME"
```

Important quota semantics:

- `/api/usage/token/` always reports token-level quota.
- `/v1/dashboard/billing/*` may report token quota or user quota depending on `DisplayTokenStatEnabled`.
- `/api/user/self` reports user-level quota.

## Model Switching

ClawRouter does not expose a dedicated public endpoint to persist a "current model" selection for an account or token. Switch models by changing the `model` field in the next relay request.

Example using Chat Completions:

```bash
curl https://clawrouter.com/v1/chat/completions \
  -H "Authorization: Bearer sk-REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      { "role": "user", "content": "Hello" }
    ]
  }'
```

To switch models, resend the request with a different `model` value after confirming it appears in `/v1/models`.

## Common Relay Methods

### Responses API

- Method: `POST`
- Path: `/v1/responses`
- Purpose: OpenAI-compatible Responses API, including newer response-oriented flows

Example:

```bash
curl https://clawrouter.com/v1/responses \
  -H "Authorization: Bearer sk-REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "input": "Write a haiku about routers."
  }'
```

### Image generation

- Method: `POST`
- Path: `/v1/images/generations/`
- Purpose: OpenAI-compatible image generation

Example:

```bash
curl https://clawrouter.com/v1/images/generations/ \
  -H "Authorization: Bearer sk-REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "A futuristic cat-themed network dashboard"
  }'
```

### Moderation

- Method: `POST`
- Path: `/v1/moderations`
- Purpose: content safety classification

Example:

```bash
curl https://clawrouter.com/v1/moderations \
  -H "Authorization: Bearer sk-REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Example text to moderate"
  }'
```

### Realtime

- Method: WebSocket
- Path: `/v1/realtime`
- Purpose: realtime audio or conversational sessions

Example URL:

```text
wss://clawrouter.com/v1/realtime?model=gpt-4o-realtime
```

Send the same bearer token in the connection headers.

## Practical Guidance

- Use `/api/user/self` when the user asks for account profile or account quota.
- Use `/api/user/models` when the user asks what the account can see in the dashboard.
- Use `/v1/models` when the user asks what a specific API key can use.
- Use `/api/usage/token/` when the user asks for token quota directly.
- Use `/v1/dashboard/billing/*` when the user expects OpenAI-style billing endpoints.
- Switch models by changing the request body's `model` field, not by searching for a separate toggle endpoint.
