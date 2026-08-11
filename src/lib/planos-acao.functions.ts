import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/rbac/guards.server";

const uuid = z.string().uuid();

export const tipoAlvoSchema = z.enum(["PROJETO", "COLABORADOR"]);
export const statusPlanoSchema = z.enum(["NAO_INICIADO", "EM_ANDAMENTO", "SUSPENSO", "CONCLUIDO", "CANCELADO"]);
export const prioridadePlanoSchema = z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]);

export const planoAcaoSchema = z.object({
  tipo_alvo: tipoAlvoSchema,
  projeto_id: uuid,
  colaborador_id: uuid.nullable().optional(),
  titulo: z.string().min(3).max(200),
  problema_identificado: z.string().min(1),
  indicador_atual: z.string().nullable().optional(),
  meta: z.string().min(1),
  acao_proposta: z.string().min(1),
  responsavel_usuario_id: uuid,
  status: statusPlanoSchema,
  prioridade: prioridadePlanoSchema,
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacoes: z.string().nullable().optional(),
});

export type PlanoAcaoInput = z.infer<typeof planoAcaoSchema>;

export const criarPlanoAcao = createServerFn({ method: "POST" })
  .validator((data: unknown) => planoAcaoSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: input, context }) => {
    const { supabase, userId } = context;

    // Gate RBAC: Somente coordenadores, RH ou Super Admin
    await requirePermission({
      ctx: { supabase, userId },
      permission: "relatorio.visualizar", // Usando permissão existente compatível com gestão operacional
      route: "/planos-acao",
    });

    // Validar se colaborador pertence ao projeto
    if (input.tipo_alvo === "COLABORADOR" && input.colaborador_id) {
      const { data: colab, error: colabErr } = await supabase
        .from("colaboradores")
        .select("projeto_id")
        .eq("id", input.colaborador_id)
        .single();

      if (colabErr || !colab || colab.projeto_id !== input.projeto_id) {
        throw new Error("INVALID_PAYLOAD: O colaborador não pertence ao projeto selecionado.");
      }
    }

    // Validar se o responsável está no escopo da coordenação (se o criador for coordenador)
    const { data: roles } = await supabase.rpc("has_role", { _user_id: userId, _role: "coordenador" });
    if (roles === true) {
      const { data: respProfile } = await supabase
        .from("profiles")
        .select("coordenador_usuario_id")
        .eq("id", input.responsavel_usuario_id)
        .single();
      
      if (respProfile && respProfile.coordenador_usuario_id !== userId && input.responsavel_usuario_id !== userId) {
         throw new Error("SCOPE_DENIED: O responsável deve pertencer à sua coordenação.");
      }
    }

    const { data, error } = await supabase
      .from("planos_acao")
      .insert({
        ...input,
        criado_por_usuario_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error("[criarPlanoAcao]", error);
      throw new Error(`DATABASE_ERROR: ${error.message}`);
    }

    return data;
  });

const listInputSchema = z.object({
  status: statusPlanoSchema.optional(),
  projeto_id: uuid.optional(),
}).optional();

export const listarPlanosAcao = createServerFn({ method: "GET" })
  .validator((data: unknown) => listInputSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: input, context }) => {
    const { supabase } = context;

    let query = supabase
      .from("planos_acao")
      .select(`
        *,
        projeto:projetos(nome),
        colaborador:colaboradores(nome_completo, matricula)
      `)
      .order("created_at", { ascending: false });

    if (input?.status) query = query.eq("status", input.status);
    if (input?.projeto_id) query = query.eq("projeto_id", input.projeto_id);

    const { data, error } = await query;

    if (error) {
      console.error("[listarPlanosAcao]", error);
      throw new Error(`DATABASE_ERROR: ${error.message}`);
    }

    const rows = data ?? [];
    const ids = Array.from(
      new Set(
        rows.flatMap((r: any) =>
          [r.responsavel_usuario_id, r.criado_por_usuario_id].filter(Boolean),
        ),
      ),
    );

    let nomes = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids);
      nomes = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    }

    return rows.map((r: any) => ({
      ...r,
      responsavel: r.responsavel_usuario_id
        ? { nome: nomes.get(r.responsavel_usuario_id) ?? null }
        : null,
      criador: r.criado_por_usuario_id
        ? { nome: nomes.get(r.criado_por_usuario_id) ?? null }
        : null,
    }));
  });

const idInputSchema = z.object({ id: uuid });

export const obterPlanoAcao = createServerFn({ method: "GET" })
  .validator((data: unknown) => idInputSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: input, context }) => {
    const { supabase } = context;

    const { data, error } = await supabase
      .from("planos_acao")
      .select(`
        *,
        projeto:projetos(nome),
        colaborador:colaboradores(nome_completo, matricula)
      `)
      .eq("id", input.id)
      .single();

    if (error) {
      console.error("[obterPlanoAcao]", error);
      throw new Error(`DATABASE_ERROR: ${error.message}`);
    }

    const ids = [data.responsavel_usuario_id, data.criado_por_usuario_id].filter(
      Boolean,
    ) as string[];
    let nomes = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids);
      nomes = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
    }

    return {
      ...data,
      responsavel: data.responsavel_usuario_id
        ? { nome: nomes.get(data.responsavel_usuario_id) ?? null }
        : null,
      criador: data.criado_por_usuario_id
        ? { nome: nomes.get(data.criado_por_usuario_id) ?? null }
        : null,
    };
  });

