import { supabaseAdmin } from "./src/integrations/supabase/client.server";
import { enfileirarNotificacoesAusencia } from "./src/lib/notificacoes-ausencia.server";

async function test() {
  console.log("Preparando dados via admin...");
  const { data: colab } = await supabaseAdmin.from("colaboradores").select("id").limit(1).single();
  const { data: prof } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
  
  if (!colab || !prof) return;

  await supabaseAdmin.from("colaboradores").update({
    whatsapp: "5561999998888",
    supervisor_usuario_id: prof.id
  } as any).eq("id", colab.id);

  await supabaseAdmin.from("profiles").update({
    telefone_whatsapp: "5561988887777"
  } as any).eq("id", prof.id);

  console.log(`Colaborador: ${colab.id}, Supervisor: ${prof.id}`);

  // Pegar ou criar ausência
  let { data: aus } = await supabaseAdmin.from("ausencias").select("id").eq("colaborador_id", colab.id).limit(1).maybeSingle();
  if (!aus) {
    const { data: c } = await supabaseAdmin.from("colaboradores").select("empresa_id, projeto_id").eq("id", colab.id).single();
    const { data: newAus } = await supabaseAdmin.from("ausencias").insert({
      colaborador_id: colab.id,
      empresa_id: c?.empresa_id,
      projeto_id: c?.projeto_id,
      tipo: "FALTA",
      tipo_detalhe: "Falta Injustificada",
      data_inicio: "2026-08-01",
      data_fim: "2026-08-01",
      status: "PENDENTE",
      origem_registro: "AUTOMATICO",
      localidade: "Teste",
      loja_codigo_nome: "Sede"
    } as any).select("id").single();
    aus = newAus;
  }

  console.log(`Chamando enfileirarNotificacoesAusencia com admin client...`);
  await enfileirarNotificacoesAusencia({
    supabase: supabaseAdmin as any,
    ausenciaId: aus!.id,
    evento: "AUSENCIA_CRIADA",
    correlationId: "test-v3-" + Date.now(),
    userId: prof.id
  });

  console.log("Fim do teste.");
}

test().catch(console.error);
