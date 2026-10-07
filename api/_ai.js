// Recallya AI layer, called server-side only.
//
// Providers are tried in this order until one answers:
//   1. ANTHROPIC_API_KEY                         -> Claude via the Anthropic API
//   2. GEMINI_API_KEY (or GOOGLE_API_KEY)        -> Gemini via Google AI Studio (free tier, no card)
//   3. AI_GATEWAY_API_KEY or Vercel OIDC token   -> Claude via Vercel AI Gateway
// So an Anthropic account with no balance falls through to Gemini automatically.
//
// Models can be overridden with RECALLYA_AI_MODEL (smart) and RECALLYA_AI_FAST_MODEL (fast).

import { productionConfigured, parseCookies, authFetch, setSessionCookies } from './_supabase.js';

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/messages';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const MODELS = {
  smart: {
    anthropic: ['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-5'],
    gemini: ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-2.5-flash'],
    gateway: ['anthropic/claude-sonnet-5.5', 'anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-4.5']
  },
  fast: {
    anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-5-5'],
    gemini: ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'],
    gateway: ['anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-5.5']
  }
};

export const HOUSE_STYLE = 'Write in plain, natural sentences. Never use em dashes or en dashes; use periods, commas, colons or parentheses instead. Never invent facts, names, prices, dates or promises that are not in the data you were given.';

export function aiProviders(req) {
  const list = [];
  if (process.env.ANTHROPIC_API_KEY) {
    list.push({ via: 'anthropic', kind: 'anthropic', url: ANTHROPIC_URL, headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY } });
  }
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    list.push({ via: 'gemini', kind: 'gemini', headers: { 'x-goog-api-key': geminiKey } });
  }
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || req?.headers?.['x-vercel-oidc-token'];
  if (token) {
    list.push({ via: process.env.AI_GATEWAY_API_KEY ? 'gateway_key' : 'gateway_oidc', kind: 'anthropic', url: GATEWAY_URL, headers: { Authorization: `Bearer ${token}` } });
  }
  return list;
}

// First configured provider (used by the health check).
export function aiCredential(req) {
  return aiProviders(req)[0] || null;
}

function modelList(tier, via) {
  const override = tier === 'fast' ? process.env.RECALLYA_AI_FAST_MODEL : process.env.RECALLYA_AI_MODEL;
  const list = MODELS[tier] || MODELS.smart;
  const base = via === 'anthropic' ? list.anthropic : via === 'gemini' ? list.gemini : list.gateway;
  const fits = override && (via === 'gemini' ? /^gemini/.test(override) : via === 'anthropic' ? /^claude/.test(override) : override.includes('/'));
  return fits ? [override, ...base.filter(m => m !== override)] : base;
}

function buildRequest(provider, model, { system, user, maxTokens, temperature }) {
  const fullSystem = system ? `${system}\n\n${HOUSE_STYLE}` : HOUSE_STYLE;
  if (provider.kind === 'gemini') {
    return {
      url: `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`,
      headers: { 'Content-Type': 'application/json', ...provider.headers },
      body: {
        systemInstruction: { parts: [{ text: fullSystem }] },
        contents: [{ role: 'user', parts: [{ text: String(user) }] }],
        // Newer Gemini models spend part of the output budget on internal thinking, so leave headroom.
        generationConfig: { maxOutputTokens: maxTokens + 4096, temperature }
      }
    };
  }
  return {
    url: provider.url,
    headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', ...provider.headers },
    body: { model, max_tokens: maxTokens, temperature, system: fullSystem, messages: [{ role: 'user', content: String(user) }] }
  };
}

function readText(provider, data) {
  if (provider.kind === 'gemini') {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('\n').trim();
  }
  return (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

// Returns {ok:true, text, model, via, usage} or {ok:false, reason, status, detail}
export async function claude({ req, tier = 'smart', system = '', user = '', maxTokens = 800, temperature = 0.4, timeoutMs = 45000 }) {
  const providers = aiProviders(req);
  if (!providers.length) return { ok: false, reason: 'ai_not_configured' };
  let last = null;
  for (const provider of providers) {
    for (const model of modelList(tier, provider.via)) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let modelProblem = false;
      try {
        const reqSpec = buildRequest(provider, model, { system, user, maxTokens, temperature });
        const r = await fetch(reqSpec.url, { method: 'POST', signal: ctrl.signal, headers: reqSpec.headers, body: JSON.stringify(reqSpec.body) });
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          const text = readText(provider, data);
          if (text) return { ok: true, text, model, via: provider.via, usage: data.usage || data.usageMetadata || null };
          last = { ok: false, reason: 'empty_reply', status: r.status, model, via: provider.via, detail: String(data?.candidates?.[0]?.finishReason || '').slice(0, 80) };
        } else {
          const message = String(data?.error?.message || data?.message || '');
          last = { ok: false, reason: 'provider_error', status: r.status, detail: message.slice(0, 300), model, via: provider.via };
          // Unknown or unavailable model: try this provider's next model. Anything else: move to the next provider.
          modelProblem = r.status === 404 || (r.status === 400 && /model/i.test(message) && !/credit|billing|balance/i.test(message));
        }
      } catch (e) {
        last = { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : 'network_error', detail: String(e?.message || e).slice(0, 200), model, via: provider.via };
      } finally {
        clearTimeout(timer);
      }
      if (!modelProblem) break;
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
