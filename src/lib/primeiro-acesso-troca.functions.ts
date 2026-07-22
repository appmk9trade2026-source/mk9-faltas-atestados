import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Conclui o fluxo obrigatório de "Primeiro acesso":
 *  1. requer usuário autenticado (com a senha temporária que o admin definiu);
 *  2. exige que `profiles.primeiro_acesso_pendente = true` — caso contrário
 *     não é o fluxo correto e a chamada é rejeitada;
 *  3. troca a senha via Auth Admin (substituindo a temporária);
 *  4. marca `primeiro_acesso_pendente = false`;
 *  5. registra auditoria `PRIMEIRO_ACESSO_CONCLUIDO` — SEM registrar a senha.
 */

const schema = z.object({
  nova_senha: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .max(72)
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
      message: "A senha deve conter letras e números.",
    }),
});

export const concluirPrimeiroAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Só executa quando de fato há um primeiro acesso pendente.
    const prof = await supabase
      .from("profiles")
      .select("id, primeiro_acesso_pendente, ativo")
      .eq("id", userId)
      .maybeSingle();

    if (prof.error) throw new Error("Falha ao carregar perfil.");
    if (!prof.data) throw new Error("Perfil não encontrado.");
    if (prof.data.ativo === false) throw new Error("Sua conta está inativa.");
    if (prof.data.primeiro_acesso_pendente !== true) {
      // Estado inconsistente: usuário na rota de troca sem pendência real.
      return { ok: true as const, ja_concluido: true as const };
    }

    // 2) Troca a senha via Auth Admin (substitui a temporária).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const upd = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.nova_senha,
    });
    if (upd.error) {
      throw new Error("Não foi possível atualizar sua senha. Tente novamente.");
    }

    // 3) Marca conclusão do primeiro acesso.
    const p2 = await supabaseAdmin
      .from("profiles")
      .update({ primeiro_acesso_pendente: false })
      .eq("id", userId);
    if (p2.error) {
      // Senha já foi trocada; mesmo assim reportamos erro para o usuário reentrar.
      throw new Error("Sua senha foi atualizada, mas houve uma falha ao concluir o processo. Faça login novamente.");
    }

    // 4) Auditoria — nunca inclui a senha.
    await supabase
      .rpc("log_audit_event", {
        _modulo: "auth",
        _acao: "PRIMEIRO_ACESSO_CONCLUIDO" as never,
        _entidade: "Sessão",
        _registro_id: userId,
        _observacoes: "Usuário concluiu troca obrigatória da senha temporária.",
        _origem: "web",
      } as never)
      .then(() => {}, () => {});

    return { ok: true as const, ja_concluido: false as const };
  });
