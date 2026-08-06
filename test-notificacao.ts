import { supabase } from "./src/integrations/supabase/client";
import { enfileirarNotificacoesAusencia } from "./src/lib/notificacoes-ausencia.server";

async function test() {
  const ausenciaId = "75d1b106-377b-48e2-9343-ee76b722a482";
  const userId = "abbf815a-b918-48d5-8a12-8ba2090750b5";
  const correlationId = "test-corr-id";

  console.log("Chamando enfileirarNotificacoesAusencia...");
  await enfileirarNotificacoesAusencia({
    supabase: supabase as any,
    ausenciaId,
    evento: "AUSENCIA_CRIADA",
    correlationId,
    userId
  });
  console.log("Concluído.");
}

test().catch(console.error);
