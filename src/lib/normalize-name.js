/**
 * Normalização única de nomes (Empresa/Projeto) para chave lógica de comparação.
 *
 * Regras:
 *  1. trim();
 *  2. remoção de caracteres invisíveis vindos do Excel (zero-width);
 *  3. remoção de acentos (NFD + strip diacríticos);
 *  4. substituição de hífens/travessões/meia-riscas por espaço;
 *  5. colapso de múltiplos espaços em um único;
 *  6. conversão para MAIÚSCULAS.
 *
 * O nome original NUNCA é sobrescrito no banco — esta função gera apenas a
 * CHAVE usada para comparação/localização. Exemplos que geram a mesma chave:
 *   "AMBEV - AS ROTA DF"
 *   "AMBEV AS ROTA DF"
 *   "AMBEV – AS ROTA DF"
 *   "ambev—as rota df"
 *   "  AMBEV  -  AS ROTA DF  "
 *  → "AMBEV AS ROTA DF"
 *
 * Deve permanecer em paridade com a função SQL `public.normalize_name(text)`.
 */
export function normalizeName(value) {
    if (!value)
        return "";
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // diacríticos
        .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ") // zero-width + NBSP
        .replace(/[\u2010-\u2015\-]/g, " ") // hífen, travessão, meia-risca, minus
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}
