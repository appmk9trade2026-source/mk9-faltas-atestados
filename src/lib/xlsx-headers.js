/**
 * Normalização e resolução por alias de cabeçalhos vindos de planilhas Excel/CSV.
 *
 * Regras de normalização (paridade com Postgres normalize_name para nomes):
 *  - trim
 *  - NFD + strip diacríticos
 *  - remove caracteres invisíveis (zero-width, NBSP)
 *  - substitui underscore/hífen/travessão/meia-risca por espaço
 *  - colapsa múltiplos espaços
 *  - lower-case
 *
 * O importador NUNCA deve depender de acesso direto por chave exata
 * (`row["Email Supervisor"]`). Utilize sempre `pickField(idx, aliases)`.
 */
export function normalizeHeader(v) {
    return String(v ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ")
        .replace(/[_\u2010-\u2015\-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}
/** Constrói um mapa `header normalizado → valor` para uma linha lida do XLSX. */
export function buildRowIndex(row) {
    const m = new Map();
    for (const [k, v] of Object.entries(row))
        m.set(normalizeHeader(k), v);
    return m;
}
/** Retorna o primeiro valor cuja chave normalizada bate com algum alias fornecido. */
export function pickField(idx, aliases) {
    for (const a of aliases) {
        const n = normalizeHeader(a);
        if (idx.has(n))
            return idx.get(n);
    }
    return "";
}
/** Retorna também o alias efetivamente utilizado (para diagnóstico de cabeçalho). */
export function pickFieldWithSource(idx, aliases) {
    for (const a of aliases) {
        const n = normalizeHeader(a);
        if (idx.has(n))
            return { value: idx.get(n), matched: n };
    }
    return { value: "", matched: null };
}
/** Aliases oficiais aceitos pela importação de colaboradores. */
export const COLABORADOR_HEADER_ALIASES = {
    matricula: ["Matrícula", "Matricula", "matricula", "chapa", "mat", "codigo colaborador"],
    nome_completo: ["Nome Completo", "Nome", "colaborador", "nome do colaborador"],
    projeto: ["Projeto", "obra", "unidade"],
    empresa: ["Empresa", "razao social", "razão social"],
    telefone: ["Telefone do Colaborador", "Telefone", "fone", "telefone colaborador"],
    whatsapp: ["WhatsApp", "whats", "celular", "whatsapp colaborador"],
    email: ["Email", "E-mail", "email colaborador", "e-mail colaborador"],
    supervisor_nome: [
        "Supervisor(a)",
        "Supervisor",
        "supervisor a",
        "nome supervisor",
        "nome do supervisor",
    ],
    supervisor_telefone: [
        "Telefone do Supervisor",
        "Telefone Supervisor",
        "fone supervisor",
        "celular supervisor",
    ],
    supervisor_email: [
        "Email Supervisor",
        "E-mail Supervisor",
        "email supervisor",
        "e mail supervisor",
        "email do supervisor",
        "e-mail do supervisor",
        "supervisor email",
        "supervisor_email",
    ],
};
/** Diagnóstico completo do cabeçalho (usado antes de confirmar a importação). */
export function diagnoseHeaders(sampleRow, requiredFields = ["matricula", "nome_completo", "projeto", "empresa"]) {
    const idx = sampleRow ? buildRowIndex(sampleRow) : new Map();
    const encontrados = {};
    for (const field of Object.keys(COLABORADOR_HEADER_ALIASES)) {
        encontrados[field] = null;
        for (const a of COLABORADOR_HEADER_ALIASES[field]) {
            const n = normalizeHeader(a);
            if (idx.has(n)) {
                encontrados[field] = n;
                break;
            }
        }
    }
    const conhecidos = new Set(Object.values(COLABORADOR_HEADER_ALIASES).flatMap((arr) => arr.map(normalizeHeader)));
    const desconhecidos = [];
    for (const k of idx.keys())
        if (!conhecidos.has(k) && k)
            desconhecidos.push(k);
    const faltando = requiredFields.filter((f) => !encontrados[f]);
    return {
        encontrados,
        faltando,
        desconhecidos,
        headers_brutos: sampleRow ? Object.keys(sampleRow) : [],
    };
}
/**
 * Heurística de guarda: detecta se a planilha CONTÉM uma coluna que se
 * pareça com "email supervisor" mas que não tenha sido mapeada por alias.
 * Bloqueia a confirmação da importação para evitar gravar supervisor_email vazio.
 */
export function suspectUnmappedSupervisorEmail(diag) {
    if (diag.encontrados.supervisor_email)
        return false;
    return diag.desconhecidos.some((h) => h.includes("supervisor") && h.includes("mail"));
}
