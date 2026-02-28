/**
 * Portfolio ARTACHO.dev - JS
 * Focado puramente em interações de interface e animações leves.
 */

function init() {
    bindUIEvents();
    handleProfileImageLoad();

    // Inicia o efeito typewriter buscando a string segura via data-text
    const nameEl = document.getElementById('name-header');
    if (nameEl) typeWriter(nameEl);
}

/**
 * Animação de digitação de texto
 * @param {HTMLElement} el - Elemento alvo (h1)
 */
function typeWriter(el) {
    const text = el.getAttribute('data-text') || el.textContent;
    el.textContent = '';

    // Array.from garante que emojis ou caracteres compostos não quebrem
    const chars = Array.from(text);
    chars.forEach((c, i) => {
        setTimeout(() => { el.textContent += c; }, i * 80);
    });
}

/**
 * Gerencia a entrada suave (Fade/Blur-in) da imagem de perfil.
 * Evita o 'pulo' (FOUC) aguardando o carregamento completo na rede ou cache.
 */
function handleProfileImageLoad() {
    const img = document.querySelector('.profile-img');
    if (!img) return;

    const triggerFadeIn = () => {
        // Força o navegador a aplicar o CSS inicial antes de injetar a classe final
        requestAnimationFrame(() => {
            img.classList.add('loaded');
        });
    };

    // Se a imagem já estiver no cache, dispara imediatamente
    if (img.complete && img.naturalHeight !== 0) {
        triggerFadeIn();
    } else {
        // Caso contrário, aguarda o download completo
        img.addEventListener('load', triggerFadeIn);
        img.addEventListener('error', triggerFadeIn); // Fallback em caso de erro
    }
}

/**
 * Central de Eventos: Focada APENAS em abrir/fechar o menu mobile.
 * O Scroll agora é 100% nativo e controlado pelo CSS (scroll-padding-top).
 */
function bindUIEvents() {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    const overlay = document.getElementById('menuOverlay');

    // ⚙️ MANUTENÇÃO: Selecionamos tanto os links da lista quanto a Logo
    const navItems = document.querySelectorAll('.nav-links a, .logo');

    function closeMenu() {
        hamburger.classList.remove('active');
        navLinks.classList.remove('active');
        overlay.classList.remove('active');
        document.body.classList.remove('menu-open');
    }

    // Fecha o menu mobile ao clicar em qualquer link interno
    navItems.forEach(link => {
        link.addEventListener('click', () => {
            // Verifica se está no mobile (se o hamburguer está visível)
            const isMobile = window.getComputedStyle(hamburger).display !== 'none';
            if (isMobile) {
                closeMenu();
            }
            // ⚠️ Importante: Sem 'e.preventDefault()' aqui!
            // Deixamos o navegador fazer a rolagem usando a regra de scroll-padding do CSS.
        });
    });

    // Toggle do menu mobile ao clicar no ícone Hamburguer
    hamburger.addEventListener('click', (e) => {
        e.stopPropagation(); // Impede propagação de clique que fecharia o menu acidentalmente
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.classList.toggle('menu-open');
    });

    // Permite fechar clicando na área escura de fundo (overlay)
    overlay.addEventListener('click', closeMenu);
}

// Inicializa a aplicação
init();