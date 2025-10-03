// ==UserScript==
// @name         my-site -> work.ink redirector
// @namespace    https://example.local/
// @version      1.0
// @description  From my-site.co/refresh?url=... -> go to work.ink, wait while title is "Just a moment", then navigate to the final url.
// @match        https://workink.vercel.app/refresh*
// @match        https://work.ink/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-start
// ==/UserScript==

(async function () {
    'use strict';

   
    function gmSet(key, value) {
        if (typeof GM_setValue === 'function') {
            try { GM_setValue(key, value); return Promise.resolve(); }
            catch (e) { return Promise.reject(e); }
        } else if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') {
            return GM.setValue(key, value);
        } else {
            return Promise.reject(new Error('No GM.setValue API available'));
        }
    }

    function gmGet(key, defaultValue = null) {
        if (typeof GM_getValue === 'function') {
            try {
                const v = GM_getValue(key);
                return Promise.resolve(v === undefined ? defaultValue : v);
            } catch (e) { return Promise.reject(e); }
        } else if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') {
            return GM.getValue(key, defaultValue);
        } else {
            return Promise.reject(new Error('No GM.getValue API available'));
        }
    }

    function gmDelete(key) {
        if (typeof GM_deleteValue === 'function') {
            try { GM_deleteValue(key); return Promise.resolve(); }
            catch (e) { return Promise.reject(e); }
        } else if (typeof GM !== 'undefined' && typeof GM.deleteValue === 'function') {
            return GM.deleteValue(key);
        } else {
            return Promise.reject(new Error('No GM.deleteValue API available'));
        }
    }

    const STORAGE_KEY = 'workink_redirect_dest';

    function extractUrlParamFromSearch(search) {
        try {
            const params = new URLSearchParams(search);
            let u = params.get('url');
            if (!u) return null;
            
            try { u = decodeURIComponent(u); } catch (e) {/* ignore */}
            return u;
        } catch (e) {
            return null;
        }
    }

    if (location.hostname === 'my-site.co' && location.pathname.startsWith('/refresh')) {
        const dest = extractUrlParamFromSearch(location.search);
        if (dest) {
            try {
                
                await gmSet(STORAGE_KEY, dest);
            } catch (err) {
                
                console.warn('GM storage failed, falling back to query param:', err);
                const encoded = encodeURIComponent(dest);
                location.href = 'https://work.ink/?__dest=' + encoded;
                return;
            }

            location.replace('https://work.ink/');
            return;
        } else {

            return;
        }
    }

    if (location.hostname === 'work.ink') {
        
        let dest = null;
        try {
            dest = await gmGet(STORAGE_KEY, null);
        } catch (e) {
            console.warn('GM.get failed:', e);
            dest = null;
        }

        
        if (!dest) {
            try {
                const params = new URLSearchParams(location.search);
                const maybe = params.get('__dest');
                if (maybe) dest = maybe;
            } catch (e) { /* ignore */ }
        }

        if (!dest) {
           
            return;
        }

        
        try {
            const parsed = new URL(dest, location.href);
            dest = parsed.href;
        } catch (e) {
            
            console.error('Destination URL looks invalid:', dest, e);
            await gmDelete(STORAGE_KEY).catch(()=>{});
            return;
        }

        
        async function finalRedirect() {
            try { await gmDelete(STORAGE_KEY); } catch (e) {/* ignore */}
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            window.location.href = dest;
        }

        
        function findAgreeButton() {
            try {
                
                let candidates = Array.from(document.querySelectorAll('button[mode="primary"][size="large"], button[mode="primary"], button[size="large"], button'));
                for (const b of candidates) {
                    try {
                        
                        const span = b.querySelector('span');
                        if (span && (span.textContent || '').trim().toUpperCase() === 'AGREE') return b;
                        
                        if ((b.textContent || '').trim().toUpperCase() === 'AGREE') return b;
                    } catch (e) { /* ignore per-element errors */ }
                }

               
                const spans = Array.from(document.querySelectorAll('span'));
                for (const s of spans) {
                    try {
                        if ((s.textContent || '').trim().toUpperCase() === 'AGREE') {
                            const p = s.closest('button');
                            if (p) return p;
                        }
                    } catch (e) { /* ignore */ }
                }

                return null;
            } catch (e) {
                return null;
            }
        }

        
        function performClick(el) {
            if (!el) return;
            try {
                el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
            } catch (e) { /* ignore */ }
            try {
                el.focus && el.focus();
            } catch (e) { /* ignore */ }

            
            try {
                el.click();
                return;
            } catch (e) { /* fallthrough to dispatch events */ }

            
            try {
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const evInit = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
                el.dispatchEvent(new MouseEvent('mouseover', evInit));
                el.dispatchEvent(new MouseEvent('mousemove', evInit));
                el.dispatchEvent(new MouseEvent('mousedown', evInit));
                el.dispatchEvent(new MouseEvent('mouseup', evInit));
                el.dispatchEvent(new MouseEvent('click', evInit));
            } catch (e) {
               
                try {
                    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                } catch (ee) { /* ignore */ }
            }
        }

        
        async function clickAgreeIfPresentThenRedirect() {
            const SEARCH_TIMEOUT_MS = 5000;
            const POLL_INTERVAL_MS = 250;
            let found = findAgreeButton();
            if (found) {
                try { performClick(found); } catch (e) { console.warn('click error', e); }
                
                finalRedirect();
                return;
            }

            
            let resolved = false;
            let mo;
            const stop = () => {
                if (mo) try { mo.disconnect(); } catch (e) {}
                resolved = true;
            };

            
            try {
                mo = new MutationObserver(() => {
                    if (resolved) return;
                    const f = findAgreeButton();
                    if (f) {
                        stop();
                        try { performClick(f); } catch (e) { console.warn('click error', e); }
                        finalRedirect();
                    }
                });
                mo.observe(document.documentElement || document.body || document, { childList: true, subtree: true });
            } catch (e) {
               
            }

            
            const start = Date.now();
            while (!resolved && (Date.now() - start) < SEARCH_TIMEOUT_MS) {
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                const f = findAgreeButton();
                if (f) {
                    stop();
                    try { performClick(f); } catch (e) { console.warn('click error', e); }
                    finalRedirect();
                    return;
                }
            }

            
            stop();
            finalRedirect();
        }

        
        const TITLE_BLOCKING_RE = /Just a/i;

        function titleIndicatesWaiting(t) {
            return TITLE_BLOCKING_RE.test(t || '');
        }

       
        if (!titleIndicatesWaiting(document.title)) {
            
            clickAgreeIfPresentThenRedirect();
            return;
        }


        let redirected = false;

        function tryMaybeRedirect() {
            if (redirected) return;
            if (!titleIndicatesWaiting(document.title)) {
                redirected = true;
                clickAgreeIfPresentThenRedirect();
            }
        }

        
        const titleEl = document.querySelector('title');
        if (titleEl) {
            const mo = new MutationObserver(() => tryMaybeRedirect());
            mo.observe(titleEl, { childList: true, subtree: true });
        }

       
        const pollInterval = setInterval(() => {
            tryMaybeRedirect();
        }, 500);

        
        const TIMEOUT_MS = 120000;
        setTimeout(() => {
            if (!redirected) {
                redirected = true;
                clearInterval(pollInterval);
                clickAgreeIfPresentThenRedirect();
            }
        }, TIMEOUT_MS);

        
        return;
    }

})();
