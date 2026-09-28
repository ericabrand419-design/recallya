import { json, authorized, callExternalTextProvider } from './_util.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res,405,{error:'method_not_allowed'});
  if (!authorized(req)) return json(res,401,{error:'unauthorized'});
  const result = await callExternalTextProvider({message:'Reply with the single word CONNECTED.', context:{test:true}});
  json(res, result.ok?200:409, result);
}
