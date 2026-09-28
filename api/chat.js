import { json, readJson, hasMinorSignal, isMatureRequest, callExternalTextProvider } from './_util.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, {error:'method_not_allowed'});
  const body = await readJson(req);
  const message = String(body.message || '').trim();
  const ageVerified = body.ageVerified === true;
  if (!message) return json(res, 400, {error:'message_required'});
  if (hasMinorSignal(message)) {
    return json(res, 200, {mode:'blocked', reply:'That request cannot be handled here.', requiresReview:true});
  }
  if (isMatureRequest(message)) {
    if (!ageVerified) {
      return json(res, 200, {mode:'age_gate', reply:'Please confirm that you are 18 or older before continuing.', requiresReview:true});
    }
    return json(res, 200, {
      mode:'approval_required',
      reply:'I can help with orders, availability and account questions. This request has been sent for creator review.',
      requiresReview:true
    });
  }

  const provider = await callExternalTextProvider({message, context:{channel:'website'}});
  if (provider.ok) {
    const data = provider.data || {};
    const reply = data.reply || data.text || data.output || null;
    if (reply) return json(res, 200, {mode:'automated', reply:String(reply), requiresReview:false});
  }

  return json(res, 200, {
    mode:'automated',
    reply:'Thanks for reaching out. I can help with availability, pricing, orders and the best link for what you are looking for. What can I help you with?',
    requiresReview:false
  });
}
