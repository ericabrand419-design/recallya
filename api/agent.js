import { json, readJson } from './_util.js';
import { requireUser, userWorkspaceMembership } from './_supabase.js';
import { runAgent, saveRun, latestRun, setItemStatus, loadWorkspace } from './_agent.js';

const RUN_COOLDOWN_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  const session = await requireUser(req, res); if (!session) return;
  const body = req.method === 'POST' ? await readJson(req) : {};
  const workspaceId = String(req.query?.workspaceId || body.workspaceId || '');
  if (!workspaceId) return json(res, 400, { ok: false, error: 'workspace_required' });
  const membership = await userWorkspaceMembership(session.user.id, workspaceId).catch(() => null);
  if (!membership) return json(res, 403, { ok: false, error: 'forbidden' });

  try {
    if (req.method === 'GET') return json(res, 200, { ok: true, run: await latestRun(workspaceId) });
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

    if (body.action === 'run') {
      const last = await latestRun(workspaceId);
      if (last && Date.now() - new Date(last.runAt).getTime() < RUN_COOLDOWN_MS) {
        return json(res, 429, { ok: false, error: 'ran_recently', run: last, retryInMinutes: Math.ceil((RUN_COOLDOWN_MS - (Date.now() - new Date(last.runAt).getTime())) / 60000) });
      }
      const { workspace, state } = await loadWorkspace(workspaceId);
      const result = await runAgent({ req, workspace, state });
      await saveRun(workspaceId, result);
      return json(res, 200, { ok: true, run: await latestRun(workspaceId) });
    }

    if (body.action === 'item') {
      const status = String(body.status || '');
      if (!['pending', 'done', 'dismissed'].includes(status)) return json(res, 400, { ok: false, error: 'bad_status' });
      await setItemStatus(workspaceId, String(body.itemId || ''), status);
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { ok: false, error: 'unknown_action' });
  } catch (e) {
    return json(res, 500, { ok: false, error: 'agent_failed', detail: e.detail || e.message });
  }
}
