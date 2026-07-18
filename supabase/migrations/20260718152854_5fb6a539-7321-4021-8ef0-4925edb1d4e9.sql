
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Coluna opcional de telefone WhatsApp no profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefone_whatsapp text;

-- 2) Enums
DO $$ BEGIN CREATE TYPE public.whatsapp_publico AS ENUM ('COLABORADOR','RH','SUPERVISOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.whatsapp_status AS ENUM (
  'PENDENTE','PROCESSANDO','ENVIADO','ENTREGUE','LIDO',
  'FALHOU_TEMPORARIO','FALHOU_DEFINITIVO','CANCELADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.whatsapp_prioridade AS ENUM ('NORMAL','ALTA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.whatsapp_provider AS ENUM ('EVOLUTION_API');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.whatsapp_modo AS ENUM ('DESATIVADO','HOMOLOGACAO','PRODUCAO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.whatsapp_base_envio AS ENUM ('OPERACIONAL','CONSENTIMENTO','DESABILITADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) updated_at helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at_whatsapp()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 4) Fallback unaccent
CREATE OR REPLACE FUNCTION public.unaccent_if_available(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  RETURN translate(coalesce(p,''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN');
END; $$;

-- 5) provider_config
CREATE TABLE IF NOT EXISTS public.whatsapp_provider_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.whatsapp_provider NOT NULL DEFAULT 'EVOLUTION_API',
  instance_name text,
  enabled boolean NOT NULL DEFAULT false,
  modo public.whatsapp_modo NOT NULL DEFAULT 'DESATIVADO',
  base_url_public_label text,
  timeout_ms integer NOT NULL DEFAULT 15000,
  max_tentativas integer NOT NULL DEFAULT 5,
  retry_base_segundos integer NOT NULL DEFAULT 30,
  retry_max_segundos integer NOT NULL DEFAULT 3600,
  batch_size integer NOT NULL DEFAULT 20,
  webhook_enabled boolean NOT NULL DEFAULT false,
  homologacao_allowlist text[] NOT NULL DEFAULT ARRAY[]::text[],
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_provider_config TO authenticated;
GRANT ALL ON public.whatsapp_provider_config TO service_role;
ALTER TABLE public.whatsapp_provider_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_provider_super_admin_all" ON public.whatsapp_provider_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "wa_provider_compliance_select" ON public.whatsapp_provider_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'compliance'));
CREATE TRIGGER trg_wa_provider_updated_at BEFORE UPDATE ON public.whatsapp_provider_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_whatsapp();

-- 6) templates
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  versao integer NOT NULL DEFAULT 1,
  publico public.whatsapp_publico NOT NULL,
  nome text NOT NULL,
  conteudo text NOT NULL,
  variaveis_permitidas text[] NOT NULL DEFAULT ARRAY[]::text[],
  ativo boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (codigo, versao)
);
CREATE INDEX IF NOT EXISTS wa_templates_publico_ativo_idx ON public.whatsapp_templates (publico, ativo);
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_templates_super_admin_all" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "wa_templates_compliance_select" ON public.whatsapp_templates
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'compliance'));
CREATE POLICY "wa_templates_rh_select_ativos" ON public.whatsapp_templates
  FOR SELECT TO authenticated USING (ativo = true AND public.has_role(auth.uid(), 'rh'));
CREATE TRIGGER trg_wa_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_whatsapp();

-- 7) Validação privacidade colaborador
CREATE OR REPLACE FUNCTION public.validar_template_colaborador_whatsapp(
  p_conteudo text, p_variaveis text[]
) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_normalizado text;
  v_var text;
  v_termo text;
  v_proibidas text[] := ARRAY[
    'falta','atestado','categoria','motivo','cid','diagnostico',
    'documento','observacao','supervisor','duracao','medico','doenca','acidente'
  ];
BEGIN
  v_normalizado := lower(public.unaccent_if_available(coalesce(p_conteudo,'')));
  FOREACH v_termo IN ARRAY v_proibidas LOOP
    IF v_normalizado ~ ('\m' || v_termo || '\M') THEN
      RAISE EXCEPTION 'Template do colaborador contém termo proibido: %', v_termo
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF p_variaveis IS NOT NULL THEN
    FOREACH v_var IN ARRAY p_variaveis LOOP
      FOREACH v_termo IN ARRAY v_proibidas LOOP
        IF lower(public.unaccent_if_available(v_var)) ~ ('\m' || v_termo || '\M') THEN
          RAISE EXCEPTION 'Variável proibida no template colaborador: %', v_var
            USING ERRCODE = 'check_violation';
        END IF;
      END LOOP;
    END LOOP;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_validar_template_colaborador()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.publico = 'COLABORADOR' THEN
    PERFORM public.validar_template_colaborador_whatsapp(NEW.conteudo, NEW.variaveis_permitidas);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_wa_template_privacy
  BEFORE INSERT OR UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_validar_template_colaborador();

