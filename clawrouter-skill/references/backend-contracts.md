# Backend Contracts

This skill is built against the current ClawRouter backend routes already present in the repo.

## Core Routes

- `GET /api/status`
  - Source: `controller/misc.go`
  - Used to detect `turnstile_check`, `email_verification`, `quota_display_type`, server address, and other runtime gates.

- `POST /api/user/register`
  - Source: `controller/user.go`
  - Password registration route.
  - Optional query: `turnstile=<token>`
  - Email verification is required only when `common.EmailVerificationEnabled` is true.

- `POST /api/user/login`
  - Source: `controller/user.go`
  - Password login route.
  - Optional query: `turnstile=<token>`
  - May return `data.require_2fa=true`.

- `POST /api/user/login/2fa`
  - Source: `controller/twofa.go`
  - Requires the pending session from the previous login call.
  - Body: `{ "code": "123456" }`

- `GET /api/user/self`
  - Source: `controller/user.go`
  - Authenticated route.
  - Requires `New-API-User` header matching the logged-in user id.
  - Returns user-level `quota`, `used_quota`, and profile metadata.

- `GET /api/user/models`
  - Source: `controller/user.go`
  - Returns the model ids visible to the authenticated user across usable groups.

- `GET /api/user/token`
  - Source: `controller/user.go`
  - Generates a management access token for the user.
  - Important: `middleware/auth.go` reads this management token from the raw `Authorization` header value, not `Bearer ...`.

## API Token and Billing Routes

- `POST /api/token/`
  - Source: `controller/token.go`
  - Creates a token but does not return the key in the response.
  - Body fields used by the UI:
    - `name`
    - `remain_quota`
    - `expired_time`
    - `unlimited_quota`
    - `model_limits_enabled`
    - `model_limits`
    - `allow_ips`
    - `group`

- `GET /api/token/search?keyword=<name>&token=`
  - Source: `controller/token.go`, `model/token.go`
  - Used by the script after token creation to fetch the created token row and reconstruct the user-facing `sk-...` key.

- `GET /api/usage/token/`
  - Source: `controller/token.go`
  - Requires bearer API key auth.
  - Returns token-level totals such as `total_granted`, `total_used`, `total_available`, `unlimited_quota`, and `model_limits`.

- `GET /v1/models`
  - Source: `router/relay-router.go`, `controller/model.go`
  - Requires bearer API key auth.
  - Returns the models visible to the token, including token model-limit filtering when enabled.

- `GET /v1/dashboard/billing/subscription`
- `GET /v1/dashboard/billing/usage`
  - Source: `router/dashboard.go`, `controller/billing.go`
  - Require bearer API key auth.
  - `controller/billing.go` switches between token-level and user-level quota semantics based on `common.DisplayTokenStatEnabled`.

## Payment Routes

- `GET /api/user/topup/info`
  - Source: `controller/topup.go`
  - Returns which payment providers are enabled.

- `POST /api/user/pay`
  - Source: `controller/topup.go`
  - Existing epay flow.

- `POST /api/user/stripe/pay`
  - Source: `controller/topup_stripe.go`
  - Existing Stripe checkout flow.

- `POST /api/user/creem/pay`
  - Source: `controller/topup_creem.go`
  - Existing Creem checkout flow.

## Current Gap

No x402 route or adapter is implemented in this repo at the moment. Search results across backend code show current payment support centered on `epay`, `stripe`, and `creem`.
