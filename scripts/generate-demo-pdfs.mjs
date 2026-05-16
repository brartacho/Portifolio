// ============================================================
// Gera 5 variações de currículo do candidato fictício "Jon Snow"
// como QA Engineer, cada uma adaptada a um tipo de vaga.
// Estrutura de currículo real + easter eggs sutis de Game of Thrones.
//
// Uso: node scripts/generate-demo-pdfs.mjs
// Output: projeto-sistema-admin-assets/cv-jon-snow-*.pdf
// ============================================================
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'projeto-sistema-admin-assets');

const NOME = 'JON SNOW';
const EMAIL = 'jon.snow@demo.artacho.dev';
const TELEFONE = '+55 11 99999-0001';
const LOCAL = 'Westeros, BR · Disponível para remoto';
const FORMACAO = 'Universidade de Vila Castelo · Bacharel em Ciência da Computação';
const COR = rgb(0.13, 0.55, 0.78); // azul Patrulha

const CVS = [
    {
        slug: 'qa-senior',
        cargo: 'Analista de QA Sênior',
        resumo: 'QA Engineer com 7 anos de experiência em automação de testes e qualidade de software. Especialista em construir estratégias de teste do zero, mentoria de times e shift-left testing. Sei que nada sei — exceto que código sem testes é Caminhante Branco esperando entrar em produção.',
        experiencias: [
            ['Patrulha da Noite Tech · 2021 - presente', 'QA Engineer Sênior', 'Lidera estratégia de qualidade para 4 squads. Implementou framework de testes E2E reduzindo bugs em produção em 67%. Mentorou 3 QAs juniors. Conduz code review de pipelines CI/CD.'],
            ['Castelo Negro Systems · 2019 - 2021', 'Analista de QA Pleno', 'Migrou suíte legada de Selenium para Playwright (450+ casos). Estabeleceu cultura de testes shift-left. Liderou guild de qualidade da empresa.'],
            ['Winterfell Software · 2017 - 2019', 'Analista de QA Júnior', 'Testes manuais e exploratórios. Documentação de casos de teste em Jira/Zephyr. Primeiros scripts de automação em Cypress.'],
        ],
        stack: ['Playwright', 'Selenium WebDriver', 'Postman / Newman', 'CI/CD (GitHub Actions, Jenkins)', 'SQL (Postgres, MySQL)', 'Git', 'Jira / Zephyr', 'BDD (Cucumber, Gherkin)'],
        idiomas: ['Português · Nativo', 'Inglês · Intermediário'],
    },
    {
        slug: 'qa-auto',
        cargo: 'QA Automation Engineer · Remoto',
        resumo: 'Especialista em automação de testes ponta a ponta com forte experiência em trabalho 100% remoto desde 2020. Foco em pipelines CI/CD robustos, paralelização e relatórios acionáveis. Operou além da Muralha (squads Brasil/EUA) detectando 247 Caminhantes Brancos antes da produção.',
        experiencias: [
            ['Castelo Negro Remote · 2022 - presente', 'Senior QA Automation Engineer', 'Construiu framework de automação E2E em Playwright + TypeScript. Reduziu tempo de regressão de 6h para 22min via paralelização. Integração com Slack/PagerDuty para alertas instantâneos.'],
            ['Selvagens Software · 2020 - 2022', 'QA Automation Pleno', 'Automatizou suíte mobile (Appium) e API (RestAssured). Implementou testes de contrato com Pact. Setup de Docker para ambientes efêmeros.'],
            ['Torre Cinza Tech · 2018 - 2020', 'QA Junior', 'Início em automação com Cypress. Cobertura de smoke tests em 87% dos fluxos críticos.'],
        ],
        stack: ['Playwright + TypeScript', 'Selenium Grid', 'Cypress', 'Appium', 'RestAssured', 'Pact (Contract Testing)', 'k6 (load testing)', 'Docker', 'GitHub Actions', 'Allure Reports'],
        idiomas: ['Português · Nativo', 'Inglês · Avançado (daily stand-ups internacionais)'],
    },
    {
        slug: 'sdet',
        cargo: 'SDET · Mercado Financeiro',
        resumo: 'Software Development Engineer in Test com foco em fintechs e sistemas de alta disponibilidade. Profundo conhecimento em testes de API, performance e segurança. O Banco de Ferro sempre paga suas dívidas — e meus testes sempre detectam regressões antes do release.',
        experiencias: [
            ['Braavos Fintech S.A. · 2022 - presente', 'SDET Sênior', 'Desenhou estratégia de testes para plataforma de pagamentos PIX processando 2M tx/dia. Implementou contract testing entre 14 microsserviços. Auditoria PCI-DSS aprovada sem ressalvas.'],
            ['Casa da Moeda Digital · 2020 - 2022', 'Engenheiro de Testes', 'Testes de performance com k6 e Gatling. Identificou bottleneck que economizou R$340k/ano em infra. Co-desenvolveu lib interna de mocks de bancos centrais.'],
            ['Iron Vault Pagamentos · 2018 - 2020', 'QA Engineer', 'Cobertura de testes API REST e SOAP. Conformidade com Open Banking. Testes de antifraude.'],
        ],
        stack: ['Java + JUnit 5', 'RestAssured / WireMock', 'k6 / Gatling (load)', 'OWASP ZAP', 'Postman + Newman', 'Kafka (event testing)', 'Postgres', 'AWS (LocalStack)', 'Datadog'],
        idiomas: ['Português · Nativo', 'Inglês · Avançado'],
    },
    {
        slug: 'test-analyst',
        cargo: 'Analista de Testes Pleno',
        resumo: 'Analista de Testes Pleno com sólida experiência em testes manuais, exploratórios e introdução à automação. Forte atuação em times ágeis (Scrum/Kanban), documentação e gestão de defeitos. A noite é escura e cheia de bugs — mas com testes estruturados, o release sai limpo.',
        experiencias: [
            ['Castelo Negro Tech · 2022 - presente', 'Analista de Testes Pleno', 'Responsável por testes funcionais e exploratórios de aplicações web e mobile. Criou 380+ casos de teste em TestRail. Aplica técnicas de BBT, EBT e Heurísticas de Bach.'],
            ['Winterfell Software · 2020 - 2022', 'Analista de Testes Júnior', 'Início em testes manuais. Acompanhou primeiros passos de automação no time (Selenium IDE para Cypress). Atuou em refinamento de histórias com PO.'],
        ],
        stack: ['Jira + Zephyr / TestRail', 'Postman (testes manuais de API)', 'Selenium IDE / Cypress (básico)', 'BDD com Cucumber', 'SQL básico', 'Scrum / Kanban', 'Heurísticas de teste'],
        idiomas: ['Português · Nativo', 'Inglês · Básico (leitura técnica)'],
    },
    {
        slug: 'bilingue',
        cargo: 'Bilingual QA Engineer (PT/EN)',
        resumo: 'QA Engineer with strong English proficiency, ready to work in international teams and clients. Sólida atuação em projetos internacionais com squads distribuídos entre Brasil, EUA e Europa. Winter is coming — and so are untested releases. I make sure both arrive in good shape.',
        experiencias: [
            ['Beyond the Wall Consulting · 2022 - present', 'Senior QA Engineer · Bilingual', 'Member of a globally distributed squad (Brazil, USA, Portugal). Daily syncs in English. Test strategy ownership for SaaS product serving 1.2M users worldwide. ISTQB Foundation + Advanced Test Analyst.'],
            ['Winterfell Software · 2019 - 2022', 'QA Engineer', 'Atuação local em time brasileiro com stakeholders internacionais. Documentação técnica e relatórios em inglês. Participação em conferências (TestBash, Agile Testing Days).'],
        ],
        stack: ['Playwright + TypeScript', 'Cypress', 'Postman', 'ISTQB CTFL + CTAL-TA', 'Agile / Scrum (English daily)', 'Confluence (EN docs)', 'Datadog / New Relic'],
        idiomas: ['Português · Native', 'English · C1 Advanced (CEFR)', 'Spanish · Intermediate'],
    },
];

