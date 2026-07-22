import { createServerFn } from "@tanstack/react-start";
import { getHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Server function pública para o fluxo "Primeiro acesso" / "Esqueci a senha".
 *
 * Diferente da chamada client-side `supabase.auth.resetPasswordForEmail`, aqui:
 *  1. normalizamos o e-mail (trim + lowercase);
 *  2. verificamos se existe usuário ATIVO em `public.profiles`;
 *  3. verificamos se existe identidade correspondente em `auth.users`;
 *  4. quando existe, disparamos o e-mail oficial de recuperação pelo serviço
 *     padrão do Lovable Cloud (via admin client, no servidor — sem depender
 *     de fetch do navegador que pode falhar silenciosamente);
 *  5. registramos SEMPRE o resultado em `public.primeiro_acesso_logs` com
 *     e-mail mascarado, código/mensagem do erro (quando houver), request_id,
 *     IP e user-agent.
 *
 * A resposta ao cliente é sempre neutra: `{ ok: true }` para casos válidos,
 * `{ ok: false }` apenas quando o servidor de auth realmente falhou ao enviar
 * — permitindo à UI mostrar a mensagem genérica "não foi possível concluir".
 * Nunca revela ao público se o e-mail existe.
 */

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  redirect_to: z.string().url().max(500),
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
  | "ENVIADO"
  | "USUARIO_INEXISTENTE"
  | "USUARIO_INATIVO"
  | "SEM_IDENTIDADE_AUTH"
  | "RATE_LIMITED"
  | "FALHA_TECNICA";

export const solicitarPrimeiroAcesso = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    let headers: Record<string, string | undefined> = {};
    try {
      headers = getHeaders() as Record<string, string | undefined>;
    } catch {
      // fora de contexto de request (ex.: prerender) — mantém headers vazios
    }
    const request_id =
      headers["x-request-id"] ??
      headers["cf-ray"] ??
      (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
    const ip =
      headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
      headers["x-real-ip"] ??
      null;
    const user_agent = headers["user-agent"] ?? null;

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
        .then(
          () => {},
          () => {},
        );
    }

    // 1) Usuário existe e está ativo?
    const prof = await supabaseAdmin
      .from("profiles")
      .select("id, ativo")
      .eq("email", data.email)
      .maybeSingle();

    if (prof.error) {
      await log("FALHA_TECNICA", "profiles_lookup", prof.error.message);
      return { ok: false as const };
    }

    if (!prof.data) {
      await log("USUARIO_INEXISTENTE");
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
        "SEM_IDENTIDADE_AUTH",
        gu.error?.name ?? "no_auth_user",
        gu.error?.message ?? "Perfil sem identidade em auth.users",
      );
      // Sinaliza para o admin, mas mantém resposta neutra ao público
      return { ok: true as const };
    }

    // 3) Dispara o e-mail oficial de recuperação pelo Lovable Cloud (server-side)
    const send = await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
      redirectTo: data.redirect_to,
    });

    if (send.error) {
      const err = send.error as { code?: string; status?: number; name?: string; message: string };
      const codigo = err.code ?? err.name ?? (err.status ? `http_${err.status}` : "unknown");
      const resultado: Resultado = err.status === 429 ? "RATE_LIMITED" : "FALHA_TECNICA";
      await log(resultado, codigo, err.message);
      // 429 é um estado esperado do plano — devolvemos ok:true (mensagem neutra),
      // pois o admin verá o log e o usuário não deve ficar em loop de tentativas.
      // Falhas técnicas devolvem ok:false para a UI exibir "tente novamente".
      return { ok: resultado === "RATE_LIMITED" ? (true as const) : (false as const) };
    }

    await log("ENVIADO");
    return { ok: true as const };
  });
