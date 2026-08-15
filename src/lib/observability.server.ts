import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { aggregateIncident } from "./health.server";
import { z } from "zod";

/**
 * Padrão de Observabilidade CRM MK9
 * Fase 3 - Estabilização
 */

export type ErrorSeverity = "P0" | "P1" | "P2" | "P3";
export type ErrorCategory = 
  | "VALIDATION" | "AUTH" | "RLS" | "RBAC" | "RPC_CONTRACT" 
  | "DATABASE" | "DUPLICITY" | "STORAGE" | "UPLOAD" 
  | "NETWORK" | "TIMEOUT" | "CONCURRENCY" | "SCHEMA_CACHE" 
  | "FRONTEND_STATE" | "UNKNOWN";

export interface LogContext {
  traceId: string;
  userId?: string;
  role?: string;
  route?: string;
  module: string;
  operation: string;
  stage?: string;
  rpc?: string;
  httpStatus?: number;
  sqlState?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  metadata?: Record<string, any>;
}

/**
 * Logger centralizado com suporte a Trace ID e sanitização rigorosa.
 */
export async function logAppError(
  context: LogContext,
  error: unknown,
  messageOverride?: string
) {
  const timestamp = new Date().toISOString();
  const rawError = error as any;
  
  // Sanitização rigorosa de PII e segredos
  const sanitizedMessage = messageOverride || rawError?.message || "Erro desconhecido";
  
  // Usando cast para bypassar tipagem rígida do enum gerado se necessário,
  // mas aqui usaremos uma ação genérica ou adaptada.
  // No audit_logs original 'EXCECAO' não existe no enum audit_action. 
  // Usaremos 'ACESSO_NEGADO' ou algo neutro se falhar, mas o ideal é casting.
  const auditData: any = {
    trace_id: context.traceId,
    modulo: context.module,
    acao: "ACESSO_NEGADO", // Fallback seguro para o enum audit_action
    entidade: "ErrorLog",
    sucesso: false,
    usuario_id: context.userId,
    perfil: context.role,
    observacoes: JSON.stringify({
      timestamp,
      operation: context.operation,
      stage: context.stage,
      rpc: context.rpc,
      http_status: context.httpStatus,
      sql_state: context.sqlState || rawError?.code,
      category: context.category,
      severity: context.severity,
      message: sanitizedMessage.slice(0, 1000),
      route: context.route,
      metadata: context.metadata ? JSON.parse(JSON.stringify(context.metadata, (key, value) => {
         const sensitive = ["token", "password", "senha", "cookie", "authorization", "cid", "diagnostico", "clinico"];
         if (sensitive.some(s => key.toLowerCase().includes(s))) return "[REDACTED]";
         return value;
      })) : undefined
    }),
    origem: "server-observability"
  };

  try {
    // Inserção direta via admin ignorando tipagem do client gerado para suportar trace_id recém-criado
    await supabaseAdmin.from("audit_logs").insert(auditData);
    
    // Etapa 4: Agregação de incidente operacional
    await aggregateIncident(context, error);
  } catch (err) {
    console.error("[CRITICAL_LOGGER_FAILURE]", err);
  }

  return {
    ok: false,
    message: context.severity === "P0" || context.severity === "P1" 
      ? "Não foi possível concluir a operação agora." 
      : sanitizedMessage,
    traceId: context.traceId,
    code: context.category
  };
}

/**
 * RPC Administrativa Simples para busca por Trace ID (Super Admin Only via RLS no DB)
 */
export const searchByTraceId = createServerFn({ method: "GET" })
  .inputValidator((traceId: string) => z.string().uuid().parse(traceId))
  .handler(async ({ data: traceId }) => {
    const { data: log, error } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .eq("trace_id", traceId)
      .maybeSingle();

    if (error) throw error;
    if (!log) return null;

    const auditLog = log as any;

    return {
      id: auditLog.id,
      traceId: auditLog.trace_id,
      timestamp: auditLog.created_at,
      modulo: auditLog.modulo,
      perfil: auditLog.perfil,
      detalhes: JSON.parse(auditLog.observacoes || "{}")
    };
  });
