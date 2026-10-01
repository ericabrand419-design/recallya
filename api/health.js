import { json } from './_util.js';
export default async function handler(req, res) {
  json(res, 200, {
    ok: true,
    service: 'recallya',
    version: '3.0.0',
    configured: {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),\n      auth: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
      x: Boolean(process.env.X_USER_ACCESS_TOKEN),
      bluesky: Boolean(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD),
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      feetfinderApprovedAdapter: Boolean(process.env.FEETFINDER_APPROVED_WEBHOOK_URL),
      slushyApprovedAdapter: Boolean(process.env.SLUSHY_APPROVED_WEBHOOK_URL),
      externalTextProvider: Boolean(process.env.EXTERNAL_TEXT_PROVIDER_URL),
      rougeExternalProvider: Boolean(process.env.ROUGE_PROVIDER_URL)
    }
  });
}