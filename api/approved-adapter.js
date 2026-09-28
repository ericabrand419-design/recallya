import { json, readJson, authorized } from './_util.js';

const configs = {
  feetfinder: ['FEETFINDER_APPROVED_WEBHOOK_URL','FEETFINDER_APPROVED_WEBHOOK_SECRET'],
  slushy: ['SLUSHY_APPROVED_WEBHOOK_URL','SLUSHY_APPROVED_WEBHOOK_SECRET']
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, {error:'method_not_allowed'});
  if (!authorized(req)) return json(res, 401, {error:'unauthorized'});
  const body = await readJson(req);
  const platform = String(body.platform || '').toLowerCase();
  const cfg = configs[platform];
  if (!cfg) return json(res, 400, {error:'unsupported_platform'});
  const url = process.env[cfg[0]];
  const secret = process.env[cfg[1]];
  if (!url) return json(res, 409, {error:'approved_adapter_not_configured', platform});
  const r = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json', ...(secret?{'Authorization':`Bearer ${secret}`}:{})},
    body:JSON.stringify(body.payload || {})
  });
  const data = await r.json().catch(()=>({}));
  return json(res, r.ok ? 200 : r.status, {ok:r.ok, platform, data});
}
