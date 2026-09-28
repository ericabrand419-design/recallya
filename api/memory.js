import { json, readJson, authorized } from './_util.js';

export default async function handler(req,res){
  if(!authorized(req)) return json(res,401,{error:'unauthorized'});
  if(req.method!=='POST') return json(res,405,{error:'method_not_allowed'});
  const body=await readJson(req);
  const action=body.action||'explain';
  const evidence=Array.isArray(body.evidence)?body.evidence:[];
  if(action==='explain'){
    return json(res,200,{
      recommendation: body.recommendation||'',
      reason: body.reason||'',
      evidence: evidence.map(e=>({text:e.text||'',source:e.source||'unknown',sourceDetail:e.sourceDetail||'',confidence:e.confidence||'recorded'})),
      policy:'Recallya should distinguish recorded evidence from inference and keep the human able to correct memory.'
    });
  }
  if(action==='correct'){
    if(!body.memory_id||!String(body.text||'').trim()) return json(res,400,{error:'memory_id_and_text_required'});
    return json(res,200,{updated:true,memory:{id:body.memory_id,text:String(body.text).trim(),source:'human_correction',confidence:'verified',verified:true},audit:{type:'memory_corrected',at:new Date().toISOString()}});
  }
  return json(res,400,{error:'unsupported_action'});
}