import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Histórico de redefinições de senha temporária (somente leitura).
 *
 * Fonte: `audit_logs` com `acao = 'SENHA_TEMPORARIA_REDEFINIDA'`.
 * As trilhas de auditoria NUNCA contêm senha, hash ou token — este módulo
 * apenas lê e enriquece os metadados administrativos (quem, quando, por quê).
 */

const ACAO = "SENHA_TEMPORARIA_REDEFINIDA";

/** Super Admin e Administrador (compliance) — supervisor/gestor não acessam. */
async function requireAdminHistorico(ctx: {
  supabase: typeof import("@/integrations/supabase/client").supabase;
  userId: string;
}) {
  const [sa, comp] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "compliance" }),
  ]);
  if (sa.data !== true && comp.data !== true) {
    throw new Error("PERMISSION_DENIED: acesso restrito a Super Admin e Administrador.");
  }
  return { superAdmin: sa.data === true };
}

export type RedefinicaoSenhaRow = {
  id: string;
  created_at: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  usuario_email: string | null;
  usuario_perfis: string[];
  usuario_empresas: string[];
  responsavel_id: string | null;
  responsavel_nome: string | null;
  justificativa: string | null;
  padrao: boolean;
  sucesso: boolean;
  origem: string | null;
};

const filtroSchema = z.object({
  inicio: z.string().trim().optional().nullable(),
  fim: z.string().trim().optional().nullable(),
  limite: z.number().int().min(1).max(2000).default(1000),
});

export const listarRedefinicoesSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => filtroSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<RedefinicaoSenhaRow[]> => {
    await requireAdminHistorico(context);
    const { supabase } = context;

    let q = supabase
      .from("audit_logs")
      .select("id, created_at, usuario_id, usuario_nome, registro_id, observacoes, depois, sucesso, origem")
      .eq("acao", ACAO as never)
      .order("created_at", { ascending: false })
      .limit(data.limite);

    if (data.inicio) q = q.gte("created_at", new Date(`${data.inicio}T00:00:00`).toISOString());
    if (data.fim) q = q.lte("created_at", new Date(`${data.fim}T23:59:59`).toISOString());

    const { data: logs, error } = await q;
    if (error) throw new Error("Falha ao carregar o histórico de redefinições.");
    const linhas = logs ?? [];
    if (linhas.length === 0) return [];

    const alvoIds = [...new Set(linhas.map((l) => l.registro_id).filter(Boolean))] as string[];
    const adminIds = [...new Set(linhas.map((l) => l.usuario_id).filter(Boolean))] as string[];
    const todos = [...new Set([...alvoIds, ...adminIds])];

    const [perfis, roles, vinculos] = await Promise.all([
      supabase.from("profiles").select("id, nome, email").in("id", todos),
      alvoIds.length
        ? supabase.from("user_roles").select("user_id, role").in("user_id", alvoIds)
        : Promise.resolve({ data: [] as { user_id: string; role: string }[] }),
      alvoIds.length
        ? supabase.from("usuario_empresas").select("user_id, empresas(nome)").in("user_id", alvoIds)
        : Promise.resolve({ data: [] as { user_id: string; empresas: { nome: string } | null }[] }),
    ]);

    const perfilPorId = new Map((perfis.data ?? []).map((p) => [p.id, p]));
    const rolesPorId = new Map<string, string[]>();
    for (const r of (roles.data ?? []) as { user_id: string; role: string }[]) {
      rolesPorId.set(r.user_id, [...(rolesPorId.get(r.user_id) ?? []), r.role]);
    }
    const empresasPorId = new Map<string, string[]>();
    for (const v of (vinculos.data ?? []) as { user_id: string; empresas: { nome: string } | null }[]) {
      const nome = v.empresas?.nome;
      if (!nome) continue;
      empresasPorId.set(v.user_id, [...(empresasPorId.get(v.user_id) ?? []), nome]);
    }

    return linhas.map((l) => {
      const depois = (l.depois ?? {}) as Record<string, unknown>;
      const alvo = l.registro_id ? perfilPorId.get(l.registro_id) : undefined;
      const resp = l.usuario_id ? perfilPorId.get(l.usuario_id) : undefined;
      const justificativa =
        typeof depois.justificativa === "string" && depois.justificativa.trim()
          ? depois.justificativa.trim()
          : (l.observacoes ?? null);
      return {
        id: l.id,
        created_at: l.created_at,
        usuario_id: l.registro_id ?? null,
        usuario_nome: alvo?.nome ?? null,
        usuario_email: alvo?.email ?? (typeof depois.email_alvo === "string" ? depois.email_alvo : null),
        usuario_perfis: l.registro_id ? (rolesPorId.get(l.registro_id) ?? []) : [],
        usuario_empresas: l.registro_id ? (empresasPorId.get(l.registro_id) ?? []) : [],
        responsavel_id: l.usuario_id ?? null,
        responsavel_nome: resp?.nome ?? l.usuario_nome ?? null,
        justificativa,
        padrao: depois.padrao === true,
        sucesso: l.sucesso !== false,
        origem: l.origem ?? null,
      };
    });
  });

/** Registra abertura da tela, filtros aplicados e exportações. */
export const auditarHistoricoSenhas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        evento: z.enum(["ABERTURA", "FILTRO", "EXPORTACAO"]),
        formato: z.enum(["csv", "xlsx", "pdf"]).optional().nullable(),
        filtros: z.record(z.string(), z.union([z.string(), z.number()])).optional().nullable(),
        total: z.number().int().min(0).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdminHistorico(context);
    const acao =
      data.evento === "EXPORTACAO" ? "EXPORTACAO" : data.evento === "ABERTURA" ? "VISUALIZACAO" : "VISUALIZACAO";
    const descricao =
      data.evento === "ABERTURA"
        ? "Abertura da tela Histórico de Redefinições de Senha."
        : data.evento === "FILTRO"
          ? "Filtros aplicados no Histórico de Redefinições de Senha."
          : `Exportação (${data.formato ?? "?"}) do Histórico de Redefinições de Senha.`;

    await context.supabase
      .rpc("log_audit_event", {
        _modulo: "usuarios",
        _acao: acao as never,
        _entidade: "Histórico de Redefinições de Senha",
        _registro_id: null,
        _depois: { evento: data.evento, formato: data.formato ?? null, filtros: data.filtros ?? null, total: data.total ?? null } as never,
        _observacoes: descricao,
        _origem: "web",
      } as never)
      .then(() => {}, () => {});

    return { ok: true as const };
  });
