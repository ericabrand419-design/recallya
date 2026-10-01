import { json, readJson } from './_util.js';
import { requireUser, restJson } from './_supabase.js';

function slugify(v='') {
  return String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,42) || 'business';
}
function initials(name='') {
  return String(name).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('') || 'B';
}
function blankState(ownerName='Owner') {
  return {
    automationsPaused:false,
    people:[], conversations:[], promises:[], agenda:[], sequences:[], campaigns:[],
    notifications:[], documents:[], quotes:[], serviceCases:[], meetingNotes:[],
    identitySuggestions:[], activities:[],
    voiceProfiles:[
      {id:'founder',name:'Founder',use:'Founder / direct messages',directness:75,warmth:70,formality:45,sales:65,description:'Your personal communication style. Recallya learns from approved messages and your corrections.',samples:[],avoid:[],cta:'Direct next step',locked:false},
      {id:'sales',name:'Sales',use:'Sales',directness:78,warmth:68,formality:50,sales:80,description:'Clear, useful and commercially aware without sounding automated.',samples:[],avoid:[],cta:'One concrete next step',locked:false},
      {id:'support',name:'Support',use:'Support',directness:65,warmth:82,formality:55,sales:20,description:'Helpful, calm and focused on resolving the customer’s issue.',samples:[],avoid:[],cta:'Confirm resolution',locked:false},
      {id:'social',name:'Brand Social',use:'Social / public posts',directness:74,warmth:72,formality:35,sales:60,description:'Conversational brand voice for public content.',samples:[],avoid:[],cta:'Low-friction action',locked:false},
      {id:'rouge',name:'Recallya Rouge',use:'Rouge provider',directness:70,warmth:80,formality:20,sales:75,description:'Optional 18+ add-on voice. Separate provider and boundaries.',samples:[],avoid:[],cta:'Configured by creator',locked:true}
    ],
    channels:[
      {id:'email',name:'Email',status:'Disconnected',policy:'Approval',voiceId:'sales'},
      {id:'sms',name:'SMS',status:'Disconnected',policy:'Approval',voiceId:'sales'},
      {id:'x',name:'X',status:'Disconnected',policy:'Approval',voiceId:'social'},
      {id:'linkedin',name:'LinkedIn',status:'Disconnected',policy:'Approval',voiceId:'social'},
      {id:'website',name:'Website',status:'Ready',policy:'Auto',voiceId:'sales'}
    ],
    automationRules:[],
    rouge:{enabled:false,voiceId:'rouge',provider:'',endpoint:'',boundaries:'18+ only. Respect opt-outs. Never infer age. Never send mature content unsolicited.',mode:'Approval',custom:'Always require human approval'},
    teamMembers:[{id:'owner',name:ownerName,role:'Owner',access:'Portfolio owner',status:'active',avatar:initials(ownerName)}],
    workflows:[],
    deliverability:{status:'Not connected',bounceRate:'—',suppressed:0,dailyLimit:0,sentToday:0},
    onboarding:{steps:[
      {id:'business',label:'Tell Recallya about your business',done:false},
      {id:'contacts',label:'Import contacts',done:false},
      {id:'email',label:'Connect email',done:false},
      {id:'voice',label:'Teach Recallya your voice',done:false},
      {id:'offers',label:'Add products and pricing',done:false},
      {id:'autopilot',label:'Set Autopilot boundaries',done:false}
    ]},
    plan:{name:'Free',seats:1,workspaces:1,contactLimit:50,features:['Core CRM','Relationship Reconstruction','Voice Studio','Forms','Basic Ask Recallya']}
  };
}

