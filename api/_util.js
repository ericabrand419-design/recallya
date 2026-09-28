export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}

export function authorized(req) {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) return true;
  const header = req.headers?.authorization || '';
  return header === `Bearer ${configured}`;
}

export function isMatureRequest(text='') {
  const t = text.toLowerCase();
  const signals = ['explicit', 'nude', 'nudes', 'sext', 'dirty talk', 'sexual', 'fetish', 'nsfw'];
  return signals.some(s => t.includes(s));
}

export function hasMinorSignal(text='') {
  const t = text.toLowerCase();
  const signals = ['minor', 'underage', 'under 18', '17 year', '16 year', '15 year', '14 year', '13 year'];
  return signals.some(s => t.includes(s));
}

export async function callExternalTextProvider({message, context={}, mode='business_assistant'}) {
  const url = process.env.EXTERNAL_TEXT_PROVIDER_URL;
  const key = process.env.EXTERNAL_TEXT_PROVIDER_KEY;
  if (!url) return { ok:false, reason:'provider_not_configured' };
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      ...(key ? {'Authorization':`Bearer ${key}`} : {})
    },
    body: JSON.stringify({
      model: process.env.EXTERNAL_TEXT_PROVIDER_MODEL || undefined,
      message,
      context,
      mode
    })
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) return {ok:false, reason:'provider_error', status:r.status, data};
  return {ok:true, data};
}
