/** Pure business helpers for the users module — safe to import in tests. */
export function validarProjetosPertencemAEmpresas(projetos, projetoIds, empresaIds) {
    const empresasSet = new Set(empresaIds);
    const invalidos = [];
    for (const pid of projetoIds) {
        const p = projetos.find((x) => x.id === pid);
        if (!p || !empresasSet.has(p.empresa_id))
            invalidos.push(pid);
    }
    return { ok: invalidos.length === 0, invalidos };
}
export function computeAcessoStatus(u, now = Date.now()) {
    const bannedActive = !!u.banned_until && new Date(u.banned_until).getTime() > now;
    if (!u.ativo || bannedActive)
        return "conta_bloqueada";
    if (u.invited_at && !u.email_confirmed_at && !u.last_sign_in_at)
        return "convite_pendente";
    if (!u.last_sign_in_at)
        return "nunca_acessou";
    return "ativo";
}
/**
 * Dependências que realmente impedem a exclusão física de um usuário.
 * Rastros de uso (auditoria, logins, notificações, visões de BI, eventos de
 * alerta) NÃO bloqueiam: não possuem FK para auth.users e são preservados
 * como histórico anônimo após a exclusão.
 */
export const DEPENDENCIAS_BLOQUEANTES = [
    "ausencias_registradas",
    "comunicacoes",
    "homologacoes",
    "importacoes",
    "operacao_alertas",
    "operacao_incidentes",
    "access_reviews",
    "supervisores_vinculados",
    "colaboradores_supervisionados",
];
export function calcularBloqueiosExclusao(deps) {
    const detalhes = DEPENDENCIAS_BLOQUEANTES.map((chave) => ({
        chave,
        total: Number(deps?.[chave] ?? 0),
    })).filter((d) => d.total > 0);
    return { total: detalhes.reduce((acc, d) => acc + d.total, 0), detalhes };
}