function wrapText(text, font, size, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        const width = font.widthOfTextAtSize(test, size);
        if (width > maxWidth && line) {
            lines.push(line);
            line = w;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines;
}

async function buildPdf(cv) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const W = 595.28, H = 841.89;

    const fontReg  = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontItal = await doc.embedFont(StandardFonts.HelveticaOblique);

    const margin = 50;
    let y = H - 60;

    // Watermark diagonal
    page.drawText('DEMONSTRACAO', {
        x: 70, y: H / 2 - 50, size: 90, font: fontBold,
        color: rgb(0.85, 0.85, 0.85), opacity: 0.22,
        rotate: degrees(35),
    });

    // Header colorido
    page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: COR });

    // Avatar (iniciais)
    const iniciais = NOME.split(' ').map(n => n[0]).slice(0, 2).join('');
    page.drawCircle({ x: margin + 35, y: y - 18, size: 30, color: COR });
    page.drawText(iniciais, {
        x: margin + 35 - fontBold.widthOfTextAtSize(iniciais, 24) / 2,
        y: y - 26, size: 24, font: fontBold, color: rgb(1, 1, 1),
    });

    // Nome + cargo
    page.drawText(NOME, { x: margin + 90, y: y - 8, size: 22, font: fontBold, color: rgb(0.1, 0.1, 0.15) });
    page.drawText(cv.cargo, { x: margin + 90, y: y - 28, size: 12, font: fontReg, color: COR });
    page.drawText(LOCAL, { x: margin + 90, y: y - 42, size: 9, font: fontItal, color: rgb(0.4, 0.4, 0.5) });
    y -= 90;

    // Contato
    page.drawText('CONTATO', { x: margin, y, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.5) });
    y -= 14;
    page.drawText(EMAIL, { x: margin, y, size: 10, font: fontReg, color: rgb(0.2, 0.2, 0.3) });
    y -= 13;
    page.drawText(TELEFONE, { x: margin, y, size: 10, font: fontReg, color: rgb(0.2, 0.2, 0.3) });
    y -= 25;

    // Resumo
    page.drawText('RESUMO PROFISSIONAL', { x: margin, y, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.5) });
    y -= 14;
    for (const line of wrapText(cv.resumo, fontReg, 10, W - 2 * margin)) {
        page.drawText(line, { x: margin, y, size: 10, font: fontReg, color: rgb(0.15, 0.15, 0.2) });
        y -= 13;
    }
    y -= 10;

    // Experiências
    page.drawText('EXPERIENCIA PROFISSIONAL', { x: margin, y, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.5) });
    y -= 16;
    for (const [empresa, cargo, desc] of cv.experiencias) {
        page.drawText(empresa, { x: margin, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
        y -= 12;
        page.drawText(cargo, { x: margin, y, size: 9, font: fontItal, color: COR });
        y -= 13;
        for (const line of wrapText(desc, fontReg, 9, W - 2 * margin)) {
            page.drawText(line, { x: margin, y, size: 9, font: fontReg, color: rgb(0.25, 0.25, 0.35) });
            y -= 11;
        }
        y -= 8;
    }
    y -= 4;

    // Formação
    page.drawText('FORMACAO', { x: margin, y, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.5) });
    y -= 14;
    page.drawText(FORMACAO, { x: margin, y, size: 10, font: fontReg, color: rgb(0.2, 0.2, 0.3) });
    y -= 22;

    // Stack
    page.drawText('TECNOLOGIAS E FERRAMENTAS', { x: margin, y, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.5) });
    y -= 14;
    for (const line of wrapText(cv.stack.join('  ·  '), fontReg, 10, W - 2 * margin)) {
        page.drawText(line, { x: margin, y, size: 10, font: fontReg, color: rgb(0.2, 0.2, 0.3) });
        y -= 13;
    }
    y -= 8;

    // Idiomas
    page.drawText('IDIOMAS', { x: margin, y, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.5) });
    y -= 14;
    page.drawText(cv.idiomas.join('  ·  '), { x: margin, y, size: 10, font: fontReg, color: rgb(0.2, 0.2, 0.3) });
    y -= 22;

    // Linha
    page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.88) });
    y -= 14;

    // Disclaimer
    const disclaimer = [
        'CV ficticio gerado para o showcase do sistema admin ARTACHO.dev.',
        'Candidato fictício "Jon Snow" - inspirado na série Game of Thrones (HBO) com fins exclusivamente demonstrativos.',
        'Pessoa, empresas, contatos e dados nao sao reais. Curriculo real do Bruno Artacho: artacho.dev/cv',
    ];
    for (const line of disclaimer) {
        page.drawText(line, { x: margin, y, size: 7.5, font: fontItal, color: rgb(0.5, 0.5, 0.55) });
        y -= 10;
    }

    // Footer
    page.drawText('// DEMONSTRACAO · ARTACHO.dev', {
        x: margin, y: 28, size: 7.5, font: fontBold, color: rgb(0.13, 0.83, 0.93),
    });

    return doc.save();
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    for (const cv of CVS) {
        const bytes = await buildPdf(cv);
        const out = join(OUT_DIR, `cv-jon-snow-${cv.slug}.pdf`);
        await writeFile(out, bytes);
        console.log(`* jon-snow-${cv.slug} - ${out} (${bytes.length} bytes)`);
    }
    console.log('\n5 PDFs de Jon Snow gerados com sucesso.');
}

main().catch(e => {
    console.error('Erro ao gerar PDFs:', e);
    process.exit(1);
});