async function createWorkspaceForUser(user,name='My Business',type='business',category='',website='',goal='Convert conversations'){
  const baseSlug=slugify(name);
  const slug=`${baseSlug}-${user.id.slice(0,6)}-${Math.random().toString(36).slice(2,6)}`;
  const rows=await restJson('workspaces?select=id,slug,name,workspace_type,category,website,primary_goal',{
    method:'POST',
    headers:{Prefer:'return=representation'},
    body:JSON.stringify({slug,name,workspace_type:type,category:category||null,website:website||null,primary_goal:goal||'Convert conversations'})
  });
  const w=rows?.[0];
  await restJson('workspace_members',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({workspace_id:w.id,user_id:user.id,role:'owner',can_view_portfolio:true})});
  const state=blankState(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Owner');
  await restJson('workspace_app_state',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({workspace_id:w.id,state,updated_by:user.id})});
  await restJson('workspace_billing',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({workspace_id:w.id,plan_key:'free',active_contact_limit:50,workspace_limit:1,seat_limit:1})});
  return {...w,data:state,products:[]};
}

async function workspacesFor(user){
  const memberships=await restJson(`workspace_members?user_id=eq.${encodeURIComponent(user.id)}&select=workspace_id,role,can_view_portfolio`);
  if(!memberships?.length){
    const name=String(user.user_metadata?.business_name||'').trim() || 'My Business';
    return [await createWorkspaceForUser(user,name)];
  }
  const ids=memberships.map(x=>x.workspace_id);
  const workspaces=[];
  for(const id of ids){
    const wr=await restJson(`workspaces?id=eq.${encodeURIComponent(id)}&select=id,slug,name,workspace_type,category,website,primary_goal&limit=1`);
    const sr=await restJson(`workspace_app_state?workspace_id=eq.${encodeURIComponent(id)}&select=state,revision,updated_at&limit=1`);
    const br=await restJson(`workspace_billing?workspace_id=eq.${encodeURIComponent(id)}&select=plan_key,active_contact_limit,workspace_limit,seat_limit&limit=1`);
    const w=wr?.[0];if(!w)continue;
    const ownerName=user.user_metadata?.full_name || user.email?.split('@')[0] || 'Owner';
    const data=sr?.[0]?.state || blankState(ownerName);
    const billing=br?.[0]||{plan_key:'free',active_contact_limit:50,workspace_limit:1,seat_limit:1};
    data.plan={...(data.plan||{}),name:billing.plan_key==='free'?'Free':billing.plan_key,contactLimit:billing.active_contact_limit,workspaces:billing.workspace_limit,seats:billing.seat_limit};
    workspaces.push({...w,data,products:[],membership:memberships.find(m=>m.workspace_id===id),revision:sr?.[0]?.revision||1});
  }
  return workspaces;
}

export default async function handler(req,res){
  const session=await requireUser(req,res);if(!session)return;
  const {user}=session;
  if(req.method==='GET'){
    try{
      const workspaces=await workspacesFor(user);
      return json(res,200,{ok:true,user:{id:user.id,email:user.email,name:user.user_metadata?.full_name||''},workspaces,activeWorkspaceId:workspaces[0]?.id||null});
    }catch(e){return json(res,500,{ok:false,error:'bootstrap_failed',detail:e.detail||e.message})}
  }
  if(req.method!=='POST')return json(res,405,{ok:false,error:'method_not_allowed'});
  const body=await readJson(req);
  if(body.action==='create_workspace'){
    try{
      const current=await workspacesFor(user);
      const billing=current[0]?.data?.plan||{workspaces:1};
      if(current.length>=Number(billing.workspaces||1))return json(res,409,{ok:false,error:'workspace_limit_reached',limit:Number(billing.workspaces||1)});
      const w=await createWorkspaceForUser(user,String(body.name||'New Business').trim(),String(body.type||'business'),String(body.category||''),String(body.website||''),String(body.goal||'Convert conversations'));
      return json(res,201,{ok:true,workspace:w});
    }catch(e){return json(res,500,{ok:false,error:'workspace_create_failed',detail:e.detail||e.message})}
  }
  return json(res,400,{ok:false,error:'unknown_action'});
}
