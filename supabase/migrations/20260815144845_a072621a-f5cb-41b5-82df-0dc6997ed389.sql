ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS trace_id uuid;
CREATE INDEX IF NOT EXISTS idx_audit_trace_id ON public.audit_logs (trace_id) WHERE trace_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  _modulo text,
  _acao public.audit_action,
  _entidade text DEFAULT NULL,
  _registro_id uuid DEFAULT NULL,
  _empresa_id uuid DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _antes jsonb DEFAULT NULL,
  _depois jsonb DEFAULT NULL,
  _sucesso boolean DEFAULT true,
  _observacoes text DEFAULT NULL,
  _origem text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _trace_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_perfil text;
  v_id uuid;
BEGIN
  SELECT nome INTO v_nome FROM public.profiles WHERE id = v_uid;
  SELECT role::text INTO v_perfil FROM public.user_roles WHERE user_id = v_uid
    ORDER BY CASE role::text
      WHEN 'super_admin' THEN 1
      WHEN 'compliance' THEN 2
      WHEN 'rh' THEN 3
      WHEN 'supervisor' THEN 4
      ELSE 9 END LIMIT 1;

  INSERT INTO public.audit_logs (
    usuario_id, usuario_nome, perfil, empresa_id, projeto_id,
    modulo, registro_id, acao, entidade, antes, depois,
    ip, user_agent, origem, sucesso, observacoes, trace_id
  ) VALUES (
    v_uid, v_nome, v_perfil, _empresa_id, _projeto_id,
    _modulo, _registro_id, _acao, _entidade, _antes, _depois,
    _ip, _user_agent, _origem, _sucesso, _observacoes, _trace_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;