-- CRM MK9 — PLANO DE AÇÃO GERENCIAL — FASE 2
-- Migration aditiva para acompanhamento e progresso

-- 1. Alterar tabela planos_acao
ALTER TABLE public.planos_acao 
ADD COLUMN IF NOT EXISTS progresso integer DEFAULT 0 CHECK (progresso >= 0 AND progresso <= 100),
ADD COLUMN IF NOT EXISTS resultado_alcancado text, -- 'SIM', 'PARCIAL', 'NAO'
ADD COLUMN IF NOT EXISTS parecer_final text,
ADD COLUMN IF NOT EXISTS justificativa_cancelamento text;

-- 2. Criar tabela de acompanhamentos
CREATE TABLE IF NOT EXISTS public.plano_acao_acompanhamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plano_id uuid REFERENCES public.planos_acao(id) ON DELETE CASCADE NOT NULL,
    progresso integer NOT NULL CHECK (progresso >= 0 AND progresso <= 100),
    observacao text NOT NULL,
    criado_por_usuario_id uuid REFERENCES auth.users(id) NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 3. Grants
GRANT SELECT, INSERT ON public.plano_acao_acompanhamentos TO authenticated;
GRANT ALL ON public.plano_acao_acompanhamentos TO service_role;

-- 4. RLS para acompanhamentos
ALTER TABLE public.plano_acao_acompanhamentos ENABLE ROW LEVEL SECURITY;

-- Política de visualização: Quem vê o plano vê os acompanhamentos
CREATE POLICY "Usuários podem ver acompanhamentos dos planos que acessam"
ON public.plano_acao_acompanhamentos
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.planos_acao p 
        WHERE p.id = plano_id
    )
);

-- Política de inserção: Somente quem tem acesso ao plano
CREATE POLICY "Usuários podem inserir acompanhamentos"
ON public.plano_acao_acompanhamentos
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = criado_por_usuario_id AND
    EXISTS (
        SELECT 1 FROM public.planos_acao p 
        WHERE p.id = plano_id
    )
);

-- 5. Trigger para atualizar o progresso do plano automaticamente ao inserir acompanhamento
CREATE OR REPLACE FUNCTION public.fn_atualiza_progresso_plano()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.planos_acao
    SET progresso = NEW.progresso,
        updated_at = now()
    WHERE id = NEW.plano_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tg_atualiza_progresso_plano
AFTER INSERT ON public.plano_acao_acompanhamentos
FOR EACH ROW
EXECUTE FUNCTION public.fn_atualiza_progresso_plano();
