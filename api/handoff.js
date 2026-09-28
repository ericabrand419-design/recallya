import { json, readJson, authorized } from './_util.js';

export default async function handler(req,res){
  if(!authorized(req)) return json(res,401,{error:'unauthorized'});
  if(req.method!=='POST') return json(res,405,{error:'method_not_allowed'});
  const body=await readJson(req);
  if(!body.customer_id||!body.owner_member_id) return json(res,400,{error:'customer_id_and_owner_member_id_required'});
  return json(res,200,{assigned:true,customer_id:body.customer_id,owner_member_id:body.owner_member_id,reason:body.reason||'',at:new Date().toISOString(),audit_event:'relationship_handoff'});
}
