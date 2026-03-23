# ClawRouter API Usage

This file summarizes the public API usage patterns from the official ClawRouter docs for use after account bootstrap.

## Base Rules

- Public domain: `https://clawrouter.com`
- Auth header: `Authorization: Bearer sk-...`
- Most endpoints are OpenAI-compatible.
- Realtime uses WebSocket and should use `wss://clawrouter.com/...`.

## Common Methods

### List models

- Method: `GET`
- Path: `/v1/models`
- Purpose: discover the currently available models before making requests

Example:

```bash
curl https://clawrouter.com/v1/models \
  -H "Authorization: Bearer sk-REPLACE_ME"
```

### Chat Completions

- Method: `POST`
- Path: `/v1/chat/completions`
- Purpose: OpenAI-compatible chat requests

Example:

```bash
curl https://clawrouter.com/v1/chat/completions \
  -H "Authorization: Bearer sk-REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      { "role": "user", "content": "Hello" }
    ]
  }'
```

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

- Start with `/v1/models` if the user is unsure which model IDs are available.
- Use `/v1/chat/completions` for broad OpenAI SDK compatibility.
- Use `/v1/responses` for newer OpenAI response workflows.
- Use `/v1/images/generations/` when the user needs image output.
- Use `/v1/moderations` for pre-checking user input or generated content.
- Use `/v1/realtime` only with a WebSocket client.
