import { json, readJson, authorized } from './_util.js';

const policies = {
  x:{name:'X',mode:'auto',max:275},
  bluesky:{name:'Bluesky',mode:'auto',max:295},
  website:{name:'Website',mode:'auto'},
  email:{name:'Email',mode:'auto'},
  reddit:{name:'Reddit',mode:'approval'},
  linkedin:{name:'LinkedIn',mode:'approval'}
};

function adapt(message,id,{goal,url,cta}={}){
  let text=String(message||'').trim();
  if(id==='email') text=`Subject: ${goal||'A useful next step'}\n\n${text}\n\n${cta||'Reply if you want to take the next step.'}${url?`\n${url}`:''}`;
  else if(id==='linkedin') text=`${text}\n\n${cta||'One useful next step.'}${url?` ${url}`:''}`;
  else if(url) text+=` ${goal==='Drive website traffic'?'Learn more':'See the next step'}: ${url}`;
  const max=policies[id]?.max;
  if(max && text.length>max) text=text.slice(0,max-1)+'…';
  return text;
}

export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:'method_not_allowed'});
  if(!authorized(req)) return json(res,401,{error:'unauthorized'});
  const body=await readJson(req);
  const message=String(body.message||'').trim();
  const channels=Array.isArray(body.channels)?body.channels.filter(x=>policies[x]):[];
  if(!message) return json(res,400,{error:'message_required'});
  if(!channels.length) return json(res,400,{error:'channels_required'});
  const variants=channels.map(id=>({channel:id,name:policies[id].name,policyMode:policies[id].mode,text:adapt(message,id,{goal:body.goal,url:body.url,cta:body.cta}),canAutoPublish:policies[id].mode==='auto'}));
  return json(res,200,{ok:true,variants,note:'This endpoint prepares policy-aware channel variants. Live publishing requires the channel-specific authorized adapter and credentials.'});
}