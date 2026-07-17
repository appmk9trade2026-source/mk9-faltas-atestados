
-- =====================================================================
-- ETAPA 11 · MÓDULO: TIPOS DE AUSÊNCIA E QUANTIDADE DE DIAS
-- =====================================================================

-- Enum de tipos de período
DO $$ BEGIN
  CREATE TYPE public.tipo_periodo_ausencia AS ENUM ('DIAS','HORAS','MEIO_PERIODO','PERIODO_INTEGRAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- TABELA: tipos_ausencia
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tipos_ausencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text,
  cor text,
  icone text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  exige_documento boolean NOT NULL DEFAULT false,
  permite_cid boolean NOT NULL DEFAULT false,
  permite_acidente boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_ausencia TO authenticated;
GRANT ALL ON public.tipos_ausencia TO service_role;
ALTER TABLE public.tipos_ausencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tipos_ausencia_select" ON public.tipos_ausencia
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'rh')
    OR public.has_role(auth.uid(),'compliance')
  );
CREATE POLICY "tipos_ausencia_admin_ins" ON public.tipos_ausencia
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tipos_ausencia_admin_upd" ON public.tipos_ausencia
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
-- Sem policy de DELETE: exclusão física proibida (soft-delete via ativo=false).

CREATE TRIGGER trg_tipos_ausencia_updated
  BEFORE UPDATE ON public.tipos_ausencia
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_tipos_ausencia_audit
  AFTER INSERT OR UPDATE ON public.tipos_ausencia
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('CONFIGURACOES','TIPO_AUSENCIA');

-- Bloqueia alteração do código depois de criado
CREATE OR REPLACE FUNCTION public.tg_tipos_ausencia_lock_codigo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.codigo IS DISTINCT FROM OLD.codigo THEN
    RAISE EXCEPTION 'O código interno do tipo de ausência não pode ser alterado.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_tipos_ausencia_lock_codigo
  BEFORE UPDATE ON public.tipos_ausencia
  FOR EACH ROW EXECUTE FUNCTION public.tg_tipos_ausencia_lock_codigo();

-- =====================================================================
-- TABELA: opcoes_periodo_ausencia
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.opcoes_periodo_ausencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  quantidade_dias integer,
  tipo_periodo public.tipo_periodo_ausencia NOT NULL DEFAULT 'DIAS',
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opcoes_periodo_ausencia TO authenticated;
GRANT ALL ON public.opcoes_periodo_ausencia TO service_role;
ALTER TABLE public.opcoes_periodo_ausencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opcoes_periodo_select" ON public.opcoes_periodo_ausencia
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'rh')
    OR public.has_role(auth.uid(),'compliance')
  );
CREATE POLICY "opcoes_periodo_admin_ins" ON public.opcoes_periodo_ausencia
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "opcoes_periodo_admin_upd" ON public.opcoes_periodo_ausencia
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_opcoes_periodo_updated
  BEFORE UPDATE ON public.opcoes_periodo_ausencia
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_opcoes_periodo_audit
  AFTER INSERT OR UPDATE ON public.opcoes_periodo_ausencia
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('CONFIGURACOES','OPCAO_PERIODO');

-- =====================================================================
-- TABELA: tipo_ausencia_opcoes_periodo (associativa)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tipo_ausencia_opcoes_periodo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_ausencia_id uuid NOT NULL REFERENCES public.tipos_ausencia(id) ON DELETE CASCADE,
  opcao_periodo_id uuid NOT NULL REFERENCES public.opcoes_periodo_ausencia(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (tipo_ausencia_id, opcao_periodo_id)
);

CREATE INDEX IF NOT EXISTS tipo_ausencia_opcoes_tipo_idx
  ON public.tipo_ausencia_opcoes_periodo(tipo_ausencia_id);
CREATE INDEX IF NOT EXISTS tipo_ausencia_opcoes_opcao_idx
  ON public.tipo_ausencia_opcoes_periodo(opcao_periodo_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipo_ausencia_opcoes_periodo TO authenticated;
GRANT ALL ON public.tipo_ausencia_opcoes_periodo TO service_role;
ALTER TABLE public.tipo_ausencia_opcoes_periodo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tao_select" ON public.tipo_ausencia_opcoes_periodo
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'rh')
    OR public.has_role(auth.uid(),'compliance')
  );
