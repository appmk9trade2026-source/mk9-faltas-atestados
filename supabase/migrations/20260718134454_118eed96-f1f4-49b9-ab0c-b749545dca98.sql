
-- =========================================================
-- 0. Extend audit_action enum
-- =========================================================
DO $$ BEGIN
  ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'SIMULACAO';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'ANALISE_CONFLITOS';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- 1. preferencias_notificacao: adicionar canal + unique
-- =========================================================
ALTER TABLE public.preferencias_notificacao
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'INTERNO'
  CHECK (canal = 'INTERNO');

DO $$ BEGIN
  ALTER TABLE public.preferencias_notificacao
    DROP CONSTRAINT IF EXISTS preferencias_notificacao_usuario_id_tipo_key;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pref_notif_user_tipo_canal
  ON public.preferencias_notificacao(usuario_id, tipo, canal);

-- =========================================================
-- 2. Catálogo: notificacao_tipos_config
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notificacao_tipos_config (
  tipo public.notif_tipo PRIMARY KEY,
  nome_exibicao text NOT NULL,
  descricao text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('INCIDENTES','SLA','OPERACOES','DEPLOY','BACKUP','SISTEMA','INFORMATIVAS')),
  obrigatoria boolean NOT NULL DEFAULT false,
  silenciavel boolean NOT NULL DEFAULT true,
  severidade_padrao public.notif_severidade NOT NULL DEFAULT 'INFO',
  papeis_aplicaveis public.app_role[] NOT NULL DEFAULT ARRAY['super_admin','rh','compliance','supervisor']::public.app_role[],
  ordem int NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notificacao_tipos_config TO authenticated;
GRANT ALL ON public.notificacao_tipos_config TO service_role;

ALTER TABLE public.notificacao_tipos_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cat_read_all" ON public.notificacao_tipos_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cat_write_super" ON public.notificacao_tipos_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_cat_upd BEFORE UPDATE ON public.notificacao_tipos_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seeds (idempotente)
INSERT INTO public.notificacao_tipos_config(tipo,nome_exibicao,descricao,categoria,obrigatoria,silenciavel,severidade_padrao,ordem) VALUES
 ('INCIDENTE_CRIADO','Incidente criado','Novo incidente aberto no sistema.','INCIDENTES',false,true,'INFO',10),
 ('INCIDENTE_ATRIBUIDO','Incidente atribuído','Incidente atribuído a um responsável.','INCIDENTES',false,true,'INFO',20),
 ('INCIDENTE_RECLASSIFICADO','Incidente reclassificado','Severidade ou prioridade alteradas.','INCIDENTES',false,true,'ATENCAO',30),
 ('INCIDENTE_CRITICO','Incidente crítico','Incidente com severidade CRÍTICA.','INCIDENTES',true,false,'CRITICA',5),
 ('INCIDENTE_P1','Incidente P1','Incidente com prioridade P1.','INCIDENTES',true,false,'ALTA',6),
 ('SLA_PROXIMO','SLA próximo do vencimento','SLA acima de 75% do tempo consumido.','SLA',true,false,'ALTA',40),
 ('SLA_VENCIDO','SLA vencido','Prazo de SLA ultrapassado.','SLA',true,false,'CRITICA',41),
 ('VALIDACAO_PENDENTE','Validação pendente','Item aguardando validação.','OPERACOES',false,true,'ATENCAO',50),
 ('INCIDENTE_RESOLVIDO','Incidente resolvido','Incidente marcado como resolvido.','INCIDENTES',false,true,'INFO',60),
 ('INCIDENTE_REABERTO','Incidente reaberto','Incidente foi reaberto.','INCIDENTES',false,true,'ATENCAO',65),
 ('PERIODO_PROXIMO_DO_FIM','Período próximo do fim','Período de operação assistida encerrando.','OPERACOES',false,true,'ATENCAO',70),
 ('PERIODO_PRORROGADO','Período prorrogado','Período de operação assistida estendido.','OPERACOES',false,true,'INFO',71),
 ('ALERTA_OPERACIONAL','Alerta operacional','Alerta gerado pelo Centro de Operações.','OPERACOES',false,true,'ATENCAO',80),
 ('DEPLOY_COM_INCIDENTE','Deploy com incidente','Deploy relacionado a incidente.','DEPLOY',false,true,'ALTA',90),
 ('BACKUP_FALHOU','Backup falhou','Rotina de backup falhou.','BACKUP',true,false,'CRITICA',91),
 ('SISTEMA','Mensagem de sistema','Mensagens administrativas gerais.','SISTEMA',false,true,'INFO',99)
