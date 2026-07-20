import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PwaAction =
  | "PWA_INSTALL_PROMPT_SHOWN"
  | "PWA_INSTALL_ACCEPTED"
  | "PWA_INSTALL_DISMISSED"
  | "PWA_INSTALL_REMIND_LATER"
  | "PWA_INSTALL_NEVER"
  | "PWA_INSTALL_PREF_RESET";

const ALLOWED: PwaAction[] = [
  "PWA_INSTALL_PROMPT_SHOWN",
  "PWA_INSTALL_ACCEPTED",
  "PWA_INSTALL_DISMISSED",
  "PWA_INSTALL_REMIND_LATER",
  "PWA_INSTALL_NEVER",
  "PWA_INSTALL_PREF_RESET",
];

export const logPwaInstallEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      acao: PwaAction;
      navegador?: string;
      plataforma?: string;
    }) => {
      if (!ALLOWED.includes(input?.acao)) throw new Error("Ação PWA inválida.");
      return {
        acao: input.acao,
        navegador: (input.navegador ?? "").slice(0, 200),
        plataforma: (input.plataforma ?? "").slice(0, 100),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      modulo: "pwa",
      acao: data.acao,
      entidade: "pwa_install",
      registro_id: null,
      sucesso: true,
      origem: "client",
      usuario_id: context.userId,
      observacoes: `${data.plataforma || "?"} · ${data.navegador || "?"}`,
    });
    return { ok: true };
  });
