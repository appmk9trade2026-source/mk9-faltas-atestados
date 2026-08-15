/**
 * Resolução única da identidade do colaborador em registros de ausência.
 *
 * Contexto: ausências podem ser criadas de duas formas:
 *  • AUTOMATICO — `colaborador_id` preenchido e dados vindos de `colaboradores`;
 *  • MANUAL     — `colaborador_id` nulo e dados preservados como snapshot nas
 *                 colunas `manual_*` da própria ausência.
 *
 * A listagem só lia o JOIN com `colaboradores`, o que deixava nome e matrícula
 * vazios nos lançamentos manuais (a tela de edição lê o snapshot e por isso
 * exibia tudo corretamente).
 *
 * Ordem de precedência (Etapa 5):
 *   1. colaboradores.nome_completo / colaboradores.matricula
 *   2. snapshot manual salvo na ausência
 *   3. indicador administrativo de vínculo ausente
 *
 * Importante: quando existe `colaborador_id` mas o JOIN não retornou o
 * colaborador (falha de leitura/RLS), NÃO exibimos "—" silenciosamente —
 * sinalizamos "Dados do colaborador indisponíveis".
 */
export const COLABORADOR_INDISPONIVEL = "Dados do colaborador indisponíveis";
function clean(v) {
    if (v === null || v === undefined)
        return null;
    const t = String(v).trim();
    return t ? t : null;
}
export function resolveAusenciaIdentidade(row) {
    const c = row?.colaborador ?? null;
    const temColaborador = !!c && (clean(c.nome_completo) !== null || clean(c.matricula) !== null);
    const temSnapshot = clean(row?.manual_nome) !== null || clean(row?.manual_matricula) !== null;
    // Fallback campo a campo: colaborador → snapshot.
    const pick = (doColaborador, doSnapshot) => clean(doColaborador) ?? clean(doSnapshot);
    const base = {
        nome: pick(c?.nome_completo, row?.manual_nome),
        matricula: pick(c?.matricula, row?.manual_matricula),
        cargo: pick(c?.cargo, row?.manual_cargo),
        email: pick(c?.email, row?.manual_email),
        telefone: pick(c?.telefone, row?.manual_telefone),
        whatsapp: pick(c?.whatsapp, row?.manual_whatsapp),
        supervisor_nome: pick(c?.supervisor?.nome || c?.supervisor_nome, row?.manual_supervisor_nome),
        supervisor_telefone: pick(c?.supervisor?.telefone || c?.supervisor?.telefone_whatsapp || c?.supervisor_telefone, row?.manual_supervisor_telefone),
        supervisor_email: pick(c?.supervisor?.email || c?.supervisor_email, row?.manual_supervisor_email),
    };
    if (temColaborador) {
        return { origem: "colaborador", indisponivel: false, ...base };
    }
    if (temSnapshot) {
        return { origem: "snapshot", indisponivel: false, ...base };
    }
    if (clean(row?.colaborador_id)) {
        // Vínculo existe no banco, mas a consulta não trouxe o colaborador.
        return { origem: "indisponivel", indisponivel: true, ...base };
    }
    return { origem: "vazio", indisponivel: false, ...base };
}
/** Texto pronto para exibição do nome (nunca esconde falha de JOIN). */
export function labelNomeColaborador(row) {
    const i = resolveAusenciaIdentidade(row);
    if (i.nome)
        return i.nome;
    return i.indisponivel ? COLABORADOR_INDISPONIVEL : "—";
}
/** Texto pronto para exibição da matrícula. */
export function labelMatriculaColaborador(row) {
    const i = resolveAusenciaIdentidade(row);
    if (i.matricula)
        return i.matricula;
    return i.indisponivel ? COLABORADOR_INDISPONIVEL : "—";
}
/** Chave de busca/ordenação consistente com o que é exibido. */
export function identidadeBuscaTexto(row) {
    const i = resolveAusenciaIdentidade(row);
    return `${i.nome ?? ""} ${i.matricula ?? ""} ${i.supervisor_nome ?? ""}`.toLowerCase();
}
