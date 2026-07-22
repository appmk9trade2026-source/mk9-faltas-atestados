import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac/guards.server";
import { PERMISSION_MAP } from "@/lib/permissions-map";
import type { PermissionCode } from "@/lib/permissions";

type AppRole = "super_admin" | "rh" | "supervisor" | "compliance" | "operacao" | "visualizador";

/**
 * Gate padronizado para operações de usuários (RBAC Fase 3 — Onda 1).
 * Combina PermissionCode (has_permission + audit + correlation_id) com a
 * exigência histórica de Super Admin (defesa em profundidade).
 */
async function gateUsuario(
  ctx: { supabase: typeof import("@/integrations/supabase/client").supabase; userId: string },
  permission: PermissionCode,
  route: string,
) {
  const gate = await requirePermission({ ctx, permission, route });
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "super_admin",
  });
  if (error || data !== true) {
    throw new Error("PERMISSION_DENIED: apenas Super Admin pode executar esta ação");
  }
  return gate;
}

async function requireSuperAdmin(ctx: {
  supabase: typeof import("@/integrations/supabase/client").supabase;
  userId: string;
}) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "super_admin",
  });
  if (error || data !== true) throw new Error("PERMISSION_DENIED: apenas Super Admin pode executar esta ação.");
}

async function audit(
  supabase: typeof import("@/integrations/supabase/client").supabase,
  acao: string,
  registroId: string | null,
  observacoes: string | null,
  antes?: unknown,
  depois?: unknown,
) {
  await supabase
    .rpc("log_audit_event", {
      _modulo: "usuarios",
      _acao: acao as never,
      _entidade: "Usuário",
      _registro_id: registroId,
      _antes: (antes ?? null) as never,
      _depois: (depois ?? null) as never,
      _observacoes: observacoes,
      _origem: "web",
    } as never)
    .then(() => {}, () => {});
}

import { validarProjetosPertencemAEmpresas } from "@/lib/usuarios-helpers";
export { validarProjetosPertencemAEmpresas } from "@/lib/usuarios-helpers";

// ---------------- CREATE ----------------
const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  nome: z.string().trim().min(2).max(120),
  telefone: z.string().trim().max(30).optional().nullable(),
  cargo: z.string().trim().max(80).optional().nullable(),
  avatar_url: z.string().trim().max(500).optional().nullable(),
  senha_temporaria: z.string().min(8).max(72).optional().nullable(),
  enviar_convite: z.boolean().default(true),
  enviar_whatsapp: z.boolean().default(false),

  ativo: z.boolean().default(true),
  roles: z
    .array(z.enum(["super_admin", "rh", "supervisor", "compliance", "operacao", "visualizador"]))
    .default([]),
  empresa_ids: z.array(z.string().uuid()).default([]),
  projeto_ids: z.array(z.string().uuid()).default([]),
});

