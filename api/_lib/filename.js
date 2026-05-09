/**
 * Normaliza nome de arquivo PDF para o padrão "senior":
 * - Sem acentos / diacríticos (ç → c, í → i, ã → a)
 * - Sem caracteres especiais (só [a-zA-Z0-9._-])
 * - Sem espaços (vira underscore)
 * - Pontos PRESERVADOS (versões tipo v1.4 ficam legíveis)
 * - Underscores e pontos duplicados colapsados
 * - Sempre termina em .pdf
 * - Comprimento máximo 200 chars (deixa folga pro limite do filesystem)
 *
 * Exemplos:
 *   "Currículo Bruno Artacho - QA 2026 v1.4.pdf"
 *     → "Curriculo_Bruno_Artacho_QA_2026_v1.4.pdf"
 *   "Curriculo João - 2026 (versão final).PDF"
 *     → "Curriculo_Joao_2026_versao_final.pdf"
 *   "My Résumé!!.pdf"
 *     → "My_Resume.pdf"
 *   "version.1.2.3.pdf"
 *     → "version.1.2.3.pdf"
 */
export function normalizeFileName(input) {
    if (!input || typeof input !== 'string') return 'arquivo.pdf';

    let clean = input.trim().normalize('NFD');
    // Remove combining diacritics (U+0300 - U+036F)
    clean = clean.replace(/[̀-ͯ]/g, '');

    // Separa base + extensão
    const dotIdx = clean.lastIndexOf('.');
    let base = dotIdx > 0 ? clean.slice(0, dotIdx) : clean;
    let ext = dotIdx > 0 ? clean.slice(dotIdx).toLowerCase() : '';

    // Força extensão .pdf (sanitiza caso venha algo estranho)
    ext = ext.replace(/[^a-z0-9.]/g, '');
    if (ext !== '.pdf') ext = '.pdf';

    // Tudo que não for alfanumérico/ponto vira underscore (preserva pontos)
    base = base.replace(/[^a-zA-Z0-9.]+/g, '_');
    // Colapsa runs de . duplicados (".." → ".")
    base = base.replace(/\.+/g, '.');
    // Remove . e _ nas pontas
    base = base.replace(/^[._]+|[._]+$/g, '');

    if (!base) base = 'arquivo';
    if (base.length > 200) base = base.slice(0, 200).replace(/[._]+$/, '');

    return base + ext;
}
