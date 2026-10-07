import { json } from './_util.js';
import { aiCredential, aiLiveCheck } from './_ai.js';
export default async function handler(req, res) {
  const cred = aiCredential(req);
  // ?ai=1 runs a tiny live Claude call (cached for 10 minutes per server instance).
  const aiCheck = req.query?.ai === '1' && cred ? await aiLiveCheck(req) : undefined;
  json(res, 200, {
    ok: true,
    service: 'recallya',
    version: '3.1.0',
    configured: {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      auth: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
      ai: Boolean(cred),
      aiVia: cred?.via || null,
      x: Boolean(process.env.X_USER_ACCESS_TOKEN),
      bluesky: Boolean(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD),
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      feetfinderApprovedAdapter: Boolean(process.env.FEETFINDER_APPROVED_WEBHOOK_URL),
      slushyApprovedAdapter: Boolean(process.env.SLUSHY_APPROVED_WEBHOOK_URL),
      externalTextProvider: Boolean(process.env.EXTERNAL_TEXT_PROVIDER_URL),
      rogueExternalProvider: Boolean(process.env.ROGUE_PROVIDER_URL)
    },
    ...(aiCheck ? { aiCheck } : {})
  });
}
