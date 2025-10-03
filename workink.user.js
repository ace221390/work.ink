// ==UserScript==
// @name         my-site -> work.ink redirector (auto-scan current tab)
// @namespace    https://example.local/
// @version      1.2
// @description  From my-site.co/refresh?url=... -> go to work.ink, wait while title is "Just a moment", then navigate to the final url. Now scans current page immediately and signals other tabs to scan too.
// @match        https://workink.vercel.app/refresh*
// @match        https://work.ink/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @connect      *
// @run-at       document-start
// ==/UserScript==

(async function () {
    'use strict';

    // -------------------------
    // GM wrappers (unchanged)
    // -------------------------
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
    const SCAN_FLAG_KEY = '__wk_scan_request';

    // -------------------------
    // Utility helpers
    // -------------------------
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

    function openWorkInkPreferNewTab(urlWithQuery) {
        // urlWithQuery optional: if provided, open `https://work.ink/?__dest=...`
        try {
            const target = urlWithQuery || 'https://work.ink/';
            const w = window.open(target, '_blank');
            if (!w) location.replace(target);
            else try { w.focus(); } catch (e) { /* ignore */ }
        } catch (e) {
            try { location.replace(urlWithQuery || 'https://work.ink/'); } catch (ee) { /* ignore */ }
        }
    }

    // The original behavior when visiting a /refresh link: store dest and open work.ink
    async function handleRefreshHref(href) {
        try {
            // extract url param
            const idx = href.indexOf('?');
            const search = idx >= 0 ? href.slice(idx) : '';
            const dest = extractUrlParamFromSearch(search);
            if (!dest) return false;
            try {
                await gmSet(STORAGE_KEY, dest);
            } catch (err) {
                // fallback: open work.ink with encoded __dest param
                console.warn('GM storage failed, falling back to query param:', err);
                const encoded = encodeURIComponent(dest);
                openWorkInkPreferNewTab('https://work.ink/?__dest=' + encoded);
                return true;
            }
            openWorkInkPreferNewTab(); // open work.ink so that tab will do the final redirect work
            return true;
        } catch (e) {
            return false;
        }
    }

    // Scan DOM for anchors/buttons that point to /refresh?url=... or to work.ink with __dest.
    async function scanPageForCandidates() {
        try {
            const found = [];

            // 1) anchors with /refresh?url=
            try {
                const anchors = Array.from(document.querySelectorAll('a[href]'));
                for (const a of anchors) {
                    try {
                        const href = a.href || (a.getAttribute && a.getAttribute('href')) || '';
                        if (!href) continue;
                        // normalize: look for workink.vercel.app refresh or workink domain or other refresh patterns
                        if (/\/\/(?:workink\.vercel\.app|work\.ink)\/refresh/i.test(href) ||
                            /\/refresh\?/.test(href) ||
                            /workink\.vercel\.app\/refresh/i.test(href)) {
                            found.push({type:'refresh-link', href});
                        }
                        // work.ink with __dest
                        if (/work\.ink\/\?__dest=/.test(href)) {
                            found.push({type:'workink-dest-link', href});
                        }
                    } catch(e){}
                }
            } catch (e) {}

            // 2) buttons or elements with data-href or onclick anchors (simple heuristic)
            try {
                const buttons = Array.from(document.querySelectorAll('button[data-href], [data-url]'));
                for (const b of buttons) {
                    try {
                        const href = b.getAttribute('data-href') || b.getAttribute('data-url') || '';
                        if (!href) continue;
                        if (/\/refresh\?/.test(href) || /work\.ink\/\?__dest=/.test(href)) found.push({type:'refresh-link', href});
                    } catch(e){}
                }
            } catch (e) {}

            // 3) meta refresh tag
            try {
                const metas = Array.from(document.querySelectorAll('meta[http-equiv="refresh"]'));
                for (const m of metas) {
                    try {
                        const c = m.getAttribute('content') || '';
                        const murl = c.split(';').slice(1).join(';').replace(/^\s*url=/i, '').trim();
                        if (murl) {
                            if (/\/refresh\?/.test(murl) || /work\.ink\/\?__dest=/.test(murl)) found.push({type:'meta-refresh', href: murl});
                        }
                    } catch(e){}
                }
            } catch (e) {}

            // 4) page text that directly contains a refresh URL (raw text search)
            try {
                const text = (document.body && document.body.innerText) || '';
                const re = /(https?:\/\/[^\s'"]*(?:workink\.vercel\.app|work\.ink)[^\s'"]*\/refresh[^\s'"]*)/i;
                const m = text.match(re);
                if (m && m[1]) found.push({type:'text-found', href: m[1]});
            } catch (e) {}

            if (found.length === 0) return false;

            // Process discovered candidates sequentially; stop if a candidate triggers action
            for (const f of found) {
                try {
                    const ok = await handleRefreshHref(f.href);
                    if (ok) return true;
                } catch(e){}
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    // -------------------------
    // Immediate actions when script loads in this tab (no refresh required)
    // -------------------------
    // 1) Run the original logic on this page (if page is matching host/path)
    //    (We keep the original code below and it will run normally.)
    // 2) Additionally, scan the page for refresh links and act immediately.
    // 3) Signal other already-running instances via GM_setValue so they can self-scan.

    // Signal other instances (tabs where the script is already running)
    async function signalOtherTabsToScan() {
        try {
            // write a timestamp value to cause other instances (that listen) to wake up
            await gmSet(SCAN_FLAG_KEY, Date.now());
        } catch (e) {
            // ignore
        }
    }

    // If GM_addValueChangeListener is available, set up listener so other instances can notify this tab
    try {
        if (typeof GM_addValueChangeListener === 'function') {
            // Note: GM_addValueChangeListener(callback) signature varies by manager; Tampermonkey supports key-based listener
            // We'll attempt both possible usages.
            try {
                // Tampermonkey style: GM_addValueChangeListener(key, callback)
                GM_addValueChangeListener(SCAN_FLAG_KEY, (name, oldVal, newVal, remote) => {
                    // remote === true if another tab changed it
                    // perform immediate scan
                    try { scanPageForCandidates(); } catch(e){}
                });
            } catch (e) {
                // fallback: general signature GM_addValueChangeListener(callback)
                try {
                    GM_addValueChangeListener((name, oldVal, newVal, remote) => {
                        if (name === SCAN_FLAG_KEY) try { scanPageForCandidates(); } catch(e){}
                    });
                } catch (ee) {
                    // ignore if not supported
                }
            }
        }
    } catch (e) {
        // ignore
    }

    // Add a lightweight UI trigger to let user scan this tab on demand
    function addFloatingScanButton() {
        try {
            if (document.getElementById('__wk_scan_btn')) return;
            const btn = document.createElement('button');
            btn.id = '__wk_scan_btn';
            btn.textContent = 'Scan⋯';
            Object.assign(btn.style, {
                position: 'fixed',
                right: '8px',
                bottom: '8px',
                zIndex: 2147483647,
                background: '#0b84ff',
                color: 'white',
                border: 'none',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                opacity: '0.85'
            });
            btn.title = 'Scan this page for work.ink refresh links';
            btn.addEventListener('click', async (ev) => {
                try {
                    btn.textContent = 'Scanning…';
                    await scanPageForCandidates();
                } catch (e) {}
                setTimeout(()=>{ btn.textContent = 'Scan⋯'; }, 1200);
            });
            document.documentElement.appendChild(btn);
            // remove after 90s to avoid lingering UI if you don't like it
            setTimeout(()=>{ try{ btn.remove(); } catch(e){} }, 90000);
        } catch (e) {
            // ignore
        }
    }

    // Register Tampermonkey menu command for manual scan (if available)
    try {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('Scan page for work.ink links', async () => {
                await scanPageForCandidates();
                try { alert('Scan complete'); } catch (e) {}
            });
        }
    } catch (e) { /* ignore */ }

    // Run immediate scan on script load for this tab
    try {
        // If the page itself is a /refresh or work.ink page, the existing main logic below will run.
        // We still do an extra DOM scan in case the page contains links to refresh targets.
        (async () => {
            // small delay to allow DOM to be present (0ms still helps)
            await new Promise(r => setTimeout(r, 0));
            try { addFloatingScanButton(); } catch(e){}
            try { await scanPageForCandidates(); } catch(e){}
            // signal others to scan (if any are already running)
            try { await signalOtherTabsToScan(); } catch(e){}
            // set 'installed' indicator so we know script has run at least once here
            try { await gmSet('__wk_installed_at', Date.now()); } catch(e){}
        })();
    } catch (e) {
        // ignore
    }

    // -------------------------
    // ---- ORIGINAL LOGIC ----
    // Keep original behavior below exactly as you provided, unchanged.
    // It will run normally on matching pages (workink.vercel.app/refresh* and work.ink/*).
    // -------------------------

    if (location.hostname === 'workink.vercel.app' && location.pathname.startsWith('/refresh')) {
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
