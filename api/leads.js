import { json, readJson } from './_util.js';

function cors(req, res) {
  const allowed = process.env.LEAD_ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Recallya-Key');
  res.setHeader('Vary', 'Origin');
}

function initials(name='') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase()).join('') || 'L';
}

function normalize(body={}) {
  const name = String(body.name || body.full_name || [body.first_name, body.last_name].filter(Boolean).join(' ') || '').trim();
  const email = String(body.email || '').trim();
  const company = String(body.company || body.organization || 'Independent').trim();
  const source = String(body.source || 'Website form').trim();
  const context = String(body.context || body.message || body.notes || '').trim();
  const role = String(body.role || body.title || 'Prospect').trim();
  const value = Number(body.value || body.estimated_value || 0) || 0;
  const nextAction = String(body.next_action || 'Send personalized introduction').trim();
  const workspaceSlug = String(body.workspace_slug || body.workspace || '').trim();
  return {
    name, email, company, source, context, role, value, nextAction, workspaceSlug,
    initials: initials(name),
    status: 'New lead',
    stage: 'New lead',
    intent: 'lead',
    captured_at: new Date().toISOString()
  };
}

async function persistToSupabase(lead) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { persisted:false, mode:'demo' };
  let workspaceId = null;
  if (lead.workspaceSlug) {
    const wr = await fetch(`${url.replace(/\/$/,'')}/rest/v1/workspaces?slug=eq.${encodeURIComponent(lead.workspaceSlug)}&select=id&limit=1`, {headers:{'apikey':key,'Authorization':`Bearer ${key}`}});
    const rows = await wr.json().catch(()=>[]);
    workspaceId = Array.isArray(rows) ? rows[0]?.id || null : null;
  }
  const payload = {
    display_name: lead.name,
    email: lead.email || null,
    role_title: lead.role || null,
    relationship_summary: lead.context || `New lead captured from ${lead.source}.`,
    memory: [`Lead entered Recallya from ${lead.source}.`, ...(lead.context ? [lead.context] : [])],
    lead_source: lead.source,
    lead_status: 'new',
    captured_at: lead.captured_at,
    ...(workspaceId ? {workspace_id: workspaceId} : {})
  };
  const r = await fetch(`${url.replace(/\/$/,'')}/rest/v1/customers?select=id,display_name,email,lead_source,lead_status,captured_at`, {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'apikey':key,
      'Authorization':`Bearer ${key}`,
      'Prefer':'return=representation'
    },
    body:JSON.stringify(payload)
  });
  const data = await r.json().catch(()=>null);
  if (!r.ok) return { persisted:false, mode:'database_error', status:r.status, detail:data };
  return { persisted:true, mode:'database', record:Array.isArray(data) ? data[0] : data };
}

export default async function handler(req,res){
  cors(req,res);
  if (req.method === 'OPTIONS') { res.statusCode=204; res.end(); return; }
  if (req.method === 'GET') return json(res,200,{ok:true,endpoint:'/api/leads',accepts:['name','email','company','role','source','context','value','next_action','workspace_slug'],persistence:process.env.SUPABASE_URL?'supabase':'demo'});
  if (req.method !== 'POST') return json(res,405,{error:'method_not_allowed'});

  const expected = process.env.LEAD_WEBHOOK_TOKEN;
  if (expected && req.headers?.['x-recallya-key'] !== expected) return json(res,401,{error:'invalid_lead_key'});

  const body = await readJson(req);
  if (req.query?.workspace_slug && !body.workspace_slug) body.workspace_slug = req.query.workspace_slug;
  const lead = normalize(body);
  if (!lead.name) return json(res,400,{error:'name_required'});
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return json(res,400,{error:'invalid_email'});
  const persistence = await persistToSupabase(lead);
  return json(res,201,{accepted:true,lead,persistence,first_action:{type:'follow_up',title:lead.nextAction,reason:`Lead captured from ${lead.source}.`}});
}
