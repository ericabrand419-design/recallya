// Recallya account agent: reviews one workspace's relationships, writes a short briefing and a queue of
// follow-up drafts. It never sends anything; every draft waits for the owner's approval.
//
// Storage: the existing smart_notifications table (server-only, RLS on), so agent output never collides with
// the browser's autosave of the workspace state.
//   briefing row: id = <runId>,            type = 'agent:briefing', title = briefing,  detail = JSON {model, via, error}
//   item rows:    id = <runId>:<n>,         type = 'agent:item',     title = reason,    detail = JSON {personName, conversationId, draft, kind}
//                 priority = high|medium|low, customer_id = personId, action = pending|done|dismissed

import { claude, extractJson, clip } from './_ai.js';
import { restJson } from './_supabase.js';

const MAX_ITEMS = 5;
const ACTIONS = ['reply', 'keep_promise', 'follow_up', 're_engage'];
const PRIORITIES = ['high', 'medium', 'low'];

function contactable(p = {}) {
  const consent = p.consent || {};
  if (consent.doNotContact) return false;
  if (/do not contact/i.test(`${p.stage || ''} ${p.status || ''}`)) return false;
  return p.activeInRecallya !== false;
}

export function snapshot(state = {}) {
  const people = (Array.isArray(state.people) ? state.people : []).filter(contactable).slice(0, 120);
  const ids = new Set(people.map(p => p.id));
  const convo = {};
  for (const c of Array.isArray(state.conversations) ? state.conversations : []) {
    if (!ids.has(c.personId) || convo[c.personId]) continue;
    const msgs = Array.isArray(c.messages) ? c.messages : [];
    const last = msgs[msgs.length - 1];
    convo[c.personId] = {
      conversationId: c.id,
      waitingOnUs: Boolean(c.needsMe) || last?.d === 'in',
      recent: msgs.slice(-4).map(m => `${m.d === 'in' ? 'them' : 'us'} (${m.time || 'earlier'}): ${String(m.text || '').slice(0, 240)}`)
    };
  }
  return {
    people: people.map(p => ({
      id: p.id, name: p.name, company: p.company, stage: p.stage, value: p.value, lastContact: p.lastContact,
      summary: String(p.summary || '').slice(0, 400), nextAction: p.nextAction,
      promisesWeMade: (p.promises || []).slice(0, 5), objections: (p.objections || []).slice(0, 4),
      preferredVoice: p.preferredVoice || 'sales', conversation: convo[p.id] || null
    })),
    promises: (state.promises || []).slice(0, 30),
    agenda: (state.agenda || []).slice(0, 30)
  };
}

function voices(state = {}) {
  return (state.voiceProfiles || []).filter(v => !v.locked).map(v => ({
    id: v.id, name: v.name, description: v.description, examples: (v.samples || []).slice(0, 4), neverSay: v.avoid || [], cta: v.cta,
    directness: v.directness, warmth: v.warmth, formality: v.formality
  }));
}

// Rules-only fallback when no AI is available: unanswered messages first, then open promises.
function rulesItems(snap) {
  const items = [];
  for (const p of snap.people) {
    if (p.conversation?.waitingOnUs) items.push({ personId: p.id, action: 'reply', priority: 'high', reason: `${p.name} is waiting on a reply.`, draft: '' });
  }
  for (const p of snap.people) {
    if (items.length >= MAX_ITEMS) break;
    if (p.promisesWeMade.length && !items.some(i => i.personId === p.id)) items.push({ personId: p.id, action: 'keep_promise', priority: 'medium', reason: `You promised ${p.name}: ${p.promisesWeMade[0]}`, draft: '' });
  }
  return items.slice(0, MAX_ITEMS);
}

