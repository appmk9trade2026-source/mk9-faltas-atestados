import { supabase } from "./src/integrations/supabase/client";
import { enfileirarNotificacoesAusencia } from "./src/lib/notificacoes-ausencia.server";

async function test() {
  // Pegar uma ausência que tenha colaborador com WhatsApp e Supervisor com WhatsApp
  // Primeiro, listar colaboradores que tenham whatsapp e supervisor_usuario_id
  console.log("Buscando cenário ideal para teste...");
  const { data: colabs } = await supabase
    .from("colaboradores")
    .select("id, whatsapp, supervisor_usuario_id, nome_completo")
    .not("whatsapp", "is", null)
    .not("supervisor_usuario_id", "is", null)
    .limit(1);

  if (!colabs || colabs.length === 0) {
    console.error("Nenhum colaborador com WhatsApp e Supervisor encontrado para teste.");
    return;
  }

  const testColab = colabs[0];
  console.log(`Testando com colaborador: ${testColab.nome_completo} (ID: ${testColab.id})`);

  // Pegar uma ausência desse colaborador ou criar uma rápida
  let { data: aus } = await supabase
    .from("ausencias")
    .select("id")
    .eq("colaborador_id", testColab.id)
    .limit(1)
    .maybeSingle();

  if (!aus) {
    console.log("Criando ausência de teste...");
    // Precisamos de empresa e projeto
    const { data: c } = await supabase.from("colaboradores").select("empresa_id, projeto_id").eq("id", testColab.id).single();
    
    const { data: newAus, error: insErr } = await supabase
      .from("ausencias")
      .insert({
        colaborador_id: testColab.id,
        empresa_id: c?.empresa_id,
        projeto_id: c?.projeto_id,
        tipo: "FALTA",
        tipo_detalhe: "Falta injustificada",
        data_inicio: "2026-08-01",
        data_fim: "2026-08-01",
        status: "PENDENTE",
        origem_registro: "AUTOMATICO",
        localidade: "Teste",
        loja_codigo_nome: "Sede"
      } as any)
      .select("id")
      .single();
    
    if (insErr) {
      console.error("Erro ao criar ausência de teste:", insErr);
      return;
    }
    aus = newAus;
  }

  console.log(`Ausência ID: ${aus!.id}`);

  await enfileirarNotificacoesAusencia({
    supabase: supabase as any,
    ausenciaId: aus!.id,
    evento: "AUSENCIA_CRIADA",
    correlationId: "test-v2-" + Date.now(),
    userId: testColab.supervisor_usuario_id!
  });

  console.log("Fim do script de teste.");
}

test().catch(console.error);
