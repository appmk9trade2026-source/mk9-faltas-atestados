-- Executar o script de correção de RPCs e Enum
DO $$ 
BEGIN
    -- Auditar e corrigir a RPC iniciar_processamento_ausencia
    -- (O conteúdo já foi gerado no arquivo sql, vamos aplicar via migration_lifecycle se possível ou supabase--migration)
    NULL;
END $$;
