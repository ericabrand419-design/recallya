import { json, readJson } from './_util.js';
import { claude, signedInUser, clip } from './_ai.js';

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

function compactPerson(p = {}) {
  return {
    name: p.name, company: p.company, role: p.role, email: p.email, stage: p.stage, status: p.status,
    value: p.value, lastContact: p.lastContact, summary: p.summary, nextAction: p.nextAction, nextWhy: p.nextWhy,
    preferences: p.preferences, objections: p.objections, promises: p.promises, purchases: p.purchases,
    memory: Array.isArray(p.memory) ? p.memory.slice(-15) : p.memory,
    relationshipReason: p.relationshipReason
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const body = await readJson(req);
  const question = String(body.question || '').trim().slice(0, 2000);
  if (!question) return json(res, 400, { error: 'question_required' });

  // AI answers are for signed-in accounts only, so the public demo can never spend AI credits.
  const user = await signedInUser(req, res);
  if (user) {
    const state = body.state || {};
    const workspace = body.workspace || {};
    const people = (Array.isArray(state.people) ? state.people : []).slice(0, 150).map(compactPerson);
    const system = [
      `You are Ask Recallya, the relationship assistant inside Recallya for the business "${String(workspace.name || 'this business').slice(0, 120)}"${workspace.category ? ` (${String(workspace.category).slice(0, 120)})` : ''}.`,
      workspace.goal ? `The business goal is: ${String(workspace.goal).slice(0, 300)}.` : '',
      'Answer the owner\'s question using only the CRM data provided. Be direct and specific: name the people, amounts and the concrete next step.',
      'If the data does not contain the answer, say exactly what is missing and how to add it in Recallya (import contacts, add context to a person, connect email).',
      'Keep answers under 160 words unless the owner asks for more. Plain text only, no markdown headings. Short lists are fine.'
    ].filter(Boolean).join(' ');
    const userPrompt = [
      body.person ? `FOCUS PERSON:\n${clip(compactPerson(body.person), 8000)}` : '',
      `CRM DATA:\n${clip({ people, promises: state.promises, agenda: state.agenda, campaigns: state.campaigns, products: workspace.products }, 40000)}`,
      `QUESTION: ${question}`
    ].filter(Boolean).join('\n\n');
    const ai = await claude({ req, tier: 'smart', system, user: userPrompt, maxTokens: 700 });
    if (ai.ok && ai.text) return json(res, 200, { answer: ai.text, source: 'claude', model: ai.model });
  }
  return json(res, 200, { answer: fallback(question, body.person, body.state), source: 'recallya_rules' });
}
