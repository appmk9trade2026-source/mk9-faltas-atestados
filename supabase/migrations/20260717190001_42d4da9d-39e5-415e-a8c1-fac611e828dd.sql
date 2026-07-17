
-- 1) Tabela de categorias analíticas
CREATE TABLE IF NOT EXISTS public.categorias_ausencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  cor text,
  icone text,
  ordem int NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias_ausencia TO authenticated;
GRANT ALL ON public.categorias_ausencia TO service_role;

ALTER TABLE public.categorias_ausencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categorias_ausencia_select" ON public.categorias_ausencia;
CREATE POLICY "categorias_ausencia_select" ON public.categorias_ausencia
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'compliance')
    OR public.has_role(auth.uid(),'rh')
    OR public.has_role(auth.uid(),'supervisor')
  );

DROP POLICY IF EXISTS "categorias_ausencia_write" ON public.categorias_ausencia;
CREATE POLICY "categorias_ausencia_write" ON public.categorias_ausencia
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_categorias_ausencia_updated_at
  BEFORE UPDATE ON public.categorias_ausencia
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Bloqueia exclusão física (segue o padrão do módulo)
CREATE OR REPLACE FUNCTION public.tg_categorias_ausencia_no_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Categorias não podem ser excluídas. Use ativo=false.' USING ERRCODE='check_violation';
END $$;
CREATE TRIGGER trg_categorias_ausencia_no_delete
  BEFORE DELETE ON public.categorias_ausencia
  FOR EACH ROW EXECUTE FUNCTION public.tg_categorias_ausencia_no_delete();

-- Auditoria
CREATE TRIGGER trg_categorias_ausencia_audit
  AFTER INSERT OR UPDATE ON public.categorias_ausencia
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_row('configuracoes','categorias_ausencia');

-- 2) Seed das 6 categorias
INSERT INTO public.categorias_ausencia (codigo, nome, cor, icone, ordem) VALUES
  ('ATESTADOS','Atestados','#2563eb','stethoscope',10),
  ('FALTAS','Faltas','#dc2626','ban',20),
  ('LICENCAS','Licenças','#16a34a','baby',30),
  ('AFASTAMENTOS','Afastamentos','#7c3aed','shield-alert',40),
  ('MEDIDAS_ADMINISTRATIVAS','Medidas Administrativas','#ea580c','gavel',50),
  ('OUTROS','Outros','#6b7280','more-horizontal',60)
ON CONFLICT (codigo) DO NOTHING;

-- 3) Coluna categoria_ausencia_id em tipos_ausencia
ALTER TABLE public.tipos_ausencia
  ADD COLUMN IF NOT EXISTS categoria_ausencia_id uuid REFERENCES public.categorias_ausencia(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tipos_ausencia_categoria
  ON public.tipos_ausencia(categoria_ausencia_id);
CREATE INDEX IF NOT EXISTS idx_ausencias_tipo_ausencia_id
  ON public.ausencias(tipo_ausencia_id);

-- 4) Vínculo automático dos 19 tipos oficiais
WITH cat AS (
  SELECT codigo, id FROM public.categorias_ausencia
)
UPDATE public.tipos_ausencia t
SET categoria_ausencia_id = (
  SELECT id FROM cat WHERE codigo = CASE t.codigo
    WHEN 'ATESTADO_MEDICO'            THEN 'ATESTADOS'
    WHEN 'ATESTADO_ACOMPANHAMENTO'    THEN 'ATESTADOS'
    WHEN 'ATESTADO_ODONTOLOGICO'      THEN 'ATESTADOS'
    WHEN 'ATESTADO_COMPARECIMENTO'    THEN 'ATESTADOS'
    WHEN 'DECLARACAO_COMPARECIMENTO'  THEN 'ATESTADOS'
    WHEN 'FALTA_JUSTIFICADA'          THEN 'FALTAS'
    WHEN 'FALTA_INJUSTIFICADA'        THEN 'FALTAS'
    WHEN 'LICENCA_NOJO'               THEN 'LICENCAS'
    WHEN 'LICENCA_GALA'               THEN 'LICENCAS'
    WHEN 'LICENCA_PATERNIDADE'        THEN 'LICENCAS'
    WHEN 'LICENCA_MATERNIDADE'        THEN 'LICENCAS'
    WHEN 'AFASTAMENTO_INSS_DOENCA'    THEN 'AFASTAMENTOS'
    WHEN 'AFASTAMENTO_INSS_ACIDENTE'  THEN 'AFASTAMENTOS'
    WHEN 'SUSPENSAO_DISCIPLINAR'      THEN 'MEDIDAS_ADMINISTRATIVAS'
    WHEN 'ABANDONO_EMPREGO'           THEN 'MEDIDAS_ADMINISTRATIVAS'
    WHEN 'DOACAO_SANGUE'              THEN 'OUTROS'
    WHEN 'ALISTAMENTO_MILITAR'        THEN 'OUTROS'
    WHEN 'CONVOCACAO_JUDICIAL'        THEN 'OUTROS'
    WHEN 'OUTROS'                     THEN 'OUTROS'
    ELSE 'OUTROS'
  END
);

