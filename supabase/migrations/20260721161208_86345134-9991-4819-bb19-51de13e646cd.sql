
-- Índices para acelerar a importação atômica de projetos.
-- Ambos são funcionais e determinísticos (regexp_replace/upper são IMMUTABLE em Postgres 15+).

CREATE INDEX IF NOT EXISTS empresas_cnpj_norm_idx
  ON public.empresas (regexp_replace(COALESCE(cnpj,''), '\D', '', 'g'));

CREATE INDEX IF NOT EXISTS projetos_empresa_codigo_upper_idx
  ON public.projetos (empresa_id, upper(COALESCE(codigo_protocolo,'')));