CREATE POLICY "tao_admin_ins" ON public.tipo_ausencia_opcoes_periodo
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tao_admin_upd" ON public.tipo_ausencia_opcoes_periodo
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tao_admin_del" ON public.tipo_ausencia_opcoes_periodo
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_tao_audit
  AFTER INSERT OR UPDATE ON public.tipo_ausencia_opcoes_periodo
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('CONFIGURACOES','TIPO_AUSENCIA_OPCAO');

-- =====================================================================
-- SNAPSHOT HISTÓRICO em public.ausencias
-- =====================================================================
ALTER TABLE public.ausencias
  ADD COLUMN IF NOT EXISTS tipo_ausencia_id uuid REFERENCES public.tipos_ausencia(id),
  ADD COLUMN IF NOT EXISTS tipo_ausencia_codigo text,
  ADD COLUMN IF NOT EXISTS tipo_ausencia_nome text,
  ADD COLUMN IF NOT EXISTS opcao_periodo_id uuid REFERENCES public.opcoes_periodo_ausencia(id),
  ADD COLUMN IF NOT EXISTS opcao_periodo_codigo text,
  ADD COLUMN IF NOT EXISTS opcao_periodo_nome text,
  ADD COLUMN IF NOT EXISTS quantidade_dias_calculada integer;

CREATE INDEX IF NOT EXISTS ausencias_tipo_ausencia_id_idx ON public.ausencias(tipo_ausencia_id);
CREATE INDEX IF NOT EXISTS ausencias_opcao_periodo_id_idx  ON public.ausencias(opcao_periodo_id);

-- =====================================================================
-- Validação da combinação tipo + período no banco
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_ausencias_valida_tipo_periodo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_tipo_cod text;
  v_tipo_nome text;
  v_tipo_ativo boolean;
  v_op_cod text;
  v_op_nome text;
  v_op_ativo boolean;
  v_op_qtd int;
  v_vinculo_ativo boolean;
BEGIN
  IF NEW.tipo_ausencia_id IS NULL OR NEW.opcao_periodo_id IS NULL THEN
    -- Snapshot ainda não definido (registros legados). Não valida.
    RETURN NEW;
  END IF;

  SELECT codigo, nome, ativo INTO v_tipo_cod, v_tipo_nome, v_tipo_ativo
    FROM public.tipos_ausencia WHERE id = NEW.tipo_ausencia_id;
  IF v_tipo_cod IS NULL THEN
    RAISE EXCEPTION 'Tipo de ausência não encontrado.' USING ERRCODE='foreign_key_violation';
  END IF;

  SELECT codigo, nome, ativo, quantidade_dias INTO v_op_cod, v_op_nome, v_op_ativo, v_op_qtd
    FROM public.opcoes_periodo_ausencia WHERE id = NEW.opcao_periodo_id;
  IF v_op_cod IS NULL THEN
    RAISE EXCEPTION 'Opção de período não encontrada.' USING ERRCODE='foreign_key_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_tipo_ativo THEN
      RAISE EXCEPTION 'Tipo de ausência inativo.' USING ERRCODE='check_violation';
    END IF;
    IF NOT v_op_ativo THEN
      RAISE EXCEPTION 'Opção de período inativa.' USING ERRCODE='check_violation';
    END IF;
  END IF;

  SELECT ativo INTO v_vinculo_ativo
    FROM public.tipo_ausencia_opcoes_periodo
    WHERE tipo_ausencia_id = NEW.tipo_ausencia_id
      AND opcao_periodo_id = NEW.opcao_periodo_id;
  IF v_vinculo_ativo IS NULL OR v_vinculo_ativo = false THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Combinação tipo/período não autorizada.' USING ERRCODE='check_violation';
    END IF;
  END IF;

  -- Snapshot imutável: sempre preenche com valores atuais no INSERT.
  IF TG_OP = 'INSERT' THEN
    NEW.tipo_ausencia_codigo := v_tipo_cod;
    NEW.tipo_ausencia_nome := v_tipo_nome;
    NEW.opcao_periodo_codigo := v_op_cod;
    NEW.opcao_periodo_nome := v_op_nome;
    NEW.quantidade_dias_calculada := v_op_qtd;
  ELSE
    -- Nunca sobrescreve snapshot histórico no UPDATE
    NEW.tipo_ausencia_codigo := OLD.tipo_ausencia_codigo;
    NEW.tipo_ausencia_nome := OLD.tipo_ausencia_nome;
    NEW.opcao_periodo_codigo := OLD.opcao_periodo_codigo;
    NEW.opcao_periodo_nome := OLD.opcao_periodo_nome;
    NEW.quantidade_dias_calculada := OLD.quantidade_dias_calculada;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ausencias_valida_tipo_periodo ON public.ausencias;
