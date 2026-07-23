export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      absenteismo_config: {
        Row: {
          alerta_crescimento_pct: number
          alerta_janela_dias: number
          alerta_limite_absenteismo_projeto: number
          alerta_limite_criticos_equipe: number
          alerta_limite_dias_perdidos: number
          alerta_limite_mudanca_criticidade: number
          alerta_limite_reincidencia: number
          alerta_sensibilidade: string
          created_at: string
          id: string
          janela_dias: number
          limiar_alta: number
          limiar_atencao: number
          limiar_critica: number
          peso_acidente_trabalho: number
          peso_acidente_trajeto: number
          peso_atestado: number
          peso_declaracao: number
          peso_dia_perdido: number
          peso_falta: number
          peso_outros: number
          peso_reincidencia: number
          peso_suspensao: number
          reincidencia_janela_dias: number
          reincidencia_min_ocorrencias: number
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alerta_crescimento_pct?: number
          alerta_janela_dias?: number
          alerta_limite_absenteismo_projeto?: number
          alerta_limite_criticos_equipe?: number
          alerta_limite_dias_perdidos?: number
          alerta_limite_mudanca_criticidade?: number
          alerta_limite_reincidencia?: number
          alerta_sensibilidade?: string
          created_at?: string
          id?: string
          janela_dias?: number
          limiar_alta?: number
          limiar_atencao?: number
          limiar_critica?: number
          peso_acidente_trabalho?: number
          peso_acidente_trajeto?: number
          peso_atestado?: number
          peso_declaracao?: number
          peso_dia_perdido?: number
          peso_falta?: number
          peso_outros?: number
          peso_reincidencia?: number
          peso_suspensao?: number
          reincidencia_janela_dias?: number
          reincidencia_min_ocorrencias?: number
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alerta_crescimento_pct?: number
          alerta_janela_dias?: number
          alerta_limite_absenteismo_projeto?: number
          alerta_limite_criticos_equipe?: number
          alerta_limite_dias_perdidos?: number
          alerta_limite_mudanca_criticidade?: number
          alerta_limite_reincidencia?: number
          alerta_sensibilidade?: string
          created_at?: string
          id?: string
          janela_dias?: number
          limiar_alta?: number
          limiar_atencao?: number
          limiar_critica?: number
          peso_acidente_trabalho?: number
          peso_acidente_trajeto?: number
          peso_atestado?: number
          peso_declaracao?: number
          peso_dia_perdido?: number
          peso_falta?: number
          peso_outros?: number
          peso_reincidencia?: number
          peso_suspensao?: number
          reincidencia_janela_dias?: number
          reincidencia_min_ocorrencias?: number
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      access_reviews: {
        Row: {
          conclusao: string | null
          created_at: string
          criado_por: string | null
          id: string
          inicio: string
          observacoes: string | null
          papel: Database["public"]["Enums"]["app_role"]
          prazo: string
          responsavel_id: string | null
          responsavel_nome: string | null
          status: Database["public"]["Enums"]["access_review_status"]
          updated_at: string
          usuario_id: string
          usuario_nome: string | null
        }
        Insert: {
          conclusao?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          inicio?: string
          observacoes?: string | null
          papel: Database["public"]["Enums"]["app_role"]
          prazo?: string
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: Database["public"]["Enums"]["access_review_status"]
          updated_at?: string
          usuario_id: string
          usuario_nome?: string | null
        }
        Update: {
          conclusao?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          inicio?: string
          observacoes?: string | null
          papel?: Database["public"]["Enums"]["app_role"]
          prazo?: string
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: Database["public"]["Enums"]["access_review_status"]
          updated_at?: string
          usuario_id?: string
          usuario_nome?: string | null
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          archived_at: string | null
          created_at: string
          empresa_id: string | null
          id: string
          projeto_id: string | null
          titulo: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          projeto_id?: string | null
          titulo?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          projeto_id?: string | null
          titulo?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_tst_saude"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "ai_conversations_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          comentario: string | null
          created_at: string
          id: string
          message_id: string
          motivo: string | null
          rating: string
          user_id: string
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          id?: string
          message_id: string
          motivo?: string | null
          rating: string
          user_id: string
        }
        Update: {
          comentario?: string | null
          created_at?: string
          id?: string
          message_id?: string
          motivo?: string | null
          rating?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          error_code: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model_identifier: string | null
          output_tokens: number | null
          provider_identifier: string | null
          role: string
          status: string
          structured_content: Json | null
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_identifier?: string | null
          output_tokens?: number | null
          provider_identifier?: string | null
          role: string
          status?: string
          structured_content?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_identifier?: string | null
          output_tokens?: number | null
          provider_identifier?: string | null
          role?: string
          status?: string
          structured_content?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_rate_limits: {
        Row: {
          contador: number
          janela_inicio: string
          user_id: string
        }
        Insert: {
          contador?: number
          janela_inicio: string
          user_id: string
        }
        Update: {
          contador?: number
          janela_inicio?: string
          user_id?: string
        }
        Relationships: []
      }
      alertas: {
        Row: {
          acao_recurso_id: string | null
          acao_tipo: string | null
          acao_url: string | null
          assumido_em: string | null
          assumido_por: string | null
          ausencia_id: string | null
          categoria: string
          chave_idempotencia: string
          colaborador_id: string | null
          created_at: string
          descricao: string
          detectado_em: string
          dispensado_em: string | null
          dispensado_por: string | null
          empresa_id: string | null
          id: string
          justificativa: string | null
          lido_em: string | null
          lido_por: string | null
          metadata: Json
          prazo_em: string | null
          projeto_id: string | null
          regra_codigo: string
          resolucao_automatica: boolean
          resolvido_em: string | null
          resolvido_por: string | null
          severidade: string
          status: string
          titulo: string
          updated_at: string
          whatsapp_outbox_id: string | null
        }
        Insert: {
          acao_recurso_id?: string | null
          acao_tipo?: string | null
          acao_url?: string | null
          assumido_em?: string | null
          assumido_por?: string | null
          ausencia_id?: string | null
          categoria: string
          chave_idempotencia: string
          colaborador_id?: string | null
          created_at?: string
          descricao: string
          detectado_em?: string
          dispensado_em?: string | null
          dispensado_por?: string | null
          empresa_id?: string | null
          id?: string
          justificativa?: string | null
          lido_em?: string | null
          lido_por?: string | null
          metadata?: Json
          prazo_em?: string | null
          projeto_id?: string | null
          regra_codigo: string
          resolucao_automatica?: boolean
          resolvido_em?: string | null
          resolvido_por?: string | null
          severidade: string
          status?: string
          titulo: string
          updated_at?: string
          whatsapp_outbox_id?: string | null
        }
        Update: {
          acao_recurso_id?: string | null
          acao_tipo?: string | null
          acao_url?: string | null
          assumido_em?: string | null
          assumido_por?: string | null
          ausencia_id?: string | null
          categoria?: string
          chave_idempotencia?: string
          colaborador_id?: string | null
          created_at?: string
          descricao?: string
          detectado_em?: string
          dispensado_em?: string | null
          dispensado_por?: string | null
          empresa_id?: string | null
          id?: string
          justificativa?: string | null
          lido_em?: string | null
          lido_por?: string | null
          metadata?: Json
          prazo_em?: string | null
          projeto_id?: string | null
          regra_codigo?: string
          resolucao_automatica?: boolean
          resolvido_em?: string | null
          resolvido_por?: string | null
          severidade?: string
          status?: string
          titulo?: string
          updated_at?: string
          whatsapp_outbox_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alertas_ausencia_id_fkey"
            columns: ["ausencia_id"]
            isOneToOne: false
            referencedRelation: "ausencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_tst_saude"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "alertas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_whatsapp_outbox_id_fkey"
            columns: ["whatsapp_outbox_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_configuracoes: {
        Row: {
          habilitada: boolean
          janela_minutos: number | null
          limite_horas: number | null
          limite_minutos: number | null
          quantidade_limite: number | null
          regra_codigo: string
          severidade: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          habilitada?: boolean
          janela_minutos?: number | null
          limite_horas?: number | null
          limite_minutos?: number | null
          quantidade_limite?: number | null
          regra_codigo: string
          severidade?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          habilitada?: boolean
          janela_minutos?: number | null
          limite_horas?: number | null
          limite_minutos?: number | null
          quantidade_limite?: number | null
          regra_codigo?: string
          severidade?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      alertas_eventos: {
        Row: {
          alerta_id: string
          created_at: string
          evento: string
          id: string
          justificativa: string | null
          metadata: Json
          status_anterior: string | null
          status_novo: string | null
          usuario_id: string | null
        }
        Insert: {
          alerta_id: string
          created_at?: string
          evento: string
          id?: string
          justificativa?: string | null
          metadata?: Json
          status_anterior?: string | null
          status_novo?: string | null
          usuario_id?: string | null
        }
        Update: {
          alerta_id?: string
          created_at?: string
          evento?: string
          id?: string
          justificativa?: string | null
          metadata?: Json
          status_anterior?: string | null
          status_novo?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alertas_eventos_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "alertas"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          acao: Database["public"]["Enums"]["audit_action"]
          antes: Json | null
          created_at: string
          depois: Json | null
          empresa_id: string | null
          entidade: string | null
          id: string
          ip: string | null
          modulo: string
          observacoes: string | null
          origem: string | null
          perfil: string | null
          projeto_id: string | null
          registro_id: string | null
          sucesso: boolean
          user_agent: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao: Database["public"]["Enums"]["audit_action"]
          antes?: Json | null
          created_at?: string
          depois?: Json | null
          empresa_id?: string | null
          entidade?: string | null
          id?: string
          ip?: string | null
          modulo: string
          observacoes?: string | null
          origem?: string | null
          perfil?: string | null
          projeto_id?: string | null
          registro_id?: string | null
          sucesso?: boolean
          user_agent?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: Database["public"]["Enums"]["audit_action"]
          antes?: Json | null
          created_at?: string
          depois?: Json | null
          empresa_id?: string | null
          entidade?: string | null
          id?: string
          ip?: string | null
          modulo?: string
          observacoes?: string | null
          origem?: string | null
          perfil?: string | null
          projeto_id?: string | null
          registro_id?: string | null
          sucesso?: boolean
          user_agent?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      ausencias: {
        Row: {
          acidente_atendimento_medico: boolean | null
          acidente_cat_emitida: boolean | null
          acidente_data: string | null
          acidente_descricao: string | null
          acidente_dias_afastamento_inicial: number | null
          acidente_hora: string | null
          acidente_houve_afastamento: boolean | null
          acidente_local: string | null
          acidente_observacoes: string | null
          acidente_trabalho_trajeto: boolean | null
          arquivo_criado_em: string | null
          arquivo_criado_por: string | null
          arquivo_mime: string | null
          arquivo_nome: string | null
          arquivo_tamanho: number | null
          arquivo_url: string | null
          cid: string | null
          colaborador_id: string
          created_at: string
          data_fim: string
          data_inicio: string
          data_retorno: string | null
          dias: number
          dias_label: string | null
          empresa_id: string
          id: string
          lancado_em: string | null
          lancado_por: string | null
          localidade: string | null
          loja_codigo_nome: string | null
          motivo: string | null
          observacoes: string | null
          opcao_periodo_codigo: string | null
          opcao_periodo_id: string | null
          opcao_periodo_nome: string | null
          possui_anexo: boolean
          projeto_id: string
          protocolo: string | null
          quantidade_dias_calculada: number | null
          registrado_em: string
          registrado_por: string | null
          status: Database["public"]["Enums"]["status_ausencia"]
          tipo: Database["public"]["Enums"]["tipo_ausencia"]
          tipo_ausencia_codigo: string | null
          tipo_ausencia_id: string | null
          tipo_ausencia_nome: string | null
          tipo_detalhe: string | null
          updated_at: string
        }
        Insert: {
          acidente_atendimento_medico?: boolean | null
          acidente_cat_emitida?: boolean | null
          acidente_data?: string | null
          acidente_descricao?: string | null
          acidente_dias_afastamento_inicial?: number | null
          acidente_hora?: string | null
          acidente_houve_afastamento?: boolean | null
          acidente_local?: string | null
          acidente_observacoes?: string | null
          acidente_trabalho_trajeto?: boolean | null
          arquivo_criado_em?: string | null
          arquivo_criado_por?: string | null
          arquivo_mime?: string | null
          arquivo_nome?: string | null
          arquivo_tamanho?: number | null
          arquivo_url?: string | null
          cid?: string | null
          colaborador_id: string
          created_at?: string
          data_fim: string
          data_inicio: string
          data_retorno?: string | null
          dias?: number
          dias_label?: string | null
          empresa_id: string
          id?: string
          lancado_em?: string | null
          lancado_por?: string | null
          localidade?: string | null
          loja_codigo_nome?: string | null
          motivo?: string | null
          observacoes?: string | null
          opcao_periodo_codigo?: string | null
          opcao_periodo_id?: string | null
          opcao_periodo_nome?: string | null
          possui_anexo?: boolean
          projeto_id: string
          protocolo?: string | null
          quantidade_dias_calculada?: number | null
          registrado_em?: string
          registrado_por?: string | null
          status?: Database["public"]["Enums"]["status_ausencia"]
          tipo: Database["public"]["Enums"]["tipo_ausencia"]
          tipo_ausencia_codigo?: string | null
          tipo_ausencia_id?: string | null
          tipo_ausencia_nome?: string | null
          tipo_detalhe?: string | null
          updated_at?: string
        }
        Update: {
          acidente_atendimento_medico?: boolean | null
          acidente_cat_emitida?: boolean | null
          acidente_data?: string | null
          acidente_descricao?: string | null
          acidente_dias_afastamento_inicial?: number | null
          acidente_hora?: string | null
          acidente_houve_afastamento?: boolean | null
          acidente_local?: string | null
          acidente_observacoes?: string | null
          acidente_trabalho_trajeto?: boolean | null
          arquivo_criado_em?: string | null
          arquivo_criado_por?: string | null
          arquivo_mime?: string | null
          arquivo_nome?: string | null
          arquivo_tamanho?: number | null
          arquivo_url?: string | null
          cid?: string | null
          colaborador_id?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          data_retorno?: string | null
          dias?: number
          dias_label?: string | null
          empresa_id?: string
          id?: string
          lancado_em?: string | null
          lancado_por?: string | null
          localidade?: string | null
          loja_codigo_nome?: string | null
          motivo?: string | null
          observacoes?: string | null
          opcao_periodo_codigo?: string | null
          opcao_periodo_id?: string | null
          opcao_periodo_nome?: string | null
          possui_anexo?: boolean
          projeto_id?: string
          protocolo?: string | null
          quantidade_dias_calculada?: number | null
          registrado_em?: string
          registrado_por?: string | null
          status?: Database["public"]["Enums"]["status_ausencia"]
          tipo?: Database["public"]["Enums"]["tipo_ausencia"]
          tipo_ausencia_codigo?: string | null
          tipo_ausencia_id?: string | null
          tipo_ausencia_nome?: string | null
          tipo_detalhe?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ausencias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausencias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausencias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_tst_saude"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "ausencias_opcao_periodo_id_fkey"
            columns: ["opcao_periodo_id"]
            isOneToOne: false
            referencedRelation: "opcoes_periodo_ausencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausencias_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ausencias_tipo_ausencia_id_fkey"
            columns: ["tipo_ausencia_id"]
            isOneToOne: false
            referencedRelation: "tipos_ausencia"
            referencedColumns: ["id"]
          },
        ]
      }
      automacao_config: {
        Row: {
          agendamento_ativo: boolean
          created_at: string
          execucao_travada_minutos: number
          falhas_para_alta: number
          falhas_para_critica: number
          id: boolean
          intervalo_minutos: number
          tolerancia_minutos: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agendamento_ativo?: boolean
          created_at?: string
          execucao_travada_minutos?: number
          falhas_para_alta?: number
          falhas_para_critica?: number
          id?: boolean
          intervalo_minutos?: number
          tolerancia_minutos?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agendamento_ativo?: boolean
          created_at?: string
          execucao_travada_minutos?: number
          falhas_para_alta?: number
          falhas_para_critica?: number
          id?: boolean
          intervalo_minutos?: number
          tolerancia_minutos?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      backup_execution_events: {
        Row: {
          correlation_id: string
          created_at: string
          created_by: string | null
          duracao_segundos: number | null
          evento: string
          id: string
          mensagem: string | null
          metadata: Json
          origem: string
          solicitacao_id: string
          status: string
          tamanho_bytes: number | null
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          created_by?: string | null
          duracao_segundos?: number | null
          evento: string
          id?: string
          mensagem?: string | null
          metadata?: Json
          origem?: string
          solicitacao_id: string
          status: string
          tamanho_bytes?: number | null
        }
        Update: {
          correlation_id?: string
          created_at?: string
          created_by?: string | null
          duracao_segundos?: number | null
          evento?: string
          id?: string
          mensagem?: string | null
          metadata?: Json
          origem?: string
          solicitacao_id?: string
          status?: string
          tamanho_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_execution_events_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "backup_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_logs: {
        Row: {
          created_at: string
          duracao_segundos: number | null
          fim: string | null
          id: string
          inicio: string
          observacoes: string | null
          origem: string | null
          solicitado_por: string | null
          solicitado_por_nome: string | null
          status: string
          tamanho_bytes: number | null
          tipo: string
        }
        Insert: {
          created_at?: string
          duracao_segundos?: number | null
          fim?: string | null
          id?: string
          inicio?: string
          observacoes?: string | null
          origem?: string | null
          solicitado_por?: string | null
          solicitado_por_nome?: string | null
          status?: string
          tamanho_bytes?: number | null
          tipo: string
        }
        Update: {
          created_at?: string
          duracao_segundos?: number | null
          fim?: string | null
          id?: string
          inicio?: string
          observacoes?: string | null
          origem?: string | null
          solicitado_por?: string | null
          solicitado_por_nome?: string | null
          status?: string
          tamanho_bytes?: number | null
          tipo?: string
        }
        Relationships: []
      }
      bi_absenteismo_diario: {
        Row: {
          afastamentos: number
          atestados: number
          categoria_id: string | null
          created_at: string
          data_referencia: string
          empresa_id: string | null
          faltas: number
          id: string
          licencas: number
          medidas_administrativas: number
          outros: number
          projeto_id: string | null
          sem_duracao: number
          status: string
          tipo_ausencia_id: string | null
          total_colaboradores_afetados: number
          total_dias_ausencia: number
          total_horas_estimadas: number
          total_registros: number
          updated_at: string
        }
        Insert: {
          afastamentos?: number
          atestados?: number
          categoria_id?: string | null
          created_at?: string
          data_referencia: string
          empresa_id?: string | null
          faltas?: number
          id?: string
          licencas?: number
          medidas_administrativas?: number
          outros?: number
          projeto_id?: string | null
          sem_duracao?: number
          status: string
          tipo_ausencia_id?: string | null
          total_colaboradores_afetados?: number
          total_dias_ausencia?: number
          total_horas_estimadas?: number
          total_registros?: number
          updated_at?: string
        }
        Update: {
          afastamentos?: number
          atestados?: number
          categoria_id?: string | null
          created_at?: string
          data_referencia?: string
          empresa_id?: string | null
          faltas?: number
          id?: string
          licencas?: number
          medidas_administrativas?: number
          outros?: number
          projeto_id?: string | null
          sem_duracao?: number
          status?: string
          tipo_ausencia_id?: string | null
          total_colaboradores_afetados?: number
          total_dias_ausencia?: number
          total_horas_estimadas?: number
          total_registros?: number
          updated_at?: string
        }
        Relationships: []
      }
      bi_config: {
        Row: {
          id: string
          janela_recorrencia_dias: number
          limite_recorrencia: number
          minimo_grupo_privacidade: number
          minimo_periodos_sazonalidade: number
          minimo_pontos_tendencia: number
          refresh_habilitado: boolean
          refresh_intervalo_minutos: number
          refresh_timeout_minutos: number
          refresh_tolerancia_minutos: number
          singleton: boolean
          updated_at: string
          updated_by: string | null
          zscore_atencao: number
          zscore_atipico: number
        }
        Insert: {
          id?: string
          janela_recorrencia_dias?: number
          limite_recorrencia?: number
          minimo_grupo_privacidade?: number
          minimo_periodos_sazonalidade?: number
          minimo_pontos_tendencia?: number
          refresh_habilitado?: boolean
          refresh_intervalo_minutos?: number
          refresh_timeout_minutos?: number
          refresh_tolerancia_minutos?: number
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
          zscore_atencao?: number
          zscore_atipico?: number
        }
        Update: {
          id?: string
          janela_recorrencia_dias?: number
          limite_recorrencia?: number
          minimo_grupo_privacidade?: number
          minimo_periodos_sazonalidade?: number
          minimo_pontos_tendencia?: number
          refresh_habilitado?: boolean
          refresh_intervalo_minutos?: number
          refresh_timeout_minutos?: number
          refresh_tolerancia_minutos?: number
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
          zscore_atencao?: number
          zscore_atipico?: number
        }
        Relationships: []
      }
      bi_refresh_execucoes: {
        Row: {
          created_at: string
          duracao_ms: number | null
          execution_id: string
          finalizado_em: string | null
          id: string
          iniciado_em: string
          linhas_processadas: number | null
          mensagem_resumida: string | null
          metadata: Json
          origem: string
          status: string
        }
        Insert: {
          created_at?: string
          duracao_ms?: number | null
          execution_id?: string
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          linhas_processadas?: number | null
          mensagem_resumida?: string | null
          metadata?: Json
          origem?: string
          status: string
        }
        Update: {
          created_at?: string
          duracao_ms?: number | null
          execution_id?: string
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          linhas_processadas?: number | null
          mensagem_resumida?: string | null
          metadata?: Json
          origem?: string
          status?: string
        }
        Relationships: []
      }
      bi_visoes_salvas: {
        Row: {
          created_at: string
          descricao: string | null
          filtros: Json
          id: string
          is_padrao: boolean
          nome: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          filtros?: Json
          id?: string
          is_padrao?: boolean
          nome: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          filtros?: Json
          id?: string
          is_padrao?: boolean
          nome?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: []
      }
      categorias_ausencia: {
        Row: {
          ativo: boolean
          codigo: string
          cor: string | null
          created_at: string
          icone: string | null
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      colaboradores: {
        Row: {
          ativo: boolean
          cargo: string | null
          cpf: string | null
          created_at: string
          data_admissao: string | null
          email: string | null
          empresa_id: string
          id: string
          matricula: string
          nome_completo: string
          observacoes: string | null
          projeto_id: string
          supervisor_email: string | null
          supervisor_nome: string | null
          supervisor_telefone: string | null
          supervisor_usuario_id: string | null
          telefone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          email?: string | null
          empresa_id: string
          id?: string
          matricula: string
          nome_completo: string
          observacoes?: string | null
          projeto_id: string
          supervisor_email?: string | null
          supervisor_nome?: string | null
          supervisor_telefone?: string | null
          supervisor_usuario_id?: string | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          email?: string | null
          empresa_id?: string
          id?: string
          matricula?: string
          nome_completo?: string
          observacoes?: string | null
          projeto_id?: string
          supervisor_email?: string | null
          supervisor_nome?: string | null
          supervisor_telefone?: string | null
          supervisor_usuario_id?: string | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_tst_saude"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "colaboradores_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicacoes: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          assunto: string | null
          ausencia_id: string
          colaborador_id: string
          created_at: string
          criado_por: string | null
          destinatario: string
          enviado_em: string | null
          enviado_por: string | null
          erro: string | null
          id: string
          mensagem: string
          status: Database["public"]["Enums"]["status_comunicacao"]
          tipo: Database["public"]["Enums"]["canal_comunicacao"]
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          assunto?: string | null
          ausencia_id: string
          colaborador_id: string
          created_at?: string
          criado_por?: string | null
          destinatario: string
          enviado_em?: string | null
          enviado_por?: string | null
          erro?: string | null
          id?: string
          mensagem: string
          status?: Database["public"]["Enums"]["status_comunicacao"]
          tipo: Database["public"]["Enums"]["canal_comunicacao"]
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          assunto?: string | null
          ausencia_id?: string
          colaborador_id?: string
          created_at?: string
          criado_por?: string | null
          destinatario?: string
          enviado_em?: string | null
          enviado_por?: string | null
          erro?: string | null
          id?: string
          mensagem?: string
          status?: Database["public"]["Enums"]["status_comunicacao"]
          tipo?: Database["public"]["Enums"]["canal_comunicacao"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacoes_ausencia_id_fkey"
            columns: ["ausencia_id"]
            isOneToOne: false
            referencedRelation: "ausencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ativo: boolean
          cnpj: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      escalonamento_execucoes: {
        Row: {
          created_at: string
          duplicidades_ignoradas: number
          duracao_ms: number | null
          erro: string | null
          erros_encontrados: number
          executado_por: string | null
          execution_id: string
          finalizado_em: string | null
          id: string
          incidentes_avaliados: number
          iniciado_em: string
          mensagem_resumida: string | null
          metadata: Json
          notificacoes_geradas: number
          origem: string
          processados: number
          regras_avaliadas: number
          status: string
        }
        Insert: {
          created_at?: string
          duplicidades_ignoradas?: number
          duracao_ms?: number | null
          erro?: string | null
          erros_encontrados?: number
          executado_por?: string | null
          execution_id: string
          finalizado_em?: string | null
          id?: string
          incidentes_avaliados?: number
          iniciado_em?: string
          mensagem_resumida?: string | null
          metadata?: Json
          notificacoes_geradas?: number
          origem?: string
          processados?: number
          regras_avaliadas?: number
          status?: string
        }
        Update: {
          created_at?: string
          duplicidades_ignoradas?: number
          duracao_ms?: number | null
          erro?: string | null
          erros_encontrados?: number
          executado_por?: string | null
          execution_id?: string
          finalizado_em?: string | null
          id?: string
          incidentes_avaliados?: number
          iniciado_em?: string
          mensagem_resumida?: string | null
          metadata?: Json
          notificacoes_geradas?: number
          origem?: string
          processados?: number
          regras_avaliadas?: number
          status?: string
        }
        Relationships: []
      }
      go_live_checklist: {
        Row: {
          categoria: string
          concluido: boolean
          concluido_em: string | null
          concluido_por: string | null
          created_at: string
          id: string
          item: string
          observacoes: string | null
          ordem: number
          updated_at: string
        }
        Insert: {
          categoria: string
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          id?: string
          item: string
          observacoes?: string | null
          ordem?: number
          updated_at?: string
        }
        Update: {
          categoria?: string
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          id?: string
          item?: string
          observacoes?: string | null
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      homologacoes: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          classificacao:
            | Database["public"]["Enums"]["homolog_classificacao"]
            | null
          created_at: string
          criticidade: Database["public"]["Enums"]["homolog_criticidade"]
          descricao: string | null
          evidencia: string | null
          evidencia_url: string | null
          executado_em: string | null
          executado_por: string | null
          id: string
          modulo: string
          nome: string
          observacoes: string | null
          responsavel: string | null
          resultado: string | null
          status: Database["public"]["Enums"]["homolog_status"]
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          classificacao?:
            | Database["public"]["Enums"]["homolog_classificacao"]
            | null
          created_at?: string
          criticidade?: Database["public"]["Enums"]["homolog_criticidade"]
          descricao?: string | null
          evidencia?: string | null
          evidencia_url?: string | null
          executado_em?: string | null
          executado_por?: string | null
          id?: string
          modulo: string
          nome: string
          observacoes?: string | null
          responsavel?: string | null
          resultado?: string | null
          status?: Database["public"]["Enums"]["homolog_status"]
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          classificacao?:
            | Database["public"]["Enums"]["homolog_classificacao"]
            | null
          created_at?: string
          criticidade?: Database["public"]["Enums"]["homolog_criticidade"]
          descricao?: string | null
          evidencia?: string | null
          evidencia_url?: string | null
          executado_em?: string | null
          executado_por?: string | null
          id?: string
          modulo?: string
          nome?: string
          observacoes?: string | null
          responsavel?: string | null
          resultado?: string | null
          status?: Database["public"]["Enums"]["homolog_status"]
          updated_at?: string
        }
        Relationships: []
      }
      importacoes: {
        Row: {
          arquivo_nome: string
          arquivo_tamanho: number | null
          atualizadas: number
          created_at: string
          detalhes: Json | null
          duracao_ms: number
          erros: number
          id: string
          ignoradas: number
          importadas: number
          status: string
          total_linhas: number
          updated_at: string
          usuario_id: string
        }
        Insert: {
          arquivo_nome: string
          arquivo_tamanho?: number | null
          atualizadas?: number
          created_at?: string
          detalhes?: Json | null
          duracao_ms?: number
          erros?: number
          id?: string
          ignoradas?: number
          importadas?: number
          status?: string
          total_linhas?: number
          updated_at?: string
          usuario_id: string
        }
        Update: {
          arquivo_nome?: string
          arquivo_tamanho?: number | null
          atualizadas?: number
          created_at?: string
          detalhes?: Json | null
          duracao_ms?: number
          erros?: number
          id?: string
          ignoradas?: number
          importadas?: number
          status?: string
          total_linhas?: number
          updated_at?: string
          usuario_id?: string
        }
        Relationships: []
      }
      inteligencia_alerta_eventos: {
        Row: {
          alerta_id: string
          comentario: string | null
          created_at: string
          dados: Json
          id: string
          tipo: Database["public"]["Enums"]["inteligencia_alerta_evento_tipo"]
          usuario_id: string | null
        }
        Insert: {
          alerta_id: string
          comentario?: string | null
          created_at?: string
          dados?: Json
          id?: string
          tipo: Database["public"]["Enums"]["inteligencia_alerta_evento_tipo"]
          usuario_id?: string | null
        }
        Update: {
          alerta_id?: string
          comentario?: string | null
          created_at?: string
          dados?: Json
          id?: string
          tipo?: Database["public"]["Enums"]["inteligencia_alerta_evento_tipo"]
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inteligencia_alerta_eventos_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "inteligencia_alertas"
            referencedColumns: ["id"]
          },
        ]
      }
      inteligencia_alerta_leituras: {
        Row: {
          alerta_id: string
          lido_em: string
          usuario_id: string
        }
        Insert: {
          alerta_id: string
          lido_em?: string
          usuario_id: string
        }
        Update: {
          alerta_id?: string
          lido_em?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inteligencia_alerta_leituras_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "inteligencia_alertas"
            referencedColumns: ["id"]
          },
        ]
      }
      inteligencia_alertas: {
        Row: {
          assumido_em: string | null
          colaborador_id: string | null
          created_at: string
          criticidade: Database["public"]["Enums"]["inteligencia_alerta_criticidade"]
          dados: Json
          descricao: string
          detectado_em: string
          empresa_id: string | null
          escopo: Database["public"]["Enums"]["inteligencia_alerta_escopo"]
          id: string
          motivo_resolucao: string | null
          projeto_id: string | null
          ref_key: string
          resolvido_em: string | null
          resolvido_por: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["inteligencia_alerta_status"]
          supervisor_usuario_id: string | null
          tipo: Database["public"]["Enums"]["inteligencia_alerta_tipo"]
          titulo: string
          updated_at: string
        }
        Insert: {
          assumido_em?: string | null
          colaborador_id?: string | null
          created_at?: string
          criticidade?: Database["public"]["Enums"]["inteligencia_alerta_criticidade"]
          dados?: Json
          descricao: string
          detectado_em?: string
          empresa_id?: string | null
          escopo: Database["public"]["Enums"]["inteligencia_alerta_escopo"]
          id?: string
          motivo_resolucao?: string | null
          projeto_id?: string | null
          ref_key: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["inteligencia_alerta_status"]
          supervisor_usuario_id?: string | null
          tipo: Database["public"]["Enums"]["inteligencia_alerta_tipo"]
          titulo: string
          updated_at?: string
        }
        Update: {
          assumido_em?: string | null
          colaborador_id?: string | null
          created_at?: string
          criticidade?: Database["public"]["Enums"]["inteligencia_alerta_criticidade"]
          dados?: Json
          descricao?: string
          detectado_em?: string
          empresa_id?: string | null
          escopo?: Database["public"]["Enums"]["inteligencia_alerta_escopo"]
          id?: string
          motivo_resolucao?: string | null
          projeto_id?: string | null
          ref_key?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["inteligencia_alerta_status"]
          supervisor_usuario_id?: string | null
          tipo?: Database["public"]["Enums"]["inteligencia_alerta_tipo"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inteligencia_alertas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inteligencia_alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inteligencia_alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_tst_saude"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "inteligencia_alertas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          created_at: string
          evento: Database["public"]["Enums"]["login_event_tipo"]
          id: string
          metadata: Json
          origem: string | null
          provider: string | null
          resultado: Database["public"]["Enums"]["login_event_resultado"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          evento: Database["public"]["Enums"]["login_event_tipo"]
          id?: string
          metadata?: Json
          origem?: string | null
          provider?: string | null
          resultado?: Database["public"]["Enums"]["login_event_resultado"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          evento?: Database["public"]["Enums"]["login_event_tipo"]
          id?: string
          metadata?: Json
          origem?: string | null
          provider?: string | null
          resultado?: Database["public"]["Enums"]["login_event_resultado"]
          user_id?: string | null
        }
        Relationships: []
      }
      notificacao_eventos: {
        Row: {
          created_at: string
          created_by: string | null
          evento: Database["public"]["Enums"]["notif_evento"]
          id: string
          metadata: Json
          notificacao_id: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          evento: Database["public"]["Enums"]["notif_evento"]
          id?: string
          metadata?: Json
          notificacao_id: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          evento?: Database["public"]["Enums"]["notif_evento"]
          id?: string
          metadata?: Json
          notificacao_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacao_eventos_notificacao_id_fkey"
            columns: ["notificacao_id"]
            isOneToOne: false
            referencedRelation: "notificacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacao_metricas_agregadas: {
        Row: {
          bucket_date: string
          created_at: string
          id: string
          materializadas: number
          severidade: Database["public"]["Enums"]["notif_severidade"]
          suprimidas: number
          tipo: Database["public"]["Enums"]["notif_tipo"]
          updated_at: string
        }
        Insert: {
          bucket_date?: string
          created_at?: string
          id?: string
          materializadas?: number
          severidade: Database["public"]["Enums"]["notif_severidade"]
          suprimidas?: number
          tipo: Database["public"]["Enums"]["notif_tipo"]
          updated_at?: string
        }
        Update: {
          bucket_date?: string
          created_at?: string
          id?: string
          materializadas?: number
          severidade?: Database["public"]["Enums"]["notif_severidade"]
          suprimidas?: number
          tipo?: Database["public"]["Enums"]["notif_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      notificacao_tipos_config: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          descricao: string
          nome_exibicao: string
          obrigatoria: boolean
          ordem: number
          papeis_aplicaveis: Database["public"]["Enums"]["app_role"][]
          severidade_padrao: Database["public"]["Enums"]["notif_severidade"]
          silenciavel: boolean
          tipo: Database["public"]["Enums"]["notif_tipo"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string
          descricao: string
          nome_exibicao: string
          obrigatoria?: boolean
          ordem?: number
          papeis_aplicaveis?: Database["public"]["Enums"]["app_role"][]
          severidade_padrao?: Database["public"]["Enums"]["notif_severidade"]
          silenciavel?: boolean
          tipo: Database["public"]["Enums"]["notif_tipo"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          descricao?: string
          nome_exibicao?: string
          obrigatoria?: boolean
          ordem?: number
          papeis_aplicaveis?: Database["public"]["Enums"]["app_role"][]
          severidade_padrao?: Database["public"]["Enums"]["notif_severidade"]
          silenciavel?: boolean
          tipo?: Database["public"]["Enums"]["notif_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      notificacao_usuarios: {
        Row: {
          arquivada_em: string | null
          created_at: string
          id: string
          lida_em: string | null
          notificacao_id: string
          status: Database["public"]["Enums"]["notif_status_usuario"]
          usuario_id: string
        }
        Insert: {
          arquivada_em?: string | null
          created_at?: string
          id?: string
          lida_em?: string | null
          notificacao_id: string
          status?: Database["public"]["Enums"]["notif_status_usuario"]
          usuario_id: string
        }
        Update: {
          arquivada_em?: string | null
          created_at?: string
          id?: string
          lida_em?: string | null
          notificacao_id?: string
          status?: Database["public"]["Enums"]["notif_status_usuario"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacao_usuarios_notificacao_id_fkey"
            columns: ["notificacao_id"]
            isOneToOne: false
            referencedRelation: "notificacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          ambiente: string
          created_at: string
          created_by: string | null
          destinatario_papel: Database["public"]["Enums"]["app_role"] | null
          destinatario_usuario_id: string | null
          expira_em: string | null
          id: string
          idempotency_key: string | null
          mensagem: string
          metadata: Json
          modulo: string | null
          origem: Database["public"]["Enums"]["notif_origem"]
          origem_id: string | null
          rota_destino: string | null
          severidade: Database["public"]["Enums"]["notif_severidade"]
          tipo: Database["public"]["Enums"]["notif_tipo"]
          titulo: string
        }
        Insert: {
          ambiente?: string
          created_at?: string
          created_by?: string | null
          destinatario_papel?: Database["public"]["Enums"]["app_role"] | null
          destinatario_usuario_id?: string | null
          expira_em?: string | null
          id?: string
          idempotency_key?: string | null
          mensagem: string
          metadata?: Json
          modulo?: string | null
          origem?: Database["public"]["Enums"]["notif_origem"]
          origem_id?: string | null
          rota_destino?: string | null
          severidade?: Database["public"]["Enums"]["notif_severidade"]
          tipo: Database["public"]["Enums"]["notif_tipo"]
          titulo: string
        }
        Update: {
          ambiente?: string
          created_at?: string
          created_by?: string | null
          destinatario_papel?: Database["public"]["Enums"]["app_role"] | null
          destinatario_usuario_id?: string | null
          expira_em?: string | null
          id?: string
          idempotency_key?: string | null
          mensagem?: string
          metadata?: Json
          modulo?: string | null
          origem?: Database["public"]["Enums"]["notif_origem"]
          origem_id?: string | null
          rota_destino?: string | null
          severidade?: Database["public"]["Enums"]["notif_severidade"]
          tipo?: Database["public"]["Enums"]["notif_tipo"]
          titulo?: string
        }
        Relationships: []
      }
      opcoes_periodo_ausencia: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          ordem: number
          quantidade_dias: number | null
          tipo_periodo: Database["public"]["Enums"]["tipo_periodo_ausencia"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          ordem?: number
          quantidade_dias?: number | null
          tipo_periodo?: Database["public"]["Enums"]["tipo_periodo_ausencia"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          ordem?: number
          quantidade_dias?: number | null
          tipo_periodo?: Database["public"]["Enums"]["tipo_periodo_ausencia"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      operacao_alertas: {
        Row: {
          created_at: string
          criado_por: string | null
          id: string
          mensagem: string | null
          origem: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          severidade: string
          status: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          id?: string
          mensagem?: string | null
          origem?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          severidade?: string
          status?: string
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          id?: string
          mensagem?: string | null
          origem?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          severidade?: string
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      operacao_assistida: {
        Row: {
          aberto_em: string
          aberto_por: string | null
          created_at: string
          descricao: string | null
          id: string
          ocorrencia: string
          prioridade: Database["public"]["Enums"]["op_assist_prioridade"]
          resolucao: string | null
          resolvido_em: string | null
          responsavel: string | null
          situacao: Database["public"]["Enums"]["op_assist_status"]
          updated_at: string
        }
        Insert: {
          aberto_em?: string
          aberto_por?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          ocorrencia: string
          prioridade?: Database["public"]["Enums"]["op_assist_prioridade"]
          resolucao?: string | null
          resolvido_em?: string | null
          responsavel?: string | null
          situacao?: Database["public"]["Enums"]["op_assist_status"]
          updated_at?: string
        }
        Update: {
          aberto_em?: string
          aberto_por?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          ocorrencia?: string
          prioridade?: Database["public"]["Enums"]["op_assist_prioridade"]
          resolucao?: string | null
          resolvido_em?: string | null
          responsavel?: string | null
          situacao?: Database["public"]["Enums"]["op_assist_status"]
          updated_at?: string
        }
        Relationships: []
      }
      operacao_assistida_periodos: {
        Row: {
          ambiente: Database["public"]["Enums"]["oa_ambiente"]
          created_at: string
          created_by: string | null
          criterios_encerramento: string | null
          data_fim_prevista: string
          data_fim_real: string | null
          data_inicio: string
          descricao: string | null
          id: string
          nome: string
          responsavel_principal: string | null
          status: Database["public"]["Enums"]["oa_periodo_status"]
          updated_at: string
        }
        Insert: {
          ambiente?: Database["public"]["Enums"]["oa_ambiente"]
          created_at?: string
          created_by?: string | null
          criterios_encerramento?: string | null
          data_fim_prevista: string
          data_fim_real?: string | null
          data_inicio: string
          descricao?: string | null
          id?: string
          nome: string
          responsavel_principal?: string | null
          status?: Database["public"]["Enums"]["oa_periodo_status"]
          updated_at?: string
        }
        Update: {
          ambiente?: Database["public"]["Enums"]["oa_ambiente"]
          created_at?: string
          created_by?: string | null
          criterios_encerramento?: string | null
          data_fim_prevista?: string
          data_fim_real?: string | null
          data_inicio?: string
          descricao?: string | null
          id?: string
          nome?: string
          responsavel_principal?: string | null
          status?: Database["public"]["Enums"]["oa_periodo_status"]
          updated_at?: string
        }
        Relationships: []
      }
      operacao_incidente_comentarios: {
        Row: {
          conteudo: string
          created_at: string
          created_by: string | null
          created_by_nome: string | null
          id: string
          incidente_id: string
          interno: boolean
          tipo: Database["public"]["Enums"]["oa_comentario_tipo"]
        }
        Insert: {
          conteudo: string
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          id?: string
          incidente_id: string
          interno?: boolean
          tipo?: Database["public"]["Enums"]["oa_comentario_tipo"]
        }
        Update: {
          conteudo?: string
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          id?: string
          incidente_id?: string
          interno?: boolean
          tipo?: Database["public"]["Enums"]["oa_comentario_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "operacao_incidente_comentarios_incidente_id_fkey"
            columns: ["incidente_id"]
            isOneToOne: false
            referencedRelation: "operacao_incidentes"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_incidente_eventos: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_nome: string | null
          evento: Database["public"]["Enums"]["oa_evento_tipo"]
          id: string
          incidente_id: string
          mensagem: string | null
          metadata: Json | null
          status_anterior:
            | Database["public"]["Enums"]["oa_incidente_status"]
            | null
          status_novo: Database["public"]["Enums"]["oa_incidente_status"] | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          evento: Database["public"]["Enums"]["oa_evento_tipo"]
          id?: string
          incidente_id: string
          mensagem?: string | null
          metadata?: Json | null
          status_anterior?:
            | Database["public"]["Enums"]["oa_incidente_status"]
            | null
          status_novo?:
            | Database["public"]["Enums"]["oa_incidente_status"]
            | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          evento?: Database["public"]["Enums"]["oa_evento_tipo"]
          id?: string
          incidente_id?: string
          mensagem?: string | null
          metadata?: Json | null
          status_anterior?:
            | Database["public"]["Enums"]["oa_incidente_status"]
            | null
          status_novo?:
            | Database["public"]["Enums"]["oa_incidente_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "operacao_incidente_eventos_incidente_id_fkey"
            columns: ["incidente_id"]
            isOneToOne: false
            referencedRelation: "operacao_incidentes"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_incidente_evidencias: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_nome: string | null
          descricao: string | null
          id: string
          incidente_id: string
          nome: string
          tipo: string | null
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          descricao?: string | null
          id?: string
          incidente_id: string
          nome: string
          tipo?: string | null
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          descricao?: string | null
          id?: string
          incidente_id?: string
          nome?: string
          tipo?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacao_incidente_evidencias_incidente_id_fkey"
            columns: ["incidente_id"]
            isOneToOne: false
            referencedRelation: "operacao_incidentes"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_incidentes: {
        Row: {
          alerta_id: string | null
          ambiente: Database["public"]["Enums"]["oa_ambiente"]
          backup_event_id: string | null
          categoria: Database["public"]["Enums"]["oa_incidente_categoria"]
          causa_raiz: string | null
          codigo: string | null
          created_at: string
          descricao: string | null
          encerrado_em: string | null
          id: string
          impacto: Database["public"]["Enums"]["oa_impacto"]
          modulo_afetado: string | null
          origem: string | null
          periodo_id: string | null
          plano_contencao: string | null
          plano_prevencao: string | null
          possui_dados_sensiveis: boolean
          prazo_resolucao: string | null
          primeira_resposta_em: string | null
          prioridade: Database["public"]["Enums"]["oa_prioridade"]
          reportado_em: string
          reportado_por: string | null
          reportado_por_nome: string | null
          resolvido_em: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          rota_afetada: string | null
          severidade: Database["public"]["Enums"]["oa_severidade"]
          solucao_aplicada: string | null
          status: Database["public"]["Enums"]["oa_incidente_status"]
          tipo: Database["public"]["Enums"]["oa_incidente_tipo"]
          titulo: string
          updated_at: string
          versao_corrigida: string | null
          versao_detectada: string | null
        }
        Insert: {
          alerta_id?: string | null
          ambiente?: Database["public"]["Enums"]["oa_ambiente"]
          backup_event_id?: string | null
          categoria?: Database["public"]["Enums"]["oa_incidente_categoria"]
          causa_raiz?: string | null
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          encerrado_em?: string | null
          id?: string
          impacto?: Database["public"]["Enums"]["oa_impacto"]
          modulo_afetado?: string | null
          origem?: string | null
          periodo_id?: string | null
          plano_contencao?: string | null
          plano_prevencao?: string | null
          possui_dados_sensiveis?: boolean
          prazo_resolucao?: string | null
          primeira_resposta_em?: string | null
          prioridade?: Database["public"]["Enums"]["oa_prioridade"]
          reportado_em?: string
          reportado_por?: string | null
          reportado_por_nome?: string | null
          resolvido_em?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          rota_afetada?: string | null
          severidade?: Database["public"]["Enums"]["oa_severidade"]
          solucao_aplicada?: string | null
          status?: Database["public"]["Enums"]["oa_incidente_status"]
          tipo?: Database["public"]["Enums"]["oa_incidente_tipo"]
          titulo: string
          updated_at?: string
          versao_corrigida?: string | null
          versao_detectada?: string | null
        }
        Update: {
          alerta_id?: string | null
          ambiente?: Database["public"]["Enums"]["oa_ambiente"]
          backup_event_id?: string | null
          categoria?: Database["public"]["Enums"]["oa_incidente_categoria"]
          causa_raiz?: string | null
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          encerrado_em?: string | null
          id?: string
          impacto?: Database["public"]["Enums"]["oa_impacto"]
          modulo_afetado?: string | null
          origem?: string | null
          periodo_id?: string | null
          plano_contencao?: string | null
          plano_prevencao?: string | null
          possui_dados_sensiveis?: boolean
          prazo_resolucao?: string | null
          primeira_resposta_em?: string | null
          prioridade?: Database["public"]["Enums"]["oa_prioridade"]
          reportado_em?: string
          reportado_por?: string | null
          reportado_por_nome?: string | null
          resolvido_em?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          rota_afetada?: string | null
          severidade?: Database["public"]["Enums"]["oa_severidade"]
          solucao_aplicada?: string | null
          status?: Database["public"]["Enums"]["oa_incidente_status"]
          tipo?: Database["public"]["Enums"]["oa_incidente_tipo"]
          titulo?: string
          updated_at?: string
          versao_corrigida?: string | null
          versao_detectada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operacao_incidentes_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "operacao_assistida_periodos"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_metricas: {
        Row: {
          categoria: string
          created_at: string
          detalhes: Json | null
          id: string
          sucesso: boolean
          tempo_ms: number
        }
        Insert: {
          categoria: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          sucesso?: boolean
          tempo_ms: number
        }
        Update: {
          categoria?: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          sucesso?: boolean
          tempo_ms?: number
        }
        Relationships: []
      }
      permissions: {
        Row: {
          action: string
          code: string
          created_at: string
          description: string | null
          module: string
        }
        Insert: {
          action: string
          code: string
          created_at?: string
          description?: string | null
          module: string
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          description?: string | null
          module?: string
        }
        Relationships: []
      }
      preferencias_notificacao: {
        Row: {
          canal: string
          created_at: string
          habilitada: boolean
          id: string
          silenciar_info: boolean
          tipo: Database["public"]["Enums"]["notif_tipo"]
          updated_at: string
          usuario_id: string
        }
        Insert: {
          canal?: string
          created_at?: string
          habilitada?: boolean
          id?: string
          silenciar_info?: boolean
          tipo: Database["public"]["Enums"]["notif_tipo"]
          updated_at?: string
          usuario_id: string
        }
        Update: {
          canal?: string
          created_at?: string
          habilitada?: boolean
          id?: string
          silenciar_info?: boolean
          tipo?: Database["public"]["Enums"]["notif_tipo"]
          updated_at?: string
          usuario_id?: string
        }
        Relationships: []
      }
      primeiro_acesso_logs: {
        Row: {
          codigo_erro: string | null
          created_at: string
          email_masked: string
          id: string
          ip: string | null
          mensagem_erro: string | null
          request_id: string | null
          resultado: string
          user_agent: string | null
        }
        Insert: {
          codigo_erro?: string | null
          created_at?: string
          email_masked: string
          id?: string
          ip?: string | null
          mensagem_erro?: string | null
          request_id?: string | null
          resultado: string
          user_agent?: string | null
        }
        Update: {
          codigo_erro?: string | null
          created_at?: string
          email_masked?: string
          id?: string
          ip?: string | null
          mensagem_erro?: string | null
          request_id?: string | null
          resultado?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          cargo: string | null
          created_at: string
          email: string
          id: string
          nome: string
          primeiro_acesso_pendente: boolean
          senha_temporaria_redefinida_em: string | null
          telefone_whatsapp: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email: string
          id: string
          nome: string
          primeiro_acesso_pendente?: boolean
          senha_temporaria_redefinida_em?: string | null
          telefone_whatsapp?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string
          primeiro_acesso_pendente?: boolean
          senha_temporaria_redefinida_em?: string | null
          telefone_whatsapp?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projeto_protocolo_sequencias: {
        Row: {
          ano: number
          projeto_id: string
          ultimo_numero: number
          updated_at: string
        }
        Insert: {
          ano: number
          projeto_id: string
          ultimo_numero?: number
          updated_at?: string
        }
        Update: {
          ano?: number
          projeto_id?: string
          ultimo_numero?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projeto_protocolo_sequencias_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      projetos: {
        Row: {
          ativo: boolean
          codigo_interno: string
          codigo_projeto: string | null
          codigo_protocolo: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          empresa_id: string
          id: string
          nome: string
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_interno: string
          codigo_projeto?: string | null
          codigo_protocolo?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          empresa_id: string
          id?: string
          nome: string
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_interno?: string
          codigo_projeto?: string | null
          codigo_protocolo?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          empresa_id?: string
          id?: string
          nome?: string
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projetos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_tst_saude"
            referencedColumns: ["empresa_id"]
          },
        ]
      }
      regras_escalonamento: {
        Row: {
          ambiente: string
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          intervalo_repeticao_minutos: number | null
          maximo_repeticoes: number | null
          minutos_para_escalonamento: number | null
          minutos_para_primeiro_alerta: number
          nome: string
          origem: Database["public"]["Enums"]["notif_origem"]
          papel_destino_escalado: Database["public"]["Enums"]["app_role"] | null
          papel_destino_inicial: Database["public"]["Enums"]["app_role"] | null
          prioridade: number
          repetir_alerta: boolean
          severidade_minima: Database["public"]["Enums"]["notif_severidade"]
          tipo_evento: Database["public"]["Enums"]["notif_tipo"]
          updated_at: string
        }
        Insert: {
          ambiente?: string
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          intervalo_repeticao_minutos?: number | null
          maximo_repeticoes?: number | null
          minutos_para_escalonamento?: number | null
          minutos_para_primeiro_alerta?: number
          nome: string
          origem?: Database["public"]["Enums"]["notif_origem"]
          papel_destino_escalado?:
            | Database["public"]["Enums"]["app_role"]
            | null
          papel_destino_inicial?: Database["public"]["Enums"]["app_role"] | null
          prioridade?: number
          repetir_alerta?: boolean
          severidade_minima?: Database["public"]["Enums"]["notif_severidade"]
          tipo_evento: Database["public"]["Enums"]["notif_tipo"]
          updated_at?: string
        }
        Update: {
          ambiente?: string
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          intervalo_repeticao_minutos?: number | null
          maximo_repeticoes?: number | null
          minutos_para_escalonamento?: number | null
          minutos_para_primeiro_alerta?: number
          nome?: string
          origem?: Database["public"]["Enums"]["notif_origem"]
          papel_destino_escalado?:
            | Database["public"]["Enums"]["app_role"]
            | null
          papel_destino_inicial?: Database["public"]["Enums"]["app_role"] | null
          prioridade?: number
          repetir_alerta?: boolean
          severidade_minima?: Database["public"]["Enums"]["notif_severidade"]
          tipo_evento?: Database["public"]["Enums"]["notif_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      release_changelog: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          impacto: string | null
          modulo: string | null
          release_id: string
          roadmap_id: string | null
          tipo: Database["public"]["Enums"]["changelog_tipo"]
          titulo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          impacto?: string | null
          modulo?: string | null
          release_id: string
          roadmap_id?: string | null
          tipo: Database["public"]["Enums"]["changelog_tipo"]
          titulo: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          impacto?: string | null
          modulo?: string | null
          release_id?: string
          roadmap_id?: string | null
          tipo?: Database["public"]["Enums"]["changelog_tipo"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_changelog_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_changelog_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmap"
            referencedColumns: ["id"]
          },
        ]
      }
      releases: {
        Row: {
          ambiente: string
          build: string | null
          commit: string | null
          created_at: string
          created_by: string | null
          data_prevista: string | null
          data_publicacao: string | null
          descricao: string | null
          id: string
          nome: string | null
          observacoes: string | null
          responsavel: string | null
          responsavel_nome: string | null
          status: Database["public"]["Enums"]["release_status"]
          tipo: Database["public"]["Enums"]["release_tipo"]
          updated_at: string
          versao: string
        }
        Insert: {
          ambiente?: string
          build?: string | null
          commit?: string | null
          created_at?: string
          created_by?: string | null
          data_prevista?: string | null
          data_publicacao?: string | null
          descricao?: string | null
          id?: string
          nome?: string | null
          observacoes?: string | null
          responsavel?: string | null
          responsavel_nome?: string | null
          status?: Database["public"]["Enums"]["release_status"]
          tipo?: Database["public"]["Enums"]["release_tipo"]
          updated_at?: string
          versao: string
        }
        Update: {
          ambiente?: string
          build?: string | null
          commit?: string | null
          created_at?: string
          created_by?: string | null
          data_prevista?: string | null
          data_publicacao?: string | null
          descricao?: string | null
          id?: string
          nome?: string | null
          observacoes?: string | null
          responsavel?: string | null
          responsavel_nome?: string | null
          status?: Database["public"]["Enums"]["release_status"]
          tipo?: Database["public"]["Enums"]["release_tipo"]
          updated_at?: string
          versao?: string
        }
        Relationships: []
      }
      roadmap: {
        Row: {
          arquivos: Json
          categoria: Database["public"]["Enums"]["roadmap_categoria"]
          checklist: Json
          created_at: string
          created_by: string | null
          criterios_aceite: string | null
          descricao: string | null
          descricao_funcional: string | null
          descricao_tecnica: string | null
          fim_previsto: string | null
          fim_real: string | null
          id: string
          incidente_id: string | null
          inicio_previsto: string | null
          inicio_real: string | null
          links: Json
          objetivo: string | null
          ordem: number
          prioridade: Database["public"]["Enums"]["roadmap_prioridade"]
          release_id: string | null
          responsavel: string | null
          responsavel_nome: string | null
          status: Database["public"]["Enums"]["roadmap_status"]
          tipo: Database["public"]["Enums"]["roadmap_tipo"]
          titulo: string
          updated_at: string
          versao: string | null
        }
        Insert: {
          arquivos?: Json
          categoria?: Database["public"]["Enums"]["roadmap_categoria"]
          checklist?: Json
          created_at?: string
          created_by?: string | null
          criterios_aceite?: string | null
          descricao?: string | null
          descricao_funcional?: string | null
          descricao_tecnica?: string | null
          fim_previsto?: string | null
          fim_real?: string | null
          id?: string
          incidente_id?: string | null
          inicio_previsto?: string | null
          inicio_real?: string | null
          links?: Json
          objetivo?: string | null
          ordem?: number
          prioridade?: Database["public"]["Enums"]["roadmap_prioridade"]
          release_id?: string | null
          responsavel?: string | null
          responsavel_nome?: string | null
          status?: Database["public"]["Enums"]["roadmap_status"]
          tipo?: Database["public"]["Enums"]["roadmap_tipo"]
          titulo: string
          updated_at?: string
          versao?: string | null
        }
        Update: {
          arquivos?: Json
          categoria?: Database["public"]["Enums"]["roadmap_categoria"]
          checklist?: Json
          created_at?: string
          created_by?: string | null
          criterios_aceite?: string | null
          descricao?: string | null
          descricao_funcional?: string | null
          descricao_tecnica?: string | null
          fim_previsto?: string | null
          fim_real?: string | null
          id?: string
          incidente_id?: string | null
          inicio_previsto?: string | null
          inicio_real?: string | null
          links?: Json
          objetivo?: string | null
          ordem?: number
          prioridade?: Database["public"]["Enums"]["roadmap_prioridade"]
          release_id?: string | null
          responsavel?: string | null
          responsavel_nome?: string | null
          status?: Database["public"]["Enums"]["roadmap_status"]
          tipo?: Database["public"]["Enums"]["roadmap_tipo"]
          titulo?: string
          updated_at?: string
          versao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_incidente_id_fkey"
            columns: ["incidente_id"]
            isOneToOne: false
            referencedRelation: "operacao_incidentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadmap_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_code: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          permission_code: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          permission_code?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      tipo_ausencia_opcoes_periodo: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          opcao_periodo_id: string
          tipo_ausencia_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          opcao_periodo_id: string
          tipo_ausencia_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          opcao_periodo_id?: string
          tipo_ausencia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipo_ausencia_opcoes_periodo_opcao_periodo_id_fkey"
            columns: ["opcao_periodo_id"]
            isOneToOne: false
            referencedRelation: "opcoes_periodo_ausencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipo_ausencia_opcoes_periodo_tipo_ausencia_id_fkey"
            columns: ["tipo_ausencia_id"]
            isOneToOne: false
            referencedRelation: "tipos_ausencia"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_ausencia: {
        Row: {
          ativo: boolean
          categoria_ausencia_id: string | null
          codigo: string
          cor: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          exige_documento: boolean
          icone: string | null
          id: string
          nome: string
          ordem: number
          permite_acidente: boolean
          permite_cid: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          categoria_ausencia_id?: string | null
          codigo: string
          cor?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          exige_documento?: boolean
          icone?: string | null
          id?: string
          nome: string
          ordem?: number
          permite_acidente?: boolean
          permite_cid?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          categoria_ausencia_id?: string | null
          codigo?: string
          cor?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          exige_documento?: boolean
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number
          permite_acidente?: boolean
          permite_cid?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tipos_ausencia_categoria_ausencia_id_fkey"
            columns: ["categoria_ausencia_id"]
            isOneToOne: false
            referencedRelation: "categorias_ausencia"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          effect: Database["public"]["Enums"]["permission_effect"]
          permission_code: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effect: Database["public"]["Enums"]["permission_effect"]
          permission_code: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effect?: Database["public"]["Enums"]["permission_effect"]
          permission_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          browser: string | null
          cidade: string | null
          created_at: string
          device: string | null
          encerrada_em: string | null
          expires_at: string | null
          id: string
          ip_hash: string | null
          last_activity: string
          motivo_encerramento: string | null
          os: string | null
          pais: string | null
          provider: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["session_status"]
          updated_at: string
          user_agent_hash: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          cidade?: string | null
          created_at?: string
          device?: string | null
          encerrada_em?: string | null
          expires_at?: string | null
          id?: string
          ip_hash?: string | null
          last_activity?: string
          motivo_encerramento?: string | null
          os?: string | null
          pais?: string | null
          provider?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          user_agent_hash?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          cidade?: string | null
          created_at?: string
          device?: string | null
          encerrada_em?: string | null
          expires_at?: string | null
          id?: string
          ip_hash?: string | null
          last_activity?: string
          motivo_encerramento?: string | null
          os?: string | null
          pais?: string | null
          provider?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          user_agent_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      usuario_empresas: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_empresas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_empresas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_tst_saude"
            referencedColumns: ["empresa_id"]
          },
        ]
      }
      usuario_projetos: {
        Row: {
          created_at: string
          id: string
          projeto_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          projeto_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          projeto_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_cron_config: {
        Row: {
          enabled: boolean
          endpoint_url: string
          id: boolean
          updated_at: string
          worker_secret: string
        }
        Insert: {
          enabled?: boolean
          endpoint_url: string
          id?: boolean
          updated_at?: string
          worker_secret: string
        }
        Update: {
          enabled?: boolean
          endpoint_url?: string
          id?: boolean
          updated_at?: string
          worker_secret?: string
        }
        Relationships: []
      }
      whatsapp_destinatario_config: {
        Row: {
          base_envio: Database["public"]["Enums"]["whatsapp_base_envio"]
          bloqueado_em: string | null
          canal_habilitado: boolean
          colaborador_id: string | null
          consentimento_origem: string | null
          consentimento_registrado_em: string | null
          created_at: string
          id: string
          motivo_bloqueio: string | null
          telefone_hash: string
          tipo_destinatario: Database["public"]["Enums"]["whatsapp_publico"]
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          base_envio?: Database["public"]["Enums"]["whatsapp_base_envio"]
          bloqueado_em?: string | null
          canal_habilitado?: boolean
          colaborador_id?: string | null
          consentimento_origem?: string | null
          consentimento_registrado_em?: string | null
          created_at?: string
          id?: string
          motivo_bloqueio?: string | null
          telefone_hash: string
          tipo_destinatario: Database["public"]["Enums"]["whatsapp_publico"]
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          base_envio?: Database["public"]["Enums"]["whatsapp_base_envio"]
          bloqueado_em?: string | null
          canal_habilitado?: boolean
          colaborador_id?: string | null
          consentimento_origem?: string | null
          consentimento_registrado_em?: string | null
          created_at?: string
          id?: string
          motivo_bloqueio?: string | null
          telefone_hash?: string
          tipo_destinatario?: Database["public"]["Enums"]["whatsapp_publico"]
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_destinatario_config_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outbox: {
        Row: {
          ausencia_id: string | null
          confirmado_em: string | null
          created_at: string
          destinatario_colaborador_id: string | null
          destinatario_usuario_id: string | null
          enviado_em: string | null
          evento_id: string
          evento_tipo: string
          falhou_em: string | null
          id: string
          idempotency_key: string
          locked_at: string | null
          locked_by: string | null
          max_tentativas: number
          payload: Json
          prioridade: Database["public"]["Enums"]["whatsapp_prioridade"]
          processado_em: string | null
          provider: Database["public"]["Enums"]["whatsapp_provider"]
          provider_instance: string | null
          provider_message_id: string | null
          proxima_tentativa_em: string
          publico: Database["public"]["Enums"]["whatsapp_publico"]
          status: Database["public"]["Enums"]["whatsapp_status"]
          telefone_criptografado: string | null
          telefone_hash: string
          telefone_mascarado: string
          template_codigo: string
          template_id: string
          template_versao: number
          tentativas: number
          ultimo_erro_codigo: string | null
          ultimo_erro_resumido: string | null
        }
        Insert: {
          ausencia_id?: string | null
          confirmado_em?: string | null
          created_at?: string
          destinatario_colaborador_id?: string | null
          destinatario_usuario_id?: string | null
          enviado_em?: string | null
          evento_id: string
          evento_tipo: string
          falhou_em?: string | null
          id?: string
          idempotency_key: string
          locked_at?: string | null
          locked_by?: string | null
          max_tentativas?: number
          payload?: Json
          prioridade?: Database["public"]["Enums"]["whatsapp_prioridade"]
          processado_em?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_provider"]
          provider_instance?: string | null
          provider_message_id?: string | null
          proxima_tentativa_em?: string
          publico: Database["public"]["Enums"]["whatsapp_publico"]
          status?: Database["public"]["Enums"]["whatsapp_status"]
          telefone_criptografado?: string | null
          telefone_hash: string
          telefone_mascarado: string
          template_codigo: string
          template_id: string
          template_versao: number
          tentativas?: number
          ultimo_erro_codigo?: string | null
          ultimo_erro_resumido?: string | null
        }
        Update: {
          ausencia_id?: string | null
          confirmado_em?: string | null
          created_at?: string
          destinatario_colaborador_id?: string | null
          destinatario_usuario_id?: string | null
          enviado_em?: string | null
          evento_id?: string
          evento_tipo?: string
          falhou_em?: string | null
          id?: string
          idempotency_key?: string
          locked_at?: string | null
          locked_by?: string | null
          max_tentativas?: number
          payload?: Json
          prioridade?: Database["public"]["Enums"]["whatsapp_prioridade"]
          processado_em?: string | null
          provider?: Database["public"]["Enums"]["whatsapp_provider"]
          provider_instance?: string | null
          provider_message_id?: string | null
          proxima_tentativa_em?: string
          publico?: Database["public"]["Enums"]["whatsapp_publico"]
          status?: Database["public"]["Enums"]["whatsapp_status"]
          telefone_criptografado?: string | null
          telefone_hash?: string
          telefone_mascarado?: string
          template_codigo?: string
          template_id?: string
          template_versao?: number
          tentativas?: number
          ultimo_erro_codigo?: string | null
          ultimo_erro_resumido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outbox_ausencia_id_fkey"
            columns: ["ausencia_id"]
            isOneToOne: false
            referencedRelation: "ausencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_destinatario_colaborador_id_fkey"
            columns: ["destinatario_colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outbox_eventos: {
        Row: {
          codigo: string | null
          created_at: string
          evento: string
          id: string
          mensagem_resumida: string | null
          metadata_segura: Json
          outbox_id: string
          provider_message_id: string | null
          status_anterior: Database["public"]["Enums"]["whatsapp_status"] | null
          status_novo: Database["public"]["Enums"]["whatsapp_status"] | null
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          evento: string
          id?: string
          mensagem_resumida?: string | null
          metadata_segura?: Json
          outbox_id: string
          provider_message_id?: string | null
          status_anterior?:
            | Database["public"]["Enums"]["whatsapp_status"]
            | null
          status_novo?: Database["public"]["Enums"]["whatsapp_status"] | null
        }
        Update: {
          codigo?: string | null
          created_at?: string
          evento?: string
          id?: string
          mensagem_resumida?: string | null
          metadata_segura?: Json
          outbox_id?: string
          provider_message_id?: string | null
          status_anterior?:
            | Database["public"]["Enums"]["whatsapp_status"]
            | null
          status_novo?: Database["public"]["Enums"]["whatsapp_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outbox_eventos_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_provider_config: {
        Row: {
          base_url_public_label: string | null
          batch_size: number
          created_at: string
          enabled: boolean
          homologacao_allowlist: string[]
          id: string
          instance_name: string | null
          max_tentativas: number
          modo: Database["public"]["Enums"]["whatsapp_modo"]
          provider: Database["public"]["Enums"]["whatsapp_provider"]
          retry_base_segundos: number
          retry_max_segundos: number
          singleton: boolean
          timeout_ms: number
          updated_at: string
          webhook_enabled: boolean
        }
        Insert: {
          base_url_public_label?: string | null
          batch_size?: number
          created_at?: string
          enabled?: boolean
          homologacao_allowlist?: string[]
          id?: string
          instance_name?: string | null
          max_tentativas?: number
          modo?: Database["public"]["Enums"]["whatsapp_modo"]
          provider?: Database["public"]["Enums"]["whatsapp_provider"]
          retry_base_segundos?: number
          retry_max_segundos?: number
          singleton?: boolean
          timeout_ms?: number
          updated_at?: string
          webhook_enabled?: boolean
        }
        Update: {
          base_url_public_label?: string | null
          batch_size?: number
          created_at?: string
          enabled?: boolean
          homologacao_allowlist?: string[]
          id?: string
          instance_name?: string | null
          max_tentativas?: number
          modo?: Database["public"]["Enums"]["whatsapp_modo"]
          provider?: Database["public"]["Enums"]["whatsapp_provider"]
          retry_base_segundos?: number
          retry_max_segundos?: number
          singleton?: boolean
          timeout_ms?: number
          updated_at?: string
          webhook_enabled?: boolean
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          ativo: boolean
          codigo: string
          conteudo: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          publico: Database["public"]["Enums"]["whatsapp_publico"]
          updated_at: string
          variaveis_permitidas: string[]
          versao: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          conteudo: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          publico: Database["public"]["Enums"]["whatsapp_publico"]
          updated_at?: string
          variaveis_permitidas?: string[]
          versao?: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          conteudo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          publico?: Database["public"]["Enums"]["whatsapp_publico"]
          updated_at?: string
          variaveis_permitidas?: string[]
          versao?: number
        }
        Relationships: []
      }
      whatsapp_test_recipients: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          nome: string
          telefone_e164: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          telefone_e164: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          telefone_e164?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_tst_destinatarios: {
        Row: {
          ativo: boolean
          cargo: string
          confirmado: boolean
          confirmado_em: string | null
          confirmado_ip: unknown
          confirmado_por: string | null
          created_at: string
          created_by: string | null
          destinatario_principal_acidente: boolean
          empresa_id: string | null
          id: string
          nome: string
          telefone_e164: string
          telefone_hash: string
          telefone_mascarado: string
          telefone_normalizado: string
          telefone_original: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          cargo?: string
          confirmado?: boolean
          confirmado_em?: string | null
          confirmado_ip?: unknown
          confirmado_por?: string | null
          created_at?: string
          created_by?: string | null
          destinatario_principal_acidente?: boolean
          empresa_id?: string | null
          id?: string
          nome?: string
          telefone_e164: string
          telefone_hash: string
          telefone_mascarado: string
          telefone_normalizado: string
          telefone_original: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          cargo?: string
          confirmado?: boolean
          confirmado_em?: string | null
          confirmado_ip?: unknown
          confirmado_por?: string | null
          created_at?: string
          created_by?: string | null
          destinatario_principal_acidente?: boolean
          empresa_id?: string | null
          id?: string
          nome?: string
          telefone_e164?: string
          telefone_hash?: string
          telefone_mascarado?: string
          telefone_normalizado?: string
          telefone_original?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_tst_destinatarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_tst_destinatarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_tst_saude"
            referencedColumns: ["empresa_id"]
          },
        ]
      }
      whatsapp_worker_execucoes: {
        Row: {
          created_at: string
          detalhes: Json
          duracao_ms: number | null
          enviadas: number
          execution_id: string
          falhas_definitivas: number
          falhas_temporarias: number
          fim: string | null
          id: string
          ignoradas: number
          inicio: string
          selecionadas: number
          status: string
          worker: string
        }
        Insert: {
          created_at?: string
          detalhes?: Json
          duracao_ms?: number | null
          enviadas?: number
          execution_id: string
          falhas_definitivas?: number
          falhas_temporarias?: number
          fim?: string | null
          id?: string
          ignoradas?: number
          inicio: string
          selecionadas?: number
          status: string
          worker: string
        }
        Update: {
          created_at?: string
          detalhes?: Json
          duracao_ms?: number | null
          enviadas?: number
          execution_id?: string
          falhas_definitivas?: number
          falhas_temporarias?: number
          fim?: string | null
          id?: string
          ignoradas?: number
          inicio?: string
          selecionadas?: number
          status?: string
          worker?: string
        }
        Relationships: []
      }
    }
    Views: {
      whatsapp_tst_monitor: {
        Row: {
          alertas_sem_tst_abertos: number | null
          empresas_ativas: number | null
          empresas_sem_confirmacao: number | null
          empresas_sem_tst: number | null
          falhas_24h: number | null
          tsts_sem_empresa: number | null
          ultimo_envio_em: string | null
        }
        Relationships: []
      }
      whatsapp_tst_saude: {
        Row: {
          alertas_sem_tst: number | null
          ativo: boolean | null
          confirmado: boolean | null
          confirmado_em: string | null
          empresa_id: string | null
          empresa_nome: string | null
          enviados_total: number | null
          falhas_total: number | null
          principal: boolean | null
          telefone_e164: string | null
          telefone_mascarado: string | null
          tst_id: string | null
          tst_nome: string | null
          ultimo_envio_em: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _obs_can_read: { Args: never; Returns: boolean }
      acessos_dashboard: { Args: never; Returns: Json }
      admin_get_user_history: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          acao: Database["public"]["Enums"]["audit_action"]
          antes: Json
          created_at: string
          depois: Json
          entidade: string
          id: string
          modulo: string
          observacoes: string
          usuario_nome: string
        }[]
      }
      admin_list_user_sessions: {
        Args: { _user_id: string }
        Returns: {
          browser: string
          cidade: string
          created_at: string
          device: string
          encerrada_em: string
          expires_at: string
          id: string
          last_activity: string
          motivo_encerramento: string
          os: string
          pais: string
          status: Database["public"]["Enums"]["session_status"]
        }[]
      }
      admin_list_users: {
        Args: {
          _ativo?: boolean
          _empresa_id?: string
          _limit?: number
          _offset?: number
          _projeto_id?: string
          _role?: Database["public"]["Enums"]["app_role"]
          _search?: string
        }
        Returns: {
          ativo: boolean
          avatar_url: string
          banned_until: string
          cargo: string
          created_at: string
          email: string
          email_confirmed_at: string
          empresa_ids: string[]
          empresa_nomes: string[]
          id: string
          invited_at: string
          last_sign_in_at: string
          nome: string
          projeto_ids: string[]
          projeto_nomes: string[]
          roles: Database["public"]["Enums"]["app_role"][]
          telefone_whatsapp: string
          total_count: number
        }[]
      }
      ai_assistente_consumir_rate_limit: {
        Args: { _user_id: string }
        Returns: Json
      }
      ai_assistente_saude: { Args: { _janela_horas?: number }; Returns: Json }
      alerta_visivel_para: {
        Args: {
          _alerta: Database["public"]["Tables"]["alertas"]["Row"]
          _user_id: string
        }
        Returns: boolean
      }
      analisar_conflitos_regras_escalonamento: { Args: never; Returns: Json }
      arquivar_notificacao: {
        Args: { _notificacao_id: string }
        Returns: undefined
      }
      atestado_path_visivel_para: {
        Args: { _name: string; _user_id: string }
        Returns: boolean
      }
      atualizar_preferencia_notificacao: {
        Args: {
          p_habilitada: boolean
          p_silenciar_info?: boolean
          p_tipo: Database["public"]["Enums"]["notif_tipo"]
        }
        Returns: Json
      }
      audit_kpis: { Args: { _inicio?: string }; Returns: Json }
      automacao_config_atualizar: {
        Args: {
          p_ativo: boolean
          p_falhas_alta: number
          p_falhas_critica: number
          p_intervalo: number
          p_tolerancia: number
          p_travada: number
        }
        Returns: Json
      }
      automacao_status: { Args: never; Returns: Json }
      backfill_protocolos_pendentes: {
        Args: { p_limite?: number }
        Returns: Json
      }
      bi_analisar_tendencias: { Args: { p_filtros?: Json }; Returns: Json }
      bi_detectar_variacoes_atipicas: {
        Args: { p_filtros?: Json }
        Returns: Json
      }
      bi_executivo_consultar: { Args: { p_filtros?: Json }; Returns: Json }
      bi_healthcheck: { Args: never; Returns: Json }
      bi_recorrencia_consultar: { Args: { p_filtros?: Json }; Returns: Json }
      bootstrap_first_super_admin: { Args: never; Returns: string }
      calcular_score_colaborador: {
        Args: { _colaborador_id: string; _janela_dias?: number }
        Returns: {
          breakdown: Json
          colaborador_id: string
          nivel: string
          score: number
          total_dias_perdidos: number
          total_ocorrencias: number
          ultima_ocorrencia: string
        }[]
      }
      calcular_score_colaboradores_lote: {
        Args: {
          _empresa_id?: string
          _janela_dias?: number
          _projeto_id?: string
        }
        Returns: {
          breakdown: Json
          colaborador_id: string
          empresa_id: string
          matricula: string
          nivel: string
          nome_completo: string
          projeto_id: string
          score: number
          supervisor_usuario_id: string
          total_dias_perdidos: number
          total_ocorrencias: number
          ultima_ocorrencia: string
        }[]
      }
      check_projeto_equivalente: {
        Args: { _empresa_id: string; _exclude_id?: string; _nome: string }
        Returns: {
          ativo: boolean
          codigo_interno: string
          codigo_protocolo: string
          created_at: string
          id: string
          nome: string
        }[]
      }
      consolidar_projetos: {
        Args: {
          p_duplicado_id: string
          p_motivo?: string
          p_principal_id: string
        }
        Returns: Json
      }
      contagem_alertas_menu: { Args: never; Returns: Json }
      contar_dependencias_usuario: {
        Args: { p_user_id: string }
        Returns: Json
      }
      contar_notificacoes_nao_lidas: { Args: never; Returns: number }
      count_active_super_admins: { Args: never; Returns: number }
      criar_notificacao: {
        Args: {
          _ambiente?: string
          _destinatario_papel?: Database["public"]["Enums"]["app_role"]
          _destinatario_usuario_id?: string
          _expira_em?: string
          _idempotency_key?: string
          _mensagem: string
          _metadata?: Json
          _modulo?: string
          _origem?: Database["public"]["Enums"]["notif_origem"]
          _origem_id?: string
          _rota_destino?: string
          _severidade?: Database["public"]["Enums"]["notif_severidade"]
          _tipo: Database["public"]["Enums"]["notif_tipo"]
          _titulo: string
        }
        Returns: string
      }
      cron_healthcheck: { Args: never; Returns: Json }
      cron_refresh_bi_absenteismo_tick: { Args: never; Returns: Json }
      cron_run_escalonamentos_tick: { Args: never; Returns: undefined }
      cron_tick_whatsapp_outbox: { Args: never; Returns: number }
      dashboard_metrics: {
        Args: {
          _categoria_id?: string
          _empresa_id?: string
          _fim: string
          _inicio: string
          _projeto_id?: string
          _status?: Database["public"]["Enums"]["status_ausencia"]
          _supervisor?: string
          _tipo?: Database["public"]["Enums"]["tipo_ausencia"]
        }
        Returns: Json
      }
      database_healthcheck: { Args: never; Returns: Json }
      database_indices_report: { Args: never; Returns: Json }
      database_performance: { Args: never; Returns: Json }
      database_slow_queries: {
        Args: { p_limit?: number; p_min_calls?: number }
        Returns: {
          calls: number
          classificacao: string
          disponivel: string
          max_exec_time_ms: number
          mean_exec_time_ms: number
          query_fingerprint: string
          rows_: number
          shared_blks_hit: number
          shared_blks_read: number
          temp_blks_written: number
          total_exec_time_ms: number
        }[]
      }
      diagnose_projetos_duplicados: { Args: never; Returns: Json }
      gen_projeto_codigo_protocolo: {
        Args: { _empresa_id: string; _exclude_id?: string; _nome: string }
        Returns: string
      }
      gerar_alertas_do_sistema: { Args: never; Returns: Json }
      gerar_campanha_revisao: {
        Args: { _dias_prazo?: number }
        Returns: number
      }
      gerar_protocolo_ausencia: {
        Args: { p_data: string; p_projeto_id: string }
        Returns: string
      }
      get_colaboradores_ativos: {
        Args: { _busca?: string; _empresa_id?: string; _projeto_id?: string }
        Returns: {
          cargo: string
          empresa_id: string
          id: string
          matricula: string
          nome_completo: string
          projeto_id: string
        }[]
      }
      get_opcoes_periodo_por_tipo: {
        Args: { _tipo_id: string }
        Returns: {
          codigo: string
          id: string
          nome: string
          ordem: number
          quantidade_dias: number
          tipo_periodo: Database["public"]["Enums"]["tipo_periodo_ausencia"]
        }[]
      }
      get_projetos_ativos_por_empresa: {
        Args: { _empresa_id: string }
        Returns: {
          codigo_protocolo: string
          id: string
          nome: string
        }[]
      }
      has_permission: {
        Args: { _code: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      homolog_kpis: { Args: never; Returns: Json }
      import_colaboradores_bulk: {
        Args: { _atualizar?: boolean; _rows: Json }
        Returns: Json
      }
      import_projetos_atomic: {
        Args: { _correlation_id: string; _rows: Json }
        Returns: Json
      }
      inteligencia_alerta_atribuir: {
        Args: { _alerta_id: string; _responsavel: string }
        Returns: undefined
      }
      inteligencia_alerta_comentar: {
        Args: { _alerta_id: string; _texto: string }
        Returns: string
      }
      inteligencia_alerta_marcar_lido: {
        Args: { _alerta_id: string }
        Returns: undefined
      }
      inteligencia_alerta_marcar_todos_lidos: { Args: never; Returns: number }
      inteligencia_alerta_status: {
        Args: {
          _alerta_id: string
          _motivo?: string
          _status: Database["public"]["Enums"]["inteligencia_alerta_status"]
        }
        Returns: undefined
      }
      inteligencia_alerta_visivel: {
        Args: {
          _colaborador_id: string
          _empresa_id: string
          _projeto_id: string
          _supervisor_id: string
        }
        Returns: boolean
      }
      inteligencia_detectar_alertas: { Args: never; Returns: Json }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      listar_notificacoes_usuario: {
        Args: {
          _limit?: number
          _offset?: number
          _status?: Database["public"]["Enums"]["notif_status_usuario"]
        }
        Returns: {
          created_at: string
          id: string
          lida_em: string
          mensagem: string
          metadata: Json
          modulo: string
          origem: Database["public"]["Enums"]["notif_origem"]
          origem_id: string
          rota_destino: string
          severidade: Database["public"]["Enums"]["notif_severidade"]
          status: Database["public"]["Enums"]["notif_status_usuario"]
          tipo: Database["public"]["Enums"]["notif_tipo"]
          titulo: string
        }[]
      }
      listar_preferencias_notificacao: {
        Args: never
        Returns: {
          categoria: string
          descricao: string
          habilitada: boolean
          nome_exibicao: string
          obrigatoria: boolean
          origem: string
          severidade_padrao: Database["public"]["Enums"]["notif_severidade"]
          silenciar_info: boolean
          silenciavel: boolean
          tipo: Database["public"]["Enums"]["notif_tipo"]
        }[]
      }
      log_audit_event: {
        Args: {
          _acao: Database["public"]["Enums"]["audit_action"]
          _antes?: Json
          _depois?: Json
          _empresa_id?: string
          _entidade?: string
          _ip?: string
          _modulo: string
          _observacoes?: string
          _origem?: string
          _projeto_id?: string
          _registro_id?: string
          _sucesso?: boolean
          _user_agent?: string
        }
        Returns: string
      }
      log_permission_denied: {
        Args: {
          _code: string
          _empresa_id?: string
          _observacoes?: string
          _projeto_id?: string
          _rota?: string
        }
        Returns: undefined
      }
      marcar_notificacao_como_lida: {
        Args: { _notificacao_id: string }
        Returns: undefined
      }
      materializar_destinatarios: {
        Args: { _notificacao_id: string }
        Returns: number
      }
      materializar_notificacao: {
        Args: {
          _ambiente?: string
          _created_by?: string
          _destinatario_papel?: Database["public"]["Enums"]["app_role"]
          _destinatario_usuario_id?: string
          _expira_em?: string
          _idempotency_key?: string
          _mensagem: string
          _metadata?: Json
          _modulo?: string
          _origem?: Database["public"]["Enums"]["notif_origem"]
          _origem_id?: string
          _rota_destino?: string
          _severidade?: Database["public"]["Enums"]["notif_severidade"]
          _tipo: Database["public"]["Enums"]["notif_tipo"]
          _titulo: string
        }
        Returns: Json
      }
      materializar_whatsapp_acidente: {
        Args: { p_ausencia_id: string }
        Returns: Json
      }
      materializar_whatsapp_ausencia: {
        Args: { p_ausencia_id: string; p_supervisor_id: string }
        Returns: Json
      }
      materializar_whatsapp_usuario_boas_vindas: {
        Args: {
          p_link_sistema: string
          p_senha_temporaria?: string
          p_user_id: string
        }
        Returns: Json
      }
      metricas_notificacoes: { Args: never; Returns: Json }
      my_permissions: {
        Args: never
        Returns: {
          permission_code: string
        }[]
      }
      normalizar_telefone_whatsapp: {
        Args: { p_telefone: string }
        Returns: {
          motivo_invalido: string
          telefone_hash: string
          telefone_mascarado: string
          telefone_normalizado: string
          valido: boolean
        }[]
      }
      normalize_matricula: { Args: { _v: string }; Returns: string }
      normalize_name: { Args: { _value: string }; Returns: string }
      notificacoes_motor_healthcheck: { Args: never; Returns: Json }
      oa_dashboard: { Args: { _periodo_id?: string }; Returns: Json }
      oa_incidente_transicionar: {
        Args: {
          _causa_raiz?: string
          _incidente_id: string
          _mensagem?: string
          _novo_status: Database["public"]["Enums"]["oa_incidente_status"]
          _plano_prevencao?: string
          _solucao?: string
        }
        Returns: string
      }
      oa_periodo_encerrar: {
        Args: { _observacoes?: string; _periodo_id: string }
        Returns: undefined
      }
      oa_periodo_prorrogar: {
        Args: { _motivo: string; _nova_data: string; _periodo_id: string }
        Returns: undefined
      }
      observabilidade_registrar_execucao: {
        Args: { p_acao: string; p_detalhes?: Json }
        Returns: undefined
      }
      operacoes_dashboard: { Args: never; Returns: Json }
      operacoes_health_check: { Args: never; Returns: Json }
      plataforma_health_score: { Args: never; Returns: Json }
      preferencia_notificacao_efetiva: {
        Args: {
          p_severidade?: Database["public"]["Enums"]["notif_severidade"]
          p_tipo: Database["public"]["Enums"]["notif_tipo"]
          p_usuario_id: string
        }
        Returns: Json
      }
      preview_consolidar_projetos: {
        Args: { p_duplicado_id: string; p_principal_id: string }
        Returns: Json
      }
      processar_escalonamentos_pendentes: { Args: never; Returns: Json }
      rbac_apply_role_matrix: { Args: { _changes: Json }; Returns: Json }
      rbac_apply_user_permission: {
        Args: { _code: string; _mode: string; _user_id: string }
        Returns: Json
      }
      rbac_critical_super_admin_perms: { Args: never; Returns: string[] }
      rbac_log_deny: {
        Args: {
          _acao: Database["public"]["Enums"]["audit_action"]
          _code: string
          _corr: string
          _empresa: string
          _obs: string
          _projeto: string
          _rota: string
        }
        Returns: undefined
      }
      rbac_matrix: { Args: never; Returns: Json }
      rbac_user_summary: { Args: { _user_id: string }; Returns: Json }
      reenfileirar_acidente_para_tst: {
        Args: { p_ausencia_id: string }
        Returns: Json
      }
      refresh_bi_absenteismo: { Args: { p_origem?: string }; Returns: Json }
      registrar_login_event: {
        Args: {
          _evento: Database["public"]["Enums"]["login_event_tipo"]
          _ip?: string
          _metadata?: Json
          _origem?: string
          _provider?: string
          _resultado?: Database["public"]["Enums"]["login_event_resultado"]
          _user_agent?: string
        }
        Returns: string
      }
      registrar_solicitacao_backup: {
        Args: { _observacoes?: string }
        Returns: string
      }
      rel_absenteismo: {
        Args: {
          _empresa_id?: string
          _fim: string
          _inicio: string
          _projeto_id?: string
          _supervisor?: string
        }
        Returns: Json
      }
      rel_afastamentos_inss: {
        Args: {
          _empresa_id?: string
          _fim: string
          _inicio: string
          _projeto_id?: string
        }
        Returns: Json
      }
      rel_atestados: {
        Args: {
          _empresa_id?: string
          _fim: string
          _inicio: string
          _projeto_id?: string
        }
        Returns: Json
      }
      rel_auditoria: { Args: { _fim: string; _inicio: string }; Returns: Json }
      rel_comunicacoes: {
        Args: {
          _empresa_id?: string
          _fim: string
          _inicio: string
          _projeto_id?: string
        }
        Returns: Json
      }
      rel_faltas: {
        Args: {
          _empresa_id?: string
          _fim: string
          _inicio: string
          _projeto_id?: string
        }
        Returns: Json
      }
      rel_licencas: {
        Args: {
          _empresa_id?: string
          _fim: string
          _inicio: string
          _projeto_id?: string
        }
        Returns: Json
      }
      rel_medidas_administrativas: {
        Args: {
          _empresa_id?: string
          _fim: string
          _inicio: string
          _projeto_id?: string
        }
        Returns: Json
      }
      report_projetos_colisoes_ativas: { Args: never; Returns: Json }
      reprocessar_escalonamentos: { Args: never; Returns: Json }
      require_permission: {
        Args: {
          _code: string
          _colaborador_id?: string
          _correlation_id?: string
          _empresa_id?: string
          _observacoes?: string
          _projeto_id?: string
          _rota?: string
        }
        Returns: Json
      }
      resolver_destinatarios_rh_ausencia: {
        Args: { p_ausencia_id: string }
        Returns: {
          telefone_bruto: string
          usuario_id: string
        }[]
      }
      restaurar_preferencias_padrao: { Args: never; Returns: number }
      revogar_sessao: {
        Args: { _motivo?: string; _session_id: string }
        Returns: undefined
      }
      rh_pode_ver_usuario: { Args: { _user_id: string }; Returns: boolean }
      roadmap_dashboard: { Args: never; Returns: Json }
      run_escalonamentos: { Args: { p_origem?: string }; Returns: Json }
      saude_sistema: { Args: never; Returns: Json }
      search_audit_logs: {
        Args: {
          _acao?: Database["public"]["Enums"]["audit_action"]
          _busca?: string
          _empresa_id?: string
          _entidade?: string
          _fim?: string
          _inicio?: string
          _limit?: number
          _modulo?: string
          _offset?: number
          _perfil?: string
          _projeto_id?: string
          _sucesso?: boolean
          _usuario_id?: string
        }
        Returns: {
          acao: Database["public"]["Enums"]["audit_action"]
          created_at: string
          empresa_id: string
          empresa_nome: string
          entidade: string
          id: string
          ip: string
          modulo: string
          origem: string
          perfil: string
          projeto_id: string
          projeto_nome: string
          registro_id: string
          sucesso: boolean
          total: number
          usuario_id: string
          usuario_nome: string
        }[]
      }
      security_functions_inventory: {
        Args: never
        Returns: {
          categoria: string
          execute_anon: boolean
          execute_authenticated: boolean
          execute_public: boolean
          execute_service_role: boolean
          expected_roles: string
          function_name: string
          grant_status: string
          owner_name: string
          risk_level: string
          schema_name: string
          search_path_configurado: boolean
          search_path_valor: string
          security_definer: boolean
          signature: string
          status: string
          volatility: string
        }[]
      }
      simular_regras_escalonamento: { Args: { p_evento: Json }; Returns: Json }
      unaccent: { Args: { "": string }; Returns: string }
      unaccent_if_available: { Args: { p: string }; Returns: string }
      user_has_projeto: {
        Args: { _projeto_id: string; _user_id: string }
        Returns: boolean
      }
      validar_template_colaborador_whatsapp: {
        Args: { p_conteudo: string; p_variaveis: string[] }
        Returns: undefined
      }
      wa_tst_confirmar: {
        Args: { p_id: string; p_ip?: unknown }
        Returns: {
          ativo: boolean
          cargo: string
          confirmado: boolean
          confirmado_em: string | null
          confirmado_ip: unknown
          confirmado_por: string | null
          created_at: string
          created_by: string | null
          destinatario_principal_acidente: boolean
          empresa_id: string | null
          id: string
          nome: string
          telefone_e164: string
          telefone_hash: string
          telefone_mascarado: string
          telefone_normalizado: string
          telefone_original: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_tst_destinatarios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      whatsapp_calc_backoff: {
        Args: { p_base_seg: number; p_max_seg: number; p_tentativas: number }
        Returns: string
      }
      whatsapp_enfileirar_template_teste: {
        Args: {
          p_colaborador_nome: string
          p_data_fim?: string
          p_data_inicio: string
          p_projeto_id: string
          p_recipient_id: string
          p_tipo_lancamento: string
        }
        Returns: Json
      }
      whatsapp_idem_key_acidente: {
        Args: { p_ausencia_id: string; p_tst_destinatario_id: string }
        Returns: string
      }
      whatsapp_idem_key_ausencia: {
        Args: {
          p_alvo_id: string
          p_ausencia_id: string
          p_publico: Database["public"]["Enums"]["whatsapp_publico"]
        }
        Returns: string
      }
      whatsapp_outbox_cancelar: {
        Args: { p_id: string; p_motivo: string }
        Returns: undefined
      }
      whatsapp_outbox_marcar_enviado: {
        Args: { p_id: string; p_provider_message_id: string }
        Returns: undefined
      }
      whatsapp_outbox_marcar_falha_definitiva: {
        Args: { p_codigo: string; p_id: string; p_mensagem_resumida: string }
        Returns: undefined
      }
      whatsapp_outbox_marcar_falha_temporaria: {
        Args: { p_codigo: string; p_id: string; p_mensagem_resumida: string }
        Returns: Database["public"]["Enums"]["whatsapp_status"]
      }
      whatsapp_outbox_processar_webhook: {
        Args: {
          p_codigo?: string
          p_instance: string
          p_mensagem?: string
          p_metadata?: Json
          p_provider_message_id: string
          p_status_novo: Database["public"]["Enums"]["whatsapp_status"]
        }
        Returns: Json
      }
      whatsapp_outbox_recuperar_travadas: {
        Args: { p_timeout_seg?: number }
        Returns: number
      }
      whatsapp_outbox_reenfileirar: {
        Args: { p_id: string; p_motivo?: string }
        Returns: undefined
      }
      whatsapp_outbox_registrar_execucao: {
        Args: {
          p_detalhes?: Json
          p_enviadas: number
          p_execution_id: string
          p_falhas_definitivas: number
          p_falhas_temporarias: number
          p_fim: string
          p_ignoradas: number
          p_inicio: string
          p_selecionadas: number
          p_status: string
          p_worker: string
        }
        Returns: undefined
      }
      whatsapp_outbox_reservar_lote: {
        Args: { p_limite?: number; p_worker_id: string }
        Returns: {
          id: string
          idempotency_key: string
          payload: Json
          provider: Database["public"]["Enums"]["whatsapp_provider"]
          provider_instance: string
          publico: Database["public"]["Enums"]["whatsapp_publico"]
          telefone_hash: string
          telefone_mascarado: string
          template_codigo: string
          template_id: string
          template_versao: number
          tentativas: number
        }[]
      }
      whatsapp_preview_template_teste: {
        Args: {
          p_colaborador_nome: string
          p_data_fim?: string
          p_data_inicio: string
          p_projeto_id: string
          p_tipo_lancamento: string
        }
        Returns: Json
      }
      whatsapp_provider_sync: {
        Args: {
          p_base_url_public_label?: string
          p_enabled: boolean
          p_instance_name: string
          p_modo: Database["public"]["Enums"]["whatsapp_modo"]
          p_webhook_enabled?: boolean
        }
        Returns: {
          base_url_public_label: string | null
          batch_size: number
          created_at: string
          enabled: boolean
          homologacao_allowlist: string[]
          id: string
          instance_name: string | null
          max_tentativas: number
          modo: Database["public"]["Enums"]["whatsapp_modo"]
          provider: Database["public"]["Enums"]["whatsapp_provider"]
          retry_base_segundos: number
          retry_max_segundos: number
          singleton: boolean
          timeout_ms: number
          updated_at: string
          webhook_enabled: boolean
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_provider_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      whatsapp_registrar_evento_seguro: {
        Args: {
          p_codigo?: string
          p_evento: string
          p_mensagem?: string
          p_metadata?: Json
          p_outbox_id: string
        }
        Returns: undefined
      }
      whatsapp_status_pode_evoluir: {
        Args: {
          atual: Database["public"]["Enums"]["whatsapp_status"]
          novo: Database["public"]["Enums"]["whatsapp_status"]
        }
        Returns: boolean
      }
    }
    Enums: {
      access_review_status: "PENDENTE" | "APROVADA" | "REVOGADA" | "PRORROGADA"
      app_role:
        | "super_admin"
        | "rh"
        | "supervisor"
        | "compliance"
        | "operacao"
        | "visualizador"
      audit_action:
        | "CREATE"
        | "UPDATE"
        | "DELETE_LOGICO"
        | "LOGIN"
        | "LOGOUT"
        | "IMPORTACAO"
        | "EXPORTACAO"
        | "DOWNLOAD"
        | "VISUALIZACAO"
        | "ENVIO_COMUNICACAO"
        | "LANCAMENTO"
        | "ACESSO_NEGADO"
        | "MUDANCA_STATUS"
        | "SIMULACAO"
        | "ANALISE_CONFLITOS"
        | "COLABORADOR_DUPLICIDADE_BLOQUEADA"
        | "WHATSAPP_DEAD_LETTER_VISUALIZADA"
        | "WHATSAPP_REENFILEIRADO"
        | "WHATSAPP_EXPORT_OUTBOX"
        | "WHATSAPP_EXPORT_EXECUCOES"
        | "USUARIO_CRIADO"
        | "USUARIO_EDITADO"
        | "USUARIO_ATIVADO"
        | "USUARIO_DESATIVADO"
        | "USUARIO_ROLE_ADICIONADA"
        | "USUARIO_ROLE_REMOVIDA"
        | "USUARIO_EMPRESA_VINCULADA"
        | "USUARIO_EMPRESA_REMOVIDA"
        | "USUARIO_PROJETO_VINCULADO"
        | "USUARIO_PROJETO_REMOVIDO"
        | "USUARIO_RESET_SENHA"
        | "USUARIO_CONVITE_REENVIADO"
        | "USUARIO_CRIACAO_REVERTIDA"
        | "USUARIO_ULTIMO_SUPER_ADMIN_BLOQUEADO"
        | "USUARIO_SESSOES_ENCERRADAS"
        | "USUARIO_AUTOALTERACAO_BLOQUEADA"
        | "USUARIO_PROJETO_EMPRESA_INCONSISTENTE"
        | "HISTORICO_VISUALIZADO"
        | "RELATORIO_VISUALIZADO"
        | "RELATORIO_EXPORTADO"
        | "ALERTA_CRIADO"
        | "ALERTA_LIDO"
        | "ALERTA_ASSUMIDO"
        | "ALERTA_RESOLVIDO"
        | "ALERTA_DISPENSADO"
        | "ALERTA_REABERTO"
        | "AUSENCIA_CRIADA_POR_SUPERVISOR"
        | "AUSENCIA_TENTATIVA_FORA_DO_ESCOPO"
        | "PROJETO_ACESSO_NEGADO"
        | "COLABORADOR_ACESSO_NEGADO"
        | "PERMISSAO_NEGADA"
        | "ROLE_PERMISSION_CREATED"
        | "ROLE_PERMISSION_UPDATED"
        | "ROLE_PERMISSION_REMOVED"
        | "ROLE_PERMISSION_BULK_UPDATED"
        | "USER_PERMISSION_UPDATED"
        | "USER_PERMISSION_REMOVED"
        | "AUSENCIA_CRIADA"
        | "AUSENCIA_EDITADA"
        | "AUSENCIA_EXCLUIDA"
        | "AUSENCIA_STATUS_ALTERADO"
        | "ESCOPO_EMPRESA_NEGADO"
        | "ESCOPO_PROJETO_NEGADO"
        | "ESCOPO_COLABORADOR_NEGADO"
        | "MUTACAO_BLOQUEADA"
        | "EMPRESA_CRIADA"
        | "EMPRESA_EDITADA"
        | "EMPRESA_ATIVADA"
        | "EMPRESA_DESATIVADA"
        | "PROJETO_CRIADO"
        | "PROJETO_EDITADO"
        | "PROJETO_ATIVADO"
        | "PROJETO_DESATIVADO"
        | "PROJETO_CODIGO_ALTERADO"
        | "PROJETO_CODIGO_ALTERACAO_NEGADA"
        | "COLABORADOR_CRIADO"
        | "COLABORADOR_EDITADO"
        | "COLABORADOR_ATIVADO"
        | "COLABORADOR_DESATIVADO"
        | "COLABORADOR_TRANSFERIDO"
        | "COLABORADORES_IMPORTADOS"
        | "PROJETOS_IMPORTACAO_INICIADA"
        | "PROJETOS_IMPORTACAO_CONCLUIDA"
        | "PROJETOS_IMPORTACAO_FALHOU"
        | "PROJETO_ATUALIZADO"
        | "PROJETO_EXCLUIDO"
        | "PROJETO_ARQUIVADO_AUTOMATICO"
        | "PROJETOS_EXCLUSAO_LOTE"
        | "TST_CONFIRMADO"
        | "PRIMEIRO_ACESSO_CONCLUIDO"
        | "SENHA_TEMPORARIA_REDEFINIDA"
        | "USUARIO_EXCLUIDO"
        | "USUARIO_EXCLUSAO_BLOQUEADA"
        | "USUARIO_EXCLUSAO_TENTATIVA"
      canal_comunicacao: "EMAIL" | "WHATSAPP" | "SMS" | "INTERNO"
      changelog_tipo:
        | "NOVA_FUNCIONALIDADE"
        | "CORRECAO"
        | "SEGURANCA"
        | "PERFORMANCE"
        | "REFATORACAO"
        | "UI"
        | "INFRAESTRUTURA"
      homolog_classificacao: "BUG" | "MELHORIA" | "DUVIDA" | "CONFIGURACAO"
      homolog_criticidade: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA"
      homolog_status:
        | "PENDENTE"
        | "EM_EXECUCAO"
        | "APROVADO"
        | "REPROVADO"
        | "NAO_APLICAVEL"
      inteligencia_alerta_criticidade: "BAIXA" | "ATENCAO" | "ALTA" | "CRITICA"
      inteligencia_alerta_escopo:
        | "COLABORADOR"
        | "SUPERVISOR"
        | "PROJETO"
        | "EMPRESA"
      inteligencia_alerta_evento_tipo:
        | "CRIADO"
        | "COMENTARIO"
        | "STATUS_ALTERADO"
        | "ATRIBUIDO"
        | "LIDO"
      inteligencia_alerta_status:
        | "NOVO"
        | "EM_ANALISE"
        | "RESOLVIDO"
        | "IGNORADO"
      inteligencia_alerta_tipo:
        | "COLAB_CRITICIDADE"
        | "COLAB_REINCIDENCIA"
        | "COLAB_DIAS_PERDIDOS"
        | "COLAB_CRESCIMENTO_SCORE"
        | "SUPERVISOR_EQUIPE_CRITICA"
        | "SUPERVISOR_CRESCIMENTO"
        | "PROJETO_CONCENTRACAO"
        | "PROJETO_ACIDENTES"
        | "EMPRESA_CONCENTRACAO"
      login_event_resultado: "SUCESSO" | "FALHA" | "BLOQUEADO"
      login_event_tipo:
        | "LOGIN"
        | "LOGOUT"
        | "TOKEN_REFRESH"
        | "FALHA_LOGIN"
        | "SESSAO_REVOGADA"
      notif_evento:
        | "CRIADA"
        | "ENTREGUE"
        | "VISUALIZADA"
        | "MARCADA_COMO_LIDA"
        | "ARQUIVADA"
        | "REENVIADA_INTERNAMENTE"
        | "ESCALADA"
        | "EXPIRADA"
      notif_origem:
        | "OPERACAO_ASSISTIDA"
        | "OPERACOES"
        | "DEPLOY"
        | "BACKUP"
        | "HEALTH_CHECK"
        | "SISTEMA"
      notif_severidade: "INFO" | "ATENCAO" | "ALTA" | "CRITICA"
      notif_status_usuario: "NAO_LIDA" | "LIDA" | "ARQUIVADA"
      notif_tipo:
        | "INCIDENTE_CRIADO"
        | "INCIDENTE_ATRIBUIDO"
        | "INCIDENTE_RECLASSIFICADO"
        | "INCIDENTE_CRITICO"
        | "INCIDENTE_P1"
        | "SLA_PROXIMO"
        | "SLA_VENCIDO"
        | "VALIDACAO_PENDENTE"
        | "INCIDENTE_RESOLVIDO"
        | "INCIDENTE_REABERTO"
        | "PERIODO_PROXIMO_DO_FIM"
        | "PERIODO_PRORROGADO"
        | "ALERTA_OPERACIONAL"
        | "DEPLOY_COM_INCIDENTE"
        | "BACKUP_FALHOU"
        | "SISTEMA"
        | "WHATSAPP_AUSENCIA_COLABORADOR"
        | "WHATSAPP_AUSENCIA_RH"
        | "WHATSAPP_AUSENCIA_SUPERVISOR"
      oa_ambiente: "desenvolvimento" | "homologacao" | "preview" | "producao"
      oa_comentario_tipo: "COMENTARIO" | "ATUALIZACAO" | "VALIDACAO" | "DECISAO"
      oa_evento_tipo:
        | "CRIADO"
        | "CLASSIFICADO"
        | "RESPONSAVEL_ATRIBUIDO"
        | "STATUS_ALTERADO"
        | "COMENTARIO_ADICIONADO"
        | "EVIDENCIA_ADICIONADA"
        | "PRAZO_ALTERADO"
        | "SOLUCAO_REGISTRADA"
        | "VALIDACAO_SOLICITADA"
        | "RESOLVIDO"
        | "ENCERRADO"
        | "REABERTO"
        | "CANCELADO"
      oa_impacto: "INDIVIDUAL" | "EQUIPE" | "DEPARTAMENTO" | "GERAL"
      oa_incidente_categoria:
        | "AUTENTICACAO"
        | "PERMISSAO"
        | "IMPORTACAO"
        | "COLABORADORES"
        | "AUSENCIAS"
        | "COMUNICACOES"
        | "PAINEL_RH"
        | "DASHBOARD"
        | "RELATORIOS"
        | "AUDITORIA"
        | "OPERACOES"
        | "DEPLOY"
        | "DESEMPENHO"
        | "INTERFACE"
        | "DADOS"
        | "OUTROS"
      oa_incidente_status:
        | "NOVO"
        | "EM_TRIAGEM"
        | "EM_ANALISE"
        | "EM_CORRECAO"
        | "AGUARDANDO_VALIDACAO"
        | "RESOLVIDO"
        | "ENCERRADO"
        | "CANCELADO"
      oa_incidente_tipo:
        | "INCIDENTE"
        | "BUG"
        | "DUVIDA"
        | "SOLICITACAO"
        | "CONFIGURACAO"
        | "MELHORIA"
      oa_periodo_status:
        | "PLANEJADO"
        | "ATIVO"
        | "PRORROGADO"
        | "ENCERRADO"
        | "CANCELADO"
      oa_prioridade: "P4" | "P3" | "P2" | "P1"
      oa_severidade: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA"
      op_assist_prioridade: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA"
      op_assist_status: "ABERTO" | "EM_ANDAMENTO" | "RESOLVIDO" | "CANCELADO"
      permission_effect: "allow" | "deny"
      release_status: "PLANEJADA" | "EM_EXECUCAO" | "PUBLICADA" | "CANCELADA"
      release_tipo: "HOTFIX" | "PATCH" | "MINOR" | "MAJOR"
      roadmap_categoria:
        | "RH"
        | "OPERACOES"
        | "AUDITORIA"
        | "DASHBOARD"
        | "COMUNICACOES"
        | "AUSENCIAS"
        | "COLABORADORES"
        | "DEPLOY"
        | "INFRAESTRUTURA"
        | "NOTIFICACOES"
        | "OPERACAO_ASSISTIDA"
        | "RELATORIOS"
        | "OUTROS"
      roadmap_prioridade: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA"
      roadmap_status:
        | "BACKLOG"
        | "PLANEJADO"
        | "EM_DESENVOLVIMENTO"
        | "EM_TESTES"
        | "HOMOLOGACAO"
        | "PRONTO_PARA_RELEASE"
        | "PUBLICADO"
        | "CANCELADO"
      roadmap_tipo:
        | "FEATURE"
        | "BUG"
        | "MELHORIA"
        | "REFATORACAO"
        | "SEGURANCA"
        | "PERFORMANCE"
        | "UX"
        | "DOCUMENTACAO"
      session_status: "ATIVA" | "ENCERRADA" | "EXPIRADA" | "REVOGADA"
      status_ausencia: "PENDENTE" | "LANCADO"
      status_comunicacao: "RASCUNHO" | "APROVADO" | "ENVIADO" | "ERRO"
      tipo_ausencia:
        | "FALTA"
        | "ATESTADO"
        | "DECLARACAO"
        | "SUSPENSAO"
        | "OUTROS"
      tipo_periodo_ausencia:
        | "DIAS"
        | "HORAS"
        | "MEIO_PERIODO"
        | "PERIODO_INTEGRAL"
      whatsapp_base_envio: "OPERACIONAL" | "CONSENTIMENTO" | "DESABILITADO"
      whatsapp_modo: "DESATIVADO" | "HOMOLOGACAO" | "PRODUCAO"
      whatsapp_prioridade: "NORMAL" | "ALTA"
      whatsapp_provider: "EVOLUTION_API"
      whatsapp_publico: "COLABORADOR" | "RH" | "SUPERVISOR" | "TST"
      whatsapp_status:
        | "PENDENTE"
        | "PROCESSANDO"
        | "ENVIADO"
        | "ENTREGUE"
        | "LIDO"
        | "FALHOU_TEMPORARIO"
        | "FALHOU_DEFINITIVO"
        | "CANCELADO"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_review_status: ["PENDENTE", "APROVADA", "REVOGADA", "PRORROGADA"],
      app_role: [
        "super_admin",
        "rh",
        "supervisor",
        "compliance",
        "operacao",
        "visualizador",
      ],
      audit_action: [
        "CREATE",
        "UPDATE",
        "DELETE_LOGICO",
        "LOGIN",
        "LOGOUT",
        "IMPORTACAO",
        "EXPORTACAO",
        "DOWNLOAD",
        "VISUALIZACAO",
        "ENVIO_COMUNICACAO",
        "LANCAMENTO",
        "ACESSO_NEGADO",
        "MUDANCA_STATUS",
        "SIMULACAO",
        "ANALISE_CONFLITOS",
        "COLABORADOR_DUPLICIDADE_BLOQUEADA",
        "WHATSAPP_DEAD_LETTER_VISUALIZADA",
        "WHATSAPP_REENFILEIRADO",
        "WHATSAPP_EXPORT_OUTBOX",
        "WHATSAPP_EXPORT_EXECUCOES",
        "USUARIO_CRIADO",
        "USUARIO_EDITADO",
        "USUARIO_ATIVADO",
        "USUARIO_DESATIVADO",
        "USUARIO_ROLE_ADICIONADA",
        "USUARIO_ROLE_REMOVIDA",
        "USUARIO_EMPRESA_VINCULADA",
        "USUARIO_EMPRESA_REMOVIDA",
        "USUARIO_PROJETO_VINCULADO",
        "USUARIO_PROJETO_REMOVIDO",
        "USUARIO_RESET_SENHA",
        "USUARIO_CONVITE_REENVIADO",
        "USUARIO_CRIACAO_REVERTIDA",
        "USUARIO_ULTIMO_SUPER_ADMIN_BLOQUEADO",
        "USUARIO_SESSOES_ENCERRADAS",
        "USUARIO_AUTOALTERACAO_BLOQUEADA",
        "USUARIO_PROJETO_EMPRESA_INCONSISTENTE",
        "HISTORICO_VISUALIZADO",
        "RELATORIO_VISUALIZADO",
        "RELATORIO_EXPORTADO",
        "ALERTA_CRIADO",
        "ALERTA_LIDO",
        "ALERTA_ASSUMIDO",
        "ALERTA_RESOLVIDO",
        "ALERTA_DISPENSADO",
        "ALERTA_REABERTO",
        "AUSENCIA_CRIADA_POR_SUPERVISOR",
        "AUSENCIA_TENTATIVA_FORA_DO_ESCOPO",
        "PROJETO_ACESSO_NEGADO",
        "COLABORADOR_ACESSO_NEGADO",
        "PERMISSAO_NEGADA",
        "ROLE_PERMISSION_CREATED",
        "ROLE_PERMISSION_UPDATED",
        "ROLE_PERMISSION_REMOVED",
        "ROLE_PERMISSION_BULK_UPDATED",
        "USER_PERMISSION_UPDATED",
        "USER_PERMISSION_REMOVED",
        "AUSENCIA_CRIADA",
        "AUSENCIA_EDITADA",
        "AUSENCIA_EXCLUIDA",
        "AUSENCIA_STATUS_ALTERADO",
        "ESCOPO_EMPRESA_NEGADO",
        "ESCOPO_PROJETO_NEGADO",
        "ESCOPO_COLABORADOR_NEGADO",
        "MUTACAO_BLOQUEADA",
        "EMPRESA_CRIADA",
        "EMPRESA_EDITADA",
        "EMPRESA_ATIVADA",
        "EMPRESA_DESATIVADA",
        "PROJETO_CRIADO",
        "PROJETO_EDITADO",
        "PROJETO_ATIVADO",
        "PROJETO_DESATIVADO",
        "PROJETO_CODIGO_ALTERADO",
        "PROJETO_CODIGO_ALTERACAO_NEGADA",
        "COLABORADOR_CRIADO",
        "COLABORADOR_EDITADO",
        "COLABORADOR_ATIVADO",
        "COLABORADOR_DESATIVADO",
        "COLABORADOR_TRANSFERIDO",
        "COLABORADORES_IMPORTADOS",
        "PROJETOS_IMPORTACAO_INICIADA",
        "PROJETOS_IMPORTACAO_CONCLUIDA",
        "PROJETOS_IMPORTACAO_FALHOU",
        "PROJETO_ATUALIZADO",
        "PROJETO_EXCLUIDO",
        "PROJETO_ARQUIVADO_AUTOMATICO",
        "PROJETOS_EXCLUSAO_LOTE",
        "TST_CONFIRMADO",
        "PRIMEIRO_ACESSO_CONCLUIDO",
        "SENHA_TEMPORARIA_REDEFINIDA",
        "USUARIO_EXCLUIDO",
        "USUARIO_EXCLUSAO_BLOQUEADA",
        "USUARIO_EXCLUSAO_TENTATIVA",
      ],
      canal_comunicacao: ["EMAIL", "WHATSAPP", "SMS", "INTERNO"],
      changelog_tipo: [
        "NOVA_FUNCIONALIDADE",
        "CORRECAO",
        "SEGURANCA",
        "PERFORMANCE",
        "REFATORACAO",
        "UI",
        "INFRAESTRUTURA",
      ],
      homolog_classificacao: ["BUG", "MELHORIA", "DUVIDA", "CONFIGURACAO"],
      homolog_criticidade: ["BAIXA", "MEDIA", "ALTA", "CRITICA"],
      homolog_status: [
        "PENDENTE",
        "EM_EXECUCAO",
        "APROVADO",
        "REPROVADO",
        "NAO_APLICAVEL",
      ],
      inteligencia_alerta_criticidade: ["BAIXA", "ATENCAO", "ALTA", "CRITICA"],
      inteligencia_alerta_escopo: [
        "COLABORADOR",
        "SUPERVISOR",
        "PROJETO",
        "EMPRESA",
      ],
      inteligencia_alerta_evento_tipo: [
        "CRIADO",
        "COMENTARIO",
        "STATUS_ALTERADO",
        "ATRIBUIDO",
        "LIDO",
      ],
      inteligencia_alerta_status: [
        "NOVO",
        "EM_ANALISE",
        "RESOLVIDO",
        "IGNORADO",
      ],
      inteligencia_alerta_tipo: [
        "COLAB_CRITICIDADE",
        "COLAB_REINCIDENCIA",
        "COLAB_DIAS_PERDIDOS",
        "COLAB_CRESCIMENTO_SCORE",
        "SUPERVISOR_EQUIPE_CRITICA",
        "SUPERVISOR_CRESCIMENTO",
        "PROJETO_CONCENTRACAO",
        "PROJETO_ACIDENTES",
        "EMPRESA_CONCENTRACAO",
      ],
      login_event_resultado: ["SUCESSO", "FALHA", "BLOQUEADO"],
      login_event_tipo: [
        "LOGIN",
        "LOGOUT",
        "TOKEN_REFRESH",
        "FALHA_LOGIN",
        "SESSAO_REVOGADA",
      ],
      notif_evento: [
        "CRIADA",
        "ENTREGUE",
        "VISUALIZADA",
        "MARCADA_COMO_LIDA",
        "ARQUIVADA",
        "REENVIADA_INTERNAMENTE",
        "ESCALADA",
        "EXPIRADA",
      ],
      notif_origem: [
        "OPERACAO_ASSISTIDA",
        "OPERACOES",
        "DEPLOY",
        "BACKUP",
        "HEALTH_CHECK",
        "SISTEMA",
      ],
      notif_severidade: ["INFO", "ATENCAO", "ALTA", "CRITICA"],
      notif_status_usuario: ["NAO_LIDA", "LIDA", "ARQUIVADA"],
      notif_tipo: [
        "INCIDENTE_CRIADO",
        "INCIDENTE_ATRIBUIDO",
        "INCIDENTE_RECLASSIFICADO",
        "INCIDENTE_CRITICO",
        "INCIDENTE_P1",
        "SLA_PROXIMO",
        "SLA_VENCIDO",
        "VALIDACAO_PENDENTE",
        "INCIDENTE_RESOLVIDO",
        "INCIDENTE_REABERTO",
        "PERIODO_PROXIMO_DO_FIM",
        "PERIODO_PRORROGADO",
        "ALERTA_OPERACIONAL",
        "DEPLOY_COM_INCIDENTE",
        "BACKUP_FALHOU",
        "SISTEMA",
        "WHATSAPP_AUSENCIA_COLABORADOR",
        "WHATSAPP_AUSENCIA_RH",
        "WHATSAPP_AUSENCIA_SUPERVISOR",
      ],
      oa_ambiente: ["desenvolvimento", "homologacao", "preview", "producao"],
      oa_comentario_tipo: ["COMENTARIO", "ATUALIZACAO", "VALIDACAO", "DECISAO"],
      oa_evento_tipo: [
        "CRIADO",
        "CLASSIFICADO",
        "RESPONSAVEL_ATRIBUIDO",
        "STATUS_ALTERADO",
        "COMENTARIO_ADICIONADO",
        "EVIDENCIA_ADICIONADA",
        "PRAZO_ALTERADO",
        "SOLUCAO_REGISTRADA",
        "VALIDACAO_SOLICITADA",
        "RESOLVIDO",
        "ENCERRADO",
        "REABERTO",
        "CANCELADO",
      ],
      oa_impacto: ["INDIVIDUAL", "EQUIPE", "DEPARTAMENTO", "GERAL"],
      oa_incidente_categoria: [
        "AUTENTICACAO",
        "PERMISSAO",
        "IMPORTACAO",
        "COLABORADORES",
        "AUSENCIAS",
        "COMUNICACOES",
        "PAINEL_RH",
        "DASHBOARD",
        "RELATORIOS",
        "AUDITORIA",
        "OPERACOES",
        "DEPLOY",
        "DESEMPENHO",
        "INTERFACE",
        "DADOS",
        "OUTROS",
      ],
      oa_incidente_status: [
        "NOVO",
        "EM_TRIAGEM",
        "EM_ANALISE",
        "EM_CORRECAO",
        "AGUARDANDO_VALIDACAO",
        "RESOLVIDO",
        "ENCERRADO",
        "CANCELADO",
      ],
      oa_incidente_tipo: [
        "INCIDENTE",
        "BUG",
        "DUVIDA",
        "SOLICITACAO",
        "CONFIGURACAO",
        "MELHORIA",
      ],
      oa_periodo_status: [
        "PLANEJADO",
        "ATIVO",
        "PRORROGADO",
        "ENCERRADO",
        "CANCELADO",
      ],
      oa_prioridade: ["P4", "P3", "P2", "P1"],
      oa_severidade: ["BAIXA", "MEDIA", "ALTA", "CRITICA"],
      op_assist_prioridade: ["BAIXA", "MEDIA", "ALTA", "CRITICA"],
      op_assist_status: ["ABERTO", "EM_ANDAMENTO", "RESOLVIDO", "CANCELADO"],
      permission_effect: ["allow", "deny"],
      release_status: ["PLANEJADA", "EM_EXECUCAO", "PUBLICADA", "CANCELADA"],
      release_tipo: ["HOTFIX", "PATCH", "MINOR", "MAJOR"],
      roadmap_categoria: [
        "RH",
        "OPERACOES",
        "AUDITORIA",
        "DASHBOARD",
        "COMUNICACOES",
        "AUSENCIAS",
        "COLABORADORES",
        "DEPLOY",
        "INFRAESTRUTURA",
        "NOTIFICACOES",
        "OPERACAO_ASSISTIDA",
        "RELATORIOS",
        "OUTROS",
      ],
      roadmap_prioridade: ["BAIXA", "MEDIA", "ALTA", "CRITICA"],
      roadmap_status: [
        "BACKLOG",
        "PLANEJADO",
        "EM_DESENVOLVIMENTO",
        "EM_TESTES",
        "HOMOLOGACAO",
        "PRONTO_PARA_RELEASE",
        "PUBLICADO",
        "CANCELADO",
      ],
      roadmap_tipo: [
        "FEATURE",
        "BUG",
        "MELHORIA",
        "REFATORACAO",
        "SEGURANCA",
        "PERFORMANCE",
        "UX",
        "DOCUMENTACAO",
      ],
      session_status: ["ATIVA", "ENCERRADA", "EXPIRADA", "REVOGADA"],
      status_ausencia: ["PENDENTE", "LANCADO"],
      status_comunicacao: ["RASCUNHO", "APROVADO", "ENVIADO", "ERRO"],
      tipo_ausencia: ["FALTA", "ATESTADO", "DECLARACAO", "SUSPENSAO", "OUTROS"],
      tipo_periodo_ausencia: [
        "DIAS",
        "HORAS",
        "MEIO_PERIODO",
        "PERIODO_INTEGRAL",
      ],
      whatsapp_base_envio: ["OPERACIONAL", "CONSENTIMENTO", "DESABILITADO"],
      whatsapp_modo: ["DESATIVADO", "HOMOLOGACAO", "PRODUCAO"],
      whatsapp_prioridade: ["NORMAL", "ALTA"],
      whatsapp_provider: ["EVOLUTION_API"],
      whatsapp_publico: ["COLABORADOR", "RH", "SUPERVISOR", "TST"],
      whatsapp_status: [
        "PENDENTE",
        "PROCESSANDO",
        "ENVIADO",
        "ENTREGUE",
        "LIDO",
        "FALHOU_TEMPORARIO",
        "FALHOU_DEFINITIVO",
        "CANCELADO",
      ],
    },
  },
} as const