export const createUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    await gateUsuario(context, PERMISSION_MAP.createUser, "/usuarios#create");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Duplicate email check via profiles
    const existing = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    if (existing.data) throw new Error("Já existe um usuário com este e-mail.");

    // Validate project↔empresa consistency BEFORE creating any auth user
    if (data.projeto_ids.length) {
      const projs = await supabaseAdmin
        .from("projetos")
        .select("id, empresa_id")
        .in("id", data.projeto_ids);
      if (projs.error) throw new Error(projs.error.message);
      const check = validarProjetosPertencemAEmpresas(projs.data ?? [], data.projeto_ids, data.empresa_ids);
      if (!check.ok) {
        await audit(context.supabase, "USUARIO_PROJETO_EMPRESA_INCONSISTENTE", null,
          `Projetos sem empresa vinculada: ${check.invalidos.join(", ")}`);
        throw new Error("Existem projetos selecionados que não pertencem a uma empresa vinculada ao usuário.");
      }
    }

    // Regra do CRM MK9: todo novo usuário nasce com a senha temporária padrão
    // "12345678" e com primeiro_acesso_pendente = true. O admin não escolhe a
    // senha inicial e nenhum convite por e-mail é enviado.
    const SENHA_PADRAO = "12345678";
    let userId: string;
    {
      const cr = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: SENHA_PADRAO,
        email_confirm: true,
        user_metadata: { nome: data.nome },
      });
      if (cr.error || !cr.data.user) throw new Error(cr.error?.message ?? "Falha ao criar usuário.");
      userId = cr.data.user.id;
    }

    // Compensation: se algo abaixo falhar, deleta o usuário do Auth para não deixar órfão.
    const rollback = async (motivo: string) => {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch {
        // fallback: bloquear conta se delete falhar
        try {
          await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
        } catch { /* noop */ }
      }
      await audit(context.supabase, "USUARIO_CRIACAO_REVERTIDA", userId,
        `Criação revertida: ${motivo}`);
    };

    try {
      const profilePayload = {
        id: userId,
        nome: data.nome,
        email: data.email,
        telefone_whatsapp: data.telefone || null,
        cargo: data.cargo || null,
        avatar_url: data.avatar_url || null,
        ativo: data.ativo,
        // Força troca obrigatória no primeiro login — senha padrão do CRM.
        primeiro_acesso_pendente: true,
      };

      const up = await supabaseAdmin.from("profiles").upsert(profilePayload, { onConflict: "id" });
      if (up.error) throw new Error(up.error.message);


      if (data.roles.length) {
        const rows = data.roles.map((role) => ({ user_id: userId, role: role as AppRole }));
        const r = await supabaseAdmin.from("user_roles").upsert(rows, { onConflict: "user_id,role" });
        if (r.error) throw new Error(r.error.message);
      }
      if (data.empresa_ids.length) {
        const rows = data.empresa_ids.map((empresa_id) => ({ user_id: userId, empresa_id }));
        const r = await supabaseAdmin.from("usuario_empresas").upsert(rows, { onConflict: "user_id,empresa_id" });
        if (r.error) throw new Error(r.error.message);
      }
      if (data.projeto_ids.length) {
        const rows = data.projeto_ids.map((projeto_id) => ({ user_id: userId, projeto_id }));
        const r = await supabaseAdmin.from("usuario_projetos").upsert(rows, { onConflict: "user_id,projeto_id" });
        if (r.error) throw new Error(r.error.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      await rollback(msg);
      throw new Error(`Falha ao configurar usuário; criação revertida. Detalhe: ${msg}`);
    }

    await audit(context.supabase, "USUARIO_CRIADO", userId, `Criado ${data.email}`, null, {
      email: data.email,
      nome: data.nome,
      roles: data.roles,
      empresa_ids: data.empresa_ids,
      projeto_ids: data.projeto_ids,
      ativo: data.ativo,
      enviar_convite: data.enviar_convite,
    });

    // WhatsApp de boas-vindas — usa o pipeline oficial (outbox + worker + Evolution API).
    // Só materializa se o admin marcou "Enviar convite por WhatsApp".
    // Falha aqui NÃO reverte a criação: o admin pode reenviar depois pela UI.
    let whatsapp_outbox_id: string | null = null;
    let whatsapp_motivo: string | null = null;
    if (data.enviar_whatsapp) {
      try {
        const link = process.env.APP_PUBLIC_URL || "https://mk9-staff-hub.lovable.app";
        const { data: matData, error: matErr } = await supabaseAdmin.rpc(
          "materializar_whatsapp_usuario_boas_vindas",
          {
            p_user_id: userId,
            p_link_sistema: link,
            p_senha_temporaria: "12345678",

          } as never,
        );
        if (matErr) {
          whatsapp_motivo = matErr.message;
        } else {
          const res = (matData ?? {}) as { ok?: boolean; motivo?: string; outbox_id?: string };
          whatsapp_outbox_id = res.outbox_id ?? null;
          whatsapp_motivo = res.ok ? null : (res.motivo ?? "DESCONHECIDO");
          if (res.ok) {
            await audit(context.supabase, "ENVIO_COMUNICACAO", userId,
              `WhatsApp de boas-vindas enfileirado (outbox ${res.outbox_id})`,
              null,
              { canal: "whatsapp", template: "USUARIO_CRIADO_V1", outbox_id: res.outbox_id, possui_senha_temporaria: true });
          } else {
            await audit(context.supabase, "ENVIO_COMUNICACAO", userId,
              `WhatsApp de boas-vindas não enfileirado: ${res.motivo}`,
              null,
              { canal: "whatsapp", template: "USUARIO_CRIADO_V1", motivo: res.motivo });
          }
        }
      } catch (e) {
        whatsapp_motivo = e instanceof Error ? e.message : "erro desconhecido";
      }
    }

    return { id: userId, whatsapp_outbox_id, whatsapp_motivo };
  });



// ---------------- UPDATE ----------------
const updateSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(2).max(120),
  telefone: z.string().trim().max(30).optional().nullable(),
  cargo: z.string().trim().max(80).optional().nullable(),
  avatar_url: z.string().trim().max(500).optional().nullable(),
  roles: z
    .array(z.enum(["super_admin", "rh", "supervisor", "compliance", "operacao", "visualizador"]))
    .default([]),
  empresa_ids: z.array(z.string().uuid()).default([]),
  projeto_ids: z.array(z.string().uuid()).default([]),
});

