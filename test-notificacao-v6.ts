import { supabaseAdmin } from "./src/integrations/supabase/client.server";
import { enfileirarNotificacoesAusencia } from "./src/lib/notificacoes-ausencia.server";

async function test() {
  console.log("Preparando dados...");
  const { data: colab } = await supabaseAdmin.from("colaboradores").select("id").limit(1).single();
  const { data: prof } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
  
  if (!colab || !prof) return;

  await supabaseAdmin.from("colaboradores").update({
    whatsapp: "5561999998888",
    supervisor_usuario_id: prof.id
  } as any).eq("id", colab.id);

  const { data: c } = await supabaseAdmin.from("colaboradores").select("empresa_id, projeto_id").eq("id", colab.id).single();
  const { data: t } = await supabaseAdmin.from("tipos_ausencia").select("id").eq("codigo", "ATESTADO_MEDICO").maybeSingle();
  const { data: o } = await supabaseAdmin.from("opcoes_periodo_ausencia").select("id").limit(1).maybeSingle();

  const { data: aus, error: insErr } = await supabaseAdmin
    .from("ausencias")
    .insert({
      colaborador_id: colab.id,
      empresa_id: c?.empresa_id,
      projeto_id: c?.projeto_id,
      tipo: "ATESTADO",
      tipo_detalhe: "Atestado Médico",
      data_inicio: "2026-08-12",
      data_fim: "2026-08-12",
      motivo: "Teste de notificação sistema",
      status: "PENDENTE",
      origem_registro: "AUTOMATICO",
      localidade: "Brasília",
      loja_codigo_nome: "Sede",
      acidente_trabalho_trajeto: false,
      tipo_ausencia_id: t?.id,
      opcao_periodo_id: o?.id
    } as any)
    .select("id")
    .single();
  
  if (insErr) {
    console.error("Erro ao criar ausência:", insErr);
    return;
  }

  console.log(`Ausência criada: ${aus.id}`);

  await enfileirarNotificacoesAusencia({
    supabase: supabaseAdmin as any,
    ausenciaId: aus.id,
    evento: "AUSENCIA_CRIADA",
    correlationId: "test-v6-" + Date.now(),
    userId: prof.id
  });

  console.log("Fim do teste.");
}

test().catch(console.error);
