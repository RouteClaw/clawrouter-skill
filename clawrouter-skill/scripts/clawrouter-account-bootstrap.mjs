#!/usr/bin/env node

import process from 'node:process';
import { parseArgs } from 'node:util';

const HELP_TEXT = `ClawRouter account bootstrap CLI

Usage:
  node skills/clawrouter-account-bootstrap/scripts/clawrouter-account-bootstrap.mjs status [--base-url <url>] [--output json|pretty]
  node skills/clawrouter-account-bootstrap/scripts/clawrouter-account-bootstrap.mjs bootstrap [--base-url <url>] --username <name> --password <password> [options]
  node skills/clawrouter-account-bootstrap/scripts/clawrouter-account-bootstrap.mjs payment-link [--base-url <url>] [auth options] --provider epay|stripe|creem|x402 [provider options]

Auth options:
  --username <name>
  --password <password>
  --turnstile-token <token>
  --twofa-code <code>
  --access-token <token>
  --user-id <id>

Bootstrap options:
  --register-mode always|if-missing|never   Default: if-missing
  --email <email>
  --verification-code <code>
  --aff-code <code>
  --with-access-token true|false            Default: false
  --token-name <name>                       Default: bootstrap-<timestamp>
  --token-remain-quota <int>                Default: 500000
  --token-unlimited true|false              Default: false
  --token-expired-time never|<unix>|<ISO>   Default: never
  --token-group <group>
  --token-model-limits <a,b,c>
  --token-allow-ips <ip1,ip2 or newline text>

Payment options:
  --provider epay|stripe|creem|x402
  --amount <int>                            For epay and stripe
  --payment-method <name>                   For epay, default: alipay
  --top-up-code <code>                      Optional for epay
  --product-id <id>                         Required for creem

General:
  --base-url <url>                         Default: https://clawrouter.com
  --output json|pretty                      Default: json
  --help
`;

class ClawRouterError extends Error {
  constructor(message, { step = 'unknown', details = null } = {}) {
    super(message);
    this.name = 'ClawRouterError';
    this.step = step;
    this.details = details;
  }
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  storeFrom(response) {
    const getSetCookie = response?.headers?.getSetCookie;
    const cookieHeaders =
      typeof getSetCookie === 'function'
        ? getSetCookie.call(response.headers)
        : response.headers.get('set-cookie')
          ? [response.headers.get('set-cookie')]
          : [];

    for (const rawCookie of cookieHeaders) {
      if (!rawCookie) {
        continue;
      }
      const pair = rawCookie.split(';', 1)[0];
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (!name) {
        continue;
      }
      if (value === '' || value.toLowerCase() === 'deleted') {
        this.cookies.delete(name);
        continue;
      }
      this.cookies.set(name, value);
    }
  }

  toHeader() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

class ClawRouterClient {
  constructor(baseUrl) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.cookieJar = new CookieJar();
    this.userId = null;
    this.accessToken = null;
  }

  setUserId(userId) {
    this.userId = Number(userId);
  }

  setAccessToken(accessToken, userId) {
    this.accessToken = normalizeAccessToken(accessToken);
    this.setUserId(userId);
  }

  buildHeaders({ auth = false } = {}) {
    const headers = { Accept: 'application/json' };
    const cookieHeader = this.cookieJar.toHeader();
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
    if (auth) {
      if (!Number.isInteger(this.userId) || this.userId <= 0) {
        throw new ClawRouterError(
          'Authenticated request requires a known user id',
          { step: 'auth-header' },
        );
      }
      headers['New-API-User'] = String(this.userId);
      if (this.accessToken) {
        headers.Authorization = this.accessToken;
      }
    }
    return headers;
  }

  async request(method, path, { query = null, body, auth = false } = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const headers = this.buildHeaders({ auth });
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'follow',
      });
    } catch (error) {
      throw new ClawRouterError(
        `Network request failed for ${method} ${path}: ${error.message}`,
        {
          step: path,
          details: { cause: error.message, url: url.toString() },
        },
      );
    }

    this.cookieJar.storeFrom(response);

    const rawText = await response.text();
    let parsed = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }

    return {
      method,
      path,
      url: url.toString(),
      status: response.status,
      ok: response.ok,
      body: parsed,
      rawText,
    };
  }
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) {
    return 'https://clawrouter.com';
  }
  if (typeof baseUrl !== 'string') {
    throw new ClawRouterError('Invalid --base-url value', {
      step: 'arguments',
    });
  }
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizeAccessToken(accessToken) {
  if (!accessToken) {
    return accessToken;
  }
  return accessToken.replace(/^Bearer\s+/i, '').trim();
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  throw new ClawRouterError(`Invalid boolean value: ${value}`, {
    step: 'arguments',
  });
}

