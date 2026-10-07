import { json, readJson, hasMinorSignal } from './_util.js';
import { claude, signedInUser, clip } from './_ai.js';

function fallback({message='', voice={}, context={}, goal=''}) {
  const name = voice.name || 'Recallya Voice';
  const avoid = Array.isArray(voice.avoid) ? voice.avoid : [];
  let text = String(message || '').trim();
  if (!text) text = context?.person?.nextAction || 'Move the relationship to one clear next step.';
  const p = context?.person;
  if (p?.nextWhy) text += ` ${p.nextWhy}`;
  if (goal && !/support/i.test(voice.use || '')) text += ` Next goal: ${goal}.`;
  avoid.forEach(word => { if (word) text = text.replaceAll(word, ''); });
  return { text:text.replace(/\s+/g,' ').trim(), voice:name, source:'recallya_rules' };
}

function voiceBrief(v = {}) {
  const lines = [
    `Voice name: ${v.name || 'Default'}`,
    v.use ? `Used for: ${v.use}` : '',
    `Directness ${Number(v.directness ?? 70)}/100, warmth ${Number(v.warmth ?? 70)}/100, formality ${Number(v.formality ?? 50)}/100, sales energy ${Number(v.sales ?? 60)}/100.`,
    v.description ? `How it sounds: ${v.description}` : '',
    Array.isArray(v.samples) && v.samples.length ? `Examples that sound right:\n- ${v.samples.slice(0, 8).join('\n- ')}` : '',
    Array.isArray(v.avoid) && v.avoid.length ? `Never use these phrases: ${v.avoid.join(', ')}` : '',
    v.cta ? `Call to action style: ${v.cta}` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:'method_not_allowed'});
  const body=await readJson(req);
  const message=String(body.message||'').slice(0,4000);
  const thread=Array.isArray(body.conversation?.messages)?body.conversation.messages.slice(-14):[];
  const threadText=thread.map(m=>String(m?.text||'')).join(' ');
  if(hasMinorSignal(message)||hasMinorSignal(threadText)) return json(res,400,{error:'minor_related_mature_content_blocked'});
  if(body.surface==='rouge') {
    return json(res,200,{ok:false,requires_external_provider:true,reason:'rouge_generation_is_external',note:'Core supplies memory, voice settings, boundaries and approval controls. Configure an approved external adult-capable provider for mature dialogue.'});
  }

  // AI drafting is for signed-in accounts only; the public demo keeps the rules-based drafts.
  const user=await signedInUser(req,res);
  if(user){
    const p=body.person||{};
    const w=body.workspace||{};
    const voice=body.voice||{};
    const system=[
      `You draft the next outgoing message from the business "${String(w.name||'the business').slice(0,120)}" to a customer or lead, for a human to review before sending.`,
      'Match the voice settings exactly. Reply to what the person most recently said, use what Recallya knows about them, and move the relationship one concrete step forward.',
      'Output only the message body: no subject line, no sign-off name, no placeholders in brackets, no commentary.',
      'Keep it short enough to read on a phone (usually 2 to 5 sentences) unless the thread clearly calls for more.'
    ].join(' ');
    const userPrompt=[
      `VOICE:\n${voiceBrief(voice)}`,
      `PERSON:\n${clip({name:p.name,company:p.company,role:p.role,stage:p.stage,summary:p.summary,preferences:p.preferences,objections:p.objections,promises:p.promises,memory:Array.isArray(p.memory)?p.memory.slice(-12):p.memory,nextAction:p.nextAction,nextWhy:p.nextWhy},8000)}`,
      thread.length?`CONVERSATION (oldest first; "in" = from them, "out" = from us):\n${thread.map(m=>`[${m?.d==='out'?'out':'in'}] ${String(m?.text||'').slice(0,1500)}`).join('\n')}`:'CONVERSATION: none yet. Write a natural opening message.',
      body.withOffer?`Include one natural, relevant next step or offer. Business products and pricing: ${clip(w.products||[],3000)}. Business goal: ${String(w.goal||'').slice(0,300)}. Do not be pushy and do not invent prices.`:'Do not add a sales pitch unless the person asked for it.',
      message?`The owner's own direction for this draft: ${message}`:''
    ].filter(Boolean).join('\n\n');
    const ai=await claude({req,tier:'smart',system,user:userPrompt,maxTokens:500,temperature:0.6});
    if(ai.ok&&ai.text) return json(res,200,{ok:true,text:ai.text,source:'claude',model:ai.model});
  }
  return json(res,200,{ok:true,...fallback({message,voice:body.voice||{},context:{person:body.person||null},goal:body.goal||''})});
}
