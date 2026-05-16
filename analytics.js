(function () {
    'use strict';

    var SITE_HOST = 'artacho.dev';
    var SESSION_KEY = 'artacho_session';
    var SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30min
    var pageStartTs = Date.now();
    var engagedTimer = null;
    var engagedFired = false;
    var timeOnPageSent = false;
    var scrollFired = { 25: false, 50: false, 75: false, 100: false };
    var sessionId = _ensureSessionId();

    function _isAdminSession() {
        try { return localStorage.getItem('artacho_admin') === '1'; } catch (_) { return false; }
    }

    function _ensureSessionId() {
        try {
            var raw = localStorage.getItem(SESSION_KEY);
            var now = Date.now();
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && parsed.id && (now - parsed.last < SESSION_TIMEOUT_MS)) {
                    parsed.last = now;
                    localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
                    return parsed.id;
                }
            }
            var id = _uuid();
            localStorage.setItem(SESSION_KEY, JSON.stringify({ id: id, last: now }));
            return id;
        } catch (_) { return null; }
    }

    function _touchSession() {
        try {
            var raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (parsed && parsed.id) {
                parsed.last = Date.now();
                localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
            }
        } catch (_) {}
    }

    function _uuid() {
        if (window.crypto && crypto.getRandomValues) {
            var arr = new Uint8Array(16);
            crypto.getRandomValues(arr);
            return Array.from(arr).map(function (b) {
                return b.toString(16).padStart(2, '0');
            }).join('');
        }
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
    }

    function send(event, meta, extras) {
        try {
            _touchSession();
            var params = new URLSearchParams(location.search);
            var adminFlag = _isAdminSession() ? { admin: true } : null;
            var mergedMeta = (adminFlag || meta) ? Object.assign({}, adminFlag, meta || {}) : null;
            var payload = JSON.stringify(Object.assign({
                event: event,
                path: location.pathname,
                referrer: document.referrer || null,
                utm_source:   params.get('utm_source')   || null,
                utm_medium:   params.get('utm_medium')   || null,
                utm_campaign: params.get('utm_campaign') || null,
                meta: mergedMeta,
                session_id: sessionId,
            }, extras || {}));
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
            } else {
                fetch('/api/track', { method: 'POST', body: payload,
                    headers: { 'Content-Type': 'application/json' }, keepalive: true });
            }
        } catch (_) {}
    }

    function getLinkTarget(anchor) {
        var href = anchor.href || '';
        if (/linkedin\.com/i.test(href))  return 'linkedin';
        if (/wa\.me|whatsapp/i.test(href)) return 'whatsapp';
        if (/github\.com/i.test(href))    return 'github';
        if (/mailto:/i.test(href))        return 'email';
        return null;
    }

    function _isExternal(href) {
        if (!href || href.charAt(0) === '#' || href.charAt(0) === '/') return false;
        if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;
        try {
            var u = new URL(href, location.href);
            if (!/^https?:/.test(u.protocol)) return false;
            var h = u.hostname.replace(/^www\./, '');
            return h !== SITE_HOST && h !== location.hostname.replace(/^www\./, '');
        } catch (_) { return false; }
    }

    function handleClick(e) {
        var el = e.target;
        while (el && el.tagName !== 'A') el = el.parentElement;
        if (!el) return;

        var href = el.getAttribute('href') || '';

        // Admin lock — cadeado do footer
        if (el.classList.contains('footer-admin-link') || (el.closest && el.closest('.footer-admin-link'))) {
            send('admin_lock_click');
        }

        // Project click — qualquer link dentro de um .project-card
        var projectCard = el.closest && el.closest('.project-card');
        if (projectCard) {
            var slug = projectCard.getAttribute('data-track-project') || 'unknown';
            var isInternal = href.startsWith('/') || (href.indexOf(location.host) !== -1 && /^https?:/.test(href));
            var sub = (el.matches && el.matches('.project-repo-link')) ? 'repo' : 'main';
            send('project_click', { project: slug, type: isInternal ? 'internal' : 'external', sub: sub });
        }

        // CV download click
        if (href === '/cv' || href.startsWith('/cv') || /\/api\/cv\/download/i.test(href)) {
            send('cv_download_click');
            return;
        }

        // Case open
        if (/estudo-caso-pagamentos|cenario-tecnico-qa/i.test(href)) {
            send('case_open', { case: href.replace(/\.html.*/, '').split('/').pop() });
            return;
        }

        // Contact click
        var target = getLinkTarget(el);
        if (target) {
            var loc = el.getAttribute('data-track-location')
                || (el.closest && el.closest('[data-track-location]') && el.closest('[data-track-location]').getAttribute('data-track-location'))
                || 'unknown';
            send('contact_click', { target: target, location: loc });
            return;
        }

        // Outbound click — qualquer link externo não coberto acima
        if (_isExternal(href)) {
            try {
                var u = new URL(href, location.href);
                send('outbound_click', { host: u.hostname.replace(/^www\./, '') });
            } catch (_) {}
        }
    }

    function handleButtonClick(e) {
        var el = e.target;
        while (el && el.tagName !== 'BUTTON') el = el.parentElement;
        if (!el) return;

        if (el.classList.contains('cv-btn--email') || el.closest('[data-analytics="email-request"]')) {
            send('email_request');
            var loc = (el.closest && el.closest('[data-track-location]') && el.closest('[data-track-location]').getAttribute('data-track-location')) || null;
            if (loc) send('contact_click', { target: 'email', location: loc });
        }
    }

    function startEngagedTimer() {
        if (engagedTimer || engagedFired) return;
        engagedTimer = setTimeout(function () {
            if (!engagedFired) {
                engagedFired = true;
                send('engaged');
            }
        }, 30000);
    }

    function cancelEngagedTimer() {
        if (engagedTimer) {
            clearTimeout(engagedTimer);
            engagedTimer = null;
        }
    }

    function handleScroll() {
        var doc = document.documentElement;
        var sh = doc.scrollHeight - doc.clientHeight;
        if (sh <= 0) return;
        var pct = Math.round((doc.scrollTop || document.body.scrollTop) / sh * 100);
        var levels = [25, 50, 75, 100];
        for (var i = 0; i < levels.length; i++) {
            if (pct >= levels[i] && !scrollFired[levels[i]]) {
                scrollFired[levels[i]] = true;
                send('scroll_depth', { pct: levels[i] }, { scroll_max_pct: levels[i] });
            }
        }
    }

    function sendTimeOnPage() {
        if (timeOnPageSent) return;
        timeOnPageSent = true;
        var ms = Date.now() - pageStartTs;
        if (ms < 250) return;
        var maxScroll = 0;
        [25, 50, 75, 100].forEach(function (l) { if (scrollFired[l] && l > maxScroll) maxScroll = l; });
        send('time_on_page', null, { time_on_page_ms: ms, scroll_max_pct: maxScroll });
    }

    function handlePrint() {
        send('print_attempt');
    }

    document.addEventListener('DOMContentLoaded', function () {
        send('pageview');

        // Evento secundário para a página de CV — diferencia view-only de download
        if (/\/cv(\.html)?$/.test(location.pathname) || location.pathname === '/cv') {
            send('cv_view');
        }

        startEngagedTimer();
        document.addEventListener('click', handleClick, true);
        document.addEventListener('click', handleButtonClick, true);
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('beforeprint', handlePrint);
    });

    window.addEventListener('pagehide', function () {
        cancelEngagedTimer();
        sendTimeOnPage();
    });
    window.addEventListener('beforeunload', function () {
        cancelEngagedTimer();
        sendTimeOnPage();
    });
})();
