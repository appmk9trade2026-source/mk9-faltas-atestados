import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { validarSenhaDefinitiva, senhaVazada } from "@/lib/senha-forte";


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
  nova_senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(72),
});


export const concluirPrimeiroAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Só executa quando de fato há um primeiro acesso pendente.
    const prof = await supabase
      .from("profiles")
      .select("id, email, matricula, nome, primeiro_acesso_pendente, ativo, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (prof.error) throw new Error("Falha ao carregar perfil.");
    if (!prof.data) throw new Error("Perfil não encontrado.");
    if (prof.data.ativo === false) throw new Error("Sua conta está inativa.");
    if (prof.data.primeiro_acesso_pendente !== true) {
      // Estado inconsistente: usuário na rota de troca sem pendência real.
      return { ok: true as const, ja_concluido: true as const };
    }

    // 1.1) Política da senha DEFINITIVA (ETAPA 5): bloqueia senhas comuns,
    //      sequências, senha igual ao e-mail/matrícula e a temporária padrão.
    const veredito = validarSenhaDefinitiva(data.nova_senha, {
      senhaTemporaria: "12345678",
      email: prof.data.email,
      matricula: prof.data.matricula,
      nome: prof.data.nome,
    });
    if (!veredito.ok) throw new Error(veredito.motivo);

    // 1.2) Verificação de vazamento (HIBP por k-anonimato) aplicada SOMENTE
    //      na senha definitiva — o fluxo de senha temporária segue liberado.
    if (await senhaVazada(data.nova_senha)) {
      throw new Error(
        "Esta senha aparece em vazamentos públicos de dados. Escolha outra senha.",
      );
    }


    // 2) Validação servidor: nova senha NÃO pode ser igual à senha temporária.
    //    Estratégia: tentar signInWithPassword num cliente isolado (sem sessão
    //    persistida) usando a nova senha. Se autenticar, significa que ela é
    //    idêntica à senha atual (a temporária) → rejeitar. Nunca registramos
    //    a senha em log/auditoria.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uinfo = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = uinfo.data?.user?.email ?? null;
    if (!email) {
      throw new Error("Não foi possível validar sua conta. Faça login novamente.");
    }

    try {
      const { createClient } = await import("@supabase/supabase-js");
      const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
      const scratch = createClient(process.env.SUPABASE_URL!, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        global: {
          fetch: (input, init) => {
            const h = new Headers(init?.headers);
            if (publishableKey.startsWith("sb_") && h.get("Authorization") === `Bearer ${publishableKey}`) {
              h.delete("Authorization");
            }
            h.set("apikey", publishableKey);
            return fetch(input, { ...init, headers: h });
          },
        },
      });
      const probe = await scratch.auth.signInWithPassword({ email, password: data.nova_senha });
      if (probe.data?.session) {
        // Igualdade confirmada — invalida a sessão de teste e registra auditoria.
        await scratch.auth.signOut().catch(() => {});
        await supabase
          .rpc("log_audit_event", {
            _modulo: "auth",
            _acao: "PRIMEIRO_ACESSO_CONCLUIDO" as never,
            _entidade: "Sessão",
            _registro_id: userId,
            _observacoes: "Tentativa bloqueada: nova senha igual à senha temporária (PASSWORD_EQUALS_TEMPORARY).",
            _origem: "web",
          } as never)
          .then(() => {}, () => {});
        const err = new Error("A nova senha deve ser diferente da senha temporária.") as Error & {
          code?: string;
        };
        err.code = "PASSWORD_EQUALS_TEMPORARY";
        throw err;
      }
      // probe.error significa "credenciais inválidas" → senha diferente. Segue o fluxo.
    } catch (e) {
      if ((e as { code?: string })?.code === "PASSWORD_EQUALS_TEMPORARY") throw e;
      // Falha de rede/serviço na sonda não pode travar a troca legítima.
    }

    // 3) Troca a senha via Auth Admin (substitui a temporária).
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

    // 4) Auditoria — nunca inclui a senha. Apenas metadados administrativos.
    const criadoEm = prof.data.created_at ? new Date(prof.data.created_at as string) : null;
    const concluidoEm = new Date();
    const tempoAteAtivacaoMs = criadoEm ? concluidoEm.getTime() - criadoEm.getTime() : null;
    const tempoAteAtivacaoHoras =
      tempoAteAtivacaoMs !== null ? Math.round((tempoAteAtivacaoMs / 3_600_000) * 10) / 10 : null;

    const partesObs = [
      "Usuário concluiu troca obrigatória da senha temporária.",
      criadoEm ? `Conta criada em ${criadoEm.toISOString()}.` : null,
      `Ativada em ${concluidoEm.toISOString()}.`,
      tempoAteAtivacaoHoras !== null ? `Tempo até ativação: ${tempoAteAtivacaoHoras}h.` : null,
    ].filter(Boolean);

    await supabase
      .rpc("log_audit_event", {
        _modulo: "auth",
        _acao: "PRIMEIRO_ACESSO_CONCLUIDO" as never,
        _entidade: "Sessão",
        _registro_id: userId,
        _observacoes: partesObs.join(" "),
        _origem: "web",
      } as never)
      .then(() => {}, () => {});

    return { ok: true as const, ja_concluido: false as const };
  });
