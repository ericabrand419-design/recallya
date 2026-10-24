import { json } from './_util.js';
import { productionConfigured, restJson } from './_supabase.js';
import { runAgent, saveRun, loadWorkspace } from './_agent.js';

// Runs once a day (see vercel.json "crons"). Each workspace's agent runs at most once per 20 hours,
// so calling this endpoint again does no extra work.
const MAX_PER_RUN = 6;
const MIN_GAP_MS = 20 * 60 * 60 * 1000;

function fromVercelCron(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers?.authorization === `Bearer ${secret}`;
  return Boolean(req.headers?.['x-vercel-cron']) || /vercel-cron/i.test(String(req.headers?.['user-agent'] || ''));
}

export default async function handler(req, res) {
  if (!fromVercelCron(req)) return json(res, 401, { ok: false, error: 'unauthorized' });
  if (!productionConfigured()) return json(res, 200, { ok: true, agentsRun: 0, note: 'production_not_configured' });
  const since = new Date(Date.now() - MIN_GAP_MS).toISOString();
  const states = await restJson('workspace_app_state?select=workspace_id&order=updated_at.desc&limit=200');
  const recent = await restJson(`smart_notifications?type=eq.agent:briefing&created_at=gte.${encodeURIComponent(since)}&select=workspace_id`);
  const done = new Set((recent || []).map(r => r.workspace_id));
  const due = (states || []).map(s => s.workspace_id).filter(id => !done.has(id)).slice(0, MAX_PER_RUN);
  const results = [];
  for (const workspaceId of due) {
    try {
      const { workspace, state } = await loadWorkspace(workspaceId);
      if (!(state.people || []).length) { results.push({ workspaceId, skipped: 'no_people' }); continue; }
      const result = await runAgent({ req, workspace, state });
      await saveRun(workspaceId, result);
      results.push({ workspaceId, items: result.items.length, model: result.model });
    } catch (e) {
      results.push({ workspaceId, error: e.detail || e.message });
    }
  }
  json(res, 200, { ok: true, checkedAt: new Date().toISOString(), agentsRun: results.filter(r => r.items !== undefined).length, results });
}