CREATE TRIGGER trg_ausencias_valida_tipo_periodo
  BEFORE INSERT OR UPDATE ON public.ausencias
  FOR EACH ROW EXECUTE FUNCTION public.tg_ausencias_valida_tipo_periodo();

-- =====================================================================
-- SEED · 19 TIPOS OFICIAIS
-- =====================================================================
INSERT INTO public.tipos_ausencia (codigo, nome, descricao, ordem, exige_documento, permite_cid, permite_acidente, cor, icone) VALUES
  ('ATESTADO_MEDICO',         'ATESTADO MEDICO (Conforme descrição do documento)',      'Atestado médico conforme documento apresentado.', 10, true,  true,  false, '#2563eb', 'Stethoscope'),
  ('ATESTADO_ACOMPANHAMENTO', 'ATESTADO DE ACOMPANHAMENTO (Filho menor de idade)',      'Acompanhamento de filho menor de idade em consulta médica.', 20, true, true, false, '#0ea5e9', 'HeartPulse'),
  ('ATESTADO_ODONTOLOGICO',   'ATESTADO ODONTOLÓGICO',                                   'Atestado odontológico.', 30, true, true, false, '#06b6d4', 'Smile'),
  ('ATESTADO_COMPARECIMENTO', 'ATESTADO DE COMPARECIMENTO (Horas)',                      'Comprovante de comparecimento em horas.', 40, true, false, false, '#14b8a6', 'Clock'),
  ('DECLARACAO_COMPARECIMENTO','DECLARAÇÃO DE COMPARECIMENTO',                           'Declaração de comparecimento a serviço ou consulta.', 50, true, false, false, '#22c55e', 'FileCheck'),
  ('FALTA_INJUSTIFICADA',     'FALTA INJUSTIFICADA',                                     'Falta sem justificativa apresentada.', 60, false, false, false, '#ef4444', 'CircleX'),
  ('FALTA_JUSTIFICADA',       'FALTA JUSTIFICADA',                                       'Falta com justificativa apresentada.', 70, false, false, false, '#f59e0b', 'CircleAlert'),
  ('LICENCA_NOJO',            'LICENÇA NOJO (2 dias consecutivos)',                      'Licença por falecimento de familiar.', 80, false, false, false, '#64748b', 'HeartCrack'),
  ('LICENCA_GALA',            'LICENÇA GALA - CASAMENTO (3 dias consecutivos)',          'Licença gala por casamento.', 90, false, false, false, '#a855f7', 'Heart'),
  ('LICENCA_PATERNIDADE',     'LICENÇA PATERNIDADE (5 dias consecutivos)',               'Licença paternidade.', 100, false, false, false, '#3b82f6', 'Baby'),
  ('LICENCA_MATERNIDADE',     'LICENÇA MATERNIDADE (120 dias consecutivos)',             'Licença maternidade.', 110, true, false, false, '#ec4899', 'Baby'),
  ('AFASTAMENTO_INSS_DOENCA', 'AFASTAMENTO INSS - DOENÇA',                                'Afastamento previdenciário por doença.', 120, true, true, false, '#dc2626', 'Activity'),
  ('AFASTAMENTO_INSS_ACIDENTE','AFASTAMENTO INSS - ACIDENTE',                             'Afastamento previdenciário por acidente.', 130, true, true, true,  '#b91c1c', 'ShieldAlert'),
  ('SUSPENSAO_DISCIPLINAR',   'SUSPENSÃO DISCIPLINAR',                                   'Suspensão aplicada por medida disciplinar.', 140, false, false, false, '#7c3aed', 'Ban'),
  ('ABANDONO_EMPREGO',        'ABANDONO DE EMPREGO',                                     'Registro de abandono de emprego.', 150, false, false, false, '#111827', 'UserX'),
  ('DOACAO_SANGUE',           'DOAÇÃO DE SANGUE',                                        'Ausência por doação de sangue.', 160, true, false, false, '#e11d48', 'Droplet'),
  ('ALISTAMENTO_MILITAR',     'ALISTAMENTO MILITAR',                                     'Ausência por alistamento militar.', 170, true, false, false, '#166534', 'Flag'),
  ('CONVOCACAO_JUDICIAL',     'CONVOCAÇÃO JUDICIAL',                                     'Ausência por convocação judicial.', 180, true, false, false, '#0f172a', 'Gavel'),
  ('OUTROS',                  'OUTROS',                                                   'Outros tipos de ausência.', 999, false, false, false, '#6b7280', 'MoreHorizontal')
