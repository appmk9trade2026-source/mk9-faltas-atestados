
-- Geração automática de codigo_protocolo (prefixo curto usado nos protocolos)
-- + backfill dos projetos existentes sem prefixo.
-- codigo_interno (PRJ-000001) já é gerado por trigger existente.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.gen_projeto_codigo_protocolo(
  _nome text,
  _empresa_id uuid,
  _exclude_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  base text;
  candidate text;
  suffix int := 1;
BEGIN
  base := regexp_replace(upper(public.unaccent(coalesce(_nome, ''))), '[^A-Z0-9]', '', 'g');
  IF length(base) = 0 THEN base := 'PRJ'; END IF;
  IF length(base) > 8 THEN base := substr(base, 1, 8); END IF;
  IF length(base) < 2 THEN base := rpad(base, 2, 'X'); END IF;

  candidate := base;
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.projetos
      WHERE empresa_id = _empresa_id
        AND codigo_protocolo = candidate
        AND (_exclude_id IS NULL OR id <> _exclude_id)
    ) THEN
      RETURN candidate;
    END IF;
    suffix := suffix + 1;
    candidate := substr(base, 1, greatest(2, 10 - length(suffix::text))) || suffix::text;
    IF suffix > 99999 THEN
      RAISE EXCEPTION 'Não foi possível gerar codigo_protocolo único (nome=%, empresa=%)', _nome, _empresa_id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.gen_projeto_codigo_protocolo(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gen_projeto_codigo_protocolo(text, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.projetos_set_codigo_protocolo_bi()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo_protocolo IS NULL OR btrim(NEW.codigo_protocolo) = '' THEN
    NEW.codigo_protocolo := public.gen_projeto_codigo_protocolo(NEW.nome, NEW.empresa_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projetos_set_codigo_protocolo_bi_trg ON public.projetos;
CREATE TRIGGER projetos_set_codigo_protocolo_bi_trg
BEFORE INSERT ON public.projetos
FOR EACH ROW
EXECUTE FUNCTION public.projetos_set_codigo_protocolo_bi();

-- Backfill: gera prefixo para projetos existentes que estão sem codigo_protocolo.
UPDATE public.projetos p
SET codigo_protocolo = public.gen_projeto_codigo_protocolo(p.nome, p.empresa_id, p.id)
WHERE p.codigo_protocolo IS NULL OR btrim(p.codigo_protocolo) = '';

-- Unicidade por empresa (não global): permite ADM em duas empresas distintas.
CREATE UNIQUE INDEX IF NOT EXISTS projetos_empresa_codigo_protocolo_uidx
  ON public.projetos(empresa_id, codigo_protocolo)
  WHERE codigo_protocolo IS NOT NULL;