async function syncSet<T extends string>(opts: {
  supabaseAdmin: typeof import("@/integrations/supabase/client.server").supabaseAdmin;
  table: "user_roles" | "usuario_empresas" | "usuario_projetos";
  userId: string;
  keyColumn: "role" | "empresa_id" | "projeto_id";
  desired: T[];
  current: T[];
  onAdd: (v: T) => Promise<void>;
  onRemove: (v: T) => Promise<void>;
}) {
  const toAdd = opts.desired.filter((v) => !opts.current.includes(v));
  const toRemove = opts.current.filter((v) => !opts.desired.includes(v));
  if (toAdd.length) {
    const rows = toAdd.map((v) => ({ user_id: opts.userId, [opts.keyColumn]: v })) as never;
    const r = await opts.supabaseAdmin.from(opts.table).insert(rows);
    if (r.error) throw new Error(r.error.message);
    for (const v of toAdd) await opts.onAdd(v);
  }
  if (toRemove.length) {
    const r = await opts.supabaseAdmin
      .from(opts.table)
      .delete()
      .eq("user_id", opts.userId)
      .in(opts.keyColumn, toRemove as never);
    if (r.error) throw new Error(r.error.message);
    for (const v of toRemove) await opts.onRemove(v);
  }
}

export const updateUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    await gateUsuario(context, PERMISSION_MAP.updateUser, "/usuarios#update");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const isSelf = data.id === context.userId;

    const [profBefore, rolesBefore, empBefore, projBefore] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", data.id).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.id),
      supabaseAdmin.from("usuario_empresas").select("empresa_id").eq("user_id", data.id),
      supabaseAdmin.from("usuario_projetos").select("projeto_id").eq("user_id", data.id),
    ]);
    if (!profBefore.data) throw new Error("Usuário não encontrado.");

    const rolesAtuais = (rolesBefore.data ?? []).map((r) => r.role as AppRole);
    const empresasAtuais = (empBefore.data ?? []).map((r) => r.empresa_id);

    // ---------- Autoalteração: bloquear perda de privilégios críticos ----------
    if (isSelf) {
      const removeuSuperAdmin =
        rolesAtuais.includes("super_admin") && !data.roles.includes("super_admin");
      const perdeuEmpresas = empresasAtuais.some((id) => !data.empresa_ids.includes(id));

      if (removeuSuperAdmin) {
        await audit(context.supabase, "USUARIO_AUTOALTERACAO_BLOQUEADA", data.id,
          "Tentativa de remover próprio papel Super Admin");
        throw new Error("Você não pode remover seu próprio papel Super Admin.");
      }
      if (perdeuEmpresas) {
        await audit(context.supabase, "USUARIO_AUTOALTERACAO_BLOQUEADA", data.id,
          "Tentativa de remover próprios vínculos de empresa");
        throw new Error("Você não pode remover seus próprios vínculos de empresa.");
      }
    }

    // ---------- Consistência empresa × projeto ----------
    if (data.projeto_ids.length) {
      const projs = await supabaseAdmin
        .from("projetos")
        .select("id, empresa_id")
        .in("id", data.projeto_ids);
      if (projs.error) throw new Error(projs.error.message);
      const check = validarProjetosPertencemAEmpresas(projs.data ?? [], data.projeto_ids, data.empresa_ids);
      if (!check.ok) {
        await audit(context.supabase, "USUARIO_PROJETO_EMPRESA_INCONSISTENTE", data.id,
          `Projetos sem empresa vinculada: ${check.invalidos.join(", ")}`);
        throw new Error("Existem projetos selecionados que não pertencem a uma empresa vinculada ao usuário.");
      }
    }

    // ---------- Último Super Admin ----------
    const removeuSuperAdmin =
      rolesAtuais.includes("super_admin") && !data.roles.includes("super_admin");
    if (removeuSuperAdmin) {
      const { data: countData } = await supabaseAdmin.rpc("count_active_super_admins");
      const count = Number(countData ?? 0);
      // O usuário atual ainda conta antes da remoção. Se count <= 1, é o último.
      if (count <= 1) {
        await audit(context.supabase, "USUARIO_ULTIMO_SUPER_ADMIN_BLOQUEADO", data.id,
          "Tentativa de remover papel Super Admin do último administrador ativo");
        throw new Error("É necessário manter pelo menos um Super Admin ativo.");
      }
    }

    const up = await supabaseAdmin
      .from("profiles")
      .update({
        nome: data.nome,
        telefone_whatsapp: data.telefone || null,
        cargo: data.cargo || null,
        avatar_url: data.avatar_url || null,
      })
      .eq("id", data.id);
    if (up.error) throw new Error(up.error.message);

    try {
      await syncSet({
        supabaseAdmin,
        table: "user_roles",
        userId: data.id,
        keyColumn: "role",
        desired: data.roles,
        current: rolesAtuais,
        onAdd: async (v) => audit(context.supabase, "USUARIO_ROLE_ADICIONADA", data.id, `+${v}`),
        onRemove: async (v) => audit(context.supabase, "USUARIO_ROLE_REMOVIDA", data.id, `-${v}`),
      });
      await syncSet({
        supabaseAdmin,
        table: "usuario_empresas",
        userId: data.id,
        keyColumn: "empresa_id",
        desired: data.empresa_ids,
        current: empresasAtuais,
        onAdd: async (v) => audit(context.supabase, "USUARIO_EMPRESA_VINCULADA", data.id, v),
        onRemove: async (v) => audit(context.supabase, "USUARIO_EMPRESA_REMOVIDA", data.id, v),
      });
      await syncSet({
        supabaseAdmin,
        table: "usuario_projetos",
        userId: data.id,
        keyColumn: "projeto_id",
        desired: data.projeto_ids,
        current: (projBefore.data ?? []).map((r) => r.projeto_id),
        onAdd: async (v) => audit(context.supabase, "USUARIO_PROJETO_VINCULADO", data.id, v),
        onRemove: async (v) => audit(context.supabase, "USUARIO_PROJETO_REMOVIDO", data.id, v),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      // Rethrow — as triggers no banco também bloqueiam violações críticas.
      throw new Error(msg);
    }

    await audit(
      context.supabase,
      "USUARIO_EDITADO",
      data.id,
      "Dados atualizados",
      { nome: profBefore.data.nome, cargo: profBefore.data.cargo, telefone: profBefore.data.telefone_whatsapp, avatar_url: profBefore.data.avatar_url },
      { nome: data.nome, cargo: data.cargo, telefone: data.telefone, avatar_url: data.avatar_url },
    );

    return { ok: true };
  });

