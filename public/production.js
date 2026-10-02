(function productionClient(){
  const params=new URLSearchParams(location.search);
  const demoMode=params.get('demo')==='1';
  const gate=document.getElementById('productionGate');
  let saveTimer=null;
  let lastSaveSignature='';
  let currentUser=null;
  let appLoaded=false;

  function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function showGate(html){if(!gate)return;gate.hidden=false;gate.innerHTML=html;document.body.classList.add('production-check')}
  function hideGate(){if(gate){gate.hidden=true;gate.innerHTML=''}document.body.classList.remove('production-check')}

  async function jsonFetch(url,options={}){
    const r=await fetch(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    let data={};try{data=await r.json()}catch{}
    return {r,data};
  }

  async function loadApp(){
    if(appLoaded&&window.RecallyaApp)return window.RecallyaApp;
    try{
      await import('/app.js?v=3.0.2');
      appLoaded=true;
      if(!window.RecallyaApp)throw new Error('Recallya app bridge did not initialize');
      return window.RecallyaApp;
    }catch(e){
      showGate(`<main class="prod-gate-card"><div class="prod-brand"><div class="brand-mark"><span>R</span></div><div><strong>Recallya</strong><small>Production</small></div></div><p class="eyebrow">APP STARTUP ERROR</p><h1>Recallya could not start the application shell.</h1><p>${esc(e?.message||'Unknown startup error')}</p><button class="primary-btn" onclick="location.reload()">Reload</button></main>`);
      throw e;
    }
  }

  function setupGate(){
    showGate(`<main class="prod-gate-card">
      <div class="prod-brand"><div class="brand-mark"><span>R</span></div><div><strong>Recallya</strong><small>Production setup</small></div></div>
      <p class="eyebrow">REAL APP MODE</p>
      <h1>Connect the production database to activate Recallya.</h1>
      <p>The seeded CRM is no longer the default app. Production is waiting for account storage and authentication so real users start with clean workspaces and persistent data.</p>
      <div class="prod-status-grid"><div><b>Application</b><span>Ready</span></div><div><b>Database</b><span>Not connected</span></div><div><b>Authentication</b><span>Not connected</span></div></div>
      <div class="prod-gate-actions"><a class="soft-btn" href="?demo=1">Explore sample demo</a></div>
      <small class="prod-note">Sample data only loads when you explicitly choose demo mode.</small>
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

  function installSignOut(app){
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

  function installWorkspaceCreate(app){
    const form=document.getElementById('newWorkspaceForm');if(!form||form.dataset.productionBound)return;form.dataset.productionBound='1';
    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Creating…';
      const w=await createWorkspace({name:document.getElementById('newWorkspaceName').value.trim(),type:document.getElementById('newWorkspaceType').value,category:document.getElementById('newWorkspaceCategory').value.trim(),website:document.getElementById('newWorkspaceWebsite').value.trim(),goal:document.getElementById('newWorkspaceGoal').value.trim()||'Convert conversations'});
      btn.disabled=false;btn.textContent='Create business';
      if(!w)return;
      app.addProductionWorkspace(w);
      document.getElementById('newWorkspaceDialog').close();form.reset();app.toast(`${w.name} workspace created`);
    };
  }

  async function boot(){
    if(demoMode){
      showGate('<main class="prod-gate-card loading-card"><div class="prod-brand"><div class="brand-mark"><span>R</span></div><div><strong>Recallya</strong><small>Loading sample workspace…</small></div></div><div class="prod-loader"></div></main>');
      await loadApp();
      document.body.classList.add('demo-mode');
      hideGate();
      return;
    }

    showGate('<main class="prod-gate-card loading-card"><div class="prod-brand"><div class="brand-mark"><span>R</span></div><div><strong>Recallya</strong><small>Loading your account…</small></div></div><div class="prod-loader"></div></main>');
    const {r,data}=await jsonFetch('/api/bootstrap');
    if(r.status===503||data.error==='production_not_configured'){setupGate();return}
    if(r.status===401){authGate();return}
    if(!r.ok){showGate(`<main class="prod-gate-card"><h1>Recallya could not load your account.</h1><p>${esc(data.detail||data.error||'Unknown error')}</p><button class="primary-btn" onclick="location.reload()">Try again</button></main>`);return}

    currentUser=data.user;
    const app=await loadApp();
    app.setProductionPortfolio(data.workspaces,data.activeWorkspaceId);
    installSignOut(app);installWorkspaceCreate(app);
    document.querySelector('.avatar-btn')?.setAttribute('title',data.user?.email||'Signed in');
    document.body.classList.add('production-live');
    hideGate();
  }

  window.RecallyaProduction={queueSave,createWorkspace,get user(){return currentUser},get live(){return Boolean(currentUser)}};
  boot();
})();
