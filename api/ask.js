import { json, readJson, callExternalTextProvider } from './_util.js';

function fallback(question, person, state={}) {
  const q = String(question || '').toLowerCase();
  if (person) {
    const name = person.name || 'This customer';
    if (/promise|owe|forget/.test(q)) return person.promises?.length ? `You currently owe ${name}: ${person.promises.join('; ')}.` : `I do not have an open promise recorded for ${name}.`;
    if (/what.*next|do next|next step|should i do/.test(q)) return `${person.nextAction}. ${person.nextWhy}`;
    if (/training/.test(q) && person.id === 'marissa') return 'Marissa said training time is her final concern. She also said a two-store pilot would be easier to get approved internally. Make the training timeline concrete in the revised proposal.';
    if (/summar|know|history/.test(q)) return `${person.summary}\n\nImportant memory: ${(person.memory || []).join(' ')}`;
    return `${person.summary}\n\nNext best action: ${person.nextAction}. ${person.nextWhy}`;
  }
  const people = state.people || [];
  const promises = state.promises || [];
  if (/follow.?up|attention|needs.*today/.test(q)) return people.filter(p=>['hot','warm'].includes(p.intent)).slice(0,3).map(p=>`${p.name}: ${p.nextAction}`).join('\n');
  if (/promise|overdue|owe/.test(q)) return promises.length ? promises.map(x=>x.text).join('\n') : 'No open promises were supplied.';
  if (/deal|pipeline|likely|move/.test(q)) return people.filter(p=>p.value).sort((a,b)=>b.value-a.value).slice(0,3).map(p=>`${p.company}: $${Number(p.value).toLocaleString()} · ${p.stage} · ${p.nextAction}`).join('\n');
  return 'The clearest next step is to resolve the specific dependency in each active relationship, then move it to a concrete commitment such as a reply, meeting, proposal or decision.';
}

export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:'method_not_allowed'});
  const body=await readJson(req);
  const question=String(body.question||'').trim();
  if(!question) return json(res,400,{error:'question_required'});
  const provider=await callExternalTextProvider({message:question,context:{surface:'ask-recallya',person:body.person||null,crmState:body.state||{}}});
  if(provider.ok){const d=provider.data||{};const answer=d.answer||d.reply||d.text||d.output;if(answer)return json(res,200,{answer:String(answer),source:'provider'});}
  return json(res,200,{answer:fallback(question,body.person,body.state),source:'recallya_demo_engine'});
}
