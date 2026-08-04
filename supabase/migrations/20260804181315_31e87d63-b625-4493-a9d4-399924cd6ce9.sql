-- ETAPA 1 e 2: Modelagem e Novos Campos
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ausencia_status_processamento') THEN
    CREATE TYPE public.ausencia_status_processamento AS ENUM ('AGUARDANDO', 'EM_PROCESSAMENTO', 'PROCESSADO');
  END IF;
END $$;

-- Adicionar campos à tabela public.ausencias
ALTER TABLE public.ausencias 
ADD COLUMN IF NOT EXISTS status_processamento public.ausencia_status_processamento NOT NULL DEFAULT 'AGUARDANDO',
ADD COLUMN IF NOT EXISTS processado_por uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS processado_em timestamptz,
ADD COLUMN IF NOT EXISTS observacao_processamento text;

-- GRANTs
GRANT SELECT, UPDATE ON public.ausencias TO authenticated;
GRANT ALL ON public.ausencias TO service_role;

-- ETAPA 6: Nova Ação (RPC para processamento)
CREATE OR REPLACE FUNCTION public.processar_ausencia(
  _ausencia_id uuid,
  _novo_status public.ausencia_status_processamento,
  _observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _antigo_status public.ausencia_status_processamento;
BEGIN
  -- Verificar permissão (RH, Compliance ou Super Admin)
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'rh') OR 
    public.has_role(auth.uid(), 'compliance')
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Somente RH, Compliance ou Admin podem alterar o processamento.';
  END IF;

  -- Obter status atual
  SELECT status_processamento INTO _antigo_status
  FROM public.ausencias
  WHERE id = _ausencia_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ausência não encontrada.';
  END IF;

  -- Atualizar registro
  UPDATE public.ausencias
  SET 
    status_processamento = _novo_status,
    observacao_processamento = COALESCE(_observacao, observacao_processamento),
    processado_por = CASE WHEN _novo_status = 'PROCESSADO' THEN auth.uid() ELSE processado_por END,
    processado_em = CASE WHEN _novo_status = 'PROCESSADO' THEN now() ELSE processado_em END
  WHERE id = _ausencia_id;

  -- Auditoria manual caso o trigger não pegue campos específicos ou para log semântico
  INSERT INTO public.audit_logs (
    usuario_id, 
    tabela, 
    registro_id, 
    operacao, 
    dados_anteriores, 
    dados_novos, 
    motivo
  ) VALUES (
    auth.uid(),
    'ausencias',
    _ausencia_id,
    'UPDATE',
    jsonb_build_object('status_processamento', _antigo_status),
    jsonb_build_object('status_processamento', _novo_status),
    'Processamento interno administrativo: ' || COALESCE(_observacao, 'Alteração de status')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.processar_ausencia FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.processar_ausencia TO authenticated;
GRANT EXECUTE ON FUNCTION public.processar_ausencia TO service_role;
