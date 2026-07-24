
-- Etapa 1 — Hierarquia de Coordenação: papel + modelo de dados + integridade.
-- Observação: RLS, telas e escopo do Coordenador ficam para as próximas etapas.

-- 1) Novo papel no enum RBAC. ADD VALUE é seguro dentro de migração; o
--    novo valor só pode ser usado após o commit desta migração, então
--    ninguém referencia 'coordenador' literalmente aqui.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordenador';

-- 2) Vínculo do Supervisor ao Coordenador responsável.
--    Modelagem escolhida: coluna em profiles apontando para auth.users(id).
--    NULL = supervisor ainda sem coordenador atribuído.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coordenador_usuario_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.coordenador_usuario_id IS
  'Hierarquia de Coordenação: quando este profile é Supervisor, aponta '
  'para o usuário Coordenador responsável (auth.users.id). NULL indica '
  'Supervisor sem Coordenador atribuído. Só Super Admin e RH podem gravar.';

-- 3) Índice parcial para consultas por Coordenador (RLS/rankings/etc.).
CREATE INDEX IF NOT EXISTS idx_profiles_coordenador_usuario_id
  ON public.profiles (coordenador_usuario_id)
  WHERE coordenador_usuario_id IS NOT NULL;

-- 4) Regra estrutural: um profile não pode ser o próprio Coordenador.
--    (Cardinalidade 1 Coordenador por Supervisor já é garantida pela coluna
--     única por profile.)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_coordenador_nao_e_si_mesmo;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_coordenador_nao_e_si_mesmo
  CHECK (coordenador_usuario_id IS NULL OR coordenador_usuario_id <> id);

-- 5) Trigger de integridade forte:
--    - Só Supervisor pode ter Coordenador vinculado.
--    - O alvo do vínculo precisa efetivamente ter o papel Coordenador.
--    Comparações são feitas em runtime, então usar 'coordenador'::app_role
--    é seguro (o enum já estará commitado quando a trigger disparar).
CREATE OR REPLACE FUNCTION public.trg_profiles_valida_coordenador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sem vínculo: nada a validar.
  IF NEW.coordenador_usuario_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Este profile precisa ter papel supervisor para receber Coordenador.
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = NEW.id
      AND role = 'supervisor'::app_role
  ) THEN
    RAISE EXCEPTION
      'COORDENACAO_SUPERVISOR_INVALIDO: apenas usuários com papel supervisor podem ter Coordenador vinculado'
      USING HINT = 'Atribua o papel supervisor antes de vincular a um Coordenador';
  END IF;

  -- Alvo precisa ter papel coordenador.
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = NEW.coordenador_usuario_id
      AND role = 'coordenador'::app_role
  ) THEN
    RAISE EXCEPTION
      'COORDENACAO_ALVO_INVALIDO: usuário informado não possui o papel Coordenador'
      USING HINT = 'Conceda o papel coordenador ao usuário destino antes de vincular';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_valida_coordenador ON public.profiles;
CREATE TRIGGER profiles_valida_coordenador
  BEFORE INSERT OR UPDATE OF coordenador_usuario_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_valida_coordenador();

-- 6) Guarda-corpo espelhado em user_roles: se alguém tentar remover o
--    papel 'coordenador' de um usuário que ainda é Coordenador de algum
--    Supervisor, bloqueia. Evita vínculos órfãos apontando para não-coord.
CREATE OR REPLACE FUNCTION public.trg_user_roles_protege_coordenacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'coordenador'::app_role THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE coordenador_usuario_id = OLD.user_id
    ) THEN
      RAISE EXCEPTION
        'COORDENACAO_EM_USO: este usuário ainda é Coordenador de um ou mais Supervisores'
        USING HINT = 'Remova ou reatribua os vínculos antes de retirar o papel coordenador';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_protege_coordenacao ON public.user_roles;
CREATE TRIGGER user_roles_protege_coordenacao
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_user_roles_protege_coordenacao();