// ---------------- ATIVAR / DESATIVAR ----------------
export const toggleUsuarioAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await gateUsuario(context, PERMISSION_MAP.updateUser, "/usuarios#toggle-ativo");
    if (data.id === context.userId && !data.ativo) {
      await audit(context.supabase, "USUARIO_AUTOALTERACAO_BLOQUEADA", data.id,
        "Tentativa de autodesativação");
      throw new Error("Você não pode desativar a si mesmo.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verifica último super admin antes de desativar
    if (!data.ativo) {
      const roles = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.id);
      const isSuper = (roles.data ?? []).some((r) => r.role === "super_admin");
      if (isSuper) {
        const { data: countData } = await supabaseAdmin.rpc("count_active_super_admins");
        const count = Number(countData ?? 0);
        if (count <= 1) {
          await audit(context.supabase, "USUARIO_ULTIMO_SUPER_ADMIN_BLOQUEADO", data.id,
            "Tentativa de desativar o último Super Admin ativo");
          throw new Error("É necessário manter pelo menos um Super Admin ativo.");
        }
      }
    }

    const upd = await supabaseAdmin.from("profiles").update({ ativo: data.ativo }).eq("id", data.id);
    if (upd.error) throw new Error(upd.error.message);
    await supabaseAdmin.auth.admin
      .updateUserById(data.id, { ban_duration: data.ativo ? "none" : "876000h" })
      .catch(() => {});
    await audit(
      context.supabase,
      data.ativo ? "USUARIO_ATIVADO" : "USUARIO_DESATIVADO",
      data.id,
      data.ativo ? "Reativado" : "Desativado",
    );
    return { ok: true };
  });

// ---------------- RESET DE SENHA ----------------
export const resetUsuarioSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await gateUsuario(context, PERMISSION_MAP.updateUser, "/usuarios#reset-senha");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const prof = await supabaseAdmin.from("profiles").select("email").eq("id", data.id).maybeSingle();
    if (!prof.data?.email) throw new Error("E-mail do usuário não encontrado.");
    const gen = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: prof.data.email,
    });
    if (gen.error) throw new Error(gen.error.message);
    await audit(context.supabase, "USUARIO_RESET_SENHA", data.id, `Link enviado para ${prof.data.email}`);
    return { ok: true };
  });