function parseInteger(value, fieldName, defaultValue = undefined) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new ClawRouterError(`Invalid integer for ${fieldName}: ${value}`, {
      step: 'arguments',
    });
  }
  return parsed;
}

function parseTokenExpiredTime(value) {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    value === 'never'
  ) {
    return -1;
  }
  if (/^\d+$/.test(String(value).trim())) {
    return Number.parseInt(String(value).trim(), 10);
  }
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) {
    throw new ClawRouterError(
      `Invalid --token-expired-time value: ${value}. Use "never", unix seconds, or an ISO date string.`,
      { step: 'arguments' },
    );
  }
  return Math.ceil(parsed / 1000);
}

function parseCsv(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertSuccessEnvelope(response, step) {
  if (!response.body || typeof response.body !== 'object') {
    throw new ClawRouterError(
      `Expected JSON response for ${step}, got HTTP ${response.status}`,
      {
        step,
        details: {
          status: response.status,
          rawText: response.rawText,
          url: response.url,
        },
      },
    );
  }

  const envelope = response.body;

  if (envelope.success === true) {
    return envelope;
  }
  if (envelope.success === false) {
    throw new ClawRouterError(envelope.message || `${step} failed`, {
      step,
      details: envelope,
    });
  }

  const message = typeof envelope.message === 'string' ? envelope.message : '';
  if (message.toLowerCase() === 'success') {
    return envelope;
  }
  if (message.toLowerCase() === 'error') {
    throw new ClawRouterError(
      typeof envelope.data === 'string' ? envelope.data : `${step} failed`,
      {
        step,
        details: envelope,
      },
    );
  }

  if (response.ok) {
    return envelope;
  }

  throw new ClawRouterError(`HTTP ${response.status} during ${step}`, {
    step,
    details: {
      status: response.status,
      envelope,
      rawText: response.rawText,
      url: response.url,
    },
  });
}

function summarizeStatus(status) {
  return {
    system_name: status.system_name,
    server_address: status.server_address,
    turnstile_check: Boolean(status.turnstile_check),
    email_verification: Boolean(status.email_verification),
    passkey_login: Boolean(status.passkey_login),
    setup: Boolean(status.setup),
  };
}

async function fetchStatus(client) {
  const response = await client.request('GET', '/api/status');
  const envelope = assertSuccessEnvelope(response, 'status');
  return envelope.data;
}

async function registerUser(client, options) {
  const payload = {
    username: options.username,
    password: options.password,
  };
  if (options.email) {
    payload.email = options.email;
  }
  if (options.verificationCode) {
    payload.verification_code = options.verificationCode;
  }
  if (options.affCode) {
    payload.aff_code = options.affCode;
  }

  const response = await client.request('POST', '/api/user/register', {
    query: { turnstile: options.turnstileToken },
    body: payload,
  });
  return assertSuccessEnvelope(response, 'register');
}

async function loginUser(client, options) {
  const response = await client.request('POST', '/api/user/login', {
    query: { turnstile: options.turnstileToken },
    body: {
      username: options.username,
      password: options.password,
    },
  });
  const envelope = assertSuccessEnvelope(response, 'login');

  if (envelope?.data?.require_2fa) {
    if (!options.twofaCode) {
      throw new ClawRouterError(
        'Login requires 2FA. Provide --twofa-code to continue.',
        {
          step: 'login',
          details: envelope,
        },
      );
    }
    const twoFaResponse = await client.request('POST', '/api/user/login/2fa', {
      body: { code: options.twofaCode },
    });
    const twoFaEnvelope = assertSuccessEnvelope(twoFaResponse, 'login-2fa');
    return twoFaEnvelope.data;
  }

  return envelope.data;
}

async function fetchSelf(client) {
  const response = await client.request('GET', '/api/user/self', { auth: true });
  const envelope = assertSuccessEnvelope(response, 'self');
  return envelope.data;
}

async function generateManagementAccessToken(client) {
  const response = await client.request('GET', '/api/user/token', {
    auth: true,
  });
  const envelope = assertSuccessEnvelope(response, 'generate-access-token');
  return envelope.data;
}

async function createApiToken(client, tokenPayload) {
  const response = await client.request('POST', '/api/token/', {
    auth: true,
    body: tokenPayload,
  });
  assertSuccessEnvelope(response, 'create-api-token');
}

async function searchApiTokenByName(client, tokenName) {
  const response = await client.request('GET', '/api/token/search', {
    auth: true,
    query: {
      keyword: tokenName,
      token: '',
    },
  });
  const envelope = assertSuccessEnvelope(response, 'search-api-token');
  const tokens = Array.isArray(envelope.data) ? envelope.data : [];
  const exactMatches = tokens.filter((token) => token.name === tokenName);
  const candidates = exactMatches.length > 0 ? exactMatches : tokens;

  if (candidates.length === 0) {
    throw new ClawRouterError(
      `Token lookup failed after creation. No token named "${tokenName}" was returned.`,
      {
        step: 'search-api-token',
        details: envelope,
      },
    );
  }

  candidates.sort(
    (left, right) => (right.created_time || 0) - (left.created_time || 0),
  );
  const token = candidates[0];

  return {
    id: token.id,
    name: token.name,
    raw_key: token.key,
    api_key: `sk-${token.key}`,
    status: token.status,
    created_time: token.created_time,
    expired_time: token.expired_time,
    remain_quota: token.remain_quota,
    unlimited_quota: token.unlimited_quota,
    model_limits_enabled: token.model_limits_enabled,
    model_limits: token.model_limits,
    allow_ips: token.allow_ips,
    group: token.group,
  };
}

async function fetchTopupInfo(client) {
  const response = await client.request('GET', '/api/user/topup/info', {
    auth: true,
  });
  const envelope = assertSuccessEnvelope(response, 'topup-info');
  return envelope.data;
}

async function createPaymentLink(client, provider, options) {
  if (provider === 'x402') {
    throw new ClawRouterError(
      'x402 is not implemented in this ClawRouter repo. Current backend payment providers are epay, stripe, and creem.',
      {
        step: 'payment-link',
        details: { provider },
      },
    );
  }

  const topupInfo = await fetchTopupInfo(client);

  let path;
  let body;
  let enabled = true;

  switch (provider) {
    case 'epay':
      enabled = Boolean(topupInfo.enable_online_topup);
      path = '/api/user/pay';
      body = {
        amount: parseInteger(options.amount, '--amount'),
        payment_method: options.paymentMethod || 'alipay',
        top_up_code: options.topUpCode || '',
      };
      break;
    case 'stripe':
      enabled = Boolean(topupInfo.enable_stripe_topup);
      path = '/api/user/stripe/pay';
      body = {
        amount: parseInteger(options.amount, '--amount'),
        payment_method: 'stripe',
      };
      break;
    case 'creem':
      enabled = Boolean(topupInfo.enable_creem_topup);
      path = '/api/user/creem/pay';
      body = {
        product_id: options.productId,
        payment_method: 'creem',
      };
      break;
    default:
      throw new ClawRouterError(`Unsupported provider: ${provider}`, {
        step: 'payment-link',
      });
  }

  if (!enabled) {
    throw new ClawRouterError(
      `Payment provider "${provider}" is not enabled on this server.`,
      {
        step: 'payment-link',
        details: topupInfo,
      },
    );
  }

  if (
    (provider === 'epay' || provider === 'stripe') &&
    !Number.isInteger(body.amount)
  ) {
    throw new ClawRouterError(`Provider "${provider}" requires --amount`, {
      step: 'payment-link',
    });
  }
  if (provider === 'creem' && !body.product_id) {
    throw new ClawRouterError('Provider "creem" requires --product-id', {
      step: 'payment-link',
    });
  }

  const response = await client.request('POST', path, {
    auth: true,
    body,
  });
  const envelope = assertSuccessEnvelope(response, `payment-link:${provider}`);

  const normalized = {
    provider,
    topup_info: topupInfo,
    raw_response: envelope,
  };

  if (provider === 'epay') {
    normalized.checkout_url = envelope.url;
    normalized.form_fields = envelope.data;
  } else if (provider === 'stripe') {
    normalized.checkout_url = envelope.data?.pay_link || null;
  } else if (provider === 'creem') {
    normalized.checkout_url = envelope.data?.checkout_url || null;
    normalized.order_id = envelope.data?.order_id || null;
  }

  return normalized;
}

function buildTokenPayload(options) {
  const tokenName = options.tokenName || `bootstrap-${Date.now()}`;
  const modelLimits = parseCsv(options.tokenModelLimits);

  return {
    name: tokenName,
    remain_quota: parseInteger(
      options.tokenRemainQuota,
      '--token-remain-quota',
      500000,
    ),
    expired_time: parseTokenExpiredTime(options.tokenExpiredTime),
    unlimited_quota: parseBoolean(options.tokenUnlimited, false),
    model_limits_enabled: modelLimits.length > 0,
    model_limits: modelLimits.join(','),
    allow_ips: options.tokenAllowIps || '',
    group: options.tokenGroup || '',
  };
}

function ensurePasswordAuthInputs(options) {
  if (!options.username || !options.password) {
    throw new ClawRouterError(
      'Username/password auth requires both --username and --password.',
      {
        step: 'arguments',
      },
    );
  }
}

function ensureTurnstileIfRequired(status, options) {
  if (status.turnstile_check && !options.turnstileToken) {
    throw new ClawRouterError(
      'This ClawRouter instance requires Turnstile. Provide --turnstile-token.',
      {
        step: 'status-check',
        details: summarizeStatus(status),
      },
    );
  }
}

async function resolveAuthenticatedUser(client, status, options) {
  if (options.accessToken) {
    const userId = parseInteger(options.userId, '--user-id');
    if (!userId) {
      throw new ClawRouterError(
        'Using --access-token also requires --user-id.',
        {
          step: 'arguments',
        },
      );
    }
    client.setAccessToken(options.accessToken, userId);
    return {
      auth_mode: 'access-token',
      login_user: await fetchSelf(client),
    };
  }

  ensurePasswordAuthInputs(options);
  ensureTurnstileIfRequired(status, options);

  const loginUserData = await loginUser(client, options);
  client.setUserId(loginUserData.id);
  return {
    auth_mode: 'session',
    login_user: loginUserData,
  };
}

async function runStatusCommand(options) {
  const client = new ClawRouterClient(options.baseUrl);
  const status = await fetchStatus(client);
  return {
    success: true,
    command: 'status',
    status: summarizeStatus(status),
    raw_status: status,
  };
}

async function runBootstrapCommand(options) {
  const client = new ClawRouterClient(options.baseUrl);
  const status = await fetchStatus(client);
  const registerMode = options.registerMode || 'if-missing';
  const registerSummary = {
    mode: registerMode,
    attempted: false,
    created: false,
    skipped: false,
    reason: null,
    message: null,
  };

  if (!options.accessToken) {
    ensurePasswordAuthInputs(options);
    ensureTurnstileIfRequired(status, options);

    if (registerMode !== 'never') {
      const registrationNeedsEmail = Boolean(status.email_verification);
      const hasEmailInputs = Boolean(options.email && options.verificationCode);

      if (
        registrationNeedsEmail &&
        !hasEmailInputs &&
        registerMode === 'if-missing'
      ) {
        registerSummary.skipped = true;
        registerSummary.reason = 'email-verification-required';
        registerSummary.message =
          'Registration skipped because this server requires email verification and no email/code was provided.';
      } else {
        registerSummary.attempted = true;
        try {
          await registerUser(client, options);
          registerSummary.created = true;
        } catch (error) {
          if (!(error instanceof ClawRouterError)) {
            throw error;
          }
          if (registerMode === 'always') {
            throw error;
          }
          registerSummary.skipped = true;
          registerSummary.reason = 'register-failed-login-fallback';
          registerSummary.message = error.message;
        }
      }
    }
  } else {
    registerSummary.skipped = true;
    registerSummary.reason = 'access-token-auth';
    registerSummary.message =
      'Registration/login steps were skipped because access-token auth was provided.';
  }

  let authResult;
  try {
    authResult = await resolveAuthenticatedUser(client, status, options);
  } catch (error) {
    if (
      error instanceof ClawRouterError &&
      registerSummary.message &&
      registerSummary.reason === 'register-failed-login-fallback'
    ) {
      throw new ClawRouterError(
        `Registration failed (${registerSummary.message}) and login fallback failed (${error.message}).`,
        {
          step: error.step,
          details: {
            register: registerSummary,
            login: error.details,
          },
        },
      );
    }
    throw error;
  }

  const user = await fetchSelf(client);

  let managementAccessToken = null;
  if (parseBoolean(options.withAccessToken, false)) {
    managementAccessToken = await generateManagementAccessToken(client);
  }

  const tokenPayload = buildTokenPayload(options);
  await createApiToken(client, tokenPayload);
  const apiToken = await searchApiTokenByName(client, tokenPayload.name);

  return {
    success: true,
    command: 'bootstrap',
    status: summarizeStatus(status),
    register: registerSummary,
    auth: {
      mode: authResult.auth_mode,
      user_id: user.id,
    },
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      status: user.status,
      group: user.group,
      email: user.email,
      quota: user.quota,
      used_quota: user.used_quota,
    },
    management_access_token: managementAccessToken,
    api_token: apiToken,
    token_request: tokenPayload,
  };
}

