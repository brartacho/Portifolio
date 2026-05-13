(function () {
    'use strict';

    var engagedTimer = null;
    var engagedFired = false;

    function send(event, meta) {
        try {
            var params = new URLSearchParams(location.search);
            var payload = JSON.stringify({
                event: event,
                path: location.pathname,
                referrer: document.referrer || null,
                utm_source:   params.get('utm_source')   || null,
                utm_medium:   params.get('utm_medium')   || null,
                utm_campaign: params.get('utm_campaign') || null,
                meta: meta || null,
            });
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

    function handleClick(e) {
        var el = e.target;
        // Sobe na árvore até encontrar um <a>
        while (el && el.tagName !== 'A') el = el.parentElement;
        if (!el) return;

        var href = el.getAttribute('href') || '';

        // CV download click: links para /cv ou tokens de download
        if (href === '/cv' || href.startsWith('/cv') || /\/api\/cv\/download/i.test(href)) {
            send('cv_download_click');
            return;
        }

        // Case open: links para os estudos de caso
        if (/estudo-caso-pagamentos|cenario-tecnico-qa/i.test(href)) {
            send('case_open', { case: href.replace(/\.html.*/, '').split('/').pop() });
            return;
        }

        // Contact click: redes sociais, email, github
        var target = getLinkTarget(el);
        if (target) {
            send('contact_click', { target: target });
            return;
        }
    }

    function handleButtonClick(e) {
        var el = e.target;
        while (el && el.tagName !== 'BUTTON') el = el.parentElement;
        if (!el) return;

        // Botão "Solicitar por email" em cv.html
        if (el.classList.contains('cv-btn--email') || el.closest('[data-analytics="email-request"]')) {
            send('email_request');
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

    document.addEventListener('DOMContentLoaded', function () {
        send('pageview');
        startEngagedTimer();
        document.addEventListener('click', handleClick, true);
        document.addEventListener('click', handleButtonClick, true);
    });

    // Cancela timer se o usuário sair antes dos 30s
    window.addEventListener('pagehide', cancelEngagedTimer);
    window.addEventListener('beforeunload', cancelEngagedTimer);
})();
