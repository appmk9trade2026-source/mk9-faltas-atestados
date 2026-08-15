# Programa de Estabilização Geral - Etapa 1: Baseline e Diagnóstico

Este plano formaliza a Etapa 1 do Programa de Estabilização, focada em estabelecer um baseline real do sistema e diagnosticar falhas estruturais antes de correções em larga escala.

## Etapas de Diagnóstico e Baseline

1. **Build e Integridade Estrutural**
   - Execução de `build:dev` completo para identificar conflitos de rota e arquivos fantasmas.
   - Limpeza de artefatos de compilação duplicados (`src/routes/*.js`).
   - Auditoria de warnings de depreciação de API (`inputValidator` vs `validator`).

2. **Smoke Test de Rotas Críticas (Automatizado)**
   - Validação de redirecionamento da Home (Guardrail P0).
   - Verificação de carregamento de Dashboards, Fila de Processamento e Relatórios.
   - Teste de busca de colaboradores (Matrícula) sob diferentes perfis (Admin vs Coordenador).

3. **Auditoria de Contratos RPC**
   - Mapeamento de assinaturas e permissões (Security Definer) de todas as funções do banco.
   - Identificação de overloads duplicados e parâmetros inconsistentes.

4. **Diagnóstico de Escopo e RBAC**
   - Verificação de visibilidade de colaboradores por Coordenadores/Supervisores.
   - Validação da política de preenchimento manual como fallback de segurança para casos fora de escopo.

## Detalhes Técnicos

- **Guardrail P0**: A Home (`src/routes/index.tsx`) é mantida como um redirecionamento puro para o Dashboard, garantindo que documentação técnica ou UIs de auditoria não sejam expostas ao usuário final.
- **Baseline de Estabilidade**: Documentado em `mem://reference/baseline-estabilidade-etapa1.md`.
- **RBAC Hardening**: O sistema agora intercepta falhas de escopo hierárquico e sugere automaticamente o modo "Preenchimento Manual" para garantir a continuidade operacional.

## Verificação

- [x] Build limpo sem conflitos de `.js`.
- [x] Redirect da Home validado via Playwright.
- [x] Busca de colaborador com fallback manual validada para perfis restritos.
- [x] Mapeamento de 90 anexos órfãos históricos concluído.

Finalizada a Etapa 1, o sistema está pronto para a **Etapa 2: Saneamento de RPCs e Storage**.
