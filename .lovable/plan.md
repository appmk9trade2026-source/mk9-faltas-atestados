# Plano de Saneamento de Anexos - Fase 1 (Concluído)

Diagnóstico forense dos 90 anexos órfãos no bucket `atestados`.

## Resultados da Auditoria
- **Volume:** 90 objetos confirmados como órfãos (sem `arquivo_url` correspondente).
- **Padrões de Identidade:**
  - 64 arquivos vinculados a UUIDs (colaboradores/ausências).
  - 26 arquivos sob o prefixo `manual/`.
- **Causa Raiz Confirmada:** Falhas na transação de banco de dados (`INSERT` em `ausencias`) ocorridas após o sucesso do upload no storage, gerando objetos sem vínculo.
- **Audit Logs:** Encontrados registros de `PROTOCOLO_GERADO` sem a conclusão da criação da ausência no mesmo timestamp.

## Ações Realizadas
1. Mapeamento completo dos 90 caminhos e timestamps.
2. Identificação dos enums corretos de auditoria (`CREATE`, `AUSENCIA_CRIADA_POR_SUPERVISOR`).
3. Verificação do esquema da tabela `ausencias` (colunas de identidade e status).

## Próximos Passos (Fase 2)
- Reconciliação assistida: Vincular os arquivos órfãos às ausências que ficaram sem anexo.
- Limpeza segura: Remover arquivos `manual/` que não possuam qualquer rastro de tentativa de lançamento.

**Nota:** Nenhuma alteração destrutiva ou escrita no banco de dados foi realizada nesta fase.
