import { chromium } from '@playwright/test';
import { mkdir } from 'fs/promises';

const BASE = process.env.AUDIT_BASE_URL || 'http://localhost:8787';
const VIEWPORTS = [
    { name: 'mobile',  width: 375,  height: 812 },
    { name: 'tablet',  width: 768,  height: 1024 },
    { name: 'desktop', width: 1440, height: 900  },
];
const PAGES = [
    { slug: 'index',      path: '/'                          },
    { slug: 'pagamentos', path: '/estudo-caso-pagamentos.html' },
    { slug: 'cenario',    path: '/cenario-tecnico-qa.html'    },
    { slug: 'cv',         path: '/cv.html'                    },
];

await mkdir('audit-screenshots', { recursive: true });

const browser = await chromium.launch();
const failures = [];

for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();

    for (const pg of PAGES) {
        await page.goto(`${BASE}${pg.path}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(800);

        await page.screenshot({
            path: `audit-screenshots/${pg.slug}--${vp.name}.png`,
            fullPage: true,
        });

        const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
        const status = overflow ? '❌ OVERFLOW' : '✅';
        console.log(`[${vp.name.padEnd(7)}] ${pg.path.padEnd(40)} ${status}`);

        if (overflow) failures.push(`overflow: ${vp.name} ${pg.path}`);

        if (vp.width <= 767) {
            const hamburgerExists = (await page.locator('#hamburger').count()) > 0;
            if (hamburgerExists) {
                const visible = await page.locator('#hamburger').isVisible().catch(() => false);
                const hStatus = visible ? '✅' : '❌ HIDDEN';
                console.log(`[${vp.name.padEnd(7)}] hamburger ${hStatus}`);
                if (!visible) failures.push(`hamburger hidden: ${vp.name} ${pg.path}`);
            }
        }
    }

    if (vp.name === 'desktop') {
        await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        const href = await page.locator('.project-primary .project-overlay-link').first()
            .getAttribute('href').catch(() => null);
        console.log(`[desktop ] project-primary card href: ${href ?? '❌ NOT FOUND'}`);
        if (!href) failures.push('project-primary card href missing');

        const zIndex = await page.locator('.project-repo-link').first()
            .evaluate(el => window.getComputedStyle(el).zIndex).catch(() => null);
        console.log(`[desktop ] project-repo-link z-index: ${zIndex ?? '❌ NOT FOUND'}`);
    }

    await ctx.close();
}

await browser.close();
console.log(`\nScreenshots saved to ./audit-screenshots/`);

if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} failure(s):`);
    for (const f of failures) console.error(`   • ${f}`);
    process.exit(1);
} else {
    console.log(`✅ All checks passed.`);
}
