import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { configSchema, addRecipientSchema } from "@/lib/health-config.schemas";



export const addTechnicalRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => addRecipientSchema.parse(data))
  .handler(async ({ data, context }) => {
    // 1. Verificação de permissão (Super Admin only)
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { 
      _user_id: context.userId, 
      _role: 'super_admin' as any
    });
    if (!isAdmin) throw new Error("Unauthorized: Super Admin required");

    // 2. Normalização canônica (apenas dígitos)
    const normalized = data.destination.replace(/\D/g, "");
    if (normalized.length < 8) throw new Error("Número inválido após normalização");

    // 3. Verificação de duplicidade lógica
    const { data: existing } = await supabaseAdmin
      .from("operational_notification_recipients")
      .select("id, active")
      .eq("destination", normalized)
      .maybeSingle();

    if (existing) {
      if (existing.active) {
        throw new Error("Este número já está cadastrado e ativo.");
      }
      // Se existia mas estava inativo, reativamos com novos dados
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("operational_notification_recipients")
        .update({
          label: data.label,
          active: true,
          environment: 'SANDBOX',
          is_test_recipient: true,
          admin_verified: false, // Reset verification on update
          updated_at: new Date().toISOString(),
          trace_id: `ADD-TECH-${Date.now()}`
        } as any)
        .eq("id", existing.id)
        .select()
        .single();
      
      if (updateErr) throw updateErr;

      await supabaseAdmin.from("operational_notification_recipient_audit" as any).insert({
        recipient_id: existing.id,
        actor_id: context.userId,
        action: "REACTIVATE_TECHNICAL_RECIPIENT",
        after_state: updated,
        trace_id: updated.trace_id
      } as any);

      return updated;
    }

    // 4. Inserção de novo
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("operational_notification_recipients")
      .insert({
        label: data.label,
        destination: normalized,
        channel: 'WHATSAPP',
        environment: 'SANDBOX',
        active: true,
        is_test_recipient: true,
        admin_verified: false,
        severity_scope: ['P0', 'P1'],
        provider_check_capability: 'NOT_SUPPORTED',
        trace_id: `ADD-TECH-${Date.now()}`
      } as any)
      .select()
      .single();

    if (insertErr) throw insertErr;

    // 5. Audit Trail (Sem PII no log de ação, apenas ID do recipient)
    await supabaseAdmin.from("operational_notification_recipient_audit" as any).insert({
      recipient_id: inserted.id,
      actor_id: context.userId,
      action: "CREATE_TECHNICAL_RECIPIENT",
      after_state: { label: inserted.label, env: inserted.environment },
      trace_id: inserted.trace_id
    } as any);

    return inserted;
  });


export const getNotificationConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("operational_notification_config")
      .select("*")
      .single();
    if (error) throw error;
    return data;
  });

export const updateNotificationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => configSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: before } = await supabaseAdmin
      .from("operational_notification_config")
      .select("*")
      .single();

    const { data: after, error } = await supabaseAdmin
      .from("operational_notification_config")
      .update({
        environment: data.environment,
        kill_switch_enabled: data.kill_switch_enabled,
        updated_at: new Date().toISOString(),
        updated_by: context.userId
      })
      .eq("id", '00000000-0000-0000-0000-000000000001')
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin.from("operational_notification_audit_logs").insert({
      actor_id: context.userId,
      action: "UPDATE_CONFIG",
      before_state: before,
      after_state: after
    });

    return after;
  });

export const listNotificationRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("operational_notification_recipients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []) as any[];
  });

export const validateNotificationGoLive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: config } = await supabaseAdmin
      .from("operational_notification_config")
      .select("*")
      .single();

    const { data: recipients } = await supabaseAdmin
      .from("operational_notification_recipients")
      .select("*")
      .eq("environment", config?.environment || 'DISABLED')
      .eq("active", true);

    const reasons: string[] = [];
    if (!config) reasons.push("CONFIG_MISSING");
    if (config?.environment === 'DISABLED') reasons.push("ENV_DISABLED");
    if (!config?.kill_switch_enabled) reasons.push("KILL_SWITCH_OFF");

    const verified = (recipients || []).filter(r => {
      const isVerified = (r as any).verified_at !== null;
      const isAdminVerified = (r as any).admin_verified === true && (r as any).provider_check_capability === 'NOT_SUPPORTED';
      return isVerified || isAdminVerified;
    });

    if (verified.length === 0) {
      reasons.push("NO_VERIFIED_RECIPIENTS");
    }

    return {
      status: reasons.length === 0 ? "READY" : "BLOCKED",
      reasons
    };
  });

export const adminVerifyRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    recipientId: z.string().uuid(),
    reason: z.string().min(10),
    traceId: z.string()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { 
      _user_id: context.userId, 
      _role: 'admin' as any
    });
    if (!isAdmin) throw new Error("Unauthorized: Super Admin required");

    const { data: before } = await supabaseAdmin
      .from("operational_notification_recipients")
      .select("*")
      .eq("id", data.recipientId)
      .single();

    if (!before) throw new Error("Recipient not found");

    if (before.environment === 'PRODUCTION') {
      throw new Error("Admin Verification restricted to SANDBOX recipients in this stage");
    }

    const { data: after, error } = await supabaseAdmin
      .from("operational_notification_recipients")
      .update({
        admin_verified: true,
        verification_method: 'ADMIN_MANUAL',
        verification_reason: data.reason,
        verified_by: context.userId,
        verified_at: new Date().toISOString(),
        trace_id: data.traceId
      } as any)
      .eq("id", data.recipientId)
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin.from("operational_notification_recipient_audit" as any).insert({
      recipient_id: data.recipientId,
      actor_id: context.userId,
      action: "ADMIN_VERIFY",
      before_state: before,
      after_state: after,
      reason: data.reason,
      trace_id: data.traceId
    } as any);

    return after;
  });

export const revokeAdminVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    recipientId: z.string().uuid(),
    reason: z.string().min(5)
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { 
      _user_id: context.userId, 
      _role: 'admin' as any
    });
    if (!isAdmin) throw new Error("Unauthorized: Super Admin required");

    const { data: before } = await supabaseAdmin
      .from("operational_notification_recipients")
      .select("*")
      .eq("id", data.recipientId)
      .single();

    if (!before) throw new Error("Recipient not found");

    const { data: after, error } = await supabaseAdmin
      .from("operational_notification_recipients")
      .update({
        admin_verified: false,
        verification_method: null,
        updated_at: new Date().toISOString()
      } as any)
      .eq("id", data.recipientId)
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin.from("operational_notification_recipient_audit" as any).insert({
      recipient_id: data.recipientId,
      actor_id: context.userId,
      action: "ADMIN_REVOKE",
      before_state: before,
      after_state: after,
      reason: data.reason
    } as any);

    return after;
  });