-- 5) dashboard_metrics: manter compatibilidade e adicionar por_categoria + filtro _categoria_id
CREATE OR REPLACE FUNCTION public.dashboard_metrics(
  _inicio date,
  _fim date,
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _supervisor text DEFAULT NULL,
  _tipo tipo_ausencia DEFAULT NULL,
  _status status_ausencia DEFAULT NULL,
  _categoria_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public
AS $function$
DECLARE
  v_prev_ini date; v_prev_fim date; v_dias int;
  v_result jsonb; v_kpis jsonb; v_prev jsonb;
  v_por_dia jsonb; v_por_empresa jsonb; v_por_projeto jsonb;
  v_por_tipo jsonb; v_por_status jsonb; v_top_sup jsonb; v_top_col jsonb;
  v_tempo_diario jsonb; v_heatmap jsonb; v_ultimos jsonb;
  v_por_categoria jsonb; v_por_tipo_oficial jsonb;
BEGIN
  v_dias := (_fim - _inicio) + 1;
  v_prev_fim := _inicio - 1;
  v_prev_ini := v_prev_fim - (v_dias - 1);

  WITH base AS (
    SELECT a.*,
           c.nome_completo AS colab_nome,
           c.supervisor_nome AS sup_nome,
           e.nome AS empresa_nome,
           p.nome AS projeto_nome,
           t.id AS tipo_oficial_id,
           t.codigo AS tipo_oficial_codigo,
           t.nome AS tipo_oficial_nome,
           t.cor AS tipo_oficial_cor,
           t.categoria_ausencia_id AS categoria_id
    FROM public.ausencias a
    JOIN public.colaboradores c ON c.id = a.colaborador_id
    JOIN public.empresas e ON e.id = a.empresa_id
    JOIN public.projetos p ON p.id = a.projeto_id
    LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_id
    WHERE a.data_inicio <= _fim AND a.data_fim >= _inicio
      AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
      AND (_supervisor IS NULL OR c.supervisor_nome ILIKE '%'||_supervisor||'%')
      AND (_tipo IS NULL OR a.tipo = _tipo)
      AND (_status IS NULL OR a.status = _status)
      AND (_categoria_id IS NULL OR t.categoria_ausencia_id = _categoria_id)
  ), filtered AS (SELECT * FROM base)
  SELECT
    jsonb_build_object(
      'total', COUNT(*),
      'pendentes', COUNT(*) FILTER (WHERE status='PENDENTE'),
      'lancadas', COUNT(*) FILTER (WHERE status='LANCADO'),
      'faltas', COUNT(*) FILTER (WHERE tipo='FALTA'),
      'atestados', COUNT(*) FILTER (WHERE tipo='ATESTADO'),
      'declaracoes', COUNT(*) FILTER (WHERE tipo='DECLARACAO'),
      'suspensoes', COUNT(*) FILTER (WHERE tipo='SUSPENSAO'),
      'acidentes_trabalho', COUNT(*) FILTER (WHERE acidente_trabalho_trajeto='TRABALHO'),
      'acidentes_trajeto', COUNT(*) FILTER (WHERE acidente_trabalho_trajeto='TRAJETO'),
      'tempo_medio_lanc_h',
        COALESCE(AVG(EXTRACT(EPOCH FROM (lancado_em - registrado_em))/3600.0)
          FILTER (WHERE lancado_em IS NOT NULL), 0)
    ),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.dia), '[]'::jsonb) FROM (
      SELECT data_inicio AS dia, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status='PENDENTE') AS pendentes,
             COUNT(*) FILTER (WHERE status='LANCADO') AS lancadas
      FROM filtered GROUP BY data_inicio
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT empresa_id, empresa_nome AS nome, COUNT(*) AS total
      FROM filtered GROUP BY empresa_id, empresa_nome
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT projeto_id, projeto_nome AS nome, COUNT(*) AS total
      FROM filtered GROUP BY projeto_id, projeto_nome LIMIT 15
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT tipo::text AS nome, COUNT(*) AS total FROM filtered GROUP BY tipo
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT status::text AS nome, COUNT(*) AS total FROM filtered GROUP BY status
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT COALESCE(sup_nome, '(Sem supervisor)') AS nome, COUNT(*) AS total
      FROM filtered GROUP BY sup_nome ORDER BY COUNT(*) DESC LIMIT 10
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT colaborador_id AS id, colab_nome AS nome, COUNT(*) AS total
      FROM filtered GROUP BY colaborador_id, colab_nome ORDER BY COUNT(*) DESC LIMIT 10
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.dia), '[]'::jsonb) FROM (
      SELECT registrado_em::date AS dia,
             AVG(EXTRACT(EPOCH FROM (lancado_em - registrado_em))/3600.0) AS horas
      FROM filtered WHERE lancado_em IS NOT NULL
      GROUP BY registrado_em::date
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.dow), '[]'::jsonb) FROM (
      SELECT EXTRACT(DOW FROM data_inicio)::int AS dow, COUNT(*) AS total
      FROM filtered GROUP BY EXTRACT(DOW FROM data_inicio)
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.registrado_em DESC), '[]'::jsonb) FROM (
      SELECT id, registrado_em, colab_nome, empresa_nome, projeto_nome,
             tipo::text AS tipo, status::text AS status, data_inicio, data_fim,
             tipo_oficial_nome, tipo_oficial_codigo
      FROM filtered ORDER BY registrado_em DESC LIMIT 20
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.ordem, t.total DESC), '[]'::jsonb) FROM (
      SELECT
        cat.id AS categoria_id,
        cat.codigo AS codigo,
        cat.nome AS nome,
        cat.cor AS cor,
        cat.ordem AS ordem,
        COUNT(*) AS total
      FROM filtered f
      LEFT JOIN public.categorias_ausencia cat ON cat.id = (
        SELECT categoria_ausencia_id FROM public.tipos_ausencia WHERE id = f.tipo_oficial_id
      )
      GROUP BY cat.id, cat.codigo, cat.nome, cat.cor, cat.ordem
    ) t),
    (SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb) FROM (
      SELECT
        f.tipo_oficial_id AS tipo_id,
        COALESCE(f.tipo_oficial_codigo, f.tipo::text) AS codigo,
        COALESCE(f.tipo_oficial_nome, f.tipo::text) AS nome,
        f.tipo_oficial_cor AS cor,
        (SELECT categoria_ausencia_id FROM public.tipos_ausencia WHERE id = f.tipo_oficial_id) AS categoria_id,
        COUNT(*) AS total
      FROM filtered f
      GROUP BY f.tipo_oficial_id, f.tipo_oficial_codigo, f.tipo_oficial_nome, f.tipo_oficial_cor, f.tipo
    ) t)
  INTO v_kpis, v_por_dia, v_por_empresa, v_por_projeto, v_por_tipo, v_por_status,
       v_top_sup, v_top_col, v_tempo_diario, v_heatmap, v_ultimos,
       v_por_categoria, v_por_tipo_oficial
  FROM filtered LIMIT 1;

  v_kpis := COALESCE(v_kpis, '{}'::jsonb) || jsonb_build_object(
    'colaboradores_ativos',
      (SELECT COUNT(*) FROM public.colaboradores
        WHERE ativo=true
          AND (_empresa_id IS NULL OR empresa_id=_empresa_id)
          AND (_projeto_id IS NULL OR projeto_id=_projeto_id)),
    'comunicacoes_enviadas',
      (SELECT COUNT(*) FROM public.comunicacoes co
        WHERE co.status='ENVIADO'
          AND co.enviado_em::date BETWEEN _inicio AND _fim)
  );

  WITH prev AS (
    SELECT a.* FROM public.ausencias a
    JOIN public.colaboradores c ON c.id = a.colaborador_id
    LEFT JOIN public.tipos_ausencia t ON t.id = a.tipo_ausencia_id
    WHERE a.data_inicio <= v_prev_fim AND a.data_fim >= v_prev_ini
      AND (_empresa_id IS NULL OR a.empresa_id = _empresa_id)
      AND (_projeto_id IS NULL OR a.projeto_id = _projeto_id)
      AND (_supervisor IS NULL OR c.supervisor_nome ILIKE '%'||_supervisor||'%')
      AND (_tipo IS NULL OR a.tipo = _tipo)
      AND (_status IS NULL OR a.status = _status)
      AND (_categoria_id IS NULL OR t.categoria_ausencia_id = _categoria_id)
  )
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pendentes', COUNT(*) FILTER (WHERE status='PENDENTE'),
    'lancadas', COUNT(*) FILTER (WHERE status='LANCADO'),
    'faltas', COUNT(*) FILTER (WHERE tipo='FALTA'),
    'atestados', COUNT(*) FILTER (WHERE tipo='ATESTADO'),
    'declaracoes', COUNT(*) FILTER (WHERE tipo='DECLARACAO'),
    'suspensoes', COUNT(*) FILTER (WHERE tipo='SUSPENSAO'),
    'acidentes_trabalho', COUNT(*) FILTER (WHERE acidente_trabalho_trajeto='TRABALHO'),
    'acidentes_trajeto', COUNT(*) FILTER (WHERE acidente_trabalho_trajeto='TRAJETO'),
    'tempo_medio_lanc_h',
      COALESCE(AVG(EXTRACT(EPOCH FROM (lancado_em - registrado_em))/3600.0)
        FILTER (WHERE lancado_em IS NOT NULL), 0),
    'comunicacoes_enviadas',
      (SELECT COUNT(*) FROM public.comunicacoes co
        WHERE co.status='ENVIADO'
          AND co.enviado_em::date BETWEEN v_prev_ini AND v_prev_fim)
  ) INTO v_prev FROM prev;

  v_result := jsonb_build_object(
    'periodo', jsonb_build_object('inicio', _inicio, 'fim', _fim,
                                  'prev_inicio', v_prev_ini, 'prev_fim', v_prev_fim),
    'kpis', COALESCE(v_kpis, '{}'::jsonb),
    'prev', COALESCE(v_prev, '{}'::jsonb),
    'por_dia', COALESCE(v_por_dia,'[]'::jsonb),
    'por_empresa', COALESCE(v_por_empresa,'[]'::jsonb),
    'por_projeto', COALESCE(v_por_projeto,'[]'::jsonb),
    'por_tipo', COALESCE(v_por_tipo,'[]'::jsonb),
    'por_status', COALESCE(v_por_status,'[]'::jsonb),
    'top_supervisores', COALESCE(v_top_sup,'[]'::jsonb),
    'top_colaboradores', COALESCE(v_top_col,'[]'::jsonb),
    'tempo_diario', COALESCE(v_tempo_diario,'[]'::jsonb),
    'heatmap', COALESCE(v_heatmap,'[]'::jsonb),
    'ultimos', COALESCE(v_ultimos,'[]'::jsonb),
    'top_empresas', COALESCE(v_por_empresa,'[]'::jsonb),
    'top_projetos', COALESCE(v_por_projeto,'[]'::jsonb),
    'por_categoria', COALESCE(v_por_categoria,'[]'::jsonb),
    'por_tipo_oficial', COALESCE(v_por_tipo_oficial,'[]'::jsonb)
  );
  RETURN v_result;
END $function$;
