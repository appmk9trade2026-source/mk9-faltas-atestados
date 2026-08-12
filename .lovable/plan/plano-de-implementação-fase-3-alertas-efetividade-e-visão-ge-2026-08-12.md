# Plano de Implementação - Fase 3: Alertas, Efetividade e Visão Gerencial

Evolução do módulo de Plano de Ação para incluir indicadores de gestão, alertas de prazo e análise de efetividade.

## 0. Preflight & Auditoria
- Validar estrutura de `public.planos_acao` e `public.plano_acao_acompanhamentos`.
- Confirmar RLS e RBAC para perfis Supervisor, Coordenador e RH/Admin.

## 1. Regras de Negócio e Situação Gerencial (Server-side)
- Criar helper centralizado para cálculo de Situação:
    - **ATRASADO**: Ativo e Data Atual > Prazo.
    - **ATENÇÃO**: Ativo e Prazo <= 3 dias.
    - **SEM ACOMPANHAMENTO**: Ativo e sem check-in nos últimos 7 dias (valor default).
    - **NO PRAZO**: Ativo e não enquadrado acima.
- Classificação de Efetividade (Encerrados):
    - **EFETIVO**: Resultado Alcançado = SIM.
    - **PARCIAL**: Resultado Alcançado = PARCIAL.
    - **NÃO EFETIVO**: Resultado Alcançado = NAO.

## 2. Interface de Usuário (Frontend)
- **KPIs do Módulo**: Cards superiores com contagem de Ativos, Atrasados, Atenção e Sem Acompanhamento.
- **Central de Atenção**: Nova seção destacada para registros que exigem ação imediata (Atrasados/Atenção).
- **Visões de Listagem**:
    - "Meus Planos" (Filtro por Responsável).
    - "Planos da Equipe" (Filtro por Projeto/Supervisor - respeitando RBAC).
- **Alertas Visuais**: Badges coloridas e ícones de alerta na tabela.

## 3. Inteligência Artificial Gerencial
- **Ação "Analisar Planos"**: Novo Server Function que resume o status dos planos ativos do usuário.
- **Análise de Efetividade**: No detalhe do plano concluído, IA avalia o resultado vs meta.
- **Privacidade**: Garantir que dados sensíveis (CID, documentos médicos) não sejam enviados.

## 4. Segurança e Performance
- Reforçar validação server-side de `empresa_id` e permissões.
- Otimizar query de listagem para evitar carregamento excessivo de histórico.

## Detalhes Técnicos
- Arquivos afetados:
    - `src/lib/planos-acao.functions.ts`: Lógica de agregação e situações.
    - `src/routes/_authenticated/planos-acao.tsx`: Nova UI, KPIs e filtros.
    - `src/lib/planos-acao-ia.functions.ts`: Novos prompts gerenciais.
- Guardrail P0 preservado: `src/routes/index.tsx` permanece um redirecionamento.
