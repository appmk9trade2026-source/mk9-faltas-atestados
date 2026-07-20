// Server functions da Central de Alertas.
//
// Toda ação:
// - roda como o usuário autenticado (RLS aplica);
// - valida a transição de status;
// - registra evento em alertas_eventos e audit_logs;
// - sanitiza metadata sensível.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { redactPayload } from "./pii";

export type AlertaSeveridade = "INFORMATIVO" | "ATENCAO" | "CRITICO";
export type AlertaStatus = "NOVO" | "LIDO" | "EM_TRATAMENTO" | "RESOLVIDO" | "DISPENSADO";

export type AlertaResumo = {
  id: string;
  regra_codigo: string;
  categoria: string;
  severidade: AlertaSeveridade;
  status: AlertaStatus;
  titulo: string;
  descricao: string;
  detectado_em: string;
  prazo_em: string | null;
  empresa_id: string | null;
  projeto_id: string | null;
  colaborador_id: string | null;
  ausencia_id: string | null;
  whatsapp_outbox_id: string | null;
  acao_tipo: string | null;
  acao_url: string | null;
  assumido_por: string | null;
  resolvido_em: string | null;
  vencido: boolean;
};

const FiltrosSchema = z.object({
  status: z.array(z.enum(["NOVO", "LIDO", "EM_TRATAMENTO", "RESOLVIDO", "DISPENSADO"])).default([]),
  severidade: z.array(z.enum(["INFORMATIVO", "ATENCAO", "CRITICO"])).default([]),
  categoria: z.string().trim().max(60).nullish(),
  empresa_id: z.string().uuid().nullish(),
  projeto_id: z.string().uuid().nullish(),
  regra_codigo: z.string().trim().max(80).nullish(),
  vencidos: z.boolean().default(false),
  meus: z.boolean().default(false),
  data_de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  data_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  q: z.string().trim().max(120).nullish(),
});

const ListarInput = z.object({
  filtros: FiltrosSchema.default({ status: [], severidade: [], vencidos: false, meus: false }),
  page: z.number().int().min(0).max(500).default(0),
  pageSize: z.number().int().min(10).max(100).default(30),
});

async function getRoles(
  supabase: { from: (t: string) => { select: (c: string) => { eq: (col: string, val: string) => Promise<{ data: unknown; error: unknown }> } } },
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) return [];
  return (data as { role: string }[] | null ?? []).map((r) => r.role);
}

