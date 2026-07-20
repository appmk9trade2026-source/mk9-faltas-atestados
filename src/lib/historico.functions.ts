// Server functions do módulo Histórico.
//
// Fontes:
// - public.audit_logs (fonte principal, já auditada e com RLS por perfil);
// - public.whatsapp_outbox_eventos (linha do tempo dos envios de WhatsApp);
// - public.whatsapp_worker_execucoes (rodadas do worker automático).
//
// Regras:
// - Sempre executado como o usuário autenticado; RLS é a última defesa.
// - Retornamos payloads redigidos por perfil (CID, telefone, tokens).
// - Auditamos HISTORICO_VISUALIZADO na primeira página de cada consulta.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { redactPayload } from "./pii";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type HistoricoOrigem = "AUDITORIA" | "WHATSAPP" | "WORKER";

export type HistoricoItem = {
  key: string; // origem:id — estável para react keys
  id: string;
  origem: HistoricoOrigem;
  ts: string; // ISO
  modulo: string | null;
  acao: string;
  entidade: string | null;
  registro_id: string | null;
  ausencia_id: string | null;
  empresa_id: string | null;
  projeto_id: string | null;
  usuario_id: string | null;
  usuario_nome: string | null;
  perfil: string | null;
  origem_texto: string | null;
  sucesso: boolean | null;
  resumo: string | null;
};

export type HistoricoFiltros = {
  data_de?: string | null;
  data_ate?: string | null;
  empresa_id?: string | null;
  projeto_id?: string | null;
  colaborador_id?: string | null;
  ausencia_id?: string | null;
  protocolo?: string | null;
  modulo?: string | null;
  acao?: string | null;
  usuario_id?: string | null;
  origem?: HistoricoOrigem | "TODAS" | null;
  q?: string | null;
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const FiltrosSchema = z
  .object({
    data_de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    data_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    empresa_id: z.string().uuid().nullish(),
    projeto_id: z.string().uuid().nullish(),
    colaborador_id: z.string().uuid().nullish(),
    ausencia_id: z.string().uuid().nullish(),
    protocolo: z.string().trim().max(60).nullish(),
    modulo: z.string().trim().max(40).nullish(),
    acao: z.string().trim().max(60).nullish(),
    usuario_id: z.string().uuid().nullish(),
    origem: z.enum(["AUDITORIA", "WHATSAPP", "WORKER", "TODAS"]).nullish(),
    q: z.string().trim().max(120).nullish(),
  })
  .strict();

const ListarInput = z.object({
  filtros: FiltrosSchema.default({}),
  page: z.number().int().min(0).max(200).default(0),
  pageSize: z.number().int().min(10).max(100).default(50),
});

const DetalheInput = z.object({
  origem: z.enum(["AUDITORIA", "WHATSAPP", "WORKER"]),
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Helpers de sessão / roles
// ---------------------------------------------------------------------------

async function getRoles(supabase: {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, val: string) => Promise<{ data: unknown; error: unknown }>;
    };
  };
}, userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) return [];
  return (data as { role: string }[] | null ?? []).map((r) => r.role);
}

// ---------------------------------------------------------------------------
// Lista de eventos (unificada)
// ---------------------------------------------------------------------------

