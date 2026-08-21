# Plano: Parte 2A — Correção Cirúrgica RPC + Response Contract

Este plano visa corrigir a falha de persistência e o erro de contrato na criação de ausências manuais por supervisores, resolvendo a causa raiz do incidente `SUPERVISOR_NEW_ABSENCE_HTML_RESPONSE`.

## Alterações Técnicas

### 1. Banco de Dados (Surgical Migration)
- **RPC `registrar_ausencia_com_colaborador_manual`**:
    - Atualizar a assinatura interna para extrair metadados de anexo (`arquivo_url`, `arquivo_nome`, `arquivo_mime`, `arquivo_tamanho`) do objeto JSONB `_ausencia`.
    - Incluir estes campos no `INSERT INTO public.ausencias`.
    - Alterar o retorno no `jsonb_build_object` de `'id'` para `'ausencia_id'`.
    - Preservar `SECURITY DEFINER` e grants existentes.

### 2. Backend (Server Function)
- **Arquivo `src/lib/ausencias.functions.ts`**:
    - Adicionar log de depuração temporário para capturar a resposta bruta da RPC em caso de erro, evitando vazamento de HTML para a UI.
    - Garantir que o tratamento de erro `ausenciaDbError` capture corretamente falhas de contrato.

## Critérios de Aceite
- Lançamento manual com anexo persiste corretamente todos os metadados no banco.
- O retorno da RPC é compatível com a validação da Server Function (`ausencia_id`).
- Ausência de vazamento de HTML em caso de erro controlado.

## Guardrails
- Não alterar RLS.
- Não implementar compensação de storage (Parte 2B).
- Não alterar `src/routes/index.tsx`.