// ---------------------------------------------------------------------------
// Listar alertas
// ---------------------------------------------------------------------------
export const listarAlertas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListarInput.parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const f = data.filtros;

    let q = supabase
      .from("alertas")
      .select(
        "id, regra_codigo, categoria, severidade, status, titulo, descricao, detectado_em, prazo_em, empresa_id, projeto_id, colaborador_id, ausencia_id, whatsapp_outbox_id, acao_tipo, acao_url, assumido_por, resolvido_em",
        { count: "exact" },
      )
      .order("detectado_em", { ascending: false });

    if (f.status.length) q = q.in("status", f.status);
    if (f.severidade.length) q = q.in("severidade", f.severidade);
    if (f.categoria) q = q.eq("categoria", f.categoria);
    if (f.empresa_id) q = q.eq("empresa_id", f.empresa_id);
    if (f.projeto_id) q = q.eq("projeto_id", f.projeto_id);
    if (f.regra_codigo) q = q.eq("regra_codigo", f.regra_codigo);
    if (f.vencidos) q = q.lt("prazo_em", new Date().toISOString()).not("prazo_em", "is", null);
    if (f.meus) q = q.eq("assumido_por", userId);
    if (f.data_de) q = q.gte("detectado_em", `${f.data_de}T00:00:00Z`);
    if (f.data_ate) q = q.lte("detectado_em", `${f.data_ate}T23:59:59Z`);
    if (f.q && f.q.length >= 2) {
      const like = `%${f.q}%`;
      q = q.or(`titulo.ilike.${like},descricao.ilike.${like},regra_codigo.ilike.${like}`);
    }

    const from = data.page * data.pageSize;
    q = q.range(from, from + data.pageSize - 1);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const now = Date.now();
    const items: AlertaResumo[] = (rows ?? []).map((r) => ({
      ...(r as AlertaResumo),
      vencido: !!(r as { prazo_em: string | null }).prazo_em &&
        new Date((r as { prazo_em: string }).prazo_em).getTime() < now &&
        !["RESOLVIDO", "DISPENSADO"].includes((r as { status: string }).status),
    }));

    return {
      items,
      total: count ?? items.length,
      page: data.page,
      pageSize: data.pageSize,
      hasMore: from + items.length < (count ?? items.length),
    };
  });

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------
export const obterAlertaDetalhe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const roles = await getRoles(supabase as never, userId);

    const { data: alerta, error } = await supabase
      .from("alertas")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!alerta) throw new Error("Alerta não encontrado.");

    const { data: eventos } = await supabase
      .from("alertas_eventos")
      .select("*")
      .eq("alerta_id", data.id)
      .order("created_at", { ascending: true });

    let empresaNome: string | null = null;
    let projetoNome: string | null = null;
    let colaboradorNome: string | null = null;
    if ((alerta as { empresa_id: string | null }).empresa_id) {
      const { data: e } = await supabase
        .from("empresas").select("nome").eq("id", (alerta as { empresa_id: string }).empresa_id).maybeSingle();
      empresaNome = (e as { nome: string } | null)?.nome ?? null;
    }
    if ((alerta as { projeto_id: string | null }).projeto_id) {
      const { data: p } = await supabase
        .from("projetos").select("nome").eq("id", (alerta as { projeto_id: string }).projeto_id).maybeSingle();
      projetoNome = (p as { nome: string } | null)?.nome ?? null;
    }
    if ((alerta as { colaborador_id: string | null }).colaborador_id) {
      const { data: c } = await supabase
        .from("colaboradores").select("nome_completo, matricula")
        .eq("id", (alerta as { colaborador_id: string }).colaborador_id).maybeSingle();
      colaboradorNome = (c as { nome_completo: string; matricula: string } | null)
        ? `${(c as { nome_completo: string }).nome_completo} (${(c as { matricula: string }).matricula})`
        : null;
    }

    return {
      alerta: {
        ...(alerta as Record<string, unknown>),
        metadata: redactPayload((alerta as { metadata: unknown }).metadata, roles),
      },
      eventos: eventos ?? [],
      contexto: { empresaNome, projetoNome, colaboradorNome },
      roles,
    };
  });

// ---------------------------------------------------------------------------
// Transições
// ---------------------------------------------------------------------------
const TRANSICOES: Record<AlertaStatus, AlertaStatus[]> = {
  NOVO: ["LIDO", "EM_TRATAMENTO", "DISPENSADO", "RESOLVIDO"],
  LIDO: ["EM_TRATAMENTO", "DISPENSADO", "RESOLVIDO"],
  EM_TRATAMENTO: ["RESOLVIDO", "DISPENSADO"],
  RESOLVIDO: ["NOVO", "EM_TRATAMENTO"],
  DISPENSADO: ["NOVO", "EM_TRATAMENTO"],
};

async function transicionar(
  supabase: any,
  userId: string,
  id: string,
  novoStatus: AlertaStatus,
  evento: string,
  extra: Record<string, unknown> = {},
  justificativa?: string,
): Promise<void> {
  const { data: atual, error: e1 } = await supabase
    .from("alertas").select("id, status, severidade").eq("id", id).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!atual) throw new Error("Alerta não encontrado.");

  const statusAnterior = (atual as { status: AlertaStatus }).status;
  const severidade = (atual as { severidade: AlertaSeveridade }).severidade;

  if (!TRANSICOES[statusAnterior]?.includes(novoStatus)) {
    throw new Error(`Transição inválida: ${statusAnterior} → ${novoStatus}`);
  }

  if (novoStatus === "DISPENSADO" && !justificativa?.trim()) {
    throw new Error("Justificativa é obrigatória para dispensar alertas.");
  }
  if (novoStatus === "RESOLVIDO" && severidade === "CRITICO" && !justificativa?.trim()) {
    throw new Error("Alertas críticos exigem justificativa para resolver.");
  }
  if (statusAnterior === "RESOLVIDO" || statusAnterior === "DISPENSADO") {
    if (!justificativa?.trim()) {
      throw new Error("Justificativa é obrigatória para reabrir alertas.");
    }
  }

  const patch: Record<string, unknown> = { status: novoStatus, ...extra };
  if (justificativa) patch.justificativa = justificativa;

  const { error: e2 } = await supabase.from("alertas").update(patch).eq("id", id);
  if (e2) throw new Error(e2.message);

  await supabase.from("alertas_eventos").insert({
    alerta_id: id, evento, status_anterior: statusAnterior, status_novo: novoStatus,
    usuario_id: userId, justificativa: justificativa ?? null,
  });

  // Auditoria
  await supabase.from("audit_logs").insert({
    usuario_id: userId,
    acao: evento as never,
    modulo: "alertas",
    entidade: "alertas",
    registro_id: id,
    origem: "app",
    sucesso: true,
    observacoes: `Alerta ${id}: ${statusAnterior} → ${novoStatus}` + (justificativa ? ` · ${justificativa}` : ""),
  });
}