export async function runAgent({ req, workspace = {}, state = {}, now = new Date() }) {
  const snap = snapshot(state);
  if (!snap.people.length) {
    return { briefing: 'No relationships to watch yet. Add or import your first contacts and I will start reviewing them every morning.', items: [], model: null, via: null };
  }
  const system = [
    `You are the Recallya agent for the business "${String(workspace.name || 'this business').slice(0, 120)}". Every morning you review its customer relationships and decide what the owner should do today.`,
    'You never send anything. Every draft you write waits for the owner to approve, edit or dismiss it.',
    `Pick at most ${MAX_ITEMS} relationships, most valuable first: people waiting on a reply from us, promises the owner made that are still open, valuable deals with no recent movement, and warm leads going quiet. Leave out anyone without a clear reason.`,
    'For each, give a one-sentence reason grounded only in the data, and a ready-to-send message (2 to 5 sentences) written in that person\'s preferred voice. Do not invent prices, dates, meetings or facts.',
    'Also write a 2 to 3 sentence briefing for the owner that says what matters today.',
    `Respond with only JSON: {"briefing":"...","items":[{"personId":"...","action":"${ACTIONS.join('|')}","priority":"${PRIORITIES.join('|')}","reason":"...","draft":"..."}]}`
  ].join(' ');
  const user = [
    `TODAY: ${now.toDateString()}`,
    `VOICES:\n${clip(voices(state), 6000)}`,
    `RELATIONSHIPS:\n${clip(snap, 45000)}`
  ].join('\n\n');
  const ai = await claude({ req, tier: 'smart', system, user, maxTokens: 2200, temperature: 0.3, timeoutMs: 40000 });
  const parsed = ai.ok ? extractJson(ai.text) : null;
  const byId = new Map(snap.people.map(p => [String(p.id), p]));
  const fromAI = Array.isArray(parsed?.items) ? parsed.items : null;
  const raw = fromAI || rulesItems(snap);
  const seen = new Set();
  const items = [];
  for (const x of raw) {
    const p = byId.get(String(x?.personId));
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    items.push({
      personId: String(p.id), personName: String(p.name || 'Contact'), conversationId: p.conversation?.conversationId || null,
      kind: ACTIONS.includes(x.action) ? x.action : 'follow_up',
      priority: PRIORITIES.includes(x.priority) ? x.priority : 'medium',
      reason: String(x.reason || '').slice(0, 400),
      draft: String(x.draft || '').slice(0, 2000)
    });
    if (items.length >= MAX_ITEMS) break;
  }
  const briefing = fromAI && typeof parsed.briefing === 'string' && parsed.briefing.trim()
    ? parsed.briefing.trim().slice(0, 800)
    : (items.length ? `${items.length} relationship${items.length === 1 ? ' needs' : 's need'} you today.` : 'Nothing urgent today. Your relationships are up to date.');
  return { briefing, items, model: fromAI ? ai.model : null, via: fromAI ? ai.via : null, error: fromAI ? null : (ai.reason || 'unparsed_reply') };
}

export async function saveRun(workspaceId, result, now = new Date()) {
  const runId = `agent-${workspaceId}-${now.getTime()}`;
  const rows = [{
    id: runId, workspace_id: String(workspaceId), customer_id: null, priority: 'info', type: 'agent:briefing',
    title: result.briefing, detail: JSON.stringify({ model: result.model, via: result.via, error: result.error || null }), action: 'shown', created_at: now.toISOString()
  }, ...result.items.map((it, i) => ({
    id: `${runId}:${i}`, workspace_id: String(workspaceId), customer_id: it.personId, priority: it.priority, type: 'agent:item',
    title: it.reason, detail: JSON.stringify({ personName: it.personName, conversationId: it.conversationId, draft: it.draft, kind: it.kind }), action: 'pending', created_at: now.toISOString()
  }))];
  await restJson('smart_notifications', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
  return runId;
}

export async function latestRun(workspaceId) {
  const runs = await restJson(`smart_notifications?workspace_id=eq.${encodeURIComponent(workspaceId)}&type=eq.agent:briefing&select=id,title,detail,created_at&order=created_at.desc&limit=1`);
  const run = runs?.[0];
  if (!run) return null;
  const items = await restJson(`smart_notifications?id=like.${encodeURIComponent(run.id)}:*&type=eq.agent:item&select=id,customer_id,priority,title,detail,action,created_at&order=id.asc`);
  const meta = safeJson(run.detail);
  return {
    runId: run.id, runAt: run.created_at, briefing: run.title, model: meta.model || null, error: meta.error || null,
    items: (items || []).map(r => {
      const d = safeJson(r.detail);
      return { id: r.id, personId: r.customer_id, personName: d.personName || 'Contact', conversationId: d.conversationId || null, kind: d.kind || 'follow_up', priority: r.priority, reason: r.title, draft: d.draft || '', status: r.action || 'pending' };
    })
  };
}

export async function setItemStatus(workspaceId, itemId, status) {
  await restJson(`smart_notifications?id=eq.${encodeURIComponent(itemId)}&workspace_id=eq.${encodeURIComponent(workspaceId)}&type=eq.agent:item`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ action: status, dismissed_at: status === 'pending' ? null : new Date().toISOString() })
  });
}

export async function loadWorkspace(workspaceId) {
  const [w] = await restJson(`workspaces?id=eq.${encodeURIComponent(workspaceId)}&select=id,name,category,primary_goal&limit=1`) || [];
  const [s] = await restJson(`workspace_app_state?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=state&limit=1`) || [];
  return { workspace: w || { id: workspaceId }, state: s?.state || {} };
}

function safeJson(t) { try { return JSON.parse(t || '{}') || {}; } catch { return {}; } }
