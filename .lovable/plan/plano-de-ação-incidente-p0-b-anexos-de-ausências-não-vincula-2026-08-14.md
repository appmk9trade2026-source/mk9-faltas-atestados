# Plano de Ação: Incidente P0-B — Anexos de Ausências Não Vinculados

O objetivo deste plano é diagnosticar e corrigir a falha de persistência que impede que anexos enviados por Supervisores sejam corretamente vinculados às ausências criadas, resultando em objetos órfãos no Storage e visualização vazia no sistema.

## Etapas de Diagnóstico e Correção

1.  **Mapeamento de Contrato (Etapa 2 e 3 do P0-B)**:
    *   Auditar `src/routes/_authenticated/nova-ausencia.tsx` e `src/lib/ausencias.functions.ts`.
    *   Identificar a ordem de execução: Upload vs Criação da Ausência.
    *   Verificar o bucket (`atestados`), a tabela (`ausencias`) e o campo de vínculo (`comprovante_url` ou similar).

2.  **Teste Controlado (Etapas 4 a 7)**:
    *   Executar um lançamento real como Supervisor no ambiente de preview.
    *   Monitorar o tráfego de rede para capturar a resposta do Storage e da Server Function.
    *   Verificar no banco de dados se o `ausencia_id` possui o `object_path` correspondente.

3.  **Auditoria de RLS (Etapa 9)**:
    *   Verificar se a falha ocorre no `UPDATE` ou `INSERT` do caminho do arquivo após a criação da ausência.
    *   Validar se o papel `authenticated` (Supervisor) tem permissão de escrita no campo de anexo da tabela `ausencias`.

4.  **Correção Cirúrgica (Etapa 10)**:
    *   Garantir a atomicidade: se o upload for feito, o ID deve ser salvo.
    *   Se a criação da ausência falhar, remover o objeto recém-enviado para evitar novos órfãos (Etapa 11).

5.  **Validação de Visualização (Etapa 13 a 15)**:
    *   Confirmar que o anexo aparece em `/ausencias` e na Central de Processamento via *signed URL*.

6.  **Dry Run dos 90 Históricos (Etapa 18)**:
    *   Realizar uma consulta SQL para classificar os 90 objetos órfãos atuais sem alterá-los.

## Detalhes Técnicos

*   **Tecnologias**: TanStack Start (Server Functions), Supabase Storage, PostgreSQL (RLS).
*   **Segurança**: Manter bucket privado, usar `signed URL` para exibição, respeitar as políticas de RLS existentes.
*   **Guardrail**: A rota `src/routes/index.tsx` permanecerá como um redirecionamento puro para o dashboard.
