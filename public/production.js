(function recallyaProductionClient(){
  const params=new URLSearchParams(location.search);
  const demoMode=params.get('demo')==='1';
  const gate=document.getElementById('productionGate');
  let saveTimer=null;
  let lastSaveSignature='';
  let currentUser=null;

  function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function showGate(html){if(!gate)return;gate.hidden=false;gate.innerHTML=html;document.body.classList.add('production-check')}
  function hideGate(){if(gate){gate.hidden=true;gate.innerHTML=''}document.body.classList.remove('production-check')}

  async function jsonFetch(url,options={}){
    const r=await fetch(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    let data={};try{data=await r.json()}catch{}
    return {r,data};
  }

  function setupGate(){
    showGate(`<main class="prod-gate-card">
      <div class="prod-brand"><div class="brand-mark"><span>R</span></div><div><strong>Recallya</strong><small>Production setup</small></div></div>
      <p class="eyebrow">REAL APP MODE</p>
      <h1>The interface is ready. The production database still needs to be connected.</h1>
      <p>Recallya will no longer pretend browser demo data is a real account. Once Supabase credentials are connected, this screen becomes signup and every workspace saves to the database.</p>
      <div class="prod-gate-actions"><a class="primary-btn" href="?demo=1">Open sample demo</a></div>
      <small class="prod-note">Demo mode is now explicit. It is not production data.</small>
    </main>`);
  }

  function authGate(message=''){
    showGate(`<main class="prod-gate-card auth-card">
      <div class="prod-brand"><div class="brand-mark"><span>R</span></div><div><strong>Recallya</strong><small>Conversations that convert.</small></div></div>
      <p class="eyebrow">YOUR RELATIONSHIPS, NOT OUR DEMO</p>
      <h1>Start with a clean Recallya account.</h1>
      <p>Create your account, then import customers, connect email or add the first relationship yourself.</p>
      ${message?`<div class="prod-auth-message">${esc(message)}</div>`:''}
      <div class="prod-auth-tabs"><button id="prodLoginTab" class="active">Sign in</button><button id="prodSignupTab">Create account</button></div>
      <form id="prodAuthForm" class="prod-auth-form">
        <label id="prodBusinessWrap" hidden>Business name<input id="prodBusiness" autocomplete="organization" placeholder="Your business" /></label>
        <label>Email<input id="prodEmail" type="email" autocomplete="email" required placeholder="you@business.com" /></label>
        <label>Password<input id="prodPassword" type="password" autocomplete="current-password" minlength="8" required placeholder="At least 8 characters" /></label>
        <button class="primary-btn" id="prodAuthSubmit">Sign in</button>
      </form>
      <div class="prod-divider"><span>or</span></div>
      <a class="soft-btn prod-demo-link" href="?demo=1">Explore with sample data</a>
      <small class="prod-note">Sample data stays separate from your real account.</small>
    </main>`);
    let mode='login';
    const setMode=m=>{mode=m;document.getElementById('prodBusinessWrap').hidden=m!=='signup';document.getElementById('prodAuthSubmit').textContent=m==='signup'?'Create account':'Sign in';document.getElementById('prodLoginTab').classList.toggle('active',m==='login');document.getElementById('prodSignupTab').classList.toggle('active',m==='signup');document.getElementById('prodPassword').autocomplete=m==='signup'?'new-password':'current-password'};
    document.getElementById('prodLoginTab').onclick=()=>setMode('login');
    document.getElementById('prodSignupTab').onclick=()=>setMode('signup');
    document.getElementById('prodAuthForm').onsubmit=async e=>{
      e.preventDefault();
      const submit=document.getElementById('prodAuthSubmit');submit.disabled=true;submit.textContent=mode==='signup'?'Creating account…':'Signing in…';
      const {r,data}=await jsonFetch('/api/auth',{method:'POST',body:JSON.stringify({action:mode,email:document.getElementById('prodEmail').value,password:document.getElementById('prodPassword').value,businessName:document.getElementById('prodBusiness').value})});
      submit.disabled=false;
      if(!r.ok){authGate(data.detail||data.error||'Could not sign in.');return}
      if(data.confirmationRequired){authGate('Account created. Check your email to confirm it, then sign in.');return}
      await boot();
    };
  }

  function installSignOut(){
    if(document.getElementById('productionSignOut'))return;
    const footer=document.querySelector('.nav-footer');if(!footer)return;
    const b=document.createElement('button');b.id='productionSignOut';b.className='soft-btn prod-signout';b.textContent='Sign out';
    b.onclick=async()=>{await jsonFetch('/api/auth',{method:'POST',body:JSON.stringify({action:'logout'})});localStorage.removeItem('recallya-v2');localStorage.removeItem('recallya-portfolio-v1');authGate()};
    footer.appendChild(b);
  }

  async function saveWorkspace(workspaceId,state,meta){
    if(demoMode||!workspaceId||!currentUser)return;
    const signature=JSON.stringify([workspaceId,state,meta?.name,meta?.category,meta?.website,meta?.goal]);
    if(signature===lastSaveSignature)return;
    const {r,data}=await jsonFetch('/api/workspace-state',{method:'PUT',body:JSON.stringify({workspaceId,state,meta:{name:meta?.name,type:meta?.type,category:meta?.category,website:meta?.website,goal:meta?.goal}})});
    if(r.ok){lastSaveSignature=signature;return}
    if(r.status===401){authGate('Your session expired. Sign in again.');return}
    if(data.error==='active_contact_limit_reached'){window.RecallyaApp?.toast?.(`Free includes ${data.limit} active relationships. Park extras or upgrade.`);return}
    window.RecallyaApp?.toast?.('Recallya could not save that change to the server.');
  }
  function queueSave(workspaceId,state,meta){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveWorkspace(workspaceId,state,meta),450)}

  async function createWorkspace(payload){
    const {r,data}=await jsonFetch('/api/bootstrap',{method:'POST',body:JSON.stringify({action:'create_workspace',...payload})});
    if(!r.ok){
      if(data.error==='workspace_limit_reached')window.RecallyaApp?.toast?.(`Your current plan includes ${data.limit} workspace.`);
      else window.RecallyaApp?.toast?.('Could not create workspace.');
      return null;
    }
    return data.workspace;
  }

  function installWorkspaceCreate(){
    const form=document.getElementById('newWorkspaceForm');if(!form||form.dataset.productionBound)return;form.dataset.productionBound='1';
    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Creating…';
      const w=await createWorkspace({name:document.getElementById('newWorkspaceName').value.trim(),type:document.getElementById('newWorkspaceType').value,category:document.getElementById('newWorkspaceCategory').value.trim(),website:document.getElementById('newWorkspaceWebsite').value.trim(),goal:document.getElementById('newWorkspaceGoal').value.trim()||'Convert conversations'});
      btn.disabled=false;btn.textContent='Create business';
      if(!w)return;
      window.RecallyaApp.addProductionWorkspace(w);
      document.getElementById('newWorkspaceDialog').close();form.reset();window.RecallyaApp.toast(`${w.name} workspace created`);
    };
  }

  async function boot(){
    if(demoMode){hideGate();document.body.classList.add('demo-mode');return}
    const app=window.RecallyaApp;
    if(!app){window.addEventListener('recallya:app-ready',boot,{once:true});return}
    showGate('<main class="prod-gate-card loading-card"><div class="prod-brand"><div class="brand-mark"><span>R</span></div><div><strong>Recallya</strong><small>Loading your business…</small></div></div><div class="prod-loader"></div></main>');
    const {r,data}=await jsonFetch('/api/bootstrap');
    if(r.status===503||data.error==='production_not_configured'){setupGate();return}
    if(r.status===401){authGate();return}
    if(!r.ok){showGate(`<main class="prod-gate-card"><h1>Recallya could not load your account.</h1><p>${esc(data.detail||data.error||'Unknown error')}</p><button class="primary-btn" onclick="location.reload()">Try again</button></main>`);return}
    currentUser=data.user;
    app.setProductionPortfolio(data.workspaces,data.activeWorkspaceId);
    installSignOut();installWorkspaceCreate();hideGate();
    document.querySelector('.avatar-btn')?.setAttribute('title',data.user?.email||'Signed in');
    document.body.classList.add('production-live');
  }

  window.RecallyaProduction={queueSave,createWorkspace,get user(){return currentUser},get live(){return Boolean(currentUser)}};
  boot();
})();
