/** Pure business helpers for the users module — safe to import in tests. */

export function validarProjetosPertencemAEmpresas(
  projetos: { id: string; empresa_id: string }[],
  projetoIds: string[],
  empresaIds: string[],
): { ok: boolean; invalidos: string[] } {
  const empresasSet = new Set(empresaIds);
  const invalidos: string[] = [];
  for (const pid of projetoIds) {
    const p = projetos.find((x) => x.id === pid);
    if (!p || !empresasSet.has(p.empresa_id)) invalidos.push(pid);
  }
  return { ok: invalidos.length === 0, invalidos };
}

export type AcessoStatus =
  | "conta_bloqueada"
  | "convite_pendente"
  | "nunca_acessou"
  | "ativo";

export function computeAcessoStatus(u: {
  ativo: boolean;
  banned_until: string | null;
  invited_at: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
}, now: number = Date.now()): AcessoStatus {
  const bannedActive = !!u.banned_until && new Date(u.banned_until).getTime() > now;
  if (!u.ativo || bannedActive) return "conta_bloqueada";
  if (u.invited_at && !u.email_confirmed_at && !u.last_sign_in_at) return "convite_pendente";
  if (!u.last_sign_in_at) return "nunca_acessou";
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
] as const;

export type DependenciaBloqueante = (typeof DEPENDENCIAS_BLOQUEANTES)[number];

export function calcularBloqueiosExclusao(
  deps: Partial<Record<string, number | null>> | null | undefined,
): { total: number; detalhes: { chave: DependenciaBloqueante; total: number }[] } {
  const detalhes = DEPENDENCIAS_BLOQUEANTES.map((chave) => ({
    chave,
    total: Number(deps?.[chave] ?? 0),
  })).filter((d) => d.total > 0);
  return { total: detalhes.reduce((acc, d) => acc + d.total, 0), detalhes };
}
