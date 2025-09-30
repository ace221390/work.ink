// ==UserScript==
// @name         my-site -> work.ink redirector
// @namespace    https://example.local/
// @version      1.0
// @description  From my-site.co/refresh?url=... -> go to work.ink, wait while title is "Just a moment", then navigate to the final url.
// @match        https://my-site.co/refresh*
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

    // --- compatibility wrappers for GM storage (supports older GM_setValue and new GM.setValue) ---
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

    // Helper: decode and normalize the incoming "url=" parameter
    function extractUrlParamFromSearch(search) {
        try {
            const params = new URLSearchParams(search);
            let u = params.get('url');
            if (!u) return null;
            // If it looks double-encoded, decode once
            try { u = decodeURIComponent(u); } catch (e) {/* ignore */}
            return u;
        } catch (e) {
            return null;
        }
    }

    // If we're on my-site.co/refresh?url=...
    if (location.hostname === 'my-site.co' && location.pathname.startsWith('/refresh')) {
        const dest = extractUrlParamFromSearch(location.search);
        if (dest) {
            try {
                // store the target URL so we can pick it up on work.ink
                await gmSet(STORAGE_KEY, dest);
            } catch (err) {
                // storing failed — fallback: attach target as query param to work.ink
                console.warn('GM storage failed, falling back to query param:', err);
                const encoded = encodeURIComponent(dest);
                location.href = 'https://work.ink/?__dest=' + encoded;
                return;
            }
            // go to work.ink
            // use replace so there's no extra history entry for the refresh page
            location.replace('https://work.ink/');
            return;
        } else {
            // no url param — nothing to do
            return;
        }
    }

    // If we're on work.ink
    if (location.hostname === 'work.ink') {
        // first try to read stored destination from GM storage
        let dest = null;
        try {
            dest = await gmGet(STORAGE_KEY, null);
        } catch (e) {
            console.warn('GM.get failed:', e);
            dest = null;
        }

        // fallback: maybe my-site attached as ?__dest=... on the work.ink URL
        if (!dest) {
            try {
                const params = new URLSearchParams(location.search);
                const maybe = params.get('__dest');
                if (maybe) dest = maybe;
            } catch (e) { /* ignore */ }
        }

        if (!dest) {
            // nothing to do
            return;
        }

        // ensure dest looks like an absolute URL; if not, attempt to normalize
        try {
            const parsed = new URL(dest, location.href);
            dest = parsed.href;
        } catch (e) {
            // if invalid URL, abort
            console.error('Destination URL looks invalid:', dest, e);
            await gmDelete(STORAGE_KEY).catch(()=>{});
            return;
        }

        // helper to perform the final redirect and clean up
        async function finalRedirect() {
            try { await gmDelete(STORAGE_KEY); } catch (e) {/* ignore */}
            // wait 2 seconds before navigating to the final destination
            await new Promise(resolve => setTimeout(resolve, 2000));
            // navigate to the final destination
            window.location.href = dest;
        }

        // Robust finder for the AGREE button (returns element or null)
        function findAgreeButton() {
            try {
                // 1) Exact-attribute candidates first
                let candidates = Array.from(document.querySelectorAll('button[mode="primary"][size="large"], button[mode="primary"], button[size="large"], button'));
                for (const b of candidates) {
                    try {
                        // check for a span child whose text is AGREE
                        const span = b.querySelector('span');
                        if (span && (span.textContent || '').trim().toUpperCase() === 'AGREE') return b;
                        // sometimes text sits directly in the button
                        if ((b.textContent || '').trim().toUpperCase() === 'AGREE') return b;
                    } catch (e) { /* ignore per-element errors */ }
                }

                // 2) Broader search by span text anywhere
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

        // attempt to click the button robustly
        function performClick(el) {
            if (!el) return;
            try {
                el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
            } catch (e) { /* ignore */ }
            try {
                el.focus && el.focus();
            } catch (e) { /* ignore */ }

            // Try native click first
            try {
                el.click();
                return;
            } catch (e) { /* fallthrough to dispatch events */ }

            // dispatch a realistic sequence of mouse events
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
                // last resort: try keyboard activation
                try {
                    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                } catch (ee) { /* ignore */ }
            }
        }

        // new helper: try to detect AGREE button (immediately or as it appears), click it, then call finalRedirect (which waits 2s)
        async function clickAgreeIfPresentThenRedirect() {
            const SEARCH_TIMEOUT_MS = 5000; // how long to wait for the button to appear
            const POLL_INTERVAL_MS = 250;
            let found = findAgreeButton();
            if (found) {
                try { performClick(found); } catch (e) { console.warn('click error', e); }
                // call finalRedirect (which itself will wait 2s before navigating)
                finalRedirect();
                return;
            }

            // If not found yet, set up a MutationObserver + poll as fallback
            let resolved = false;
            let mo;
            const stop = () => {
                if (mo) try { mo.disconnect(); } catch (e) {}
                resolved = true;
            };

            // observe changes to catch dynamically inserted buttons
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
                // if observer can't be created, we'll rely on polling
            }

            // Polling fallback until timeout
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

            // timeout reached, clean up and proceed to finalRedirect without clicking
            stop();
            finalRedirect();
        }

        // check current title
        const TITLE_BLOCKING_RE = /Just a/i;

        function titleIndicatesWaiting(t) {
            return TITLE_BLOCKING_RE.test(t || '');
        }

        // If the title does not contain "Just a moment", redirect immediately
        if (!titleIndicatesWaiting(document.title)) {
            // try to click AGREE if present (the helper will wait briefly for the button), then final redirect
            clickAgreeIfPresentThenRedirect();
            return;
        }

        // Otherwise wait until the title changes to something without "Just a moment".
        // We'll observe the <title> element (if present) and also poll as a fallback.
        let redirected = false;

        function tryMaybeRedirect() {
            if (redirected) return;
            if (!titleIndicatesWaiting(document.title)) {
                redirected = true;
                clickAgreeIfPresentThenRedirect();
            }
        }

        // observe <title> element for changes
        const titleEl = document.querySelector('title');
        if (titleEl) {
            const mo = new MutationObserver(() => tryMaybeRedirect());
            mo.observe(titleEl, { childList: true, subtree: true });
        }

        // poll every 500ms as an extra fallback
        const pollInterval = setInterval(() => {
            tryMaybeRedirect();
        }, 500);

        // safety: after TIMEOUT_MS we will give up waiting and redirect anyway
        const TIMEOUT_MS = 120000; // 2 minutes
        setTimeout(() => {
            if (!redirected) {
                redirected = true;
                clearInterval(pollInterval);
                clickAgreeIfPresentThenRedirect();
            }
        }, TIMEOUT_MS);

        // also stop polling once redirected
        // (finalRedirect will navigate away, but keep good housekeeping)
        // note: finalRedirect uses window.location so script will unload shortly after
        return;
    }

})();