-- 8) Normalização telefone
CREATE OR REPLACE FUNCTION public.normalizar_telefone_whatsapp(p_telefone text)
RETURNS TABLE (
  telefone_normalizado text,
  telefone_mascarado text,
  telefone_hash text,
  valido boolean,
  motivo_invalido text
) LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_digits text; v_ddi text; v_ddd text; v_num text;
BEGIN
  IF p_telefone IS NULL OR btrim(p_telefone) = '' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, false, 'TELEFONE_VAZIO'; RETURN;
  END IF;
  v_digits := regexp_replace(p_telefone, '\D', '', 'g');
  IF length(v_digits) BETWEEN 10 AND 11 THEN
    v_digits := '55' || v_digits;
  END IF;
  IF length(v_digits) NOT BETWEEN 12 AND 13 THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, false, 'FORMATO_INVALIDO'; RETURN;
  END IF;
  v_ddi := substring(v_digits from 1 for 2);
  v_ddd := substring(v_digits from 3 for 2);
  v_num := substring(v_digits from 5);
  IF v_ddi <> '55' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, false, 'DDI_NAO_SUPORTADO'; RETURN;
  END IF;
  IF v_ddd::int < 11 OR v_ddd::int > 99 THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, false, 'DDD_INVALIDO'; RETURN;
  END IF;
  IF length(v_num) NOT BETWEEN 8 AND 9 THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, false, 'NUMERO_INVALIDO'; RETURN;
  END IF;
  RETURN QUERY SELECT
    v_digits,
    '+' || v_ddi || ' (' || v_ddd || ') ****-' || right(v_num, 4),
    encode(digest(v_digits, 'sha256'), 'hex'),
    true,
    NULL::text;
END; $$;

-- 9) whatsapp_destinatario_config
CREATE TABLE IF NOT EXISTS public.whatsapp_destinatario_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_destinatario public.whatsapp_publico NOT NULL,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  telefone_hash text NOT NULL,
  canal_habilitado boolean NOT NULL DEFAULT true,
  base_envio public.whatsapp_base_envio NOT NULL DEFAULT 'OPERACIONAL',
  consentimento_registrado_em timestamptz,
  consentimento_origem text,
  bloqueado_em timestamptz,
  motivo_bloqueio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (usuario_id IS NOT NULL OR colaborador_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS wa_dest_unique_idx
  ON public.whatsapp_destinatario_config
  (tipo_destinatario, telefone_hash, coalesce(usuario_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(colaborador_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_destinatario_config TO authenticated;
GRANT ALL ON public.whatsapp_destinatario_config TO service_role;
ALTER TABLE public.whatsapp_destinatario_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_dest_super_admin_all" ON public.whatsapp_destinatario_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "wa_dest_compliance_select" ON public.whatsapp_destinatario_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'compliance'));
CREATE TRIGGER trg_wa_dest_updated_at BEFORE UPDATE ON public.whatsapp_destinatario_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_whatsapp();

-- 10) whatsapp_outbox
CREATE TABLE IF NOT EXISTS public.whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_tipo text NOT NULL,
  evento_id text NOT NULL,
  ausencia_id uuid REFERENCES public.ausencias(id) ON DELETE RESTRICT,
  publico public.whatsapp_publico NOT NULL,
  destinatario_usuario_id uuid REFERENCES auth.users(id),
  destinatario_colaborador_id uuid REFERENCES public.colaboradores(id),
  telefone_hash text NOT NULL,
  telefone_mascarado text NOT NULL,
  telefone_criptografado text,
  template_id uuid NOT NULL REFERENCES public.whatsapp_templates(id),
  template_codigo text NOT NULL,
  template_versao integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  status public.whatsapp_status NOT NULL DEFAULT 'PENDENTE',
  prioridade public.whatsapp_prioridade NOT NULL DEFAULT 'NORMAL',
  tentativas integer NOT NULL DEFAULT 0,
  max_tentativas integer NOT NULL DEFAULT 5,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  provider public.whatsapp_provider NOT NULL DEFAULT 'EVOLUTION_API',
  provider_instance text,
  provider_message_id text,
  ultimo_erro_codigo text,
  ultimo_erro_resumido text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz,
  enviado_em timestamptz,
  confirmado_em timestamptz,
  falhou_em timestamptz
);
CREATE INDEX IF NOT EXISTS wa_outbox_status_prox_idx
  ON public.whatsapp_outbox (status, proxima_tentativa_em)
  WHERE status IN ('PENDENTE','FALHOU_TEMPORARIO');
CREATE INDEX IF NOT EXISTS wa_outbox_ausencia_idx ON public.whatsapp_outbox (ausencia_id);
CREATE INDEX IF NOT EXISTS wa_outbox_provider_msg_idx ON public.whatsapp_outbox (provider_message_id);
CREATE INDEX IF NOT EXISTS wa_outbox_created_idx ON public.whatsapp_outbox (created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_outbox TO authenticated;
GRANT ALL ON public.whatsapp_outbox TO service_role;
ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_outbox_super_admin_select" ON public.whatsapp_outbox
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "wa_outbox_compliance_select" ON public.whatsapp_outbox
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'compliance'));
CREATE POLICY "wa_outbox_rh_select" ON public.whatsapp_outbox
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'rh'));

