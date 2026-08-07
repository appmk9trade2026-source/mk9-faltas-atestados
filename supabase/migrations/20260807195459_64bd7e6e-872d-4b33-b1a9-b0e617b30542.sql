BEGIN;

-- 1. Enums para Alvo, Status e Prioridade
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_alvo_plano') THEN
        CREATE TYPE public.tipo_alvo_plano AS ENUM ('PROJETO', 'COLABORADOR');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_plano_acao') THEN
        CREATE TYPE public.status_plano_acao AS ENUM ('NAO_INICIADO', 'EM_ANDAMENTO', 'SUSPENSO', 'CONCLUIDO', 'CANCELADO');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prioridade_plano_acao') THEN
        CREATE TYPE public.prioridade_plano_acao AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');
    END IF;
END $$;

-- 2. Tabela planos_acao
CREATE TABLE IF NOT EXISTS public.planos_acao (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_alvo public.tipo_alvo_plano NOT NULL,
    projeto_id uuid NOT NULL REFERENCES public.projetos(id),
    colaborador_id uuid REFERENCES public.colaboradores(id),
    titulo text NOT NULL CHECK (char_length(titulo) >= 3 AND char_length(titulo) <= 200),
    problema_identificado text NOT NULL,
    indicador_atual text,
    meta text NOT NULL,
    acao_proposta text NOT NULL,
    responsavel_usuario_id uuid NOT NULL REFERENCES auth.users(id),
    criado_por_usuario_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
    status public.status_plano_acao NOT NULL DEFAULT 'NAO_INICIADO',
    prioridade public.prioridade_plano_acao NOT NULL DEFAULT 'MEDIA',
    data_inicio date NOT NULL DEFAULT CURRENT_DATE,
    prazo date NOT NULL,
    concluido_em timestamptz,
    resultado text,
    observacoes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT planos_acao_prazo_check CHECK (prazo >= data_inicio),
    CONSTRAINT planos_acao_projeto_alvo_check CHECK (
        (tipo_alvo = 'PROJETO' AND colaborador_id IS NULL) OR
        (tipo_alvo = 'COLABORADOR' AND colaborador_id IS NOT NULL)
    )
);

-- 3. Grants
GRANT SELECT, INSERT, UPDATE ON public.planos_acao TO authenticated;
GRANT ALL ON public.planos_acao TO service_role;

-- 4. RLS
ALTER TABLE public.planos_acao ENABLE ROW LEVEL SECURITY;

-- 5. Policies
CREATE POLICY "planos_acao_select_v1"
ON public.planos_acao
FOR SELECT
TO authenticated
USING (
    has_role(auth.uid(), 'super_admin') OR 
    has_role(auth.uid(), 'rh') OR
    criado_por_usuario_id = auth.uid() OR
    responsavel_usuario_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE (p.id = criado_por_usuario_id OR p.id = responsavel_usuario_id) 
        AND p.coordenador_usuario_id = auth.uid()
    )
);

CREATE POLICY "planos_acao_insert_v1"
ON public.planos_acao
FOR INSERT
TO authenticated
WITH CHECK (
    (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'rh') OR has_role(auth.uid(), 'coordenador'))
    AND criado_por_usuario_id = auth.uid()
);

CREATE POLICY "planos_acao_update_v1"
ON public.planos_acao
FOR UPDATE
TO authenticated
USING (
    has_role(auth.uid(), 'super_admin') OR 
    has_role(auth.uid(), 'rh') OR
    criado_por_usuario_id = auth.uid() OR
    responsavel_usuario_id = auth.uid()
);

-- 6. Trigger Auditoria
CREATE OR REPLACE FUNCTION public.log_plano_acao_audit()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_logs (modulo, entidade, acao, observacoes, usuario_id)
    VALUES ('planos_acao', NEW.id::text, 'PLANO_ACAO_CRIADO', 
            format('Plano "%s" criado para %s %s', NEW.titulo, NEW.tipo_alvo, COALESCE(NEW.colaborador_id::text, NEW.projeto_id::text)), 
            auth.uid());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_planos_acao_audit
AFTER INSERT ON public.planos_acao
FOR EACH ROW EXECUTE FUNCTION public.log_plano_acao_audit();

COMMIT;