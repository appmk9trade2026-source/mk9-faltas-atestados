
-- Template de boas-vindas do usuário (publico = COLABORADOR: reutiliza filtros existentes;
-- a variação semântica está no evento_tipo = 'USUARIO_CRIADO' na outbox).
INSERT INTO public.whatsapp_templates
  (codigo, versao, publico, nome, conteudo, variaveis_permitidas, ativo)
VALUES (
  'USUARIO_CRIADO_V1', 1, 'COLABORADOR', 'Boas-vindas de novo usuário do sistema',
$tpl$Olá, {{nome_usuario}}!

Seu acesso ao CRM MK9 foi criado com sucesso.

Empresa:
{{empresa}}

Perfil:
{{perfil}}

Login:
{{email}}

Acesse:
{{link_sistema}}

{{bloco_senha}}Em caso de dúvidas procure o administrador do sistema.

Esta é uma mensagem automática. Não responda este WhatsApp.$tpl$,
  ARRAY['nome_usuario','email','empresa','perfil','link_sistema','bloco_senha']::text[],
  true
)
ON CONFLICT (codigo, versao) DO UPDATE
  SET conteudo = EXCLUDED.conteudo,
      variaveis_permitidas = EXCLUDED.variaveis_permitidas,
      publico = EXCLUDED.publico,
      nome = EXCLUDED.nome,
      ativo = true,
      updated_at = now();

-- Materializador: cria uma única mensagem na outbox por usuário.
CREATE OR REPLACE FUNCTION public.materializar_whatsapp_usuario_boas_vindas(
  p_user_id uuid,
  p_link_sistema text,
  p_senha_temporaria text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_prof     public.profiles%ROWTYPE;
  v_tpl      record;
  v_norm     record;
  v_empresa  text;
  v_perfil   text;
  v_bloco    text;
  v_idem     text;
  v_outbox_id uuid;
  v_payload  jsonb;
  v_link     text;
BEGIN
  SELECT * INTO v_prof FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'USUARIO_INEXISTENTE');
  END IF;
  IF v_prof.ativo IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'USUARIO_INATIVO');
  END IF;
  IF v_prof.telefone_whatsapp IS NULL OR length(btrim(v_prof.telefone_whatsapp)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_TELEFONE');
  END IF;

  SELECT * INTO v_norm FROM public.normalizar_telefone_whatsapp(v_prof.telefone_whatsapp);
  IF NOT v_norm.valido THEN
    RETURN jsonb_build_object('ok', false, 'motivo', COALESCE(v_norm.motivo_invalido, 'TELEFONE_INVALIDO'));
  END IF;

  v_idem := 'usuario:' || p_user_id::text || ':boas_vindas:v1';

  SELECT id INTO v_outbox_id
    FROM public.whatsapp_outbox
   WHERE idempotency_key = v_idem;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'ja_existente', true, 'outbox_id', v_outbox_id);
  END IF;

  -- Empresas vinculadas ao usuário
  SELECT string_agg(DISTINCT e.nome, ', ')
    INTO v_empresa
    FROM public.usuario_empresas ue
    JOIN public.empresas e ON e.id = ue.empresa_id
   WHERE ue.user_id = p_user_id;
  v_empresa := COALESCE(NULLIF(btrim(coalesce(v_empresa,'')), ''), '—');

  -- Perfis (papéis)
  SELECT string_agg(DISTINCT
           CASE ur.role::text
             WHEN 'super_admin'   THEN 'Super Admin'
             WHEN 'rh'            THEN 'RH'
             WHEN 'supervisor'    THEN 'Supervisor'
             WHEN 'compliance'    THEN 'Compliance'
             WHEN 'operacao'      THEN 'Operação'
             WHEN 'visualizador'  THEN 'Visualizador'
             ELSE ur.role::text
           END, ', ')
    INTO v_perfil
    FROM public.user_roles ur
   WHERE ur.user_id = p_user_id;
  v_perfil := COALESCE(NULLIF(btrim(coalesce(v_perfil,'')), ''), 'Usuário');

  IF p_senha_temporaria IS NOT NULL AND length(btrim(p_senha_temporaria)) > 0 THEN
    v_bloco := 'Senha provisória:' || E'\n' || p_senha_temporaria || E'\n\n'
            || 'Recomendamos alterar sua senha no primeiro acesso.' || E'\n\n';
  ELSE
    v_bloco := '';
  END IF;

  v_link := COALESCE(NULLIF(btrim(coalesce(p_link_sistema,'')), ''),
                     'https://mk9-staff-hub.lovable.app');

  SELECT * INTO v_tpl
    FROM public.whatsapp_templates
   WHERE codigo = 'USUARIO_CRIADO_V1' AND ativo = true
   ORDER BY versao DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_INEXISTENTE';
  END IF;

  v_payload := jsonb_build_object(
    'nome_usuario',   COALESCE(NULLIF(btrim(coalesce(v_prof.nome,'')),''), v_prof.email),
    'email',          COALESCE(v_prof.email, ''),
    'empresa',        v_empresa,
    'perfil',         v_perfil,
    'link_sistema',   v_link,
    'bloco_senha',    v_bloco,
    'telefone_e164',  v_norm.telefone_normalizado
  );

  INSERT INTO public.whatsapp_outbox
    (evento_tipo, evento_id, publico, destinatario_usuario_id,
     telefone_hash, telefone_mascarado,
     template_id, template_codigo, template_versao,
     payload, provider, idempotency_key, proxima_tentativa_em)
  VALUES
    ('USUARIO_CRIADO', v_idem, 'COLABORADOR'::whatsapp_publico, p_user_id,
     v_norm.telefone_hash, v_norm.telefone_mascarado,
     v_tpl.id, v_tpl.codigo, v_tpl.versao,
     v_payload, 'EVOLUTION_API'::whatsapp_provider,
     v_idem, now())
  RETURNING id INTO v_outbox_id;

  INSERT INTO public.whatsapp_outbox_eventos
    (outbox_id, evento, codigo, metadata_segura)
  VALUES
    (v_outbox_id, 'MATERIALIZADO', 'USUARIO_CRIADO',
     jsonb_build_object(
       'user_id', p_user_id,
       'telefone_mascarado', v_norm.telefone_mascarado,
       'template', v_tpl.codigo,
       'versao', v_tpl.versao,
       'possui_senha_temporaria', (v_bloco <> '')
     ));

  RETURN jsonb_build_object('ok', true, 'outbox_id', v_outbox_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.materializar_whatsapp_usuario_boas_vindas(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materializar_whatsapp_usuario_boas_vindas(uuid, text, text) TO service_role;
