import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export const getStabilityResults = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabase
      .from('audit_stability_results')
      .select('*')
      .order('flow_id', { ascending: true })
      .order('gate_id', { ascending: true });

    if (error) throw error;
    return data;
  });

export const updateStabilityResult = createServerFn({ method: "POST" })
  .input(z.object({
    flow_id: z.string(),
    gate_id: z.string(),
    status: z.enum(['NOT_TESTED', 'PASS', 'GAP', 'BLOCKED']),
    severity: z.enum(['P0', 'P1', 'P2', 'P3', 'N/A']),
    evidence: z.string().optional(),
    root_cause: z.string().optional(),
    recommended_fix: z.string().optional(),
    trace_id: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { error } = await supabase
      .from('audit_stability_results')
      .upsert({
        ...data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'flow_id, gate_id' });

    if (error) throw error;
    return { success: true };
  });
