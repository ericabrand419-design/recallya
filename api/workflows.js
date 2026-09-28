import { json, readJson, authorized } from './_util.js';

export default async function handler(req,res){
  if(!authorized(req)) return json(res,401,{error:'unauthorized'});
  if(req.method==='GET') return json(res,200,{ok:true,endpoint:'/api/workflows',supports:['compile_rule','preview_actions']});
  if(req.method!=='POST') return json(res,405,{error:'method_not_allowed'});
  const body=await readJson(req);
  const trigger=String(body.trigger||'').trim();
  const instruction=String(body.instruction||body.action||'').trim();
  if(!trigger||!instruction) return json(res,400,{error:'trigger_and_instruction_required'});
  const actions=instruction.split(/\b(?:then|and then)\b/i).map(x=>x.trim()).filter(Boolean);
  return json(res,200,{compiled:true,workflow:{name:body.name||'New workflow',trigger,actions,status:'draft'},requiresApproval:true});
}
