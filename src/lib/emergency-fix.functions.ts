import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const forceDeleteGhostAbsence = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    // Apenas registros explicitamente marcados como EXCLUIDO podem ser removidos fisicamente por esta rota de emergência
    const { error } = await supabaseAdmin
      .from("ausencias")
      .delete()
      .eq("id", data.id)
      .eq("status", "CANCELADO")
      .eq("status_documental", "EXCLUIDO");

    if (error) throw error;
    return { success: true };
  });
