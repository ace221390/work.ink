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
            try { u = decodeURIComponent(u); } catch (e) {}
            return u;
        } catch (e) {
            return null;
        }
    }

    function _createRedirectNotice(dest) {
        try {
            const existing = document.getElementById('wk-redirect-notice');
            if (existing) {
                try { existing.remove(); } catch (e) {}
            }

            const container = document.createElement('div');
            container.id = 'wk-redirect-notice';
            container.style.position = 'fixed';
            container.style.top = '12px';
            container.style.left = '50%';
            container.style.transform = 'translateX(-50%) translateY(-6px)';
            container.style.zIndex = '2147483647';
            container.style.maxWidth = '92%';
            container.style.width = 'min(880px, 94%)';
            container.style.boxSizing = 'border-box';
            container.style.padding = '10px 14px';
            container.style.borderRadius = '12px';
            container.style.backdropFilter = 'saturate(120%) blur(6px)';
            container.style.boxShadow = '0 8px 28px rgba(15,23,42,0.35)';
            container.style.color = '#fff';
            container.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
            container.style.fontSize = '13px';
            container.style.lineHeight = '1.2';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'space-between';
            container.style.gap = '12px';
            container.style.opacity = '0';
            container.style.transition = 'opacity 260ms ease, transform 260ms ease';
            container.style.background = 'linear-gradient(90deg,#6a11cb 0%,#2575fc 100%)';

            const message = document.createElement('div');
            message.style.flex = '1 1 auto';
            message.style.overflow = 'hidden';
            message.style.textOverflow = 'ellipsis';
            message.style.whiteSpace = 'nowrap';
            message.style.paddingRight = '8px';

            const label = document.createElement('strong');
            label.textContent = 'Redirecting — ';
            label.style.fontWeight = '600';
            label.style.marginRight = '6px';
            label.style.display = 'inline-block';
            label.style.verticalAlign = 'baseline';

            const destText = document.createElement('span');
            const shortDest = (typeof dest === 'string' ? dest : '') || '';
            try {
                const parsed = new URL(shortDest, location.href);
                destText.textContent = parsed.href;
            } catch (e) {
                destText.textContent = shortDest;
            }
            destText.style.opacity = '0.95';
            destText.style.fontWeight = '500';
            destText.style.fontSize = '13px';
            destText.style.display = 'inline-block';
            destText.style.verticalAlign = 'baseline';
            destText.style.overflow = 'hidden';
            destText.style.textOverflow = 'ellipsis';
            destText.style.maxWidth = '76%';

            message.appendChild(label);
            message.appendChild(destText);

            const info = document.createElement('div');
            info.style.marginLeft = '12px';
            info.style.fontSize = '12px';
            info.style.opacity = '0.95';

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.setAttribute('aria-label', 'Dismiss redirect notice');
            closeBtn.textContent = '×';
            closeBtn.style.background = 'transparent';
            closeBtn.style.border = 'none';
            closeBtn.style.color = 'rgba(255,255,255,0.95)';
            closeBtn.style.fontSize = '18px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.padding = '0 6px';
            closeBtn.style.lineHeight = '1';
            closeBtn.style.marginLeft = '8px';
            closeBtn.style.flex = '0 0 auto';
            closeBtn.style.opacity = '0.95';

            closeBtn.addEventListener('click', function () {
                try { container.remove(); } catch (e) {}
            }, { passive: true });

            container.appendChild(message);
            container.appendChild(info);
            container.appendChild(closeBtn);

            const parent = document.documentElement || document.body || document;
            try {
                parent.appendChild(container);
            } catch (e) {
                try { (document.body || document.head || document).appendChild(container); } catch (ee) {}
            }

            requestAnimationFrame(() => {
                container.style.opacity = '1';
                container.style.transform = 'translateX(-50%) translateY(0)';
            });

            let countdown = 2;
            info.textContent = `will redirect in ${countdown}s`;
            const interval = setInterval(() => {
                countdown -= 1;
                if (countdown <= 0) {
                    clearInterval(interval);
                    try { info.textContent = 'redirecting…'; } catch (e) {}
                } else {
                    try { info.textContent = `will redirect in ${countdown}s`; } catch (e) {}
                }
            }, 1000);

            return {
                remove: () => {
                    try {
                        container.style.opacity = '0';
                        container.style.transform = 'translateX(-50%) translateY(-6px)';
                        setTimeout(()=>{ try { container.remove(); } catch (e) {} }, 300);
                        clearInterval(interval);
                    } catch (e) {}
                }
            };
        } catch (e) {
            return { remove: ()=>{} };
        }
    }

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
            } catch (e) { }
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
            try { await gmDelete(STORAGE_KEY); } catch (e) {}
            const notice = _createRedirectNotice(dest);
            try {
                await new Promise(resolve => setTimeout(resolve, 2000));
            } finally {
                try { notice.remove(); } catch (e) {}
            }
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
                    } catch (e) { }
                }

                const spans = Array.from(document.querySelectorAll('span'));
                for (const s of spans) {
                    try {
                        if ((s.textContent || '').trim().toUpperCase() === 'AGREE') {
                            const p = s.closest('button');
                            if (p) return p;
                        }
                    } catch (e) { }
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
            } catch (e) { }
            try {
                el.focus && el.focus();
            } catch (e) { }

            try {
                el.click();
                return;
            } catch (e) { }

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
                } catch (ee) { }
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
            } catch (e) { }

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
