import { json } from './_util.js';

export function productionConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function base() {
  return String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

export function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  return Object.fromEntries(raw.split(';').map(x => x.trim()).filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return i < 0 ? [part, ''] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}

function cookie(name, value, {maxAge}={}) {
  const bits = [`${name}=${encodeURIComponent(value || '')}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (typeof maxAge === 'number') bits.push(`Max-Age=${maxAge}`);
  return bits.join('; ');
}

export function setSessionCookies(res, session={}) {
  const access = session.access_token || '';
  const refresh = session.refresh_token || '';
  const ttl = Number(session.expires_in || 3600);
  res.setHeader('Set-Cookie', [
    cookie('recallya_access', access, {maxAge: ttl}),
    cookie('recallya_refresh', refresh, {maxAge: 60 * 60 * 24 * 30})
  ]);
}

export function clearSessionCookies(res) {
  res.setHeader('Set-Cookie', [
    cookie('recallya_access', '', {maxAge: 0}),
    cookie('recallya_refresh', '', {maxAge: 0})
  ]);
}

export async function authFetch(path, options={}) {
  const anon = process.env.SUPABASE_ANON_KEY;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': anon,
    ...(options.headers || {})
  };
  return fetch(`${base()}/auth/v1${path}`, {...options, headers});
}

export async function serviceRest(path, options={}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    ...(options.headers || {})
  };
  return fetch(`${base()}/rest/v1/${path}`, {...options, headers});
}

async function userFromAccess(access) {
  if (!access) return null;
  const r = await authFetch('/user', {headers:{Authorization:`Bearer ${access}`}});
  if (!r.ok) return null;
  return r.json().catch(()=>null);
}

async function refreshSession(refresh) {
  if (!refresh) return null;
  const r = await authFetch('/token?grant_type=refresh_token', {
    method:'POST',
    body:JSON.stringify({refresh_token:refresh})
  });
  if (!r.ok) return null;
  return r.json().catch(()=>null);
}

export async function requireUser(req, res) {
  if (!productionConfigured()) {
    json(res, 503, {ok:false, error:'production_not_configured', configured:false});
    return null;
  }
  const cookies = parseCookies(req);
  let session = null;
  let user = await userFromAccess(cookies.recallya_access);
  if (!user && cookies.recallya_refresh) {
    session = await refreshSession(cookies.recallya_refresh);
    if (session?.access_token) {
      setSessionCookies(res, session);
      user = session.user || await userFromAccess(session.access_token);
    }
  }
  if (!user) {
    json(res, 401, {ok:false, error:'authentication_required', configured:true});
    return null;
  }
  return {user, session};
}

export async function restJson(path, options={}) {
  const r = await serviceRest(path, options);
  const data = await r.json().catch(()=>null);
  if (!r.ok) {
    const e = new Error('supabase_rest_error');
    e.status = r.status;
    e.detail = data;
    throw e;
  }
  return data;
}

export async function userWorkspaceMembership(userId, workspaceId) {
  const rows = await restJson(`workspace_members?user_id=eq.${encodeURIComponent(userId)}&workspace_id=eq.${encodeURIComponent(workspaceId)}&select=workspace_id,role,can_view_portfolio&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}