// ---------------- DEFINIR NOVA SENHA TEMPORÁRIA ----------------
// Super Admin: substitui a senha do usuário no provedor de autenticação,
// marca primeiro_acesso_pendente = true, encerra todas as sessões e
// registra auditoria SEM armazenar a senha em lugar algum.
export const definirSenhaTemporariaUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        nova_senha: z
          .string()
          .min(8, "Senha muito curta")
          .max(72, "Senha muito longa")
          .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), {
            message: "A senha deve conter letras e números.",
          }),
        motivo: z.string().trim().max(500).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await gateUsuario(context, PERMISSION_MAP.updateUser, "/usuarios#senha-temporaria");
    await requireSuperAdmin(context);

    if (data.id === context.userId) {
      await audit(
        context.supabase,
        "USUARIO_AUTOALTERACAO_BLOQUEADA",
        data.id,
        "Tentativa de redefinir a própria senha via painel administrativo",
      );
      throw new Error(
        "Use a área do seu perfil para trocar a própria senha; este fluxo é para outros usuários.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const prof = await supabaseAdmin
      .from("profiles")
      .select("id, nome, email, ativo")
      .eq("id", data.id)
      .maybeSingle();
    if (!prof.data) throw new Error("Usuário não encontrado.");
    if (prof.data.ativo === false)
      throw new Error("Usuário está desativado — reative antes de redefinir a senha.");

    // 1. Atualiza a senha somente no provedor de autenticação.
    const upd = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.nova_senha,
    });
    if (upd.error) throw new Error(upd.error.message);

    // 2. Marca primeiro_acesso_pendente = true (força troca no próximo login).
    const now = new Date().toISOString();
    const p = await supabaseAdmin
      .from("profiles")
      .update({
        primeiro_acesso_pendente: true,
        senha_temporaria_redefinida_em: now,
      })
      .eq("id", data.id);
    if (p.error) throw new Error(p.error.message);

    // 3. Encerra todas as sessões ativas do usuário-alvo.
    try {
      const adminAny = supabaseAdmin.auth.admin as unknown as {
        signOut: (uid: string, scope?: "global" | "local" | "others") => Promise<{ error: unknown }>;
      };
      await adminAny.signOut(data.id, "global").catch(() => {});
    } catch { /* noop */ }
    await supabaseAdmin
      .from("user_sessions")
      .update({
        status: "ENCERRADA" as never,
        encerrada_em: now,
        motivo_encerramento: "senha_temporaria_redefinida",
      })
      .eq("user_id", data.id)
      .eq("status", "ATIVA" as never);

    // 4. Auditoria — jamais registrar a senha, hash ou token.
    await audit(
      context.supabase,
      "SENHA_TEMPORARIA_REDEFINIDA",
      data.id,
      data.motivo?.trim() ? `Motivo: ${data.motivo.trim()}` : "Senha temporária redefinida pelo administrador",
      null,
      {
        email_alvo: prof.data.email,
        primeiro_acesso_pendente: true,
        sessoes_encerradas: true,
      },
    );

    return { ok: true, primeiro_acesso_pendente: true };
  });

// ---------------- DEPENDÊNCIAS / EXCLUSÃO SEGURA ----------------
export type DependenciasUsuario = {
  ausencias_registradas: number;
  comunicacoes: number;
  homologacoes: number;
  importacoes: number;
  alertas_eventos: number;
  operacao_alertas: number;
  operacao_incidentes: number;
  auditorias: number;
  access_reviews: number;
  bi_visoes_salvas: number;
  notificacao_eventos: number;
  login_events: number;
  vinculos_empresas: number;
  vinculos_projetos: number;
  roles: number;
  total_bloqueante: number;
};

export const contarDependenciasUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const { data: rpcData, error } = await context.supabase.rpc(
      "contar_dependencias_usuario" as never,
      { p_user_id: data.id } as never,
    );
    if (error) throw new Error(error.message);
    return (rpcData ?? {}) as unknown as DependenciasUsuario;
  });