async function runPaymentLinkCommand(options) {
  const client = new ClawRouterClient(options.baseUrl);
  const status = await fetchStatus(client);
  const authResult = await resolveAuthenticatedUser(client, status, options);
  const payment = await createPaymentLink(client, options.provider, options);

  return {
    success: true,
    command: 'payment-link',
    status: summarizeStatus(status),
    auth: {
      mode: authResult.auth_mode,
      user_id: client.userId,
    },
    payment,
  };
}

function printResult(result, outputMode) {
  if (outputMode === 'pretty') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

function parseCli() {
  const parsed = parseArgs({
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: 'boolean', short: 'h' },
      'base-url': { type: 'string' },
      username: { type: 'string' },
      password: { type: 'string' },
      'turnstile-token': { type: 'string' },
      'twofa-code': { type: 'string' },
      'access-token': { type: 'string' },
      'user-id': { type: 'string' },
      'register-mode': { type: 'string' },
      email: { type: 'string' },
      'verification-code': { type: 'string' },
      'aff-code': { type: 'string' },
      'with-access-token': { type: 'string' },
      'token-name': { type: 'string' },
      'token-remain-quota': { type: 'string' },
      'token-unlimited': { type: 'string' },
      'token-expired-time': { type: 'string' },
      'token-group': { type: 'string' },
      'token-model-limits': { type: 'string' },
      'token-allow-ips': { type: 'string' },
      provider: { type: 'string' },
      amount: { type: 'string' },
      'payment-method': { type: 'string' },
      'top-up-code': { type: 'string' },
      'product-id': { type: 'string' },
      output: { type: 'string' },
    },
  });

  return {
    command: parsed.positionals[0],
    help: parsed.values.help || false,
    baseUrl: parsed.values['base-url'],
    username: parsed.values.username,
    password: parsed.values.password,
    turnstileToken: parsed.values['turnstile-token'],
    twofaCode: parsed.values['twofa-code'],
    accessToken: parsed.values['access-token'],
    userId: parsed.values['user-id'],
    registerMode: parsed.values['register-mode'],
    email: parsed.values.email,
    verificationCode: parsed.values['verification-code'],
    affCode: parsed.values['aff-code'],
    withAccessToken: parsed.values['with-access-token'],
    tokenName: parsed.values['token-name'],
    tokenRemainQuota: parsed.values['token-remain-quota'],
    tokenUnlimited: parsed.values['token-unlimited'],
    tokenExpiredTime: parsed.values['token-expired-time'],
    tokenGroup: parsed.values['token-group'],
    tokenModelLimits: parsed.values['token-model-limits'],
    tokenAllowIps: parsed.values['token-allow-ips'],
    provider: parsed.values.provider,
    amount: parsed.values.amount,
    paymentMethod: parsed.values['payment-method'],
    topUpCode: parsed.values['top-up-code'],
    productId: parsed.values['product-id'],
    output: parsed.values.output || 'json',
  };
}

async function main() {
  const options = parseCli();

  if (options.help || !options.command) {
    console.log(HELP_TEXT);
    return;
  }

  let result;
  switch (options.command) {
    case 'status':
      result = await runStatusCommand(options);
      break;
    case 'bootstrap':
      result = await runBootstrapCommand(options);
      break;
    case 'payment-link':
      if (!options.provider) {
        throw new ClawRouterError('payment-link requires --provider', {
          step: 'arguments',
        });
      }
      result = await runPaymentLinkCommand(options);
      break;
    default:
      throw new ClawRouterError(`Unknown command: ${options.command}`, {
        step: 'arguments',
      });
  }

  printResult(result, options.output);
}

main().catch((error) => {
  const normalized =
    error instanceof ClawRouterError
      ? error
      : new ClawRouterError(error?.message || String(error), {
          step: 'runtime',
        });

  const failure = {
    success: false,
    step: normalized.step,
    message: normalized.message,
    details: normalized.details,
  };

  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
