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
      .eq("environment", config?.environment)
      .eq("active", true)
      .not("verified_at", "is", null);

    const reasons: string[] = [];
    if (!config) reasons.push("CONFIG_MISSING");
    if (config?.environment === 'DISABLED') reasons.push("ENV_DISABLED");
    if (!config?.kill_switch_enabled) reasons.push("KILL_SWITCH_OFF");
    if (!recipients || recipients.length === 0) reasons.push("NO_VERIFIED_RECIPIENTS");

    return {
      status: reasons.length === 0 ? "READY" : "BLOCKED",
      reasons
    };
  });