export const excluirUsuarioSeguro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        confirmacao: z.literal("EXCLUIR"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Proteção — não excluir a si mesmo.
    if (data.id === context.userId) {
      await audit(
        context.supabase,
        "USUARIO_AUTOALTERACAO_BLOQUEADA",
        data.id,
        "Tentativa de auto-exclusão pelo painel administrativo",
      );
      throw new Error("Você não pode excluir a si mesmo.");
    }

    const prof = await supabaseAdmin
      .from("profiles")
      .select("id, nome, email")
      .eq("id", data.id)
      .maybeSingle();
    if (!prof.data) throw new Error("Usuário não encontrado.");

    // 2. Último Super Admin ativo protegido.
    const rolesRow = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.id);
    const alvoIsSuper = (rolesRow.data ?? []).some((r) => r.role === "super_admin");
    if (alvoIsSuper) {
      const { data: countData } = await supabaseAdmin.rpc("count_active_super_admins");
      const count = Number(countData ?? 0);
      if (count <= 1) {
        await audit(
          context.supabase,
          "USUARIO_ULTIMO_SUPER_ADMIN_BLOQUEADO",
          data.id,
          "Tentativa de excluir o último Super Admin ativo",
        );
        throw new Error("Não é possível excluir o último Super Admin ativo.");
      }
    }

    // 3. Dependências históricas/operacionais bloqueiam a exclusão física.
    const { data: depData, error: depErr } = await context.supabase.rpc(
      "contar_dependencias_usuario" as never,
      { p_user_id: data.id } as never,
    );
    if (depErr) throw new Error(depErr.message);
    const dep = (depData ?? {}) as DependenciasUsuario;
    if ((dep.total_bloqueante ?? 0) > 0) {
      await audit(
        context.supabase,
        "USUARIO_EXCLUSAO_BLOQUEADA",
        data.id,
        `Exclusão bloqueada por dependências (total=${dep.total_bloqueante})`,
        null,
        dep as unknown,
      );
      throw new Error(
        "USUARIO_COM_HISTORICO: Este usuário possui registros históricos e não pode ser excluído. Use 'Desativar' para remover o acesso preservando o histórico.",
      );
    }

    // 4. Registra a tentativa (auditoria antes da remoção).
    await audit(
      context.supabase,
      "USUARIO_EXCLUSAO_TENTATIVA",
      data.id,
      `Exclusão física iniciada para ${prof.data.email}`,
      { email: prof.data.email, nome: prof.data.nome },
      null,
    );

    // 5. Remove vínculos sem histórico (roles, empresas, projetos, permissões,
    //    preferências, configurações WhatsApp, sessões, IA).
    const cleanupByUserId = [
      "user_roles",
      "usuario_empresas",
      "usuario_projetos",
      "user_permissions",
      "user_sessions",
      "ai_conversations",
      "ai_feedback",
      "ai_rate_limits",
    ] as const;
    const cleanupByUsuarioId = [
      "preferencias_notificacao",
      "notificacao_usuarios",
      "whatsapp_destinatario_config",
    ] as const;
    for (const tbl of cleanupByUserId) {
      await (supabaseAdmin.from(tbl) as unknown as {
        delete: () => { eq: (c: string, v: string) => Promise<unknown> };
      })
        .delete()
        .eq("user_id", data.id);
    }
    for (const tbl of cleanupByUsuarioId) {
      await (supabaseAdmin.from(tbl) as unknown as {
        delete: () => { eq: (c: string, v: string) => Promise<unknown> };
      })
        .delete()
        .eq("usuario_id", data.id);
    }

    // 6. Exclui a identidade no provedor de autenticação PRIMEIRO.
    //    Se falhar, o profile permanece intacto (sem órfão de auth).
    const delAuth = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (delAuth.error) {
      await audit(
        context.supabase,
        "USUARIO_EXCLUSAO_BLOQUEADA",
        data.id,
        `Falha ao excluir identidade de autenticação: ${delAuth.error.message}`,
      );
      throw new Error("Falha ao excluir a identidade de autenticação. Nenhum dado foi removido.");
    }

    // 7. Remove o profile — depois de auth removido.
    const delProf = await supabaseAdmin.from("profiles").delete().eq("id", data.id);
    if (delProf.error) {
      // Não há como reverter o auth deletado. Registrar e relatar.
      await audit(
        context.supabase,
        "USUARIO_EXCLUSAO_BLOQUEADA",
        data.id,
        `Auth removido, mas falha ao remover profile: ${delProf.error.message}`,
      );
      throw new Error(
        "Identidade removida, mas houve falha ao remover o perfil. Contate o administrador do sistema.",
      );
    }

    await audit(
      context.supabase,
      "USUARIO_EXCLUIDO",
      data.id,
      `Usuário ${prof.data.email} excluído fisicamente (sem histórico).`,
    );

    return { ok: true };
  });
export const reenviarConviteUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await gateUsuario(context, PERMISSION_MAP.updateUser, "/usuarios#reenviar-convite");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const prof = await supabaseAdmin
      .from("profiles")
      .select("email, ativo")
      .eq("id", data.id)
      .maybeSingle();
    if (!prof.data?.email) throw new Error("E-mail do usuário não encontrado.");
    if (prof.data.ativo === false) throw new Error("Usuário desativado; reative antes de reenviar convite.");

    // Não recria o usuário — apenas dispara novo link de convite.
    const gen = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: prof.data.email,
    });
    if (gen.error) throw new Error(gen.error.message);

    await audit(context.supabase, "USUARIO_CONVITE_REENVIADO", data.id,
      `Convite reenviado para ${prof.data.email}`);
    return { ok: true };
  });

// ---------------- SESSÕES ATIVAS ----------------
export const encerrarSessoesUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), manter_atual: z.boolean().default(true) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await gateUsuario(context, PERMISSION_MAP.updateUser, "/usuarios#sessoes");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const isSelf = data.id === context.userId;
    // Scope 'others' preserves the caller's current session even for self.
    const scope: "global" | "others" = isSelf && data.manter_atual ? "others" : "global";

    // API oficial: signOut(user_id, scope)
    // O SDK aceita a assinatura (userId, scope) em versões recentes; caso contrário,
    // fazemos fallback marcando as sessões locais como ENCERRADAS.
    const adminAny = supabaseAdmin.auth.admin as unknown as {
      signOut: (uid: string, scope?: "global" | "local" | "others") => Promise<{ error: unknown }>;
    };
    try {
      const r = await adminAny.signOut(data.id, scope);
      if (r?.error) throw r.error;
    } catch (err) {
      // Fallback local — não expor detalhe técnico.
      void err;
    }

    // Refletir na tabela local de sessões
    await supabaseAdmin
      .from("user_sessions")
      .update({
        status: "ENCERRADA" as never,
        encerrada_em: new Date().toISOString(),
        motivo_encerramento: isSelf && data.manter_atual ? "admin_encerrou_outras" : "admin_encerrou_todas",
      })
      .eq("user_id", data.id)
      .eq("status", "ATIVA" as never);

    await audit(context.supabase, "USUARIO_SESSOES_ENCERRADAS", data.id,
      isSelf && data.manter_atual
        ? "Encerradas todas as sessões exceto a atual"
        : "Todas as sessões encerradas");
    return { ok: true, scope };
  });

