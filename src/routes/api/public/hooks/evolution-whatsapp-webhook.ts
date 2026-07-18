// ============================================================================
// FASE 4 · Webhook público da Evolution API.
// Endpoint: /api/public/hooks/evolution-whatsapp-webhook
// Segurança: header `x-webhook-secret` deve conter EVOLUTION_WEBHOOK_SECRET.
// Aceita apenas POST. Rejeita payloads > EVOLUTION_WEBHOOK_MAX_BYTES (default 32 KiB).
// Nunca envia mensagens. Nunca processa fila. Apenas sincroniza status.
// ============================================================================
import { createFileRoute } from "@tanstack/react-router";
import {
  parseEvolutionPayload,
  timingSafeEqualStr,
} from "@/lib/whatsapp-webhook";

const MAX_BYTES_DEFAULT = 32 * 1024;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handlePost(request: Request): Promise<Response> {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!secret) {
    // Segredo não configurado: não expor detalhes.
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const provided =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("x-evolution-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (!provided || !timingSafeEqualStr(provided, secret)) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const maxBytes = Math.max(
    1024,
    Math.min(1_048_576, Number(process.env.EVOLUTION_WEBHOOK_MAX_BYTES ?? MAX_BYTES_DEFAULT)),
  );
  const declaredLen = Number(request.headers.get("content-length") ?? "0");
  if (declaredLen && declaredLen > maxBytes) {
    return jsonResponse({ ok: false, error: "payload_too_large" }, 413);
  }

  const raw = await request.text();
  if (raw.length > maxBytes) {
    return jsonResponse({ ok: false, error: "payload_too_large" }, 413);
  }

  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = parseEvolutionPayload(body);

  // Sem provider_message_id → não há como localizar a mensagem. 200 + IGNORADO.
  if (!parsed.providerMessageId) {
    return jsonResponse({ ok: true, action: "WEBHOOK_IGNORADO_SEM_MESSAGE_ID" });
  }

  // Status desconhecido → 200 + IGNORADO (não gerar erro para não induzir retry externo).
  if (!parsed.status) {
    return jsonResponse({ ok: true, action: "WEBHOOK_IGNORADO_STATUS_DESCONHECIDO" });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc(
    "whatsapp_outbox_processar_webhook" as any,
    {
      p_instance: parsed.instance,
      p_provider_message_id: parsed.providerMessageId,
      p_status_novo: parsed.status,
      p_codigo: parsed.codigo,
      p_mensagem: parsed.mensagem,
      p_metadata: { source: "evolution-webhook" } as any,
    } as any,
  );

  if (error) {
    // Falha da RPC: 500 sem detalhes de infraestrutura.
    return jsonResponse({ ok: false, error: "rpc_error" }, 500);
  }

  return jsonResponse({ ok: true, result: data ?? null });
}

export const Route = createFileRoute("/api/public/hooks/evolution-whatsapp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePost(request),
      GET: async () =>
        new Response("Method Not Allowed", {
          status: 405,
          headers: { allow: "POST" },
        }),
      PUT: async () =>
        new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } }),
      DELETE: async () =>
        new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } }),
      PATCH: async () =>
        new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } }),
    },
  },
});
