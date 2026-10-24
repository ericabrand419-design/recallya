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

  // ---- Account agent: daily briefing + approval queue on the Today screen ----
  const KIND={reply:'Reply',keep_promise:'Keep a promise',follow_up:'Follow up',re_engage:'Re-engage'};
  let agentWs=null, agentRun=null, agentBusy=false;
  function agentStyles(){
    if(document.getElementById('agentPanelStyles'))return;
    const st=document.createElement('style');st.id='agentPanelStyles';
    st.textContent=`body.production-live #today-view .hero-card{display:none}.agent-panel{margin:0 0 18px}.agent-briefing{font-size:1.02rem;line-height:1.5;margin:6px 0 4px}.agent-meta{display:block;opacity:.65;margin-bottom:12px}.agent-items{display:grid;gap:12px}.agent-item{border:1px solid rgba(120,140,170,.25);border-radius:14px;padding:14px}.agent-item-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:6px}.agent-chip{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:rgba(120,140,170,.18)}.agent-chip.high{background:rgba(229,72,77,.15);color:#c0262d}.agent-chip.medium{background:rgba(245,166,35,.18);color:#9a5b00}.agent-kind{font-size:.85rem;opacity:.7}.agent-reason{margin:0 0 8px;line-height:1.45}.agent-draft{width:100%;box-sizing:border-box;min-height:84px;border-radius:10px;border:1px solid rgba(120,140,170,.35);padding:10px;font:inherit;line-height:1.45;resize:vertical}.agent-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.agent-handled{opacity:.65;font-size:.9rem;margin-top:4px}`;
    document.head.appendChild(st);
  }
  function agentPanel(){
    let el=document.getElementById('agentPanel');
    const today=document.getElementById('today-view');
    if(!today)return null;
    if(!el){
      el=document.createElement('article');el.id='agentPanel';el.className='panel agent-panel';
      el.innerHTML='<div class="panel-head"><div><p class="eyebrow">YOUR RECALLYA AGENT</p><h2>Today\'s briefing</h2></div><button class="soft-btn" id="agentRunBtn" type="button">Run now</button></div><p class="agent-briefing" id="agentBriefing">Loading your agent…</p><small class="agent-meta" id="agentMeta"></small><div class="agent-items" id="agentItems"></div><div class="agent-handled" id="agentHandled"></div>';
      const hero=today.querySelector('.hero-card');
      if(hero&&hero.nextSibling)today.insertBefore(el,hero.nextSibling);else today.prepend(el);
      el.querySelector('#agentRunBtn').onclick=()=>runAgentNow();
    }
    return el;
  }
  function when(iso){if(!iso)return'';const d=new Date(iso);const mins=Math.round((Date.now()-d.getTime())/60000);if(mins<1)return'just now';if(mins<60)return`${mins} min ago`;const h=Math.round(mins/60);if(h<24)return`${h} hr ago`;return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}
  function renderAgent(){
    const el=agentPanel();if(!el)return;
    const run=agentRun;
    el.querySelector('#agentRunBtn').disabled=agentBusy;
    el.querySelector('#agentRunBtn').textContent=agentBusy?'Reviewing…':'Run now';
    if(!run){
      el.querySelector('#agentBriefing').textContent='Your agent has not run yet. It reviews your relationships every morning, or press Run now.';
      el.querySelector('#agentMeta').textContent='Drafts only. Nothing is sent without your approval.';
      el.querySelector('#agentItems').innerHTML='';el.querySelector('#agentHandled').textContent='';return;
    }
    el.querySelector('#agentBriefing').textContent=run.briefing||'';
    el.querySelector('#agentMeta').textContent=`Last review ${when(run.runAt)}${run.model?'':' (built-in rules, AI was unavailable)'}. Drafts only. Nothing is sent without your approval.`;
    const open=(run.items||[]).filter(i=>i.status==='pending');
    const handled=(run.items||[]).length-open.length;
    el.querySelector('#agentItems').innerHTML=open.map(i=>`<div class="agent-item" data-agent-item="${esc(i.id)}"><div class="agent-item-head"><strong>${esc(i.personName)}</strong><span class="agent-chip ${esc(i.priority)}">${esc(i.priority)}</span><span class="agent-kind">${esc(KIND[i.kind]||'Follow up')}</span></div><p class="agent-reason">${esc(i.reason)}</p>${i.draft?`<textarea class="agent-draft" aria-label="Draft for ${esc(i.personName)}">${esc(i.draft)}</textarea>`:''}<div class="agent-actions">${i.draft?'<button class="primary-btn" type="button" data-agent-use>Use draft</button>':''}<button class="soft-btn" type="button" data-agent-done>Done</button><button class="soft-btn" type="button" data-agent-dismiss>Dismiss</button></div></div>`).join('')||'<p class="agent-reason">Nothing waiting on you from this review.</p>';
    el.querySelector('#agentHandled').textContent=handled?`${handled} handled from this review.`:'';
    el.querySelectorAll('[data-agent-item]').forEach(card=>{
      const item=open.find(x=>x.id===card.dataset.agentItem);
      card.querySelector('[data-agent-done]').onclick=()=>setAgentItem(item,'done');
      card.querySelector('[data-agent-dismiss]').onclick=()=>setAgentItem(item,'dismissed');
      const use=card.querySelector('[data-agent-use]');
      if(use)use.onclick=()=>useDraft(item,card.querySelector('.agent-draft').value);
    });
  }
  async function loadAgent(){
    const ws=window.RecallyaApp?.getActiveWorkspaceId?.();if(!ws||!currentUser)return;
    agentWs=ws;
    const {r,data}=await jsonFetch(`/api/agent?workspaceId=${encodeURIComponent(ws)}`);
    if(ws!==agentWs)return;
    agentRun=r.ok?data.run:null;renderAgent();
  }
  async function runAgentNow(){
    if(agentBusy||!agentWs)return;agentBusy=true;renderAgent();
    const {r,data}=await jsonFetch('/api/agent',{method:'POST',body:JSON.stringify({action:'run',workspaceId:agentWs})});
    agentBusy=false;
    if(r.ok){agentRun=data.run;window.RecallyaApp?.toast?.('Your agent finished its review')}
    else if(data.error==='ran_recently'){agentRun=data.run;window.RecallyaApp?.toast?.(`Your agent just ran. Try again in ${data.retryInMinutes} min.`)}
    else window.RecallyaApp?.toast?.('Your agent could not finish. Try again shortly.');
    renderAgent();
  }
  async function setAgentItem(item,status){
    if(!item)return;item.status=status;renderAgent();
    const {r}=await jsonFetch('/api/agent',{method:'POST',body:JSON.stringify({action:'item',workspaceId:agentWs,itemId:item.id,status})});
    if(!r.ok){item.status='pending';renderAgent();window.RecallyaApp?.toast?.('Could not update that item.')}
  }
  function useDraft(item,text){
    const app=window.RecallyaApp;
    if(app&&item.conversationId){
      app.navigate('inbox');
      setTimeout(()=>{const t=document.querySelector(`[data-conversation="${CSS.escape(item.conversationId)}"]`);if(t)t.click();const box=document.getElementById('replyText');if(box){box.value=text;box.focus()}app.toast?.('Draft placed in the reply box. Review it, then send.')},60);
      return;
    }
    navigator.clipboard?.writeText(text).then(()=>app?.toast?.('Draft copied. This person has no conversation yet.'),()=>{});
  }
  function installAgent(){
    agentStyles();agentPanel();loadAgent();
    setInterval(()=>{
      if(!currentUser)return;
      if(!document.getElementById('agentPanel')){agentPanel();renderAgent()}
      const ws=window.RecallyaApp?.getActiveWorkspaceId?.();
      if(ws&&ws!==agentWs){agentRun=null;renderAgent();loadAgent()}
    },2000);
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
    installSignOut(app);installWorkspaceCreate(app);installAgent();
    document.querySelector('.avatar-btn')?.setAttribute('title',data.user?.email||'Signed in');
    document.body.classList.add('production-live');
    hideGate();
  }

  window.RecallyaProduction={queueSave,createWorkspace,get user(){return currentUser},get live(){return Boolean(currentUser)}};
  boot();
})();
