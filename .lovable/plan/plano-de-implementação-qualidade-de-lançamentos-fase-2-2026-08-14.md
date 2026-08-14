# Plano de Implementação — Qualidade de Lançamentos Fase 2

Implementação da Fase 2 do módulo de Qualidade de Lançamentos, focando em classificação estruturada de erros, auditoria forense e navegação aprimorada.

## Etapa 0 — Validação da Fase 1 (Checklist Operacional)
Confirmar que os indicadores da Fase 1 estão operacionais para o período 15/07/2026 a 14/08/2026.
- Total de registros auditados: 325 (conforme auditoria SQL anterior).
- Supervisores identificados: ~23 ativos.

## Etapa 1 — Navegação e Botão Voltar
Adicionar botão "← Voltar" no topo da página de Qualidade de Lançamentos.
- Localização: `src/routes/_authenticated/qualidade-lancamentos.tsx`.
- Comportamento: Navegação para a rota anterior ou fallback para `/dashboard` via TanStack Router `useNavigate` e `window.history.length`.

## Etapa 2 — Banco de Dados: Motivo Estruturado e Classificação de Erros
Criar enum de motivos e atualizar a função de exclusão para suportar a nova taxonomia.
- **SQL:**
  1. Criar tipo enum `ausencia_motivo_exclusao_categoria_v2` com as 9 opções solicitadas.
  2. Adicionar coluna `e_erro_supervisor` (boolean) na tabela `public.ausencias`.
  3. Atualizar RPC `public.excluir_ausencia_segura` para aceitar a nova categoria e definir automaticamente `e_erro_supervisor` com base na categoria.
  4. Garantir que `registrado_por` seja preservado como autoria original (imutável).

## Etapa 3 — Frontend: Modal de Exclusão Estruturada
Modificar o fluxo de exclusão para exigir o motivo e classificação.
- **Localização:** `src/routes/_authenticated/ausencias.tsx` e componentes relacionados.
- **Ação:** Interceptar o clique em "Excluir", abrir modal com select de categorias. Se "OUTRO", exigir justificativa. Se "OUTRO", permitir definir manualmente se é erro.

## Etapa 4 — Evolução da RPC de Indicadores (Fase 2)
Atualizar `public.rel_qualidade_lancamentos` para refletir as novas métricas da Fase 2.
- **Métricas:** Total Lançamentos, Lançamentos com Erro, Taxa de Acerto, Taxa de Erro, Erros por 100 lançamentos.
- **Regra:** Um lançamento com múltiplas intervenções conta como apenas 1 lançamento com erro.

## Etapa 5 — UI: KPIs e Ranking Evoluído
Atualizar a interface da página principal de Qualidade.
- Adicionar indicadores secundários: "Lançamentos com Erro" e "Taxa de Erro".
- Atualizar a tabela de ranking com as novas colunas e ordenação por maior taxa de erro.

## Etapa 6 — Detalhe do Supervisor (Drawer Auditável)
Implementar visualização detalhada por supervisor.
- **Drawer:** Exibir distribuição de erros por categoria.
- **Lista Auditável:** Listar protocolos, datas, motivos e responsáveis pela correção.
- **Segurança:** Ocultar CID e dados clínicos conforme LGPD/Compliance.

## Detalhes Técnicos
- **Fórmulas:** 
  - `taxa_acerto = ((total - lancamentos_com_erro) / total) * 100`
  - `erros_por_100 = (lancamentos_com_erro / total) * 100`
- **RBAC:** Apenas perfis com permissão de exclusão (Super Admin/RH) podem classificar erros.
- **Guardrail:** Nenhuma alteração em `src/routes/index.tsx` (redirect puro).
