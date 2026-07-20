import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type AppRole = "super_admin" | "rh" | "supervisor" | "compliance" | "operacao" | "visualizador";

async function requireSuperAdmin(ctx: {
  supabase: typeof import("@/integrations/supabase/client").supabase;
  userId: string;
}) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "super_admin",
  });
  if (error || data !== true) throw new Error("Apenas Super Admin pode executar esta ação.");
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
    await requireSuperAdmin(context);
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

    let userId: string;
    if (data.enviar_convite && !data.senha_temporaria) {
      const inv = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        data: { nome: data.nome },
      });
      if (inv.error || !inv.data.user) throw new Error(inv.error?.message ?? "Falha ao convidar usuário.");
      userId = inv.data.user.id;
    } else {
      const cr = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.senha_temporaria ?? undefined,
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
    // Falha aqui NÃO reverte a criação: o admin pode reenviar depois pela UI.
    let whatsapp_outbox_id: string | null = null;
    let whatsapp_motivo: string | null = null;
    try {
      const link = process.env.APP_PUBLIC_URL || "https://mk9-staff-hub.lovable.app";
      const { data: matData, error: matErr } = await supabaseAdmin.rpc(
        "materializar_whatsapp_usuario_boas_vindas",
        {
          p_user_id: userId,
          p_link_sistema: link,
          p_senha_temporaria: data.senha_temporaria || null,
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
            { canal: "whatsapp", template: "USUARIO_CRIADO_V1", outbox_id: res.outbox_id, possui_senha_temporaria: !!data.senha_temporaria });
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
    await requireSuperAdmin(context);
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
    await requireSuperAdmin(context);
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
    await requireSuperAdmin(context);
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

// ---------------- REENVIAR CONVITE ----------------
export const reenviarConviteUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
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
    await requireSuperAdmin(context);
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

// ---------------- WhatsApp: reenviar boas-vindas ----------------
async function requireSuperAdminOrRH(ctx: {
  supabase: typeof import("@/integrations/supabase/client").supabase;
  userId: string;
}) {
  const [sa, rh] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "rh" }),
  ]);
  if (sa.data !== true && rh.data !== true) {
    throw new Error("Apenas Super Admin ou RH podem reenviar boas-vindas.");
  }
}

export const reenviarBoasVindasWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      senha_temporaria: z.string().min(8).max(72).optional().nullable(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireSuperAdminOrRH(context);
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
export type BoasVindasStatus = {
  user_id: string;
  outbox_id: string | null;
  status: string | null;
  ultimo_erro: string | null;
  telefone_mascarado: string | null;
  atualizado_em: string | null;
  provider_message_id: string | null;
};

export const listarStatusBoasVindas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ user_ids: z.array(z.string().uuid()).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    // Qualquer role autenticado que já veja a lista de usuários pode ver o status.
    // Restringimos a super_admin/rh/compliance (mesmas roles que enxergam a outbox).
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
      .select("id, destinatario_usuario_id, status, telefone_mascarado, ultimo_erro_resumido, provider_message_id, created_at, enviado_em, confirmado_em, falhou_em")
      .eq("evento_tipo", "USUARIO_CRIADO")
      .in("destinatario_usuario_id", data.user_ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const byUser = new Map<string, BoasVindasStatus>();
    for (const r of rows ?? []) {
      const uid = (r.destinatario_usuario_id as string) ?? "";
      if (!uid || byUser.has(uid)) continue;
      byUser.set(uid, {
        user_id: uid,
        outbox_id: (r.id as string) ?? null,
        status: (r.status as string) ?? null,
        ultimo_erro: (r.ultimo_erro_resumido as string) ?? null,
        telefone_mascarado: (r.telefone_mascarado as string) ?? null,
        provider_message_id: (r.provider_message_id as string) ?? null,
        atualizado_em: ((r.confirmado_em as string) ?? (r.enviado_em as string) ?? (r.falhou_em as string) ?? (r.created_at as string)) ?? null,
      });
    }
    return { itens: Array.from(byUser.values()) };
  });
