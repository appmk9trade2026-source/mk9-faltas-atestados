
-- Novos campos operacionais para colaboradores (mantém colunas antigas para preservar dados)
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS supervisor_nome text,
  ADD COLUMN IF NOT EXISTS supervisor_telefone text,
  ADD COLUMN IF NOT EXISTS supervisor_email text;

-- Atualiza trigger de normalização para incluir novos campos e manter os antigos
CREATE OR REPLACE FUNCTION public.tg_colaboradores_normalize()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.matricula := regexp_replace(btrim(NEW.matricula), '\s+', '', 'g');
  NEW.nome_completo := regexp_replace(btrim(NEW.nome_completo), '\s+', ' ', 'g');

  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(btrim(NEW.email));
    IF NEW.email = '' THEN NEW.email := NULL; END IF;
  END IF;

  IF NEW.cpf IS NOT NULL THEN
    NEW.cpf := regexp_replace(NEW.cpf, '\D', '', 'g');
    IF NEW.cpf = '' THEN NEW.cpf := NULL; END IF;
  END IF;

  IF NEW.telefone IS NOT NULL THEN
    NEW.telefone := regexp_replace(NEW.telefone, '\D', '', 'g');
    IF NEW.telefone = '' THEN NEW.telefone := NULL; END IF;
  END IF;

  IF NEW.whatsapp IS NOT NULL THEN
    NEW.whatsapp := regexp_replace(NEW.whatsapp, '\D', '', 'g');
    IF NEW.whatsapp = '' THEN NEW.whatsapp := NULL; END IF;
  END IF;

  IF NEW.cargo IS NOT NULL THEN
    NEW.cargo := btrim(NEW.cargo);
    IF NEW.cargo = '' THEN NEW.cargo := NULL; END IF;
  END IF;

  IF NEW.observacoes IS NOT NULL THEN
    IF btrim(NEW.observacoes) = '' THEN NEW.observacoes := NULL; END IF;
  END IF;

  IF NEW.supervisor_nome IS NOT NULL THEN
    NEW.supervisor_nome := regexp_replace(btrim(NEW.supervisor_nome), '\s+', ' ', 'g');
    IF NEW.supervisor_nome = '' THEN NEW.supervisor_nome := NULL; END IF;
  END IF;

  IF NEW.supervisor_telefone IS NOT NULL THEN
    NEW.supervisor_telefone := regexp_replace(NEW.supervisor_telefone, '\D', '', 'g');
    IF NEW.supervisor_telefone = '' THEN NEW.supervisor_telefone := NULL; END IF;
  END IF;

  IF NEW.supervisor_email IS NOT NULL THEN
    NEW.supervisor_email := lower(btrim(NEW.supervisor_email));
    IF NEW.supervisor_email = '' THEN NEW.supervisor_email := NULL; END IF;
  END IF;

  RETURN NEW;
END;
$function$;