const IdInput = z.object({ id: z.string().uuid() });
const IdJustInput = z.object({ id: z.string().uuid(), justificativa: z.string().trim().min(3).max(500) });

export const marcarAlertaComoLido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdInput.parse(raw))
  .handler(async ({ context, data }) => {
    await transicionar(context.supabase, context.userId, data.id, "LIDO", "ALERTA_LIDO", {
      lido_em: new Date().toISOString(), lido_por: context.userId,
    });
    return { ok: true };
  });

export const assumirAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdInput.parse(raw))
  .handler(async ({ context, data }) => {
    await transicionar(context.supabase, context.userId, data.id, "EM_TRATAMENTO", "ALERTA_ASSUMIDO", {
      assumido_em: new Date().toISOString(), assumido_por: context.userId,
    });
    return { ok: true };
  });

const ResolverInput = z.object({ id: z.string().uuid(), justificativa: z.string().trim().max(500).optional() });

export const resolverAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ResolverInput.parse(raw))
  .handler(async ({ context, data }) => {
    await transicionar(context.supabase, context.userId, data.id, "RESOLVIDO", "ALERTA_RESOLVIDO", {
      resolvido_em: new Date().toISOString(), resolvido_por: context.userId,
    }, data.justificativa);
    return { ok: true };
  });

export const dispensarAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdJustInput.parse(raw))
  .handler(async ({ context, data }) => {
    await transicionar(context.supabase, context.userId, data.id, "DISPENSADO", "ALERTA_DISPENSADO", {
      dispensado_em: new Date().toISOString(), dispensado_por: context.userId,
    }, data.justificativa);
    return { ok: true };
  });

export const reabrirAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdJustInput.parse(raw))
  .handler(async ({ context, data }) => {
    await transicionar(context.supabase, context.userId, data.id, "NOVO", "ALERTA_REABERTO", {
      resolvido_em: null, resolvido_por: null, dispensado_em: null, dispensado_por: null,
    }, data.justificativa);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Filtros auxiliares (empresas/projetos)
// ---------------------------------------------------------------------------
export const listarFiltrosDeAlertas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [empresas, projetos, categorias, regras] = await Promise.all([
      supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("projetos").select("id, nome, empresa_id").eq("ativo", true).order("nome"),
      supabase.from("alertas").select("categoria"),
      supabase.from("alertas").select("regra_codigo"),
    ]);
    const uniqCategorias = Array.from(
      new Set(((categorias.data ?? []) as { categoria: string }[]).map((c) => c.categoria)),
    ).sort();
    const uniqRegras = Array.from(
      new Set(((regras.data ?? []) as { regra_codigo: string }[]).map((r) => r.regra_codigo)),
    ).sort();
    return {
      empresas: (empresas.data ?? []) as { id: string; nome: string }[],
      projetos: (projetos.data ?? []) as { id: string; nome: string; empresa_id: string }[],
      categorias: uniqCategorias,
      regras: uniqRegras,
    };
  });

// ---------------------------------------------------------------------------
// Contagem para o badge do menu
// ---------------------------------------------------------------------------
export const obterContagemAlertasMenu = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("contagem_alertas_menu");
    if (error) throw new Error(error.message);
    return (data ?? {
      novos: 0, criticos_abertos: 0, em_tratamento: 0, vencidos: 0, resolvidos_hoje: 0, total_abertos: 0,
    }) as {
      novos: number;
      criticos_abertos: number;
      em_tratamento: number;
      vencidos: number;
      resolvidos_hoje: number;
      total_abertos: number;
    };
  });

// Executa geração manual (super_admin apenas — RLS na função é definer, checamos aqui).
export const executarGeracaoAlertas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase as never, context.userId);
    if (!roles.includes("super_admin")) {
      throw new Error("Somente Super Admin pode executar geração manual.");
    }
    const { data, error } = await context.supabase.rpc("gerar_alertas_do_sistema");
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  });
