# Plano de Saneamento de Anexos - Fase 1 (Audit Log & Schema Fix)

Este documento registra a execução da Fase 1 do saneamento histórico de anexos.

## Status da Auditoria
- **Órfãos Confirmados:** 90
- **Padrões de Path:**
  - `ausencias/manual/`: 26 arquivos
  - `ausencias/{UUID}/`: 64 arquivos
- **Eventos de Auditoria:** Identificados eventos de `CREATE` e `PROTOCOLO_GERADO` que coincidem temporalmente com a criação dos objetos órfãos.

## Matriz de Cruzamento (Amostra)
| Object Path | Storage Created At | Suspected Cause |
|-------------|--------------------|-----------------|
| `ausencias/2d981756...` | 2026-07-27 | Race condition / RLS Fail |
| `ausencias/manual/...` | 2026-08-06 | Upload manual sem vínculo |

## Conclusão da Fase 1
A base de dados `public.ausencias` possui registros com `arquivo_url` nulo que batem com os timestamps dos arquivos no storage. O erro de "Falha ao salvar" reportado anteriormente pelos supervisores é a causa provável da dissociação.

*Este plano não realiza alterações destrutivas.*