// ---------------- WhatsApp: reenviar boas-vindas (apenas Super Admin) ----------------


export const reenviarBoasVindasWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      senha_temporaria: z.string().min(8).max(72).optional().nullable(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await gateUsuario(context, PERMISSION_MAP.updateUser, "/usuarios#reenviar-whatsapp");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const idem = `usuario:${data.id}:boas_vindas:v1`;
    // Se a mensagem já existe, cancela para permitir reenvio (idempotência preservada por nova chave versionada).
    const existing = await supabaseAdmin
      .from("whatsapp_outbox")
      .select("id, status")
      .eq("idempotency_key", idem)
      .maybeSingle();

    if (existing.data) {
      // Regera com uma nova versão de chave para forçar nova materialização.
      // Marcamos a idempotency_key antiga para preservar histórico.
      const carimbo = `:reenviada:${Date.now()}`;
      const upd = await supabaseAdmin
        .from("whatsapp_outbox")
        .update({ idempotency_key: idem + carimbo })
        .eq("id", existing.data.id);
      if (upd.error) throw new Error(upd.error.message);
    }

    const link = process.env.APP_PUBLIC_URL || "https://mk9-staff-hub.lovable.app";
    const { data: matData, error: matErr } = await supabaseAdmin.rpc(
      "materializar_whatsapp_usuario_boas_vindas",
      {
        p_user_id: data.id,
        p_link_sistema: link,
        p_senha_temporaria: data.senha_temporaria || null,
      } as never,
    );
    if (matErr) throw new Error(matErr.message);
    const res = (matData ?? {}) as { ok?: boolean; motivo?: string; outbox_id?: string };
    if (!res.ok) {
      await audit(context.supabase, "ENVIO_COMUNICACAO", data.id,
        `Reenvio WhatsApp boas-vindas bloqueado: ${res.motivo}`,
        null, { canal: "whatsapp", template: "USUARIO_CRIADO_V1", motivo: res.motivo });
      throw new Error(`Não foi possível enfileirar: ${res.motivo}`);
    }
    await audit(context.supabase, "ENVIO_COMUNICACAO", data.id,
      `Reenvio WhatsApp boas-vindas (outbox ${res.outbox_id})`,
      null, { canal: "whatsapp", template: "USUARIO_CRIADO_V1", outbox_id: res.outbox_id });
    return { ok: true, outbox_id: res.outbox_id };
  });

// ---------------- WhatsApp: status por usuário ----------------
export type WhatsappDerivedStatus =
  | "NAO_ENVIADO"
  | "PENDENTE"
  | "ATRASADO"
  | "PROCESSANDO"
  | "ENVIADO"
  | "ENTREGUE"
  | "LIDA"
  | "FALHOU_TEMPORARIO"
  | "FALHOU_DEFINITIVO"
  | "CANCELADO";

export type BoasVindasStatus = {
  user_id: string;
  outbox_id: string | null;
  status: string | null;
  status_derivado: WhatsappDerivedStatus;
  ultimo_erro: string | null;
  ultimo_erro_codigo: string | null;
  telefone_mascarado: string | null;
  atualizado_em: string | null;
  provider_message_id: string | null;
  tentativas: number;
  max_tentativas: number;
  proxima_tentativa_em: string | null;
  created_at: string | null;
  enviado_em: string | null;
  template_codigo: string | null;
};

const ATRASADO_APOS_MIN = 5;

function derivarStatus(raw: string | null, createdAt: string | null): WhatsappDerivedStatus {
  if (!raw) return "NAO_ENVIADO";
  if (raw === "PENDENTE") {
    if (createdAt) {
      const ageMs = Date.now() - new Date(createdAt).getTime();
      if (ageMs > ATRASADO_APOS_MIN * 60_000) return "ATRASADO";
    }
    return "PENDENTE";
  }
  return raw as WhatsappDerivedStatus;
}

