import { json, readJson, callExternalTextProvider } from './_util.js';

const STAGES = ['New lead','Nurturing','Opportunity','Proposal','Decision','Customer','Past customer','Dormant','Do not contact'];

function textOf(c={}) {
  return [
    c.stage,c.status,c.lifecycle,c.notes,c.context,c.summary,c.lastContact,
    ...(Array.isArray(c.memory)?c.memory:[]),
    ...(Array.isArray(c.objections)?c.objections:[]),
    ...(Array.isArray(c.purchases)?c.purchases:[])
  ].filter(Boolean).join(' ').toLowerCase();
}

function heuristic(c={}) {
  const t=textOf(c);
  const explicit=String(c.stage||'').trim();
  if (explicit && !/^(new lead|lead|imported|unknown)$/i.test(explicit)) {
    return {
      stage: STAGES.find(s=>s.toLowerCase()===explicit.toLowerCase()) || explicit,
      lifecycle: /customer/i.test(explicit)?'Customer':/past|dormant|lost/i.test(explicit)?'Inactive':'Opportunity',
      confidence: 99,
      reason:'Imported stage was explicit.',
      evidence:[{source:'Imported CRM',detail:`Stage: ${explicit}`}],
      needsReview:false
    };
  }
  const rules=[
    {re:/do not contact|unsubscribe|opt.?out/,stage:'Do not contact',life:'Inactive',confidence:98,why:'Explicit contact restriction found.'},
    {re:/invoice paid|paid invoice|active customer|current customer|client since|renewal|purchased|bought/,stage:'Customer',life:'Customer',confidence:91,why:'Purchase or active-customer evidence found.'},
    {re:/former customer|past customer|previous client|churned|cancelled|canceled/,stage:'Past customer',life:'Inactive',confidence:88,why:'Prior-customer evidence found.'},
    {re:/contract sent|proposal sent|quote sent|proposal|quote/,stage:'Proposal',life:'Opportunity',confidence:84,why:'Proposal or quote activity found.'},
    {re:/decision|approval|cfo|partner approval|sign.?off|budget approval/,stage:'Decision',life:'Opportunity',confidence:82,why:'Decision-stage language found.'},
    {re:/demo|discovery|qualified|interested|pricing|price|meeting booked/,stage:'Opportunity',life:'Opportunity',confidence:78,why:'Active buying-interest evidence found.'},
    {re:/follow.?up|later|next month|next quarter|not ready|circle back|re.?engage/,stage:'Nurturing',life:'Lead',confidence:73,why:'Future follow-up or nurture language found.'},
    {re:/no response|ghosted|inactive|dormant|old lead|cold lead/,stage:'Dormant',life:'Inactive',confidence:72,why:'Inactivity language found.'}
  ];
  const match=rules.find(r=>r.re.test(t));
  if(match) return {
    stage:match.stage,lifecycle:match.life,confidence:match.confidence,reason:match.why,
    evidence:[{source:'Imported notes/history',detail:(c.notes||c.context||c.summary||'Matching relationship history').slice(0,240)}],
    needsReview:match.confidence<80
  };
  return {
    stage:'New lead',lifecycle:'Lead',confidence:45,
    reason:'Not enough history to confidently place this relationship.',
    evidence:[{source:'Import',detail:'Contact record exists but relationship history is sparse.'}],
    needsReview:true
  };
}

function sanitizeAI(items, originals) {
  if (!Array.isArray(items)) return null;
  const byId=new Map(originals.map(c=>[String(c.id),c]));
  return items.map(x=>{
    const source=byId.get(String(x.id));
    if(!source) return null;
    const fallback=heuristic(source);
    const stage=STAGES.includes(x.stage)?x.stage:fallback.stage;
    return {
      id:String(x.id),
      stage,
      lifecycle:String(x.lifecycle||fallback.lifecycle).slice(0,40),
      confidence:Math.max(0,Math.min(100,Number(x.confidence)||fallback.confidence)),
      reason:String(x.reason||fallback.reason).slice(0,500),
      evidence:Array.isArray(x.evidence)?x.evidence.slice(0,6).map(e=>({
        source:String(e.source||'Connected history').slice(0,80),
        detail:String(e.detail||'').slice(0,500)
      })):fallback.evidence,
      needsReview:Boolean(x.needsReview ?? (Number(x.confidence||0)<80))
    };
  }).filter(Boolean);
}

export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{ok:false,error:'method_not_allowed'});
  const body=await readJson(req);
  const contacts=Array.isArray(body.contacts)?body.contacts.slice(0,100):[];
  if(!contacts.length) return json(res,400,{ok:false,error:'contacts_required'});

  const compact=contacts.map(c=>({
    id:String(c.id||''),
    name:String(c.name||'').slice(0,120),
    company:String(c.company||'').slice(0,160),
    email:String(c.email||'').slice(0,180),
    stage:String(c.stage||'').slice(0,80),
    status:String(c.status||'').slice(0,80),
    lifecycle:String(c.lifecycle||'').slice(0,80),
    notes:String(c.notes||c.context||c.summary||'').slice(0,1800),
    memory:Array.isArray(c.memory)?c.memory.slice(0,12).map(x=>String(x).slice(0,500)):[],
    objections:Array.isArray(c.objections)?c.objections.slice(0,6):[],
    purchases:Array.isArray(c.purchases)?c.purchases.slice(0,8):[],
    lastContact:String(c.lastContact||'').slice(0,120)
  }));

  const provider=await callExternalTextProvider({
    mode:'relationship_reconstruction',
    message:'Reconstruct each customer relationship. Return JSON with a relationships array. For every item return id, stage (New lead, Nurturing, Opportunity, Proposal, Decision, Customer, Past customer, Dormant, or Do not contact), lifecycle, confidence 0-100, reason, evidence [{source,detail}], and needsReview. Never invent facts. Distinguish explicit evidence from inference.',
    context:{contacts:compact}
  });

  let aiItems=null;
  if(provider.ok){
    const d=provider.data;
    aiItems=d?.relationships || d?.data?.relationships || d?.output?.relationships || null;
    if(typeof d?.text==='string'){
      try{aiItems=JSON.parse(d.text).relationships}catch{}
    }
  }
  const reconstructed=sanitizeAI(aiItems,compact) || compact.map(c=>({id:c.id,...heuristic(c)}));
  return json(res,200,{
    ok:true,
    engine:aiItems?'ai':'rules_fallback',
    reconstructed,
    note:aiItems?'External AI provider used with source-constrained instructions.':'External AI provider is not configured, so Recallya used its deterministic reconstruction rules.'
  });
}