ON CONFLICT (codigo) DO NOTHING;

-- =====================================================================
-- SEED · 29 OPÇÕES DE PERÍODO
-- =====================================================================
INSERT INTO public.opcoes_periodo_ausencia (codigo, nome, quantidade_dias, tipo_periodo, ordem) VALUES
  ('1_DIA',   '1 DIA',   1,   'DIAS', 10),
  ('2_DIAS',  '2 DIAS',  2,   'DIAS', 20),
  ('3_DIAS',  '3 DIAS',  3,   'DIAS', 30),
  ('4_DIAS',  '4 DIAS',  4,   'DIAS', 40),
  ('5_DIAS',  '5 DIAS',  5,   'DIAS', 50),
  ('6_DIAS',  '6 DIAS',  6,   'DIAS', 60),
  ('7_DIAS',  '7 DIAS',  7,   'DIAS', 70),
  ('8_DIAS',  '8 DIAS',  8,   'DIAS', 80),
  ('9_DIAS',  '9 DIAS',  9,   'DIAS', 90),
  ('10_DIAS', '10 DIAS', 10,  'DIAS', 100),
  ('11_DIAS', '11 DIAS', 11,  'DIAS', 110),
  ('12_DIAS', '12 DIAS', 12,  'DIAS', 120),
  ('13_DIAS', '13 DIAS', 13,  'DIAS', 130),
  ('14_DIAS', '14 DIAS', 14,  'DIAS', 140),
  ('15_DIAS', '15 DIAS', 15,  'DIAS', 150),
  ('16_DIAS', '16 DIAS', 16,  'DIAS', 160),
  ('17_DIAS', '17 DIAS', 17,  'DIAS', 170),
  ('18_DIAS', '18 DIAS', 18,  'DIAS', 180),
  ('19_DIAS', '19 DIAS', 19,  'DIAS', 190),
  ('20_DIAS', '20 DIAS', 20,  'DIAS', 200),
  ('21_DIAS', '21 DIAS', 21,  'DIAS', 210),
  ('30_DIAS', '30 DIAS', 30,  'DIAS', 300),
  ('45_DIAS', '45 DIAS', 45,  'DIAS', 450),
  ('60_DIAS', '60 DIAS', 60,  'DIAS', 600),
  ('90_DIAS', '90 DIAS', 90,  'DIAS', 900),
  ('120_DIAS','120 DIAS (LICENÇA MATERNIDADE)',            120, 'DIAS', 1200),
  ('180_DIAS','180 DIAS (LICENÇA MATERNIDADE ESTENDIDA)',  180, 'DIAS', 1800),
  ('PERIODO_INTEGRAL','PERÍODO INTEGRAL (AFASTAMENTO INSS)', NULL, 'PERIODO_INTEGRAL', 5000),
  ('MEIO_PERIODO',    'MEIO PERÍODO (HORAS)',                NULL, 'MEIO_PERIODO',     5100)
ON CONFLICT (codigo) DO NOTHING;