export const listarHistorico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListarInput.parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const f = data.filtros ?? {};
    const roles = await getRoles(supabase as never, userId);

    // Resolver ausencia_id a partir do protocolo, quando fornecido.
    let ausenciaIdFromProtocolo: string | null = null;
    if (f.protocolo && f.protocolo.length >= 3) {
      const { data: a } = await supabase
        .from("ausencias")
        .select("id")
        .ilike("protocolo", `%${f.protocolo.toUpperCase()}%`)
        .limit(1)
        .maybeSingle();
      if (a?.id) ausenciaIdFromProtocolo = a.id as string;
    }

    const registroFilter =
      f.ausencia_id ?? ausenciaIdFromProtocolo ?? null;

    // ----- audit_logs -----
    const wantsOrigem = f.origem ?? "TODAS";
    const items: HistoricoItem[] = [];

    if (wantsOrigem === "TODAS" || wantsOrigem === "AUDITORIA") {
      let q = supabase
        .from("audit_logs")
        .select(
          "id, created_at, usuario_id, usuario_nome, perfil, empresa_id, projeto_id, modulo, registro_id, acao, entidade, sucesso, origem, observacoes",
        )
        .order("created_at", { ascending: false })
        .limit(500);

      if (f.data_de) q = q.gte("created_at", `${f.data_de}T00:00:00Z`);
      if (f.data_ate) q = q.lte("created_at", `${f.data_ate}T23:59:59Z`);
      if (f.empresa_id) q = q.eq("empresa_id", f.empresa_id);
      if (f.projeto_id) q = q.eq("projeto_id", f.projeto_id);
      if (f.modulo) q = q.eq("modulo", f.modulo);
      if (f.acao) q = q.eq("acao", f.acao as never);
      if (f.usuario_id) q = q.eq("usuario_id", f.usuario_id);
      if (registroFilter) q = q.eq("registro_id", registroFilter);
      if (f.q && f.q.length >= 2) {
        const like = `%${f.q}%`;
        q = q.or(
          `usuario_nome.ilike.${like},entidade.ilike.${like},observacoes.ilike.${like}`,
        );
      }

      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      for (const r of (rows ?? []) as Record<string, unknown>[]) {
        items.push({
          key: `AUDITORIA:${r.id as string}`,
          id: r.id as string,
          origem: "AUDITORIA",
          ts: r.created_at as string,
          modulo: (r.modulo as string) ?? null,
          acao: r.acao as string,
          entidade: (r.entidade as string) ?? null,
          registro_id: (r.registro_id as string) ?? null,
          ausencia_id: null,
          empresa_id: (r.empresa_id as string) ?? null,
          projeto_id: (r.projeto_id as string) ?? null,
          usuario_id: (r.usuario_id as string) ?? null,
          usuario_nome: (r.usuario_nome as string) ?? null,
          perfil: (r.perfil as string) ?? null,
          origem_texto: (r.origem as string) ?? null,
          sucesso: (r.sucesso as boolean) ?? null,
          resumo: (r.observacoes as string) ?? null,
        });
      }
    }

    // ----- whatsapp_outbox_eventos -----
    if (wantsOrigem === "TODAS" || wantsOrigem === "WHATSAPP") {
      let q = supabase
        .from("whatsapp_outbox_eventos")
        .select(
          "id, created_at, outbox_id, evento, status_anterior, status_novo, codigo, mensagem_resumida",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (f.data_de) q = q.gte("created_at", `${f.data_de}T00:00:00Z`);
      if (f.data_ate) q = q.lte("created_at", `${f.data_ate}T23:59:59Z`);
      const { data: rows } = await q;
      // Se não temos permissão, rows vem vazio — silencioso.
      for (const r of (rows ?? []) as Record<string, unknown>[]) {
        items.push({
          key: `WHATSAPP:${r.id as string}`,
          id: r.id as string,
          origem: "WHATSAPP",
          ts: r.created_at as string,
          modulo: "whatsapp",
          acao: (r.evento as string) ?? "WHATSAPP_EVENTO",
          entidade: "whatsapp_outbox",
          registro_id: (r.outbox_id as string) ?? null,
          ausencia_id: null,
          empresa_id: null,
          projeto_id: null,
          usuario_id: null,
          usuario_nome: null,
          perfil: null,
          origem_texto: "worker",
          sucesso:
            r.status_novo === "FALHOU_DEFINITIVO" || r.status_novo === "FALHOU_TEMPORARIO"
              ? false
              : true,
          resumo:
            (r.mensagem_resumida as string) ??
            `${(r.status_anterior as string) ?? "?"} → ${(r.status_novo as string) ?? "?"}`,
        });
      }
    }

    // ----- whatsapp_worker_execucoes -----
    if (wantsOrigem === "TODAS" || wantsOrigem === "WORKER") {
      let q = supabase
        .from("whatsapp_worker_execucoes")
        .select(
          "id, created_at, worker, status, selecionadas, enviadas, falhas_temporarias, falhas_definitivas, ignoradas, duracao_ms",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (f.data_de) q = q.gte("created_at", `${f.data_de}T00:00:00Z`);
      if (f.data_ate) q = q.lte("created_at", `${f.data_ate}T23:59:59Z`);
      const { data: rows } = await q;
      for (const r of (rows ?? []) as Record<string, unknown>[]) {
        items.push({
          key: `WORKER:${r.id as string}`,
          id: r.id as string,
          origem: "WORKER",
          ts: r.created_at as string,
          modulo: "whatsapp",
          acao: `WORKER_${(r.status as string) ?? "EXEC"}`,
          entidade: "whatsapp_worker",
          registro_id: null,
          ausencia_id: null,
          empresa_id: null,
          projeto_id: null,
          usuario_id: null,
          usuario_nome: (r.worker as string) ?? "worker",
          perfil: "system",
          origem_texto: "cron",
          sucesso: r.status === "OK",
          resumo: `sel:${r.selecionadas ?? 0} · env:${r.enviadas ?? 0} · falhas:${(r.falhas_temporarias ?? 0) as number + (r.falhas_definitivas as number ?? 0)} · ${r.duracao_ms ?? 0}ms`,
        });
      }
    }

    // Merge por timestamp desc + paginação em memória.
    items.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    const total = items.length;
    const from = data.page * data.pageSize;
    const slice = items.slice(from, from + data.pageSize);

    // Fire-and-forget: audita a visualização (somente primeira página).
    if (data.page === 0) {
      void supabase.from("audit_logs").insert({
        usuario_id: userId,
        acao: "HISTORICO_VISUALIZADO",
        modulo: "historico",
        entidade: "historico_eventos",
        empresa_id: f.empresa_id ?? null,
        projeto_id: f.projeto_id ?? null,
        origem: "app",
        sucesso: true,
        observacoes:
          `filtros=${JSON.stringify({
            de: f.data_de ?? null,
            ate: f.data_ate ?? null,
            origem: wantsOrigem,
            modulo: f.modulo ?? null,
            acao: f.acao ?? null,
            protocolo: f.protocolo ?? null,
          })} · retornados=${slice.length}`,
      });
    }

    return {
      items: slice,
      total,
      page: data.page,
      pageSize: data.pageSize,
      hasMore: from + slice.length < total,
      roles,
    };
  });

