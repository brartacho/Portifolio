// ============================================================
// Gera 5 PDFs demonstrativos para a showcase do painel admin
// Personagens de Game of Thrones reimaginados como profissionais de TI
// PT-BR · Watermark DEMONSTRAÇÃO · Pessoas/empresas fictícias
//
// Uso: node scripts/generate-demo-pdfs.mjs
// Output: projeto-sistema-admin-assets/cv-demo-*.pdf
// ============================================================
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'projeto-sistema-admin-assets');

const CVS = [
    {
        slug: 'jon-snow',
        nome: 'JON SNOW',
        cargo: 'Analista de QA Sênior',
        local: 'A Muralha · Westeros',
        email: 'jon.snow@patrulhadanoite.demo',
        telefone: '+99 99 99999-0001',
        resumo: 'Lorde Comandante de pipelines de teste, com 7 anos de experiência além da Muralha detectando Caminhantes Brancos (bugs em produção). Sei muito sobre código não testado - afinal, sei nada.',
        experiencias: [
            ['Sistemas da Patrulha da Noite · 2019-2026', 'Lorde Comandante de Qualidade', 'Implementou testes-Muralha (regressão automatizada). Reduziu invasões de Caminhantes Brancos em 87% no ambiente de produção.'],
            ['Castelo Negro Tech · 2017-2019', 'Vigia Jurado de Testes Manuais', 'Operou pipelines de validação noturna. Forjou alianças cross-time com Selvagens da área de Dev.'],
        ],
        formacao: 'Universidade de Vila Toupeira · Bacharel em Ciência da Computação',
        stack: ['Playwright', 'Postman', 'Aço Valiriano (Selenium Grid)', 'CI/CD em vidro de dragão', 'SQL', 'Git'],
        cor: rgb(0.0, 0.5, 0.8),
    },
    {
        slug: 'daenerys-targaryen',
        nome: 'DAENERYS TARGARYEN',
        cargo: 'Engineering Manager',
        local: 'Pedra do Dragão · Westeros',
        email: 'daenerys@dragonstone.demo',
        telefone: '+99 99 99999-0002',
        resumo: 'Mãe dos Microsserviços, Quebradora de Tech Debt, Khaleesi de stand-ups diárias. Liderei um time de 3 dragões (Drogon, Rhaegal e Viserion como PROD, STG, DEV) e queimei legado Java 6 em 2 sprints.',
        experiencias: [
            ['Targaryen Cloud Systems · 2021-2026', 'Engineering Manager', 'Liderou migração de 47 monólitos para microsserviços. Cultura: "Khaleesi gosta de OKRs claros e cerveja após o deploy."'],
            ['Casa Targaryen Pleno · 2018-2021', 'Tech Lead', 'Forjou estratégia de observabilidade fim-a-fim. Reduziu MTTR em 64% usando dashboards customizados em Grafana das Cinzas.'],
        ],
        formacao: 'Cidadela de Pentos · Mestrado em Liderança Técnica',
        stack: ['Kubernetes', 'Terraform', 'Microsserviços em chamas (Spring Boot)', 'Liderança 1:1', 'OKRs', 'Mentoria'],
        cor: rgb(0.5, 0.1, 0.6),
    },
    {
        slug: 'tyrion-lannister',
        nome: 'TYRION LANNISTER',
        cargo: 'Arquiteto Backend Sênior',
        local: 'Rochedo Casterly · Westeros',
        email: 'tyrion@lannister.demo',
        telefone: '+99 99 99999-0003',
        resumo: 'Mão do CTO. Eu bebo e arquiteto coisas. Um Lannister sempre paga suas dívidas técnicas. 12 anos desenhando sistemas distribuídos resilientes - preferencialmente com uma taça de vinho na outra mão.',
        experiencias: [
            ['Lannister Capital Tech · 2020-2026', 'Arquiteto Sênior', 'Desenhou plataforma de pagamentos processando ouro suficiente para sustentar Porto Real. Implementou padrões CQRS e Event Sourcing.'],
            ['Rochedo Casterly Sistemas · 2015-2020', 'Engenheiro Pleno - Sênior', 'Refatorou o legado real da família Lannister. Eliminou 18.000 linhas de código duplicado.'],
        ],
        formacao: 'Universidade de Porto Real · MBA em Arquitetura de Software',
        stack: ['Python Lannister', 'Postgres em ouro', 'Redis', 'Kafka', 'Wine 7+', 'Negociação política'],
        cor: rgb(0.7, 0.5, 0.0),
    },
    {
        slug: 'arya-stark',
        nome: 'ARYA STARK',
        cargo: 'Security Engineer / Pentester',
        local: 'Bravos · Mar Estreito',
        email: 'arya@manyfaced.demo',
        telefone: '+99 99 99999-0004',
        resumo: 'Uma garota não tem bugs. Especialista em testes de penetração e arquitetura de segurança. Treinada pelos Sem Rosto em técnicas de bypass de autenticação. Hoje uma garota tem um nome - e ela faz pentest.',
        experiencias: [
            ['Casa do Preto e Branco Sec · 2022-2026', 'Security Engineer Sênior', 'Conduziu 200+ auditorias de segurança. "O que dizemos a uma vuln 0-day? Hoje não."'],
            ['Inverso Stark · 2019-2022', 'Pentester Pleno', 'Bypass de autenticação Faceless em 5 dos 7 reinos. Reportou e corrigiu CVEs críticos.'],
        ],
        formacao: 'Casa do Preto e Branco · Certificação em Faceless Authentication',
        stack: ['Burp Suite (Agulha)', 'Metasploit', 'OWASP', 'Criptografia Valiriana', 'Python', 'Shell Scripting'],
        cor: rgb(0.4, 0.4, 0.45),
    },
    {
        slug: 'bran-stark',
        nome: 'BRAN STARK',
        cargo: 'Data Engineer · Machine Learning',
        local: 'Winterfell · Norte',
        email: 'bran@threeeyedraven.demo',
        telefone: '+99 99 99999-0005',
        resumo: 'O Corvo de Três Olhos de pipelines de dados. Eu sou o BI de dashboards. Vejo time series através do tempo. Especialista em modelos preditivos e arquitetura de data lakes que abrangem todos os Sete Reinos.',
        experiencias: [
            ['Winterfell Data Platform · 2023-2026', 'Senior Data Engineer', 'Greenseeing de time-series em escala. Construiu pipelines processando 2.3 TB/dia de eventos do reino.'],
            ['Velho Bosque Analytics · 2020-2023', 'Data Engineer Pleno', 'Implementou data warehouse em Weirwood Spark. Reduziu latência de consultas em 73%.'],
        ],
        formacao: 'Maesteres da Cidadela · Pós em Ciência de Dados',
        stack: ['Spark', 'Airflow', 'PostgreSQL dos Deuses Antigos', 'Python · Pandas', 'dbt', 'Tableau'],
        cor: rgb(0.15, 0.4, 0.2),
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
    const page = doc.addPage([595.28, 841.89]); // A4 portrait
    const W = 595.28, H = 841.89;

    const fontReg  = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontItal = await doc.embedFont(StandardFonts.HelveticaOblique);

    const margin = 50;
    let y = H - 60;

    // -- Watermark diagonal (DEMONSTRAÇÃO) --
    page.drawText('DEMONSTRAÇÃO', {
        x: 70, y: H / 2 - 50, size: 90, font: fontBold,
        color: rgb(0.85, 0.85, 0.85), opacity: 0.25,
        rotate: degrees(35),
    });

    // -- Header colorido --
    page.drawRectangle({
        x: 0, y: H - 8, width: W, height: 8,
        color: cv.cor,
    });

    // -- Avatar (círculo com iniciais) --
    const iniciais = cv.nome.split(' ').map(n => n[0]).slice(0, 2).join('');
    page.drawCircle({ x: margin + 35, y: y - 18, size: 30, color: cv.cor });
    page.drawText(iniciais, {
        x: margin + 35 - fontBold.widthOfTextAtSize(iniciais, 24) / 2,
        y: y - 26, size: 24, font: fontBold, color: rgb(1, 1, 1),
    });

    // -- Nome + cargo --
    page.drawText(cv.nome, { x: margin + 90, y: y - 8, size: 22, font: fontBold, color: rgb(0.1, 0.1, 0.15) });
    page.drawText(cv.cargo, { x: margin + 90, y: y - 28, size: 12, font: fontReg, color: cv.cor });
    page.drawText(cv.local, { x: margin + 90, y: y - 42, size: 9, font: fontItal, color: rgb(0.4, 0.4, 0.5) });
    y -= 90;

    // -- Contato --
    page.drawText('CONTATO', { x: margin, y, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.5) });
    y -= 14;
    page.drawText(cv.email, { x: margin, y, size: 10, font: fontReg, color: rgb(0.2, 0.2, 0.3) });
    y -= 13;
    page.drawText(cv.telefone, { x: margin, y, size: 10, font: fontReg, color: rgb(0.2, 0.2, 0.3) });
    y -= 25;

    // -- Resumo --
    page.drawText('RESUMO PROFISSIONAL', { x: margin, y, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.5) });
    y -= 14;
    const resumoLines = wrapText(cv.resumo, fontReg, 10, W - 2 * margin);
    for (const line of resumoLines) {
        page.drawText(line, { x: margin, y, size: 10, font: fontReg, color: rgb(0.15, 0.15, 0.2) });
        y -= 13;
    }
    y -= 10;

    // -- Experiências --
    page.drawText('EXPERIÊNCIA PROFISSIONAL', { x: margin, y, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.5) });
    y -= 16;
    for (const [empresa, cargo, desc] of cv.experiencias) {
        page.drawText(empresa, { x: margin, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.2) });
        y -= 12;
        page.drawText(cargo, { x: margin, y, size: 9, font: fontItal, color: cv.cor });
        y -= 13;
        const descLines = wrapText(desc, fontReg, 9, W - 2 * margin);
        for (const line of descLines) {
            page.drawText(line, { x: margin, y, size: 9, font: fontReg, color: rgb(0.25, 0.25, 0.35) });
            y -= 11;
        }
        y -= 8;
    }
    y -= 4;

    // -- Formação --
    page.drawText('FORMAÇÃO', { x: margin, y, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.5) });
    y -= 14;
    page.drawText(cv.formacao, { x: margin, y, size: 10, font: fontReg, color: rgb(0.2, 0.2, 0.3) });
    y -= 22;

    // -- Stack --
    page.drawText('TECNOLOGIAS', { x: margin, y, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.5) });
    y -= 14;
    const stackText = cv.stack.join('  ·  ');
    const stackLines = wrapText(stackText, fontReg, 10, W - 2 * margin);
    for (const line of stackLines) {
        page.drawText(line, { x: margin, y, size: 10, font: fontReg, color: rgb(0.2, 0.2, 0.3) });
        y -= 13;
    }
    y -= 16;

    // -- Linha divisória --
    page.drawLine({
        start: { x: margin, y },
        end: { x: W - margin, y },
        thickness: 0.5, color: rgb(0.85, 0.85, 0.88),
    });
    y -= 14;

    // -- Disclaimer --
    const disclaimer = [
        'CV ficticio gerado para o showcase do sistema admin ARTACHO.dev.',
        'Personagem da serie Game of Thrones (HBO) reimaginado para fins de demonstracao tecnica.',
        'Pessoa, empresa, contato e dados nao sao reais. Curriculo real do Bruno Artacho: artacho.dev/cv',
    ];
    for (const line of disclaimer) {
        page.drawText(line, { x: margin, y, size: 7.5, font: fontItal, color: rgb(0.5, 0.5, 0.55) });
        y -= 10;
    }

    // -- Footer ARTACHO.dev --
    page.drawText('// DEMONSTRACAO · ARTACHO.dev', {
        x: margin, y: 28, size: 7.5, font: fontBold, color: rgb(0.13, 0.83, 0.93),
    });

    return doc.save();
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });
    for (const cv of CVS) {
        const bytes = await buildPdf(cv);
        const out = join(OUT_DIR, `cv-demo-${cv.slug}.pdf`);
        await writeFile(out, bytes);
        console.log(`* ${cv.slug} - ${out} (${bytes.length} bytes)`);
    }
    console.log('\n5 PDFs gerados com sucesso.');
}

main().catch(e => {
    console.error('Erro ao gerar PDFs:', e);
    process.exit(1);
});
