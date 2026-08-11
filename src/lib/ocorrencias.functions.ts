// src/lib/ocorrencias.functions.ts
// Reestruturação AMBEV - Foundation Stage 1
// Implementação de Server Functions para Ocorrências de Ponto.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/rbac/guards.server";
import { PERMISSION_MAP } from "@/lib/permissions-map";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const uuid = z.string().uuid();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");

/** Schema para criação de ocorrência de ponto AMBEV */
export const ocorrenciaPontoSchema = z.object({
  empresa_id: uuid,
  projeto_id: uuid,
  colaborador_id: uuid, 
  data_ocorrencia: iso,
  motivo: z.string().trim().min(5).max(200),
  justificativa: z.string().trim().min(10).max(2000),
  arquivo_url: z.string().trim().url("URL de anexo inválida"),
  arquivo_nome: z.string().trim().max(255).optional(),
  ausencia_id: uuid.nullable().optional(),
});

export type OcorrenciaPontoInput = z.infer<typeof ocorrenciaPontoSchema>;

/** Lista ocorrências com base no escopo do usuário */
export const listarOcorrencias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => z.object({
    status: z.enum(["PENDENTE", "APROVADA", "REPROVADA", "CANCELADA"]).optional(),
    projeto_id: uuid.optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("ocorrencias_ponto")
      .select(`
        *,
        projeto:projeto_id (nome),
        colaborador:colaborador_id (nome_completo, matricula),
        registrado_por_user:registrado_por (id)
      `)
      .order("created_at", { ascending: false });

    if (data.status) query = query.eq("status", data.status);
    if (data.projeto_id) query = query.eq("projeto_id", data.projeto_id);

    const { data: ocorrencias, error } = await query;
    if (error) throw new Error(`Erro ao listar ocorrências: ${error.message}`);
    return ocorrencias;
  });

/** Cria uma nova ocorrência de ponto */
export const criarOcorrencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => ocorrenciaPontoSchema.parse(data))
  .handler(async ({ data, context }) => {
    // 1. Validar permissão (Supervisor, Coordenador, RH)
    await requirePermission({
      ctx: context,
      permission: PERMISSION_MAP.createAbsence, // Reutilizando permissão de lançamento
      projetoId: data.projeto_id,
      empresaId: data.empresa_id,
    });

    // 2. Validar se o projeto é AMBEV (ID 0a6c2ac6-2872-47a0-b818-b4660ef81244 ou prefixo)
    const { data: projeto } = await context.supabase
      .from("projetos")
      .select("nome, empresa_id")
      .eq("id", data.projeto_id)
      .single();

    const isAmbev = projeto?.empresa_id === '0a6c2ac6-2872-47a0-b818-b4660ef81244' || projeto?.nome.toUpperCase().includes('AMBEV');
    if (!isAmbev) {
      throw new Error("Ocorrência de Ponto é um fluxo exclusivo para projetos AMBEV.");
    }

    // 3. Persistir
    const { data: newOcorrencia, error } = await context.supabase
      .from("ocorrencias_ponto")
      .insert({
        empresa_id: data.empresa_id,
        projeto_id: data.projeto_id,
        colaborador_id: data.colaborador_id,
        data_ocorrencia: data.data_ocorrencia,
        motivo: data.motivo,
        justificativa: data.justificativa,
        arquivo_url: data.arquivo_url,
        arquivo_nome: data.arquivo_nome,
        ausencia_id: data.ausencia_id,
        registrado_por: context.userId,
        status: "PENDENTE",
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar ocorrência: ${error.message}`);

    // 4. Log de auditoria (usando supabaseAdmin para garantir privilégios)
    await supabaseAdmin.rpc("log_audit_event", {
      _modulo: "ocorrencias",
      _acao: "CRIAR",
      _entidade: "Ocorrência Ponto",
      _registro_id: newOcorrencia.id,
      _empresa_id: data.empresa_id,
      _projeto_id: data.projeto_id,
      _usuario_id: context.userId,
      _sucesso: true,
      _observacoes: `Nova ocorrência de ponto protocolada: ${newOcorrencia.protocolo}`,
      _origem: "server"
    } as any);

    return newOcorrencia;
  });

/** Aprova ou reprova uma ocorrência (RH/Coordenador apenas) */
export const processarOcorrencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => z.object({
    id: uuid,
    status: z.enum(["APROVADA", "REPROVADA"]),
    parecer: z.string().trim().min(5).max(1000),
  }).parse(data))
  .handler(async ({ data, context }) => {
    // 1. Validar permissão (RH ou Coordenador)
    const roles = (context.claims?.roles as string[]) || [];
    const canProcess = roles.some((r: string) => ["rh", "coordenador", "super_admin"].includes(r));
    if (!canProcess) throw new Error("Apenas RH ou Coordenadores podem processar ocorrências.");


    // 2. Buscar ocorrência para conferir escopo
    const { data: ocorrencia } = await context.supabase
      .from("ocorrencias_ponto")
      .select("projeto_id, empresa_id, status")
      .eq("id", data.id)
      .single();

    if (!ocorrencia) throw new Error("Ocorrência não encontrada.");
    if (ocorrencia.status !== "PENDENTE") throw new Error("Esta ocorrência já foi processada.");

    // 3. Atualizar
    const { data: updated, error } = await context.supabase
      .from("ocorrencias_ponto")
      .update({
        status: data.status,
        parecer_processamento: data.parecer,
        processado_por: context.userId,
        processado_em: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select()
      .single();

    if (error) throw new Error(`Erro ao processar ocorrência: ${error.message}`);

    // 4. Auditoria
    await supabaseAdmin.rpc("log_audit_event", {
      _modulo: "ocorrencias",
      _acao: "PROCESSAR",
      _entidade: "Ocorrência Ponto",
      _registro_id: data.id,
      _empresa_id: ocorrencia.empresa_id,
      _projeto_id: ocorrencia.projeto_id,
      _usuario_id: context.userId,
      _sucesso: true,
      _observacoes: `Ocorrência ${data.status}: ${data.parecer}`,
      _origem: "server"
    } as any);

    return updated;
  });
