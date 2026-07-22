UPDATE public.whatsapp_templates
   SET conteudo = 'Olá, {{nome_usuario}}!

Seu acesso ao CRM MK9 foi criado com sucesso.

Empresa:
{{empresa}}

Perfil:
{{perfil}}

Login:
{{email}}

{{bloco_senha}}Acesse:
{{link_sistema}}

No primeiro acesso, será obrigatório criar uma nova senha pessoal.

Em caso de dúvidas, procure o administrador do sistema.

Esta é uma mensagem automática. Não responda este WhatsApp.',
       updated_at = now()
 WHERE codigo = 'USUARIO_CRIADO_V1';