export const listarStatusBoasVindas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ user_ids: z.array(z.string().uuid()).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const [sa, rh, cp] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "rh" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "compliance" }),
    ]);
    if (sa.data !== true && rh.data !== true && cp.data !== true) {
      return { itens: [] as BoasVindasStatus[] };
    }
    if (!data.user_ids.length) return { itens: [] as BoasVindasStatus[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("whatsapp_outbox")
      .select("id, destinatario_usuario_id, status, telefone_mascarado, ultimo_erro_resumido, ultimo_erro_codigo, provider_message_id, created_at, enviado_em, confirmado_em, falhou_em, tentativas, max_tentativas, proxima_tentativa_em, template_codigo")
      .eq("evento_tipo", "USUARIO_CRIADO")
      .in("destinatario_usuario_id", data.user_ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const byUser = new Map<string, BoasVindasStatus>();
    for (const r of rows ?? []) {
      const uid = (r.destinatario_usuario_id as string) ?? "";
      if (!uid || byUser.has(uid)) continue;
      const raw = (r.status as string) ?? null;
      const createdAt = (r.created_at as string) ?? null;
      byUser.set(uid, {
        user_id: uid,
        outbox_id: (r.id as string) ?? null,
        status: raw,
        status_derivado: derivarStatus(raw, createdAt),
        ultimo_erro: (r.ultimo_erro_resumido as string) ?? null,
        ultimo_erro_codigo: (r.ultimo_erro_codigo as string) ?? null,
        telefone_mascarado: (r.telefone_mascarado as string) ?? null,
        provider_message_id: (r.provider_message_id as string) ?? null,
        atualizado_em: ((r.confirmado_em as string) ?? (r.enviado_em as string) ?? (r.falhou_em as string) ?? createdAt) ?? null,
        tentativas: Number(r.tentativas ?? 0),
        max_tentativas: Number(r.max_tentativas ?? 5),
        proxima_tentativa_em: (r.proxima_tentativa_em as string) ?? null,
        created_at: createdAt,
        enviado_em: (r.enviado_em as string) ?? null,
        template_codigo: (r.template_codigo as string) ?? null,
      });
    }
    return { itens: Array.from(byUser.values()) };
  });

// ---------------- WhatsApp: reprocessar convite (apenas Super Admin) ----------------
export const reprocessarConviteWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await gateUsuario(context, PERMISSION_MAP.updateUser, "/usuarios#reprocessar-whatsapp");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Última outbox do usuário
    const { data: last, error: qErr } = await supabaseAdmin
      .from("whatsapp_outbox")
      .select("id, status")
      .eq("evento_tipo", "USUARIO_CRIADO")
      .eq("destinatario_usuario_id", data.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (qErr) throw new Error(qErr.message);

    const status = (last?.status as string) ?? null;

    // Caso 1: nada existe → materializa novo convite (comportamento igual ao reenviar)
    if (!last) {
      const link = process.env.APP_PUBLIC_URL || "https://mk9-staff-hub.lovable.app";
      const { data: matData, error: matErr } = await supabaseAdmin.rpc(
        "materializar_whatsapp_usuario_boas_vindas",
        { p_user_id: data.id, p_link_sistema: link, p_senha_temporaria: null } as never,
      );
      if (matErr) throw new Error(matErr.message);
      const res = (matData ?? {}) as { ok?: boolean; motivo?: string; outbox_id?: string };
      if (!res.ok) throw new Error(`Não foi possível enfileirar: ${res.motivo}`);
      await audit(context.supabase, "WHATSAPP_REENFILEIRADO", data.id,
        `Convite WhatsApp materializado via reprocessamento`, null,
        { outbox_id: res.outbox_id });
      return { ok: true, acao: "materializado" as const, outbox_id: res.outbox_id };
    }

    // Caso 2: falha definitiva/cancelado → reenfileira via RPC existente
    if (status === "FALHOU_DEFINITIVO" || status === "CANCELADO") {
      const { error: rerr } = await supabaseAdmin.rpc("whatsapp_outbox_reenfileirar", {
        p_id: last.id,
        p_motivo: "Reprocessado por Super Admin (UI)",
      } as never);
      if (rerr) throw new Error(rerr.message);
      await audit(context.supabase, "WHATSAPP_REENFILEIRADO", data.id,
        `Convite WhatsApp reenfileirado após ${status}`, null,
        { outbox_id: last.id });
      return { ok: true, acao: "reenfileirado" as const, outbox_id: last.id };
    }

    // Caso 3: PENDENTE/ATRASADO/FALHOU_TEMPORARIO → força próxima tentativa agora
    const { error: uerr } = await supabaseAdmin
      .from("whatsapp_outbox")
      .update({
        proxima_tentativa_em: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq("id", last.id);
    if (uerr) throw new Error(uerr.message);
    await audit(context.supabase, "WHATSAPP_REENFILEIRADO", data.id,
      `Convite WhatsApp: próxima tentativa antecipada (estava ${status})`, null,
      { outbox_id: last.id });
    return { ok: true, acao: "antecipado" as const, outbox_id: last.id };
  });

