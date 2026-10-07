// Recallya AI layer: Claude, called server-side only.
//
// Credentials, in order of preference:
//   1. ANTHROPIC_API_KEY            -> Anthropic API directly
//   2. AI_GATEWAY_API_KEY           -> Vercel AI Gateway
//   3. Vercel OIDC token            -> Vercel AI Gateway (automatic on Vercel, no key to manage)
//
// Models can be overridden with RECALLYA_AI_MODEL (smart) and RECALLYA_AI_FAST_MODEL (fast).

import { productionConfigured, parseCookies, authFetch, setSessionCookies } from './_supabase.js';

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/messages';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const MODELS = {
  smart: {
    gateway: ['anthropic/claude-sonnet-5.5', 'anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-4.5'],
    anthropic: ['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-5']
  },
  fast: {
    gateway: ['anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-5.5'],
    anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-5-5']
  }
};

export const HOUSE_STYLE = 'Write in plain, natural sentences. Never use em dashes or en dashes; use periods, commas, colons or parentheses instead. Never invent facts, names, prices, dates or promises that are not in the data you were given.';

export function aiCredential(req) {
  if (process.env.ANTHROPIC_API_KEY) {
    return { via: 'anthropic', url: ANTHROPIC_URL, headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY } };
  }
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || req?.headers?.['x-vercel-oidc-token'];
  if (token) {
    return { via: process.env.AI_GATEWAY_API_KEY ? 'gateway_key' : 'gateway_oidc', url: GATEWAY_URL, headers: { Authorization: `Bearer ${token}` } };
  }
  return null;
}

function modelList(tier, via) {
  const override = tier === 'fast' ? process.env.RECALLYA_AI_FAST_MODEL : process.env.RECALLYA_AI_MODEL;
  const list = MODELS[tier] || MODELS.smart;
  const base = via === 'anthropic' ? list.anthropic : list.gateway;
  return override ? [override, ...base.filter(m => m !== override)] : base;
}

// Returns {ok:true, text, model, via, usage} or {ok:false, reason, status, detail}
export async function claude({ req, tier = 'smart', system = '', user = '', maxTokens = 800, temperature = 0.4, timeoutMs = 45000 }) {
  const cred = aiCredential(req);
  if (!cred) return { ok: false, reason: 'ai_not_configured' };
  let last = null;
  for (const model of modelList(tier, cred.via)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(cred.url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', ...cred.headers },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system: system ? `${system}\n\n${HOUSE_STYLE}` : HOUSE_STYLE,
          messages: [{ role: 'user', content: String(user) }]
        })
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        return { ok: true, text, model, via: cred.via, usage: data.usage || null };
      }
      const message = String(data?.error?.message || data?.message || '');
      last = { ok: false, reason: 'provider_error', status: r.status, detail: message.slice(0, 300), model, via: cred.via };
      // Try the next model only when this one is unknown or unavailable; any other error is final.
      const modelProblem = r.status === 404 || (r.status === 400 && /model/i.test(message));
      if (!modelProblem) return last;
    } catch (e) {
      last = { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : 'network_error', detail: String(e?.message || e).slice(0, 200), model, via: cred.via };
      return last;
    } finally {
      clearTimeout(timer);
    }
  }
  return last || { ok: false, reason: 'no_model_available' };
}

// Pull the first JSON object out of a model reply (tolerates code fences or stray prose).
export function extractJson(text = '') {
  const s = String(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

// Signed-in Recallya user, or null. Never writes an error response, so callers can fall back quietly.
export async function signedInUser(req, res) {
  if (!productionConfigured()) return null;
  const cookies = parseCookies(req);
  if (cookies.recallya_access) {
    const r = await authFetch('/user', { headers: { Authorization: `Bearer ${cookies.recallya_access}` } });
    if (r.ok) return r.json().catch(() => null);
  }
  if (cookies.recallya_refresh) {
    const r = await authFetch('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: cookies.recallya_refresh }) });
    if (r.ok) {
      const session = await r.json().catch(() => null);
      if (session?.access_token) {
        setSessionCookies(res, session);
        return session.user || null;
      }
    }
  }
  return null;
}

// Keep prompts bounded so one request can never send an enormous CRM to the model.
export function clip(value, max = 30000) {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}

// Tiny live check, cached per server instance so repeated hits cost nothing.
let lastCheck = null;
export async function aiLiveCheck(req) {
  const ttl = lastCheck?.result?.ok ? 10 * 60 * 1000 : 60 * 1000;
  if (lastCheck && Date.now() - lastCheck.at < ttl) return { ...lastCheck.result, cached: true };
  const result = await claude({ req, tier: 'fast', system: 'You are a connectivity check.', user: 'Reply with exactly: OK', maxTokens: 5, temperature: 0, timeoutMs: 15000 });
  const summary = result.ok ? { ok: true, model: result.model, via: result.via } : { ok: false, reason: result.reason, status: result.status, detail: result.detail, via: result.via };
  lastCheck = { at: Date.now(), result: summary };
  return summary;
}
