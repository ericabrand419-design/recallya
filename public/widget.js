(() => {
  const script = document.currentScript;
  const endpoint = script?.dataset?.endpoint || '/api/chat';
  const accent = script?.dataset?.accent || '#191816';
  let ageVerified = false;
  const root = document.createElement('div');
  root.innerHTML = `<style>
  #ccw-btn{position:fixed;right:20px;bottom:20px;z-index:99999;border:0;border-radius:999px;background:${accent};color:#fff;padding:13px 16px;font:700 14px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.18);cursor:pointer}
  #ccw-box{position:fixed;right:20px;bottom:74px;z-index:99999;width:min(360px,calc(100vw - 28px));height:480px;background:#fff;border:1px solid #e7e2dc;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.22);display:none;overflow:hidden;font:14px system-ui;color:#171513}
  #ccw-head{padding:15px 16px;background:${accent};color:#fff;font-weight:800}#ccw-msgs{height:350px;overflow:auto;padding:14px;background:#faf8f5;display:flex;flex-direction:column;gap:9px}
  .ccw-m{padding:9px 11px;border-radius:12px;max-width:82%;line-height:1.4}.ccw-in{background:#eeeae5;align-self:flex-start}.ccw-out{background:${accent};color:#fff;align-self:flex-end}
  #ccw-form{display:flex;gap:7px;padding:10px;border-top:1px solid #eee}#ccw-input{flex:1;border:1px solid #ddd;border-radius:10px;padding:10px}#ccw-send{border:0;border-radius:10px;background:${accent};color:#fff;padding:0 12px;font-weight:800}
  </style><button id="ccw-btn">Chat</button><div id="ccw-box"><div id="ccw-head">Recallya</div><div id="ccw-msgs"><div class="ccw-m ccw-in">Hi. I can help with availability, pricing, orders and links. Mature creator workflows are 18+ only.</div></div><form id="ccw-form"><input id="ccw-input" autocomplete="off" placeholder="Type a message..."><button id="ccw-send">Send</button></form></div>`;
  document.body.appendChild(root);
  const box=root.querySelector('#ccw-box'), btn=root.querySelector('#ccw-btn'), msgs=root.querySelector('#ccw-msgs'), form=root.querySelector('#ccw-form'), input=root.querySelector('#ccw-input');
  btn.onclick=()=>box.style.display=box.style.display==='block'?'none':'block';
  const add=(text,dir)=>{const d=document.createElement('div');d.className=`ccw-m ccw-${dir}`;d.textContent=text;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight};
  form.onsubmit=async e=>{e.preventDefault();const message=input.value.trim();if(!message)return;input.value='';add(message,'out');
    if(!ageVerified && /18|adult|yes/i.test(message)) ageVerified=true;
    try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,ageVerified})});const data=await r.json();add(data.reply||'Your message was received.','in')}catch{add('I could not connect right now. Please try again.','in')}
  };
})();
