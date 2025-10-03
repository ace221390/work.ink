/* hosted obfuscated loader - expose window.__wk_obf_load(env) */
/* theme: 4000 */
(function(){
  "use strict";
  const _0x4k = [
    "workink_redirect_dest",
    "workink.vercel.app",
    "work.ink",
    "/refresh",
    "url",
    "https://work.ink/?__dest=",
    "https://work.ink/",
    "__dest",
    "AGREE",
    "Just a"
  ];
  function _0x(i){ return _0x4k[i]; }

  /* junk helpers to bloat & confuse */
  function _J0(){return 4000;}
  function _J1(a){try{return a+'';}catch(e){return'';}}
  function _J2(){for(let i=0;i<2;i++)Math.random(); return 'k';}
  function _J3(x){try{return (x+'').split('').reverse().join('');}catch(e){return x;}}
  function _J4(){if(false) console.log('dead');}
  function _J5(){return Math.floor(Math.random()*1e6).toString(36);}
  function _J6(){return '4k'+_J5();}
  function _J7(){return (function(){return 'x';})();}
  function _J8(){try{return Date.now()%1000;}catch(e){return 0;}}
  function _J9(){return void 0;}

  /* exported loader: call with env = { gmSet, gmGet, gmDelete, sessionKeyPromise } */
  async function __wk(env){
    const _env = env || {};

    /* GM wrappers: prefer provided env.gm*, then GM_* globals, then fallback to localStorage */
    const gmSet = _env.gmSet || (typeof GM_setValue === 'function' ? (k,v)=>{ try{ GM_setValue(k,v); return Promise.resolve(); }catch(e){return Promise.reject(e);} } :
                   (typeof GM !== 'undefined' && GM.setValue ? (k,v)=>GM.setValue(k,v) : (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); return Promise.resolve(); }catch(e){return Promise.reject(e);} } ));
    const gmGet = _env.gmGet || (typeof GM_getValue === 'function' ? (k,def)=>{ try{ const r=GM_getValue(k); return Promise.resolve(r===undefined?def:r);}catch(e){return Promise.reject(e);} } :
                   (typeof GM !== 'undefined' && GM.getValue ? (k,def)=>GM.getValue(k,def) : (k,def)=>{ try{ const s=localStorage.getItem(k); return Promise.resolve(s===null?def:JSON.parse(s)); }catch(e){return Promise.reject(e);} } ));
    const gmDel = _env.gmDelete || (typeof GM_deleteValue === 'function' ? (k)=>{ try{ GM_deleteValue(k); return Promise.resolve(); }catch(e){ return Promise.reject(e);} } :
                  (typeof GM !== 'undefined' && GM.deleteValue ? (k)=>GM.deleteValue(k) : (k)=>{ try{ localStorage.removeItem(k); return Promise.resolve(); }catch(e){ return Promise.reject(e);} } ));

    /* safe utilities */
    function _sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
    function _safe(f){ try{return f(); }catch(e){ return null; } }

    /* extract 'url' param */
    function _extract(search){
      try{
        const ps = new URLSearchParams(search);
        let u = ps.get(_0x(4));
        if(!u) return null;
        try{ u = decodeURIComponent(u); }catch(e){}
        return u;
      }catch(err){
        return null;
      }
    }

    /* branch 1: when loaded on workink.vercel.app/refresh -> store destination and redirect to work.ink */
    if(location.hostname === _0x(1) && location.pathname.startsWith(_0x(3))){
      const dest = _extract(location.search);
      if(dest){
        try{
          await gmSet(_0x(0), dest);
        }catch(err){
          try{ console.warn("GM storage failed, falling back to query param:", err); }catch(e){}
          const enc = encodeURIComponent(dest);
          location.href = _0x(5) + enc;
          return;
        }
        location.replace(_0x(6));
        return;
      } else return;
    }

    /* branch 2: when on work.ink -> read stored dest or __dest query and perform click/redirect workflow */
    if(location.hostname === _0x(2)){
      let dest = null;
      try{ dest = await gmGet(_0x(0), null); }catch(e){ try{ console.warn("GM.get failed:", e); }catch(ee){} dest = null; }

      if(!dest){
        try{ const ps = new URLSearchParams(location.search); const m = ps.get(_0x(7)); if(m) dest = m; }catch(e){}
      }
      if(!dest) return;

      try{ const parsed = new URL(dest, location.href); dest = parsed.href; }catch(e){
        try{ console.error("Destination URL looks invalid:", dest, e); }catch(ee){} await gmDel(_0x(0)).catch(()=>{}); return;
      }

      async function _final(){
        try{ await gmDel(_0x(0)); }catch(e){}
        await _sleep(2000);
        window.location.href = dest;
      }

      function _findAgree(){
        try{
          let cand = Array.from(document.querySelectorAll('button[mode="primary"][size="large"], button[mode="primary"], button[size="large"], button'));
          for(const b of cand){
            try{
              const sp = b.querySelector('span');
              if(sp && (sp.textContent||'').trim().toUpperCase() === _0x(8)) return b;
              if((b.textContent||'').trim().toUpperCase() === _0x(8)) return b;
            }catch(e){}
          }
          const spans = Array.from(document.querySelectorAll('span'));
          for(const s of spans){
            try{
              if((s.textContent||'').trim().toUpperCase() === _0x(8)){
                const p = s.closest('button'); if(p) return p;
              }
            }catch(e){}
          }
          return null;
        }catch(e){ return null; }
      }

      function _click(el){
        if(!el) return;
        try{ el.scrollIntoView({ block:'center', inline:'center', behavior:'auto' }); }catch(e){}
        try{ el.focus && el.focus(); }catch(e){}
        try{ el.click(); return; }catch(e){}
        try{
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width/2, cy = r.top + r.height/2;
          const ev = { bubbles:true, cancelable:true, view:window, clientX:cx, clientY:cy };
          el.dispatchEvent(new MouseEvent('mouseover', ev));
          el.dispatchEvent(new MouseEvent('mousemove', ev));
          el.dispatchEvent(new MouseEvent('mousedown', ev));
          el.dispatchEvent(new MouseEvent('mouseup', ev));
          el.dispatchEvent(new MouseEvent('click', ev));
        }catch(e){
          try{ el.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true })); el.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', bubbles:true })); }catch(ee){}
        }
      }

      async function _clickThen(){
        const SEARCH_TIMEOUT_MS = 5000, POLL_INTERVAL_MS = 250;
        let f = _findAgree();
        if(f){ try{ _click(f); }catch(e){ try{ console.warn("click error", e); }catch(ee){} } _final(); return; }

        let resolved=false, mo;
        const stop = ()=>{ if(mo) try{ mo.disconnect(); }catch(e){} resolved = true; };
        try{
          mo = new MutationObserver(()=>{ if(resolved) return; const ff = _findAgree(); if(ff){ stop(); try{ _click(ff); }catch(e){ try{ console.warn("click error", e); }catch(ee){} } _final(); } });
          mo.observe(document.documentElement || document.body || document, { childList:true, subtree:true });
        }catch(e){}

        const start = Date.now();
        while(!resolved && (Date.now()-start) < SEARCH_TIMEOUT_MS){
          await _sleep(POLL_INTERVAL_MS);
          const ff = _findAgree();
          if(ff){ stop(); try{ _click(ff); }catch(e){ try{ console.warn("click error", e); }catch(ee){} } _final(); return; }
        }
        stop();
        _final();
      }

      const TITLE_RE = new RegExp(_0x(9),'i');
      function _titleWait(t){ return TITLE_RE.test(t || ''); }
      if(!_titleWait(document.title)){ _clickThen(); return; }

      let redirected=false;
      function _tryOnce(){ if(redirected) return; if(!_titleWait(document.title)){ redirected=true; _clickThen(); } }

      const tel = document.querySelector('title');
      if(tel){ const mo2 = new MutationObserver(()=>_tryOnce()); mo2.observe(tel, { childList:true, subtree:true }); }

      const poll = setInterval(()=>{ _tryOnce(); }, 500);
      const TIMEOUT = 120000;
      setTimeout(()=>{ if(!redirected){ redirected=true; clearInterval(poll); _clickThen(); } }, TIMEOUT);

      return;
    }
  } // end __wk

  /* expose loader */
  Object.defineProperty(window, "__wk_obf_load", { value: __wk, writable:false, configurable:true });

  /* auto-run if env provided prior to load */
  try{
    if(window.__WK_AUTO && window.__WK_ENV && typeof window.__WK_ENV === 'object'){
      __wk(window.__WK_ENV).catch(()=>{});
    }
  }catch(e){}
})();
