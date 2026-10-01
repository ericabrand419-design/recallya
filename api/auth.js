import { json, readJson } from './_util.js';
import { productionConfigured, authFetch, setSessionCookies, clearSessionCookies, requireUser } from './_supabase.js';

function cleanEmail(v='') { return String(v).trim().toLowerCase(); }

export default async function handler(req,res){
  if (!productionConfigured()) return json(res,503,{ok:false,configured:false,error:'production_not_configured'});

  if (req.method === 'GET') {
    const session = await requireUser(req,res);
    if (!session) return;
    return json(res,200,{ok:true,configured:true,user:{id:session.user.id,email:session.user.email,user_metadata:session.user.user_metadata||{}}});
  }

  if (req.method !== 'POST') return json(res,405,{ok:false,error:'method_not_allowed'});
  const body = await readJson(req);
  const action = String(body.action||'').toLowerCase();

  if (action === 'logout') {
    clearSessionCookies(res);
    return json(res,200,{ok:true});
  }

  const email = cleanEmail(body.email);
  const password = String(body.password||'');
  if (!email || !password) return json(res,400,{ok:false,error:'email_and_password_required'});
  if (password.length < 8) return json(res,400,{ok:false,error:'password_too_short'});

  if (action === 'signup') {
    const businessName = String(body.businessName||'').trim();
    const r = await authFetch('/signup',{
      method:'POST',
      body:JSON.stringify({email,password,data:{business_name:businessName||undefined}})
    });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) return json(res,r.status,{ok:false,error:'signup_failed',detail:data?.msg||data?.message||data?.error_description||'Could not create account'});
    if (data.access_token) setSessionCookies(res,data);
    return json(res,data.access_token?201:202,{ok:true,confirmationRequired:!data.access_token,user:data.user?{id:data.user.id,email:data.user.email}:null});
  }

  if (action === 'login') {
    const r = await authFetch('/token?grant_type=password',{
      method:'POST',
      body:JSON.stringify({email,password})
    });
    const data = await r.json().catch(()=>({}));
    if (!r.ok || !data.access_token) return json(res,401,{ok:false,error:'login_failed',detail:data?.msg||data?.message||data?.error_description||'Invalid email or password'});
    setSessionCookies(res,data);
    return json(res,200,{ok:true,user:{id:data.user?.id,email:data.user?.email}});
  }

  return json(res,400,{ok:false,error:'unknown_action'});
}
