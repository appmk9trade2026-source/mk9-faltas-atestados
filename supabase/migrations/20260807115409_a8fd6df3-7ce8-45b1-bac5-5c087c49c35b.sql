
-- CRM MK9 — CORREÇÃO CIRÚRGICA DA EXCLUSÃO LÓGICA
-- ETAPA: Adicionar coluna faltante e atualizar RPC

-- 1. Adicionar coluna faltante detectada no erro
ALTER TABLE public.ausencias ADD COLUMN IF NOT EXISTS excluida_por_usuario_id uuid REFERENCES auth.users(id);

-- 2. Garantir Grants na tabela para que a RPC (SECURITY DEFINER) funcione corretamente
GRANT SELECT, UPDATE ON public.ausencias TO authenticated;
GRANT ALL ON public.ausencias TO service_role;

-- 3. Atualizar a RPC para a versão estável que utiliza a nova coluna
CREATE OR REPLACE FUNCTION public.excluir_ausencia_segura(
  p_ausencia_id uuid,
  p_categoria_motivo text,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_nome text;
  v_user_papel text;
  v_ausencia record;
BEGIN
  -- 1. Obter usuário logado
  v_user_id := auth.uid();
  
  -- 2. Validar permissão (Super Admin ou RH)
  SELECT 
    p.nome, 
    ur.role::text INTO v_user_nome, v_user_papel
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.id = v_user_id
    AND ur.role IN ('super_admin', 'rh')
  LIMIT 1;

  IF v_user_id IS NULL OR v_user_papel IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: apenas Super Admin e RH podem excluir lançamentos.';
  END IF;

  -- 3. Verificar existência da ausência
  SELECT * INTO v_ausencia 
  FROM public.ausencias 
  WHERE id = p_ausencia_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ausência não encontrada (ID: %)', p_ausencia_id;
  END IF;

  -- 4. Aplicar exclusão lógica
  UPDATE public.ausencias
  SET 
    status_documental = 'EXCLUIDO',
    excluida_em = now(),
    excluida_por_usuario_id = v_user_id,
    excluidora_nome_snapshot = v_user_nome,
    excluidora_papel_snapshot = v_user_papel,
    motivo_exclusao_categoria = p_categoria_motivo,
    motivo_exclusao_detalhe = p_motivo,
    status = 'CANCELADO'
  WHERE id = p_ausencia_id;

  -- 5. Auditoria
  PERFORM public.log_audit_event(
    _modulo := 'ausencias',
    _acao := 'EXCLUIR',
    _entidade := 'Ausência',
    _registro_id := p_ausencia_id,
    _empresa_id := v_ausencia.empresa_id,
    _projeto_id := v_ausencia.projeto_id,
    _usuario_id := v_user_id,
    _usuario_nome := v_user_nome,
    _perfil := v_user_papel,
    _antes := row_to_json(v_ausencia)::jsonb,
    _depois := jsonb_build_object(
      'status_documental', 'EXCLUIDO',
      'motivo_exclusao_categoria', p_categoria_motivo,
      'motivo_exclusao_detalhe', p_motivo
    ),
    _sucesso := true,
    _observacoes := 'Exclusão lógica realizada via interface administrativa.',
    _origem := 'rpc'
  );

  RETURN jsonb_build_object(
    'success', true,
    'ausencia_id', p_ausencia_id,
    'status_documental', 'EXCLUIDO'
  );
END;
$$;

-- 4. Re-aplicar Grants da Função
REVOKE ALL ON FUNCTION public.excluir_ausencia_segura(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.excluir_ausencia_segura(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.excluir_ausencia_segura(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_ausencia_segura(uuid, text, text) TO service_role;
