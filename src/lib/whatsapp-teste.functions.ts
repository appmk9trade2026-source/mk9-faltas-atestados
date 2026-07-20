import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Ctx = {
  supabase: typeof import("@/integrations/supabase/client").supabase;
  userId: string;
};

async function assertSuperAdmin(ctx: Ctx): Promise<void> {
  const { data } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "super_admin",
  });
  if (data !== true) throw new Error("Apenas Super Admin pode usar o modo de teste.");
}

// ------------------------- Recipients (allow-list) ----------------------------

export const listTestRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { data, error } = await context.supabase
      .from("whatsapp_test_recipients")
      .select("id, nome, telefone_e164, ativo, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      ...r,
      telefone_mascarado: r.telefone_e164.replace(/.(?=.{4})/g, "*"),
    }));
  });

const RecipientInput = z.object({
  nome: z.string().trim().min(1).max(120),
  telefone_e164: z
    .string()
    .trim()
    .regex(/^\+?[1-9][0-9]{7,14}$/, "Telefone deve estar em formato E.164 (ex: +5511999999999)"),
});

export const createTestRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RecipientInput.parse(raw))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context);
    const telefone = data.telefone_e164.startsWith("+")
      ? data.telefone_e164
      : `+${data.telefone_e164}`;
    const { data: row, error } = await context.supabase
      .from("whatsapp_test_recipients")
      .insert({ nome: data.nome, telefone_e164: telefone, created_by: context.userId })
      .select("id, nome, telefone_e164, ativo")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleTestRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context);
    const { error } = await context.supabase
      .from("whatsapp_test_recipients")
      .update({ ativo: data.ativo })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTestRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context);
    const { error } = await context.supabase
      .from("whatsapp_test_recipients")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------------- Projetos (para o select) ---------------------------

export const listProjetosParaTeste = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { data, error } = await context.supabase
      .from("projetos")
      .select("id, nome, codigo_protocolo, ativo")
      .order("nome");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ------------------------- Preview & Envio ------------------------------------

const TesteInput = z.object({
  tipo_lancamento: z.enum(["FALTA", "ATESTADO"]),
  projeto_id: z.string().uuid(),
  colaborador_nome: z.string().trim().min(1).max(120),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_fim: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export const previewTemplateTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => TesteInput.parse(raw))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context);
    const { data: res, error } = await context.supabase.rpc("whatsapp_preview_template_teste", {
      p_tipo_lancamento: data.tipo_lancamento,
      p_projeto_id: data.projeto_id,
      p_colaborador_nome: data.colaborador_nome,
      p_data_inicio: data.data_inicio,
      p_data_fim: data.data_fim ?? null,
    });
    if (error) throw new Error(error.message);
    return res as {
      template_codigo: string;
      template_versao: number;
      protocolo_simulado: string;
      tipo_lancamento: string;
      periodo_texto: string;
      projeto_nome: string;
      aviso_privacidade: string;
      texto_renderizado: string;
    };
  });

export const enfileirarTemplateTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    TesteInput.extend({ recipient_id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context);
    const { data: res, error } = await context.supabase.rpc("whatsapp_enfileirar_template_teste", {
      p_recipient_id: data.recipient_id,
      p_tipo_lancamento: data.tipo_lancamento,
      p_projeto_id: data.projeto_id,
      p_colaborador_nome: data.colaborador_nome,
      p_data_inicio: data.data_inicio,
      p_data_fim: data.data_fim ?? null,
    });
    if (error) throw new Error(error.message);
    return res as {
      ok: boolean;
      outbox_id: string;
      template_codigo: string;
      template_versao: number;
      protocolo_simulado: string;
      destinatario_mascarado: string;
      texto_renderizado: string;
    };
  });

// ------------------------- Status do envio ------------------------------------

export const getTesteStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ outbox_id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context);
    const { data: row, error } = await context.supabase
      .from("whatsapp_outbox")
      .select(
        "id, status, telefone_mascarado, template_codigo, template_versao, provider_message_id, enviado_em, confirmado_em, falhou_em, ultimo_erro_resumido, tentativas",
      )
      .eq("id", data.outbox_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
