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
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          id: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      projetos: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          empresa_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          empresa_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          empresa_id?: string
          id?: string
          nome?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      audit_kpis: { Args: { _inicio?: string }; Returns: Json }
      bootstrap_first_super_admin: { Args: never; Returns: string }
      dashboard_metrics:
        | {
            Args: {
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
        | {
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
          id: string
          nome: string
        }[]
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
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
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
      operacoes_dashboard: { Args: never; Returns: Json }
      operacoes_health_check: { Args: never; Returns: Json }
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
    }
    Enums: {
      app_role: "super_admin" | "rh" | "supervisor" | "compliance"
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
      canal_comunicacao: "EMAIL" | "WHATSAPP" | "SMS" | "INTERNO"
      homolog_classificacao: "BUG" | "MELHORIA" | "DUVIDA" | "CONFIGURACAO"
      homolog_criticidade: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA"
      homolog_status:
        | "PENDENTE"
        | "EM_EXECUCAO"
        | "APROVADO"
        | "REPROVADO"
        | "NAO_APLICAVEL"
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
      app_role: ["super_admin", "rh", "supervisor", "compliance"],
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
      ],
      canal_comunicacao: ["EMAIL", "WHATSAPP", "SMS", "INTERNO"],
      homolog_classificacao: ["BUG", "MELHORIA", "DUVIDA", "CONFIGURACAO"],
      homolog_criticidade: ["BAIXA", "MEDIA", "ALTA", "CRITICA"],
      homolog_status: [
        "PENDENTE",
        "EM_EXECUCAO",
        "APROVADO",
        "REPROVADO",
        "NAO_APLICAVEL",
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
      status_ausencia: ["PENDENTE", "LANCADO"],
      status_comunicacao: ["RASCUNHO", "APROVADO", "ENVIADO", "ERRO"],
      tipo_ausencia: ["FALTA", "ATESTADO", "DECLARACAO", "SUSPENSAO", "OUTROS"],
      tipo_periodo_ausencia: [
        "DIAS",
        "HORAS",
        "MEIO_PERIODO",
        "PERIODO_INTEGRAL",
      ],
    },
  },
} as const
