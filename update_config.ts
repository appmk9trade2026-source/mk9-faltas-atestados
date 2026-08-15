import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function main() {
  const { error } = await supabaseAdmin
    .from("operational_notification_config")
    .update({ kill_switch_enabled: false })
    .eq("environment", "SANDBOX");

  if (error) throw error;
  console.log("Kill Switch RESTORED to OFF");
}

main().catch(console.error);
