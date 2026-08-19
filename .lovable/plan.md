# Plano de Estabilização e Auditoria Preventiva /estabilidade

Este plano visa transformar a página `/estabilidade` em um painel técnico real para acompanhamento da auditoria preventiva do CRM MK9, removendo dados hardcoded e implementando a matriz de homologação conforme as diretrizes do Programa de Estabilização.

## 1. Infraestrutura de Auditoria
- Criar a tabela `audit_stability_results` para armazenar os resultados reais dos testes.
- Implementar as colunas: `flow_id`, `gate_id`, `status` (NOT_TESTED, PASS, GAP, BLOCKED), `evidence`, `severity` (P0-P3), `root_cause`, `recommended_fix` e `trace_id`.
- Configurar RLS e GRANTs para permitir escrita apenas por `super_admin`.

## 2. Refatoração da UI (`src/routes/_authenticated/estabilidade.lazy.tsx`)
- Substituir a interface estática por componentes que consomem dados do backend.
- **Header**: Adicionar subtítulo "ETAPA PREVENTIVA — MATRIZ REAL DE HOMOLOGAÇÃO".
- **Matriz de Homologação**: Criar grid dinâmico com os fluxos (Nova Ausência, Ocorrência, Processamento) e seus respectivos gates técnicos (Build, Server Function, Contract, etc.).
- **Visualização de Status**: Aplicar a paleta de cores definida:
  - `NOT_TESTED`: Cinza/Neutro.
  - `PASS`: Verde.
  - `GAP`: Âmbar.
  - `BLOCKED/P0`: Vermelho.
- **Drawer de Evidências**: Implementar componente lateral para exibir detalhes técnicos, logs de erro (sanitizados) e Trace IDs de cada gate selecionado.

## 3. Lógica de Auditoria (Nova Ausência)
- Implementar verificação real de conflitos para a matrícula 2625 (Karina Mercado).
- Validar idempotência no fluxo de gravação.
- Auditar a sanitização Zod e o HTML Guard nos retornos de erro.

## 4. Governança e Regressão
- Garantir que a Home (`src/routes/index.tsx`) permaneça como um redirecionamento puro para `/dashboard`.
- Validar proteção server-side na rota `/estabilidade` via `beforeLoad` (já implementado, mas passível de verificação).
- Gerar relatório final automatizado baseado nos dados reais da auditoria.

## Detalhes Técnicos
- **Tabela**: `public.audit_stability_results`.
- **RBAC**: Acesso exclusivo para `role = 'super_admin'`.
- **Componentes**: Utilização de Shadcn UI (Card, Badge, Progress, Drawer).
- **Dados**: Uso de `useSuspenseQuery` para carregamento dos resultados da auditoria.