ON CONFLICT (tipo) DO UPDATE SET
  nome_exibicao=EXCLUDED.nome_exibicao,
  descricao=EXCLUDED.descricao,
  categoria=EXCLUDED.categoria,
  obrigatoria=EXCLUDED.obrigatoria,
  silenciavel=EXCLUDED.silenciavel,
  severidade_padrao=EXCLUDED.severidade_padrao,
  ordem=EXCLUDED.ordem;

-- =========================================================
-- 3. Preferência efetiva
-- =========================================================
CREATE OR REPLACE FUNCTION public.preferencia_notificacao_efetiva(
  p_usuario_id uuid,
  p_tipo public.notif_tipo,
  p_severidade public.notif_severidade DEFAULT 'INFO'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cat record; v_pref record;
BEGIN
  SELECT * INTO v_cat FROM public.notificacao_tipos_config WHERE tipo=p_tipo;
  IF v_cat.tipo IS NULL THEN
    RETURN jsonb_build_object('habilitada',true,'obrigatoria',false,'origem','PADRAO','motivo','Tipo não catalogado');
  END IF;
  -- Regra obrigatória
  IF v_cat.obrigatoria THEN
    RETURN jsonb_build_object('habilitada',true,'obrigatoria',true,'origem','REGRA_OBRIGATORIA','motivo','Tipo obrigatório');
  END IF;
  -- Severidade alta/crítica prevalece
  IF p_severidade IN ('ALTA','CRITICA') THEN
    RETURN jsonb_build_object('habilitada',true,'obrigatoria',true,'origem','REGRA_OBRIGATORIA','motivo','Severidade '||p_severidade||' não pode ser silenciada');
  END IF;
  -- Preferência do usuário
  SELECT * INTO v_pref FROM public.preferencias_notificacao
    WHERE usuario_id=p_usuario_id AND tipo=p_tipo AND canal='INTERNO';
  IF v_pref.id IS NOT NULL THEN
    IF NOT v_pref.habilitada THEN
      RETURN jsonb_build_object('habilitada',false,'obrigatoria',false,'origem','USUARIO','motivo','Desabilitada pelo usuário');
    END IF;
    IF v_pref.silenciar_info AND p_severidade='INFO' THEN
      RETURN jsonb_build_object('habilitada',false,'obrigatoria',false,'origem','USUARIO','motivo','INFO silenciado pelo usuário');
    END IF;
    RETURN jsonb_build_object('habilitada',true,'obrigatoria',false,'origem','USUARIO','motivo','Habilitada pelo usuário');
  END IF;
  -- Padrão
  RETURN jsonb_build_object('habilitada',true,'obrigatoria',false,'origem','PADRAO','motivo','Padrão do catálogo');
END $$;
GRANT EXECUTE ON FUNCTION public.preferencia_notificacao_efetiva(uuid,public.notif_tipo,public.notif_severidade) TO authenticated;

-- =========================================================
-- 4. RPCs de preferência do usuário
-- =========================================================
CREATE OR REPLACE FUNCTION public.listar_preferencias_notificacao()
RETURNS TABLE(
  tipo public.notif_tipo,
  nome_exibicao text,
  descricao text,
  categoria text,
  obrigatoria boolean,
  silenciavel boolean,
  severidade_padrao public.notif_severidade,
  habilitada boolean,
  silenciar_info boolean,
  origem text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='insufficient_privilege'; END IF;
  RETURN QUERY
  SELECT c.tipo, c.nome_exibicao, c.descricao, c.categoria, c.obrigatoria, c.silenciavel, c.severidade_padrao,
    COALESCE(p.habilitada, true) AS habilitada,
    COALESCE(p.silenciar_info, false) AS silenciar_info,
    CASE WHEN c.obrigatoria THEN 'REGRA_OBRIGATORIA'
         WHEN p.id IS NOT NULL THEN 'USUARIO'
         ELSE 'PADRAO' END AS origem
  FROM public.notificacao_tipos_config c
  LEFT JOIN public.preferencias_notificacao p
    ON p.tipo=c.tipo AND p.usuario_id=v_uid AND p.canal='INTERNO'
  WHERE c.ativo=true
  ORDER BY c.categoria, c.ordem;
END $$;
GRANT EXECUTE ON FUNCTION public.listar_preferencias_notificacao() TO authenticated;

CREATE OR REPLACE FUNCTION public.atualizar_preferencia_notificacao(
  p_tipo public.notif_tipo,
  p_habilitada boolean,
  p_silenciar_info boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_cat record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_cat FROM public.notificacao_tipos_config WHERE tipo=p_tipo AND ativo=true;
  IF v_cat.tipo IS NULL THEN RAISE EXCEPTION 'Tipo inválido' USING ERRCODE='check_violation'; END IF;
  IF v_cat.obrigatoria AND (NOT p_habilitada OR p_silenciar_info) THEN
    PERFORM public.log_audit_event('notificacoes','ACESSO_NEGADO','preferencias_notificacao',NULL,NULL,NULL,NULL,
      jsonb_build_object('tipo',p_tipo,'motivo','Tentativa de desabilitar tipo obrigatório'),false,
      'Tipo obrigatório','api',NULL,NULL);
    RAISE EXCEPTION 'Tipo obrigatório não pode ser desabilitado' USING ERRCODE='check_violation';
  END IF;
  IF v_cat.severidade_padrao IN ('ALTA','CRITICA') AND (NOT p_habilitada OR p_silenciar_info) THEN
    RAISE EXCEPTION 'Severidade % não pode ser silenciada', v_cat.severidade_padrao USING ERRCODE='check_violation';
  END IF;

  INSERT INTO public.preferencias_notificacao(usuario_id, tipo, canal, habilitada, silenciar_info)
  VALUES (v_uid, p_tipo, 'INTERNO', p_habilitada, p_silenciar_info)
  ON CONFLICT (usuario_id, tipo, canal) DO UPDATE
    SET habilitada=EXCLUDED.habilitada,
        silenciar_info=EXCLUDED.silenciar_info,
        updated_at=now();

  PERFORM public.log_audit_event('notificacoes','UPDATE','preferencias_notificacao',NULL,NULL,NULL,NULL,
    jsonb_build_object('tipo',p_tipo,'habilitada',p_habilitada,'silenciar_info',p_silenciar_info),true,
    NULL,'api',NULL,NULL);

  RETURN jsonb_build_object('ok',true,'tipo',p_tipo,'habilitada',p_habilitada,'silenciar_info',p_silenciar_info);
END $$;
GRANT EXECUTE ON FUNCTION public.atualizar_preferencia_notificacao(public.notif_tipo,boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.restaurar_preferencias_padrao()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='insufficient_privilege'; END IF;
  WITH d AS (DELETE FROM public.preferencias_notificacao WHERE usuario_id=v_uid RETURNING 1)
  SELECT count(*) INTO v_n FROM d;
  PERFORM public.log_audit_event('notificacoes','UPDATE','preferencias_notificacao',NULL,NULL,NULL,NULL,
    jsonb_build_object('acao','restaurar_padroes','removidas',v_n),true,NULL,'api',NULL,NULL);
  RETURN v_n;
END $$;
GRANT EXECUTE ON FUNCTION public.restaurar_preferencias_padrao() TO authenticated;

-- =========================================================
-- 5. Simulador de regras (READ-ONLY)
-- =========================================================
CREATE OR REPLACE FUNCTION public.simular_regras_escalonamento(p_evento jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_readonly boolean := false;
  v_evento jsonb;
  v_origem public.notif_origem;
  v_tipo public.notif_tipo;
  v_sev public.notif_severidade;
  v_ambiente text;
  v_regras_correspondentes jsonb := '[]'::jsonb;
  v_avaliadas int := 0;
  v_correspondentes int := 0;
  v_destinatarios jsonb := '[]'::jsonb;
  v_notif_previstas int := 0;
  v_notif_obrig int := 0;
  v_notif_supr int := 0;
  v_avisos jsonb := '[]'::jsonb;
  v_erros jsonb := '[]'::jsonb;
  r record;
  v_dest_users_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='insufficient_privilege'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.has_role(v_uid,'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;
  IF public.has_role(v_uid,'compliance') AND NOT public.has_role(v_uid,'super_admin') THEN
    v_readonly := true;
  END IF;

  v_evento := COALESCE(p_evento,'{}'::jsonb);

  -- Sanitização/validação com fallbacks
  BEGIN v_origem := (v_evento->>'origem')::public.notif_origem;
  EXCEPTION WHEN OTHERS THEN v_origem := 'OPERACAO_ASSISTIDA'; v_avisos := v_avisos || to_jsonb('Origem inválida; usando OPERACAO_ASSISTIDA'::text); END;

  BEGIN v_tipo := (v_evento->>'tipo_evento')::public.notif_tipo;
  EXCEPTION WHEN OTHERS THEN
    v_erros := v_erros || to_jsonb('tipo_evento obrigatório'::text);
    RETURN jsonb_build_object('erros_validacao',v_erros,'regras_avaliadas',0,'regras_correspondentes',v_regras_correspondentes);
  END;

  BEGIN v_sev := COALESCE((v_evento->>'severidade')::public.notif_severidade,'INFO');
  EXCEPTION WHEN OTHERS THEN v_sev := 'INFO'; END;

  v_ambiente := COALESCE(v_evento->>'ambiente','producao');

  -- Avaliar regras ativas
  FOR r IN
    SELECT * FROM public.regras_escalonamento
    WHERE ativo=true
    ORDER BY prioridade
  LOOP
    v_avaliadas := v_avaliadas + 1;
    IF r.tipo_evento = v_tipo
       AND r.ambiente = v_ambiente
       AND r.origem = v_origem
       AND array_position(ARRAY['INFO','ATENCAO','ALTA','CRITICA']::text[], v_sev::text)
           >= array_position(ARRAY['INFO','ATENCAO','ALTA','CRITICA']::text[], r.severidade_minima::text)
    THEN
      v_correspondentes := v_correspondentes + 1;

      -- Contar destinatários teóricos com base em user_roles
      SELECT count(*) INTO v_dest_users_count
        FROM public.user_roles ur
       WHERE ur.role = r.papel_destino_inicial;

      IF v_dest_users_count = 0 AND r.papel_destino_inicial IS NOT NULL THEN
        v_avisos := v_avisos || to_jsonb(('Nenhum usuário elegível para papel '||r.papel_destino_inicial::text)::text);
      END IF;

      v_notif_previstas := v_notif_previstas + v_dest_users_count;

      v_regras_correspondentes := v_regras_correspondentes || jsonb_build_object(
        'regra_id', r.id,
        'nome', r.nome,
        'prioridade', r.prioridade,
        'tempo_primeiro_alerta', r.minutos_para_primeiro_alerta,
        'tempo_escalonamento', r.minutos_para_escalonamento,
        'papel_destino_inicial', r.papel_destino_inicial,
        'papel_destino_escalado', r.papel_destino_escalado,
        'repeticao', r.repetir_alerta,
        'intervalo_repeticao_minutos', r.intervalo_repeticao_minutos,
        'maximo_repeticoes', r.maximo_repeticoes,
        'destinatarios_estimados', v_dest_users_count,
        'motivo_correspondencia', format('tipo=%s ambiente=%s severidade>=%s', v_tipo, v_ambiente, r.severidade_minima)
      );

      v_destinatarios := v_destinatarios || jsonb_build_object(
        'papel', r.papel_destino_inicial,
        'usuarios', v_dest_users_count,
        'regra_id', r.id
      );
    END IF;
  END LOOP;

  -- Considerar obrigatoriedade do catálogo
  SELECT CASE WHEN c.obrigatoria OR v_sev IN ('ALTA','CRITICA') THEN v_notif_previstas ELSE 0 END
    INTO v_notif_obrig
  FROM public.notificacao_tipos_config c WHERE c.tipo=v_tipo;
  v_notif_obrig := COALESCE(v_notif_obrig, 0);

  -- Auditoria mínima (sem payload sensível)
  PERFORM public.log_audit_event('notificacoes','SIMULACAO','regras_escalonamento',NULL,NULL,NULL,NULL,
    jsonb_build_object(
      'readonly', v_readonly,
      'tipo_evento', v_tipo,
      'severidade', v_sev,
      'ambiente', v_ambiente,
      'regras_avaliadas', v_avaliadas,
      'regras_correspondentes', v_correspondentes
    ),true,NULL,'api',NULL,NULL);

  RETURN jsonb_build_object(
    'evento_normalizado', jsonb_build_object(
      'origem', v_origem, 'tipo_evento', v_tipo, 'severidade', v_sev, 'ambiente', v_ambiente,
      'prioridade', v_evento->>'prioridade', 'status_incidente', v_evento->>'status_incidente',
      'categoria', v_evento->>'categoria', 'modulo', v_evento->>'modulo',
      'possui_responsavel', v_evento->>'possui_responsavel',
      'percentual_sla_consumido', v_evento->>'percentual_sla_consumido',
      'minutos_em_aberto', v_evento->>'minutos_em_aberto'
    ),
    'regras_avaliadas', v_avaliadas,
    'regras_correspondentes', v_regras_correspondentes,
    'destinatarios_previstos', v_destinatarios,
    'notificacoes_previstas', v_notif_previstas,
    'notificacoes_obrigatorias', v_notif_obrig,
    'notificacoes_opcionais', GREATEST(v_notif_previstas - v_notif_obrig, 0),
    'notificacoes_suprimidas', v_notif_supr,
    'escalonamentos_previstos', v_correspondentes,
    'avisos', v_avisos,
    'erros_validacao', v_erros,
    'readonly', v_readonly,
    'simulado_em', now()
  );
END $$;
GRANT EXECUTE ON FUNCTION public.simular_regras_escalonamento(jsonb) TO authenticated;

-- =========================================================
-- 6. Análise de conflitos
-- =========================================================
CREATE OR REPLACE FUNCTION public.analisar_conflitos_regras_escalonamento()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb := '[]'::jsonb; r record; d record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;

  -- Regras equivalentes
  FOR r IN
    SELECT a.id AS a_id, b.id AS b_id, a.nome AS a_nome, b.nome AS b_nome
    FROM public.regras_escalonamento a
    JOIN public.regras_escalonamento b
      ON a.id < b.id
     AND a.tipo_evento=b.tipo_evento
     AND a.ambiente=b.ambiente
     AND COALESCE(a.papel_destino_inicial::text,'')=COALESCE(b.papel_destino_inicial::text,'')
    WHERE a.ativo AND b.ativo
  LOOP
    v := v || jsonb_build_object('tipo_conflito','REGRA_EQUIVALENTE','severidade','ATENCAO',
      'regra_id',r.a_id,'regra_relacionada_id',r.b_id,
      'descricao', format('Regras "%s" e "%s" têm mesmo evento e destino', r.a_nome, r.b_nome),
      'recomendacao','Consolidar ou diferenciar por severidade/prioridade');
  END LOOP;

  -- Escalonamento anterior ao primeiro alerta
  FOR r IN
    SELECT id, nome FROM public.regras_escalonamento
    WHERE ativo AND minutos_para_escalonamento IS NOT NULL
      AND minutos_para_escalonamento < minutos_para_primeiro_alerta
  LOOP
    v := v || jsonb_build_object('tipo_conflito','ESCALONAMENTO_ANTES_ALERTA','severidade','ALTA',
      'regra_id',r.id,'regra_relacionada_id',NULL,
      'descricao', format('Regra "%s": escalonamento antes do primeiro alerta', r.nome),
      'recomendacao','Ajustar minutos_para_escalonamento >= minutos_para_primeiro_alerta');
  END LOOP;

  -- Repetição sem intervalo
  FOR r IN
    SELECT id, nome FROM public.regras_escalonamento
    WHERE ativo AND repetir_alerta AND COALESCE(intervalo_repeticao_minutos,0) <= 0
  LOOP
    v := v || jsonb_build_object('tipo_conflito','REPETICAO_SEM_INTERVALO','severidade','ALTA',
      'regra_id',r.id,'regra_relacionada_id',NULL,
      'descricao', format('Regra "%s": repetição ativa sem intervalo', r.nome),
      'recomendacao','Definir intervalo_repeticao_minutos > 0');
  END LOOP;

  -- Máximo de repetições zero
  FOR r IN
    SELECT id, nome FROM public.regras_escalonamento
    WHERE ativo AND repetir_alerta AND maximo_repeticoes = 0
  LOOP
    v := v || jsonb_build_object('tipo_conflito','MAX_REPETICOES_ZERO','severidade','ATENCAO',
      'regra_id',r.id,'regra_relacionada_id',NULL,
      'descricao', format('Regra "%s": repetição ativa com máximo 0', r.nome),
      'recomendacao','Definir maximo_repeticoes > 0 ou desativar repetição');
  END LOOP;

  -- Sem destinatário
  FOR r IN
    SELECT id, nome FROM public.regras_escalonamento
    WHERE ativo AND papel_destino_inicial IS NULL
  LOOP
    v := v || jsonb_build_object('tipo_conflito','SEM_DESTINATARIO','severidade','ALTA',
      'regra_id',r.id,'regra_relacionada_id',NULL,
      'descricao', format('Regra "%s": sem papel destinatário', r.nome),
      'recomendacao','Definir papel_destino_inicial');
  END LOOP;

  -- Papel sem usuários
  FOR r IN
    SELECT re.id, re.nome, re.papel_destino_inicial
    FROM public.regras_escalonamento re
    WHERE re.ativo AND re.papel_destino_inicial IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.role=re.papel_destino_inicial)
  LOOP
    v := v || jsonb_build_object('tipo_conflito','PAPEL_SEM_USUARIOS','severidade','ALTA',
      'regra_id',r.id,'regra_relacionada_id',NULL,
      'descricao', format('Regra "%s": papel %s sem usuários', r.nome, r.papel_destino_inicial),
      'recomendacao','Atribuir usuários ao papel ou alterar destino');
  END LOOP;

  PERFORM public.log_audit_event('notificacoes','ANALISE_CONFLITOS','regras_escalonamento',NULL,NULL,NULL,NULL,
    jsonb_build_object('conflitos', jsonb_array_length(v)),true,NULL,'api',NULL,NULL);

  RETURN jsonb_build_object('total', jsonb_array_length(v), 'conflitos', v, 'analisado_em', now());
END $$;
GRANT EXECUTE ON FUNCTION public.analisar_conflitos_regras_escalonamento() TO authenticated;

-- =========================================================
-- 7. Métricas agregadas
-- =========================================================
CREATE OR REPLACE FUNCTION public.metricas_notificacoes()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance')) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN jsonb_build_object(
    'obrigatorias_24h', (SELECT count(*) FROM public.notificacoes n
       JOIN public.notificacao_tipos_config c ON c.tipo=n.tipo
       WHERE n.created_at>=now()-interval '24 hours' AND (c.obrigatoria OR n.severidade IN ('ALTA','CRITICA'))),
    'tipos_mais_desativados', (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC),'[]'::jsonb) FROM (
      SELECT tipo::text AS tipo, count(*) AS total
      FROM public.preferencias_notificacao WHERE habilitada=false
      GROUP BY tipo ORDER BY count(*) DESC LIMIT 10
    ) t),
    'usuarios_com_preferencias', (SELECT count(DISTINCT usuario_id) FROM public.preferencias_notificacao),
    'regras_ativas', (SELECT count(*) FROM public.regras_escalonamento WHERE ativo),
    'ultima_simulacao', (SELECT max(created_at) FROM public.audit_logs WHERE acao='SIMULACAO'),
    'gerado_em', now()
  );
END $$;
GRANT EXECUTE ON FUNCTION public.metricas_notificacoes() TO authenticated;
