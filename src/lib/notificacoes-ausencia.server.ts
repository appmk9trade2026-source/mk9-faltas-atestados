import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/integrations/supabase/types";

export type EventoNotificacao = "AUSENCIA_CRIADA" | "AUSENCIA_RETIFICADA" | "AUSENCIA_EXCLUIDA";

interface NotificarParams {
  supabase: SupabaseClient<Database>;
  ausenciaId: string;
  evento: EventoNotificacao;
  correlationId: string;
  userId: string;
}

/**
 * Enfileira notificações de ausência (WhatsApp e Internas).
 * EXECUTADO COM AWAIT: Garante a persistência no banco antes de retornar ao cliente.
 */
export async function enfileirarNotificacoesAusencia({
  supabase,
  ausenciaId,
  evento,
  correlationId,
  userId,
}: NotificarParams) {
  try {
    // 1. Buscar dados da ausência e hierarquia (Colaborador -> Supervisor -> Coordenador)
    const { data: aus, error: ausErr } = await supabase
      .from("ausencias")
      .select(`
        id,
        protocolo,
        data_inicio,
        data_fim,
        tipo_detalhe,
        empresa_id,
        projeto_id,
        colaborador_id,
        colaborador:colaboradores (
          id,
          nome_completo,
          matricula,
          whatsapp,
          supervisor_usuario_id,
          projeto:projetos (
            id,
            nome,
            coordenador_usuario_id
          )
        )
      `)
      .eq("id", ausenciaId)
      .maybeSingle();

    if (ausErr || !aus) {
      console.error("[Notificações] Erro ao carregar ausência:", ausErr);
      return;
    }

    const colab = aus.colaborador as any;
    if (!colab) return;

    const projeto = colab.projeto as any;
    const destinatarios: { tipo: string; usuario_id?: string; colaborador_id?: string; whatsapp?: string; nome: string }[] = [];

    // A. Colaborador (WhatsApp)
    if (colab.whatsapp) {
      destinatarios.push({
        tipo: "COLABORADOR",
        colaborador_id: colab.id,
        whatsapp: colab.whatsapp,
        nome: colab.nome_completo
      });
    }

    // B. Supervisor (Interna + WhatsApp se tiver profile)
    if (colab.supervisor_usuario_id) {
      const { data: supProfile } = await supabase
        .from("profiles")
        .select("id, nome, telefone_whatsapp")
        .eq("id", colab.supervisor_usuario_id)
        .maybeSingle();
      
      if (supProfile) {
        destinatarios.push({
          tipo: "SUPERVISOR",
          usuario_id: supProfile.id,
          whatsapp: supProfile.telefone_whatsapp || undefined,
          nome: supProfile.nome || "Supervisor"
        });
      }
    }

    // C. Coordenador (Interna)
    if (projeto?.coordenador_usuario_id) {
      destinatarios.push({
        tipo: "COORDENADOR",
        usuario_id: projeto.coordenador_usuario_id,
        nome: "Coordenador"
      });
    }

    // 2. Criar Notificações
    const promises: Promise<any>[] = [];

    for (const dest of destinatarios) {
      const idempotencyBase = `${ausenciaId}:${evento}:${dest.tipo}:${dest.usuario_id || dest.colaborador_id}`;

      // 2.1 WhatsApp Outbox (apenas se houver número)
      if (dest.whatsapp && (dest.tipo === "COLABORADOR" || dest.tipo === "SUPERVISOR")) {
        const templateCodigo = evento === "AUSENCIA_CRIADA" ? "ausencia_criada_v1" : "ausencia_notificacao_v1";
        
        // Buscar ID do template ativo
        const { data: template } = await supabase
          .from("whatsapp_templates")
          .select("id, versao")
          .eq("codigo", templateCodigo)
          .eq("ativo", true)
          .maybeSingle();

        if (template) {
          // Use .then() or just cast to any/Promise to satisfy the collector array
          const insertWa = supabase.from("whatsapp_outbox").insert({
            ausencia_id: ausenciaId,
            evento_tipo: evento,
            evento_id: correlationId,
            idempotency_key: `wa:${idempotencyBase}`,
            destinatario_colaborador_id: dest.colaborador_id || null,
            destinatario_usuario_id: dest.usuario_id || null,
            template_id: template.id,
            template_codigo: templateCodigo,
            template_versao: template.versao,
            publico: dest.tipo === "COLABORADOR" ? "COLABORADOR" : "INTERNO",
            prioridade: "ALTA",
            status: "PENDENTE",
            telefone_hash: "hash_placeholder",
            telefone_mascarado: dest.whatsapp.replace(/(\d{2})(\d{5})(\d{4})/, "$1*****$3"),
            payload: {
              protocolo: aus.protocolo,
              colaborador_nome: colab.nome_completo,
              tipo_detalhe: aus.tipo_detalhe,
              data_inicio: aus.data_inicio,
              data_fim: aus.data_fim
            }
          } as any);
          
          promises.push(insertWa as any);
        }
      }

      // 2.2 Notificações Internas (Alertas) para Supervisor e Coordenador
      if (dest.usuario_id && (dest.tipo === "SUPERVISOR" || dest.tipo === "COORDENADOR")) {
        const insertAlerta = supabase.from("alertas").insert({
          ausencia_id: ausenciaId,
          colaborador_id: colab.id,
          empresa_id: aus.empresa_id,
          projeto_id: aus.projeto_id,
          categoria: "NOTIFICACAO",
          regra_codigo: `NOTIF_${evento}`,
          severidade: "INFORMATIVO",
          status: "NOVO",
          titulo: evento === "AUSENCIA_CRIADA" ? "Nova Ausência Registrada" : "Ausência Atualizada",
          descricao: `O colaborador ${colab.nome_completo} possui um novo registro de ${aus.tipo_detalhe} (Protocolo: ${aus.protocolo}).`,
          chave_idempotencia: `alerta:${idempotencyBase}`,
          metadata: {
            evento,
            protocolo: aus.protocolo,
            tipo_detalhe: aus.tipo_detalhe,
            data_inicio: aus.data_inicio
          }
        } as any);
        
        promises.push(insertAlerta as any);
      }
    }

    // Executa e aguarda o enfileiramento local no banco
    if (promises.length > 0) {
      const results = await Promise.allSettled(promises);
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        console.warn(`[Notificações] ${failures.length} falhas ao enfileirar registros.`);
      }
    }

  } catch (err) {
    console.error("[Notificações] Falha crítica no enfileiramento:", err);
  }
}
