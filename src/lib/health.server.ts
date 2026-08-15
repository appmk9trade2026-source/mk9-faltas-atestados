import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LogContext } from "./observability.server";
import { crypto } from "crypto";

/**
 * Filtros de incidentes - NÃO criar incidentes para erros esperados.
 */
const IGNORED_CATEGORIES = ["VALIDATION", "AUTH"];
const IGNORED_MESSAGES = [
  "Já existe um lançamento",
  "Já existe ausência ativa",
  "Protocolo em duplicidade",
  "Permission denied", // RLS normal
  "Not found",
  "JWT expired"
];

/**
 * Calcula o fingerprint determinístico e sanitizado.
 */
function calculateFingerprint(context: LogContext, error: any): string {
  const safeErrorCode = error?.code || "NO_CODE";
  const components = [
    context.module,
    context.operation,
    context.stage || "unknown",
    context.category,
    safeErrorCode
  ];
  
  const rawString = components.join("|").toLowerCase();
  return Buffer.from(rawString).toString('base64');
}

/**
 * Agrega um erro em um incidente operacional.
 */
export async function aggregateIncident(context: LogContext, error: unknown) {
  // 1. Filtros
  if (IGNORED_CATEGORIES.includes(context.category)) return;
  
  const rawError = error as any;
  const message = rawError?.message || "";
  if (IGNORED_MESSAGES.some(msg => message.includes(msg))) return;

  // 2. Fingerprint
  const fingerprint = calculateFingerprint(context, rawError);

  try {
    // 3. Upsert atômico (ou busca e atualização)
    // Usamos select primeiro para evitar conflitos de transação complexos em ambientes serverless se o fingerprint já existir.
    const { data: existing } = await supabaseAdmin
      .from("operational_health_incidents")
      .select("id, occurrence_count, affected_users_count, metadata")
      .eq("fingerprint", fingerprint)
      .in("status", ["OPEN", "MONITORING"])
      .maybeSingle();

    if (existing) {
      // Atualizar incidente existente
      const newMetadata = existing.metadata as any;
      const affectedUsers = new Set(newMetadata.affected_users || []);
      if (context.userId) affectedUsers.add(context.userId);

      await supabaseAdmin
        .from("operational_health_incidents")
        .update({
          occurrence_count: Number(existing.occurrence_count) + 1,
          affected_users_count: affectedUsers.size,
          last_seen_at: new Date().toISOString(),
          sample_trace_id: context.traceId,
          metadata: { ...newMetadata, affected_users: Array.from(affectedUsers).slice(0, 100) },
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id);
    } else {
      // Criar novo incidente
      const affectedUsers = context.userId ? [context.userId] : [];
      await supabaseAdmin
        .from("operational_health_incidents")
        .insert({
          fingerprint,
          module: context.module,
          operation: context.operation,
          stage: context.stage,
          category: context.category,
          severity: context.severity,
          status: "OPEN",
          occurrence_count: 1,
          affected_users_count: affectedUsers.length,
          sample_trace_id: context.traceId,
          metadata: { affected_users: affectedUsers }
        });
    }
  } catch (err) {
    // Falha silenciosa para não quebrar o log original
    console.error("[HEALTH_AGGREGATION_FAILURE]", err);
  }
}