-- =====================================================================
-- SEED · REGRAS INICIAIS (tipo × período)
-- =====================================================================
CREATE OR REPLACE FUNCTION public._seed_vinculo(_tipo text, _opcoes text[])
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_t uuid; v_o uuid; c text;
BEGIN
  SELECT id INTO v_t FROM public.tipos_ausencia WHERE codigo = _tipo;
  IF v_t IS NULL THEN RETURN; END IF;
  FOREACH c IN ARRAY _opcoes LOOP
    SELECT id INTO v_o FROM public.opcoes_periodo_ausencia WHERE codigo = c;
    IF v_o IS NOT NULL THEN
      INSERT INTO public.tipo_ausencia_opcoes_periodo (tipo_ausencia_id, opcao_periodo_id, ativo)
      VALUES (v_t, v_o, true)
      ON CONFLICT (tipo_ausencia_id, opcao_periodo_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  dias_1a21 text[] := ARRAY['1_DIA','2_DIAS','3_DIAS','4_DIAS','5_DIAS','6_DIAS','7_DIAS','8_DIAS','9_DIAS','10_DIAS','11_DIAS','12_DIAS','13_DIAS','14_DIAS','15_DIAS','16_DIAS','17_DIAS','18_DIAS','19_DIAS','20_DIAS','21_DIAS'];
  dias_atestado_medico text[] := ARRAY['1_DIA','2_DIAS','3_DIAS','4_DIAS','5_DIAS','6_DIAS','7_DIAS','8_DIAS','9_DIAS','10_DIAS','11_DIAS','12_DIAS','13_DIAS','14_DIAS','15_DIAS','16_DIAS','17_DIAS','18_DIAS','19_DIAS','20_DIAS','21_DIAS','30_DIAS','45_DIAS','60_DIAS','90_DIAS'];
  dias_suspensao text[] := ARRAY['1_DIA','2_DIAS','3_DIAS','4_DIAS','5_DIAS','6_DIAS','7_DIAS','8_DIAS','9_DIAS','10_DIAS','11_DIAS','12_DIAS','13_DIAS','14_DIAS','15_DIAS','16_DIAS','17_DIAS','18_DIAS','19_DIAS','20_DIAS','21_DIAS','30_DIAS'];
  inss text[] := ARRAY['PERIODO_INTEGRAL','15_DIAS','30_DIAS','45_DIAS','60_DIAS','90_DIAS'];
  todas text[];
BEGIN
  PERFORM public._seed_vinculo('ATESTADO_MEDICO', dias_atestado_medico);
  PERFORM public._seed_vinculo('ATESTADO_ACOMPANHAMENTO', dias_1a21);
  PERFORM public._seed_vinculo('ATESTADO_ODONTOLOGICO', dias_1a21);
  PERFORM public._seed_vinculo('ATESTADO_COMPARECIMENTO', ARRAY['MEIO_PERIODO','1_DIA']);
  PERFORM public._seed_vinculo('DECLARACAO_COMPARECIMENTO', ARRAY['MEIO_PERIODO','1_DIA']);
  PERFORM public._seed_vinculo('FALTA_INJUSTIFICADA', dias_1a21);
  PERFORM public._seed_vinculo('FALTA_JUSTIFICADA', dias_1a21);
  PERFORM public._seed_vinculo('LICENCA_NOJO', ARRAY['2_DIAS']);
  PERFORM public._seed_vinculo('LICENCA_GALA', ARRAY['3_DIAS']);
  PERFORM public._seed_vinculo('LICENCA_PATERNIDADE', ARRAY['5_DIAS']);
  PERFORM public._seed_vinculo('LICENCA_MATERNIDADE', ARRAY['120_DIAS','180_DIAS']);
  PERFORM public._seed_vinculo('AFASTAMENTO_INSS_DOENCA', inss);
  PERFORM public._seed_vinculo('AFASTAMENTO_INSS_ACIDENTE', inss);
  PERFORM public._seed_vinculo('SUSPENSAO_DISCIPLINAR', dias_suspensao);
  PERFORM public._seed_vinculo('ABANDONO_EMPREGO', ARRAY['PERIODO_INTEGRAL']);
  PERFORM public._seed_vinculo('DOACAO_SANGUE', ARRAY['1_DIA']);
  PERFORM public._seed_vinculo('ALISTAMENTO_MILITAR', ARRAY['MEIO_PERIODO','1_DIA']);
  PERFORM public._seed_vinculo('CONVOCACAO_JUDICIAL', ARRAY['MEIO_PERIODO','1_DIA','2_DIAS','3_DIAS']);

  SELECT array_agg(codigo) INTO todas FROM public.opcoes_periodo_ausencia WHERE ativo = true;
  PERFORM public._seed_vinculo('OUTROS', todas);
END $$;

DROP FUNCTION public._seed_vinculo(text, text[]);

-- =====================================================================
-- RPC · Opções permitidas para um tipo (usado pelo frontend)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_opcoes_periodo_por_tipo(_tipo_id uuid)
RETURNS TABLE(id uuid, codigo text, nome text, quantidade_dias integer, tipo_periodo public.tipo_periodo_ausencia, ordem integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT o.id, o.codigo, o.nome, o.quantidade_dias, o.tipo_periodo, o.ordem
  FROM public.tipo_ausencia_opcoes_periodo tao
  JOIN public.opcoes_periodo_ausencia o ON o.id = tao.opcao_periodo_id
  WHERE tao.tipo_ausencia_id = _tipo_id
    AND tao.ativo = true
    AND o.ativo = true
  ORDER BY o.ordem ASC, o.nome ASC
$$;
