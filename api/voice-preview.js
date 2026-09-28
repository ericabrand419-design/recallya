import { json, readJson, callExternalTextProvider, hasMinorSignal } from './_util.js';

function fallback({message='', voice={}, context={}, goal=''}) {
  const name = voice.name || 'Recallya Voice';
  const avoid = Array.isArray(voice.avoid) ? voice.avoid : [];
  let text = String(message || '').trim();
  if (!text) text = context?.person?.nextAction || 'Move the relationship to one clear next step.';
  const p = context?.person;
  if (p?.nextWhy) text += ` ${p.nextWhy}`;
  if (goal && !/support/i.test(voice.use || '')) text += ` Next goal: ${goal}.`;
  avoid.forEach(word => { if (word) text = text.replaceAll(word, ''); });
  return { text:text.replace(/\s+/g,' ').trim(), voice:name, source:'recallya_demo_voice' };
}

export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:'method_not_allowed'});
  const body=await readJson(req);
  const message=String(body.message||'');
  if(hasMinorSignal(message)) return json(res,400,{error:'minor_related_mature_content_blocked'});
  if(body.surface==='rouge') {
    return json(res,200,{ok:false,requires_external_provider:true,reason:'rouge_generation_is_external',note:'Core supplies memory, voice settings, boundaries and approval controls. Configure an approved external adult-capable provider for mature dialogue.'});
  }
  const provider=await callExternalTextProvider({message,context:{surface:'voice-preview',voice:body.voice||{},goal:body.goal||'',person:body.person||null},mode:'business_voice'});
  if(provider.ok){
    const d=provider.data||{}; const text=d.answer||d.reply||d.text||d.output;
    if(text) return json(res,200,{ok:true,text:String(text),source:'provider'});
  }
  return json(res,200,{ok:true,...fallback(body)});
}