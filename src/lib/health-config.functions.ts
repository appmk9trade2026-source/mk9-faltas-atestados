import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const configSchema = z.object({
  environment: z.enum(['DISABLED', 'SANDBOX', 'PRODUCTION']),
  kill_switch_enabled: z.boolean(),
});

export const getNotificationConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
    return data || [];
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
      .select("id")
      .eq("environment", config?.environment || 'DISABLED')
      .eq("active", true)
      .not("verified_at", "is", null);

    const reasons: string[] = [];
    if (!config) reasons.push("CONFIG_MISSING");
    if (config?.environment === 'DISABLED') reasons.push("ENV_DISABLED");
    if (!config?.kill_switch_enabled) reasons.push("KILL_SWITCH_OFF");
    if (!recipients || recipients.length === 0) {
      // Fallback Etapa 8.7: Se provider não suporta check, aceita admin_verified em SANDBOX
      const { data: adminVerifiedRecipients } = await supabaseAdmin
        .from("operational_notification_recipients")
        .select("id")
        .eq("environment", config?.environment || 'DISABLED')
        .eq("active", true)
        .eq("is_test_recipient", true) // Guardrail P0
        .eq("admin_verified", true)
        .eq("provider_check_capability", 'NOT_SUPPORTED');

      if (!adminVerifiedRecipients || adminVerifiedRecipients.length === 0) {
        reasons.push("NO_VERIFIED_RECIPIENTS");
      }
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
    // 1. Verificar permissão de Admin (RBAC P0)
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { 
      _user_id: context.userId, 
      _role: 'admin' 
    });
    if (!isAdmin) throw new Error("Unauthorized: Super Admin required");

    const { data: before } = await supabaseAdmin
      .from("operational_notification_recipients")
      .select("*")
      .eq("id", data.recipientId)
      .single();

    // 2. Apenas destinatários de teste em SANDBOX ou com check indisponível
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
      })
      .eq("id", data.recipientId)
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin.from("operational_notification_recipient_audit").insert({
      recipient_id: data.recipientId,
      actor_id: context.userId,
      action: "ADMIN_VERIFY",
      before_state: before,
      after_state: after,
      reason: data.reason,
      trace_id: data.traceId
    });

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
      _role: 'admin' 
    });
    if (!isAdmin) throw new Error("Unauthorized: Super Admin required");

    const { data: before } = await supabaseAdmin
      .from("operational_notification_recipients")
      .select("*")
      .eq("id", data.recipientId)
      .single();

    const { data: after, error } = await supabaseAdmin
      .from("operational_notification_recipients")
      .update({
        admin_verified: false,
        verification_method: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", data.recipientId)
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin.from("operational_notification_recipient_audit").insert({
      recipient_id: data.recipientId,
      actor_id: context.userId,
      action: "ADMIN_REVOKE",
      before_state: before,
      after_state: after,
      reason: data.reason
    });

    return after;
  });