// ---------------------------------------------------------------------------
// Detalhe de um evento
// ---------------------------------------------------------------------------

export const obterEventoDetalhe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => DetalheInput.parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const roles = await getRoles(supabase as never, userId);

    if (data.origem === "AUDITORIA") {
      const { data: row, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Evento não encontrado.");
      const r = row as Record<string, unknown>;
      return {
        origem: "AUDITORIA" as const,
        id: r.id as string,
        ts: r.created_at as string,
        acao: r.acao as string,
        modulo: (r.modulo as string) ?? null,
        entidade: (r.entidade as string) ?? null,
        registro_id: (r.registro_id as string) ?? null,
        empresa_id: (r.empresa_id as string) ?? null,
        projeto_id: (r.projeto_id as string) ?? null,
        usuario_nome: (r.usuario_nome as string) ?? null,
        usuario_id: (r.usuario_id as string) ?? null,
        perfil: (r.perfil as string) ?? null,
        origem_texto: (r.origem as string) ?? null,
        ip: (r.ip as string) ?? null,
        sucesso: (r.sucesso as boolean) ?? null,
        observacoes: (r.observacoes as string) ?? null,
        antes: redactPayload(r.antes, roles),
        depois: redactPayload(r.depois, roles),
        roles,
      };
    }

    if (data.origem === "WHATSAPP") {
      const { data: row, error } = await supabase
        .from("whatsapp_outbox_eventos")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Evento não encontrado.");
      const r = row as Record<string, unknown>;
      const showProviderId = roles.includes("super_admin");
      return {
        origem: "WHATSAPP" as const,
        id: r.id as string,
        ts: r.created_at as string,
        outbox_id: (r.outbox_id as string) ?? null,
        evento: (r.evento as string) ?? null,
        status_anterior: (r.status_anterior as string) ?? null,
        status_novo: (r.status_novo as string) ?? null,
        codigo: (r.codigo as string) ?? null,
        provider_message_id: showProviderId
          ? ((r.provider_message_id as string) ?? null)
          : null,
        mensagem_resumida: (r.mensagem_resumida as string) ?? null,
        metadata_segura: redactPayload(r.metadata_segura, roles),
        roles,
      };
    }

    // WORKER
    const { data: row, error } = await supabase
      .from("whatsapp_worker_execucoes")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Execução não encontrada.");
    const r = row as Record<string, unknown>;
    return {
      origem: "WORKER" as const,
      id: r.id as string,
      ts: r.created_at as string,
      execution_id: (r.execution_id as string) ?? null,
      worker: (r.worker as string) ?? null,
      status: (r.status as string) ?? null,
      inicio: (r.inicio as string) ?? null,
      fim: (r.fim as string) ?? null,
      duracao_ms: (r.duracao_ms as number) ?? null,
      selecionadas: (r.selecionadas as number) ?? null,
      enviadas: (r.enviadas as number) ?? null,
      falhas_temporarias: (r.falhas_temporarias as number) ?? null,
      falhas_definitivas: (r.falhas_definitivas as number) ?? null,
      ignoradas: (r.ignoradas as number) ?? null,
      detalhes: redactPayload(r.detalhes, roles),
      roles,
    };
  });

// ---------------------------------------------------------------------------
// Suporte para filtros: listagens leves para dropdowns
// ---------------------------------------------------------------------------

export const listarFiltrosDoHistorico = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [empresas, projetos] = await Promise.all([
      supabase.from("empresas").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("projetos").select("id, nome, empresa_id").eq("ativo", true).order("nome"),
    ]);
    return {
      empresas: (empresas.data ?? []) as { id: string; nome: string }[],
      projetos: (projetos.data ?? []) as {
        id: string;
        nome: string;
        empresa_id: string;
      }[],
    };
  });
