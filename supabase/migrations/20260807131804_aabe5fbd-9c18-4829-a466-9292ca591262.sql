-- Migração cirúrgica para correção da chamada de auditoria em excluir_ausencia_segura
-- Autor: Lovable Agent
-- Data: 2026-08-07

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
  -- A permissão é verificada via profiles e user_roles para garantir o snapshot da autoria
  SELECT 
    p.nome, 
    ur.role::text INTO v_user_nome, v_user_papel
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.id = v_user_id
    AND ur.role IN ('super_admin', 'rh')
  LIMIT 1;

  IF v_user_id IS NULL OR v_user_papel IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: apenas Super Admin e RH podem excluir lançamentos.' 
      USING ERRCODE = '42501';
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
  -- CORREÇÃO: Removidos argumentos inexistentes (_usuario_id, _usuario_nome, _perfil)
  -- CORREÇÃO: Ajustada a ação para o enum correto (AUSENCIA_EXCLUIDA)
  PERFORM public.log_audit_event(
    _modulo := 'ausencias',
    _acao := 'AUSENCIA_EXCLUIDA'::public.audit_action,
    _entidade := 'Ausência',
    _registro_id := p_ausencia_id,
    _empresa_id := v_ausencia.empresa_id,
    _projeto_id := v_ausencia.projeto_id,
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

-- Garantir privilégios de execução
GRANT EXECUTE ON FUNCTION public.excluir_ausencia_segura(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_ausencia_segura(uuid, text, text) TO service_role;
