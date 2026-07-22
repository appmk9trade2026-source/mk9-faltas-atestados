import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server function pública para o fluxo "Esqueci minha senha".
 *
 * IMPORTANTE:
 *  - Este fluxo NÃO é usado no "Primeiro acesso" — aquele é feito 100%
 *    client-side com e-mail + senha temporária (ver auth.tsx →
 *    FirstAccessDialog) e não envia e-mail.
 *  - Aqui, dispara e-mail oficial de recuperação pelo Lovable Cloud.
 *  - Logs vão em `public.primeiro_acesso_logs` (nome herdado; usada
 *    exclusivamente para recuperação de senha — ver docs/security).
 *
 * Resultados registrados: RECUPERACAO_SOLICITADA, RECUPERACAO_ENVIADA,
 * RECUPERACAO_FALHOU, RATE_LIMIT, USUARIO_INATIVO, IDENTIDADE_AUTH_AUSENTE.
 * Nunca armazena senha, token ou link completo.
 */

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  redirect_to: z.string().url().max(500),
  client_request_id: z.string().trim().max(64).optional().nullable(),
  user_agent: z.string().trim().max(500).optional().nullable(),
});

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const shown = local.slice(0, Math.min(2, local.length));
  const hidden = "*".repeat(Math.max(1, local.length - shown.length));
  return `${shown}${hidden}@${domain}`;
}

type Resultado =
  | "RECUPERACAO_SOLICITADA"
  | "RECUPERACAO_ENVIADA"
  | "RECUPERACAO_FALHOU"
  | "RATE_LIMIT"
  | "USUARIO_INATIVO"
  | "IDENTIDADE_AUTH_AUSENTE";

export const solicitarRecuperacaoSenha = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const request_id =
      data.client_request_id ??
      (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
    const ip = null;
    const user_agent = data.user_agent ?? null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email_masked = maskEmail(data.email);

    async function log(
      resultado: Resultado,
      codigo_erro?: string | null,
      mensagem_erro?: string | null,
    ) {
      await supabaseAdmin
        .from("primeiro_acesso_logs")
        .insert({
          email_masked,
          resultado,
          codigo_erro: codigo_erro ?? null,
          mensagem_erro: mensagem_erro ? mensagem_erro.slice(0, 500) : null,
          request_id,
          ip,
          user_agent,
        })
        .then(() => {}, () => {});
    }

    // Marca a solicitação (sempre, para auditoria).
    await log("RECUPERACAO_SOLICITADA");

    // 1) Usuário existe e está ativo?
    const prof = await supabaseAdmin
      .from("profiles")
      .select("id, ativo")
      .eq("email", data.email)
      .maybeSingle();

    if (prof.error) {
      await log("RECUPERACAO_FALHOU", "profiles_lookup", prof.error.message);
      return { ok: false as const };
    }

    if (!prof.data) {
      // Resposta neutra — não confirma existência.
      return { ok: true as const };
    }

    if (prof.data.ativo === false) {
      await log("USUARIO_INATIVO");
      return { ok: true as const };
    }

    // 2) Identidade em auth.users?
    const gu = await supabaseAdmin.auth.admin.getUserById(prof.data.id);
    if (gu.error || !gu.data?.user) {
      await log(
        "IDENTIDADE_AUTH_AUSENTE",
        gu.error?.name ?? "no_auth_user",
        gu.error?.message ?? "Perfil sem identidade em auth.users",
      );
      return { ok: true as const };
    }

    // 3) Dispara o e-mail oficial de recuperação (server-side)
    const send = await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
      redirectTo: data.redirect_to,
    });

    if (send.error) {
      const err = send.error as { code?: string; status?: number; name?: string; message: string };
      const codigo = err.code ?? err.name ?? (err.status ? `http_${err.status}` : "unknown");
      const resultado: Resultado = err.status === 429 ? "RATE_LIMIT" : "RECUPERACAO_FALHOU";
      await log(resultado, codigo, err.message);
      return { ok: resultado === "RATE_LIMIT" ? (true as const) : (false as const) };
    }

    await log("RECUPERACAO_ENVIADA");
    return { ok: true as const };
  });
