import { json, readJson } from './_util.js';
import { requireUser, restJson, userWorkspaceMembership } from './_supabase.js';

function safeMeta(meta={}) {
  return {
    name:String(meta.name||'').trim().slice(0,120),
    type:String(meta.type||'business').trim().slice(0,40),
    category:String(meta.category||'').trim().slice(0,120),
    website:String(meta.website||'').trim().slice(0,300),
    goal:String(meta.goal||'').trim().slice(0,500)
  };
}

export default async function handler(req,res){
  const session=await requireUser(req,res);if(!session)return;
  const {user}=session;
  if(req.method==='GET'){
    const workspaceId=String(req.query?.workspaceId||'');
    if(!workspaceId)return json(res,400,{ok:false,error:'workspace_required'});
    const membership=await userWorkspaceMembership(user.id,workspaceId);if(!membership)return json(res,403,{ok:false,error:'forbidden'});
    try{
      const rows=await restJson(`workspace_app_state?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=state,revision,updated_at&limit=1`);
      return json(res,200,{ok:true,workspaceId,state:rows?.[0]?.state||{},revision:rows?.[0]?.revision||0,updatedAt:rows?.[0]?.updated_at||null});
    }catch(e){return json(res,500,{ok:false,error:'load_failed',detail:e.detail||e.message})}
  }
  if(req.method!=='PUT')return json(res,405,{ok:false,error:'method_not_allowed'});
  const body=await readJson(req);
  const workspaceId=String(body.workspaceId||'');
  if(!workspaceId||!body.state||typeof body.state!=='object')return json(res,400,{ok:false,error:'workspace_and_state_required'});
  const membership=await userWorkspaceMembership(user.id,workspaceId);if(!membership)return json(res,403,{ok:false,error:'forbidden'});
  const serialized=JSON.stringify(body.state);
  if(serialized.length>2_500_000)return json(res,413,{ok:false,error:'workspace_state_too_large'});
  try{
    const billingRows=await restJson(`workspace_billing?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=plan_key,active_contact_limit&limit=1`);
    const billing=billingRows?.[0]||{plan_key:'free',active_contact_limit:50};
    const active=(Array.isArray(body.state.people)?body.state.people:[]).filter(p=>p?.activeInRecallya!==false).length;
    if(billing.plan_key==='free'&&active>Number(billing.active_contact_limit||50)){
      return json(res,409,{ok:false,error:'active_contact_limit_reached',limit:Number(billing.active_contact_limit||50),active});
    }
    await restJson(`workspace_app_state?workspace_id=eq.${encodeURIComponent(workspaceId)}`,{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=representation'},
      body:JSON.stringify({workspace_id:workspaceId,state:body.state,updated_by:user.id,updated_at:new Date().toISOString()})
    });
    const meta=safeMeta(body.meta||{});
    if(meta.name){
      await restJson(`workspaces?id=eq.${encodeURIComponent(workspaceId)}`,{
        method:'PATCH',
        headers:{Prefer:'return=minimal'},
        body:JSON.stringify({name:meta.name,workspace_type:meta.type,category:meta.category||null,website:meta.website||null,primary_goal:meta.goal||null,updated_at:new Date().toISOString()})
      });
    }
    return json(res,200,{ok:true,workspaceId,savedAt:new Date().toISOString()});
  }catch(e){return json(res,500,{ok:false,error:'save_failed',detail:e.detail||e.message})}
}
