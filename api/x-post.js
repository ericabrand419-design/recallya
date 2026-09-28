import { json, readJson, authorized } from './_util.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, {error:'method_not_allowed'});
  if (!authorized(req)) return json(res, 401, {error:'unauthorized'});
  const token = process.env.X_USER_ACCESS_TOKEN;
  if (!token) return json(res, 409, {error:'x_not_configured'});
  const body = await readJson(req);
  const text = String(body.text || '').trim();
  if (!text) return json(res, 400, {error:'text_required'});
  const r = await fetch('https://api.x.com/2/tweets', {
    method:'POST',
    headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({text})
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) return json(res, r.status, {error:'x_error', data});
  return json(res, 200, {ok:true, data});
}