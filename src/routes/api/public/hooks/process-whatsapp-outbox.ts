// ============================================================================
// FASE 3 · Worker WhatsApp — endpoint público (chamado por pg_cron)
// Autenticação: header `apikey` deve conter SUPABASE_PUBLISHABLE_KEY.
// Segredos: EVOLUTION_BASE_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME,
// EVOLUTION_ENABLED (opcional, default "true").
// ============================================================================
import { createFileRoute } from "@tanstack/react-router";
import {
  classifyEvolutionError,
  isEvolutionAccepted,
  renderTemplate,
} from "@/lib/whatsapp-worker";

type OutboxItem = {
  id: string;
  telefone_hash: string;
  telefone_mascarado: string | null;
  template_id: string | null;
  template_codigo: string | null;
  template_versao: number | null;
  publico: "COLABORADOR" | "RH" | "SUPERVISOR";
  payload: Record<string, unknown>;
  provider: string;
  provider_instance: string | null;
  idempotency_key: string;
  tentativas: number;
};

const WORKER_NAME = "process-whatsapp-outbox@v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sendEvolutionText(args: {
  baseUrl: string;
  apiKey: string;
  instance: string;
  telefone: string;
  texto: string;
  idempotencyKey: string;
  timeoutMs: number;
}): Promise<{ ok: true; providerMessageId: string | null } | { ok: false; status: number | null; message: string }> {
  // Endpoint da Evolution API v2 estável para envio de texto:
  //   POST {BASE}/message/sendText/{instance}
  //   headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" }
  //   body: { number, text, options?: { delay, presence } }
  const url = `${args.baseUrl.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(args.instance)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: args.apiKey,
        "x-idempotency-key": args.idempotencyKey,
      },
      body: JSON.stringify({ number: args.telefone, text: args.texto }),
      signal: controller.signal,
    });
    const raw = await res.text();
    let parsed: any = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
    if (!isEvolutionAccepted(res.status)) {
      const msg = (parsed && (parsed.message || parsed.error)) || raw || `HTTP ${res.status}`;
      return { ok: false, status: res.status, message: String(msg).slice(0, 500) };
    }
    const providerMessageId =
      parsed?.key?.id ?? parsed?.messageId ?? parsed?.id ?? parsed?.data?.key?.id ?? null;
    return { ok: true, providerMessageId };
  } catch (err: any) {
    const status = err?.name === "AbortError" ? 408 : null;
    return { ok: false, status, message: (err?.message ?? "network error").slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }
}

async function handleRun(): Promise<Response> {
  const inicio = new Date();
  const executionId = `${WORKER_NAME}:${inicio.toISOString()}:${crypto.randomUUID()}`;

  const enabledEnv = (process.env.EVOLUTION_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabledEnv) {
    return jsonResponse({ ok: true, status: "PROVIDER_DESATIVADO", executionId });
  }
  const baseUrl = process.env.EVOLUTION_BASE_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceEnv = process.env.EVOLUTION_INSTANCE_NAME;
  if (!baseUrl || !apiKey || !instanceEnv) {
    return jsonResponse(
      { ok: false, error: "missing_secrets", missing: {
        EVOLUTION_BASE_URL: !baseUrl,
        EVOLUTION_API_KEY: !apiKey,
        EVOLUTION_INSTANCE_NAME: !instanceEnv,
      } },
      500,
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1) Recuperação de travadas (sempre roda antes do lote)
  const { data: recuperadas } = await supabaseAdmin.rpc(
    "whatsapp_outbox_recuperar_travadas",
    { p_timeout_seg: null } as any,
  );

  // 2) Reserva de lote
  const { data: lote, error: errLote } = await supabaseAdmin.rpc(
    "whatsapp_outbox_reservar_lote",
    { p_worker_id: executionId, p_limite: null } as any,
  );
  if (errLote) {
    await supabaseAdmin.rpc("whatsapp_outbox_registrar_execucao", {
      p_execution_id: executionId,
      p_worker: WORKER_NAME,
      p_status: "ERRO",
      p_inicio: inicio.toISOString(),
      p_fim: new Date().toISOString(),
      p_selecionadas: 0,
      p_enviadas: 0,
      p_falhas_temporarias: 0,
      p_falhas_definitivas: 0,
      p_ignoradas: 0,
      p_detalhes: { erro: errLote.message, recuperadas } as any,
    } as any);
    return jsonResponse({ ok: false, error: errLote.message }, 500);
  }

  const itens = ((lote ?? []) as unknown) as OutboxItem[];
  if (itens.length === 0) {
    await supabaseAdmin.rpc("whatsapp_outbox_registrar_execucao", {
      p_execution_id: executionId,
      p_worker: WORKER_NAME,
      p_status: itens.length === 0 ? "SEM_ITENS" : "OK",
      p_inicio: inicio.toISOString(),
      p_fim: new Date().toISOString(),
      p_selecionadas: 0,
      p_enviadas: 0,
      p_falhas_temporarias: 0,
      p_falhas_definitivas: 0,
      p_ignoradas: 0,
      p_detalhes: { recuperadas } as any,
    } as any);
    return jsonResponse({ ok: true, status: "SEM_ITENS", executionId, recuperadas });
  }

  // Pré-carrega templates usados no lote
  const templateIds = Array.from(new Set(itens.map((i) => i.template_id).filter(Boolean))) as string[];
  const { data: templates } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("id, codigo, versao, publico, conteudo, variaveis_permitidas, ativo")
    .in("id", templateIds.length ? templateIds : ["00000000-0000-0000-0000-000000000000"]);
  const byId = new Map((templates ?? []).map((t: any) => [t.id, t]));

  const timeoutMs = Math.max(3_000, Math.min(60_000, Number(process.env.EVOLUTION_TIMEOUT_MS ?? 15_000)));

  let enviadas = 0, falhasT = 0, falhasD = 0, ignoradas = 0;

  for (const item of itens) {
    const tpl = item.template_id ? byId.get(item.template_id) : null;
    if (!tpl || !tpl.ativo) {
      await supabaseAdmin.rpc("whatsapp_outbox_marcar_falha_definitiva", {
        p_id: item.id,
        p_codigo: "TEMPLATE_INVALIDO",
        p_mensagem_resumida: `Template ${item.template_codigo ?? item.template_id ?? "n/d"} não encontrado ou inativo`,
      } as any);
      falhasD++;
      continue;
    }

    // Telefone real precisa ser derivado do payload (evita PII em outras colunas).
    const telefoneReal = String((item.payload as any)?.telefone_e164 ?? (item.payload as any)?.telefone ?? "");
    if (!/^\d{10,15}$/.test(telefoneReal)) {
      await supabaseAdmin.rpc("whatsapp_outbox_marcar_falha_definitiva", {
        p_id: item.id,
        p_codigo: "TELEFONE_INVALIDO",
        p_mensagem_resumida: "Payload sem telefone válido no formato E.164",
      } as any);
      falhasD++;
      continue;
    }

    const texto = renderTemplate(tpl.conteudo, item.payload ?? {}, tpl.variaveis_permitidas);
    if (!texto.trim()) {
      await supabaseAdmin.rpc("whatsapp_outbox_marcar_falha_definitiva", {
        p_id: item.id,
        p_codigo: "PAYLOAD_INVALIDO",
        p_mensagem_resumida: "Renderização do template resultou vazia",
      } as any);
      falhasD++;
      continue;
    }

    // Evento ENVIO_INICIADO (informativo)
    await supabaseAdmin.from("whatsapp_outbox_eventos").insert({
      outbox_id: item.id,
      evento: "ENVIO_INICIADO",
      codigo: "WORKER",
      metadata_segura: { execution_id: executionId, tentativa: item.tentativas + 1 } as any,
    } as any);

    const result = await sendEvolutionText({
      baseUrl: baseUrl!,
      apiKey: apiKey!,
      instance: item.provider_instance ?? instanceEnv!,
      telefone: telefoneReal,
      texto,
      idempotencyKey: item.idempotency_key,
      timeoutMs,
    });

    if (result.ok) {
      await supabaseAdmin.rpc("whatsapp_outbox_marcar_enviado", {
        p_id: item.id,
        p_provider_message_id: result.providerMessageId ?? `evolution:${executionId}:${item.id}`,
      } as any);
      enviadas++;
    } else {
      const cls = classifyEvolutionError(result.status, result.message);
      if (cls.kind === "TEMPORARIA") {
        await supabaseAdmin.rpc("whatsapp_outbox_marcar_falha_temporaria", {
          p_id: item.id,
          p_codigo: cls.codigo,
          p_mensagem_resumida: cls.mensagem,
        } as any);
        falhasT++;
      } else {
        await supabaseAdmin.rpc("whatsapp_outbox_marcar_falha_definitiva", {
          p_id: item.id,
          p_codigo: cls.codigo,
          p_mensagem_resumida: cls.mensagem,
        } as any);
        falhasD++;
      }
    }
  }

  const fim = new Date();
  await supabaseAdmin.rpc("whatsapp_outbox_registrar_execucao", {
    p_execution_id: executionId,
    p_worker: WORKER_NAME,
    p_status: "OK",
    p_inicio: inicio.toISOString(),
    p_fim: fim.toISOString(),
    p_selecionadas: itens.length,
    p_enviadas: enviadas,
    p_falhas_temporarias: falhasT,
    p_falhas_definitivas: falhasD,
    p_ignoradas: ignoradas,
    p_detalhes: { recuperadas } as any,
  } as any);

  return jsonResponse({
    ok: true,
    executionId,
    selecionadas: itens.length,
    enviadas,
    falhas_temporarias: falhasT,
    falhas_definitivas: falhasD,
    recuperadas,
  });
}

function verifyApiKey(request: Request): boolean {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!expected) return false;
  const got = request.headers.get("apikey") ?? request.headers.get("x-api-key");
  return !!got && got === expected;
}

export const Route = createFileRoute("/api/public/hooks/process-whatsapp-outbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyApiKey(request)) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
        try {
          return await handleRun();
        } catch (err: any) {
          return jsonResponse({ ok: false, error: err?.message ?? "unknown" }, 500);
        }
      },
      GET: async ({ request }) => {
        // Permite health-check autenticado (mesmo apikey do cron).
        if (!verifyApiKey(request)) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
        return jsonResponse({ ok: true, worker: WORKER_NAME });
      },
    },
  },
});
