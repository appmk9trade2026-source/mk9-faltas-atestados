import { supabaseAdmin } from "./src/integrations/supabase/client.server";
import { enfileirarNotificacoesAusencia } from "./src/lib/notificacoes-ausencia.server";

async function test() {
  console.log("Preparando dados...");
  // 1. Criar Empresa
  const { data: emp } = await supabaseAdmin.from("empresas").insert({
    nome: "Empresa Teste Notif",
    codigo_interno: "TESTNOTIF",
    ativo: true
  } as any).select("id").single();
  
  if (!emp) return;

  // 2. Criar Projeto
  const { data: proj } = await supabaseAdmin.from("projetos").insert({
    empresa_id: emp.id,
    nome: "Projeto Teste Notif",
    codigo_interno: "PROJNOTIF",
    ativo: true
  } as any).select("id").single();

  // 3. Criar Perfil Supervisor
  const { data: prof } = await supabaseAdmin.from("profiles").select("id").limit(1).single();
  
  // 4. Criar Colaborador
  const { data: colab } = await supabaseAdmin.from("colaboradores").insert({
    empresa_id: emp.id,
    projeto_id: proj!.id,
    nome_completo: "Colaborador Teste Notif",
    matricula: "NOTIF001",
    whatsapp: "5561999998888",
    supervisor_usuario_id: prof!.id,
    ativo: true
  } as any).select("id").single();

  console.log(`Cenário: Empresa ${emp.id}, Projeto ${proj!.id}, Colaborador ${colab!.id}`);

  // 5. Criar Ausência
  const { data: t } = await supabaseAdmin.from("tipos_ausencia").select("id").eq("codigo", "ATESTADO_MEDICO").maybeSingle();
  const { data: o } = await supabaseAdmin.from("opcoes_periodo_ausencia").select("id").limit(1).maybeSingle();

  const { data: aus, error: insErr } = await supabaseAdmin
    .from("ausencias")
    .insert({
      colaborador_id: colab!.id,
      empresa_id: emp.id,
      projeto_id: proj!.id,
      tipo: "ATESTADO",
      tipo_detalhe: "Atestado Médico",
      data_inicio: "2026-08-12",
      data_fim: "2026-08-12",
      motivo: "Teste de notificação sistema v7",
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
    correlationId: "test-v7-" + Date.now(),
    userId: prof!.id
  });

  console.log("Fim do teste.");
}

test().catch(console.error);