CREATE OR REPLACE FUNCTION public.tg_wa_outbox_no_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'whatsapp_outbox: DELETE bloqueado — use RPC de cancelamento'; END; $$;
CREATE TRIGGER trg_wa_outbox_no_delete BEFORE DELETE ON public.whatsapp_outbox
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_outbox_no_delete();

-- 11) whatsapp_outbox_eventos (append-only)
CREATE TABLE IF NOT EXISTS public.whatsapp_outbox_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.whatsapp_outbox(id) ON DELETE RESTRICT,
  evento text NOT NULL,
  status_anterior public.whatsapp_status,
  status_novo public.whatsapp_status,
  provider_message_id text,
  codigo text,
  mensagem_resumida text,
  metadata_segura jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_outbox_eventos_outbox_idx
  ON public.whatsapp_outbox_eventos (outbox_id, created_at DESC);
GRANT SELECT, INSERT ON public.whatsapp_outbox_eventos TO authenticated;
GRANT ALL ON public.whatsapp_outbox_eventos TO service_role;
ALTER TABLE public.whatsapp_outbox_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_outbox_ev_super_admin_select" ON public.whatsapp_outbox_eventos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "wa_outbox_ev_compliance_select" ON public.whatsapp_outbox_eventos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'compliance'));
CREATE POLICY "wa_outbox_ev_rh_select" ON public.whatsapp_outbox_eventos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'rh'));

CREATE OR REPLACE FUNCTION public.tg_wa_outbox_ev_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'whatsapp_outbox_eventos é append-only'; END; $$;
CREATE TRIGGER trg_wa_outbox_ev_no_update BEFORE UPDATE ON public.whatsapp_outbox_eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_outbox_ev_immutable();
CREATE TRIGGER trg_wa_outbox_ev_no_delete BEFORE DELETE ON public.whatsapp_outbox_eventos
  FOR EACH ROW EXECUTE FUNCTION public.tg_wa_outbox_ev_immutable();

-- 12) Seeds: provider desativado + 3 templates iniciais
INSERT INTO public.whatsapp_provider_config (provider, enabled, modo, instance_name, singleton)
VALUES ('EVOLUTION_API', false, 'DESATIVADO', NULL, true)
ON CONFLICT (singleton) DO NOTHING;

INSERT INTO public.whatsapp_templates (codigo, versao, publico, nome, conteudo, variaveis_permitidas, ativo)
VALUES
  ('AUSENCIA_LANCADA_COLABORADOR_V1', 1, 'COLABORADOR',
   'Confirmação genérica ao colaborador (v1)',
   'Olá, {{primeiro_nome}}. Informamos que um novo lançamento foi registrado em seu cadastro em {{data_registro}}. Em caso de dúvidas, entre em contato com o RH.',
   ARRAY['primeiro_nome','data_registro'],
   true),
  ('AUSENCIA_LANCADA_RH_V1', 1, 'RH',
   'Aviso operacional ao RH (v1)',
   'Novo lançamento registrado. Colaborador: {{colaborador_nome}} ({{matricula}}). Empresa: {{empresa}} · Projeto: {{projeto}}. Categoria: {{categoria}} · Período: {{periodo}}. Data: {{data_registro}}. Supervisor: {{supervisor_nome}}. Status: {{status}}. Protocolo: {{protocolo}}.',
   ARRAY['colaborador_nome','matricula','empresa','projeto','categoria','periodo','data_registro','supervisor_nome','status','protocolo'],
   true),
  ('AUSENCIA_LANCADA_SUPERVISOR_V1', 1, 'SUPERVISOR',
   'Confirmação ao Supervisor (v1)',
   'Lançamento registrado com sucesso. Colaborador: {{colaborador_nome}} · Empresa: {{empresa}} · Projeto: {{projeto}}. Categoria: {{categoria}} · Período: {{periodo}}. Status inicial: {{status}}. Protocolo: {{protocolo}}.',
   ARRAY['colaborador_nome','empresa','projeto','categoria','periodo','status','protocolo'],
   true)
ON CONFLICT (codigo, versao) DO NOTHING;

-- 13) Grants finais das funções desta fase
REVOKE ALL ON FUNCTION public.normalizar_telefone_whatsapp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validar_template_colaborador_whatsapp(text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unaccent_if_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalizar_telefone_whatsapp(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validar_template_colaborador_whatsapp(text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unaccent_if_available(text) TO authenticated, service_role;
